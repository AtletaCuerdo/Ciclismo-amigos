/**
 * Escenario virtual con Three.js: una vuelta cerrada de 17 km con terreno,
 * carretera, árboles y los ciclistas, vista en tercera persona.
 *
 * Todo se genera por código y con una semilla fija, así cada usuario ve
 * exactamente el mismo recorrido sin descargar modelos.
 */
import * as THREE from 'three';
import type { Avatar } from './avatar';
import { Ciclista3D } from './ciclista3d';
import { LONGITUD_VUELTA_M, altitud, enVuelta, pendiente } from './perfil';

const PASO_M = 5; // resolución del trazado
const ANCHO_CARRETERA = 8;
const COLOR_CIELO = 0xa9d8f5;
/** Franja a cada lado de la carretera donde el terreno tiene su misma altitud. */
const ZONA_LLANA_M = 30;

// ---------------------------------------------------------------------------
// Trazado horizontal
// ---------------------------------------------------------------------------

/** Números pseudoaleatorios con semilla (mismo mundo para todos). */
function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Trazado {
  n: number;
  x: Float32Array;
  z: Float32Array;
  dx: Float32Array; // dirección unitaria
  dz: Float32Array;
}

/** Curva cerrada irregular escalada para medir exactamente 17 km. */
function crearTrazado(): Trazado {
  const puntos: THREE.Vector3[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + 0.16 * Math.sin(3 * a + 0.6) + 0.09 * Math.cos(5 * a + 1.3);
    puntos.push(new THREE.Vector3(Math.cos(a) * 3100 * r, 0, Math.sin(a) * 2100 * r));
  }
  let curva = new THREE.CatmullRomCurve3(puntos, true, 'centripetal');
  curva.arcLengthDivisions = 6000;
  const escala = LONGITUD_VUELTA_M / curva.getLength();
  curva = new THREE.CatmullRomCurve3(
    puntos.map((p) => p.multiplyScalar(escala)),
    true,
    'centripetal',
  );
  curva.arcLengthDivisions = 6000;

  const total = Math.round(LONGITUD_VUELTA_M / PASO_M);
  const t: Trazado = {
    n: total,
    x: new Float32Array(total),
    z: new Float32Array(total),
    dx: new Float32Array(total),
    dz: new Float32Array(total),
  };
  for (let i = 0; i < total; i++) {
    const u = i / total;
    const p = curva.getPointAt(u);
    const d = curva.getTangentAt(u);
    const largo = Math.hypot(d.x, d.z) || 1;
    t.x[i] = p.x;
    t.z[i] = p.z;
    t.dx[i] = d.x / largo;
    t.dz[i] = d.z / largo;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------------------

/** Colinas suaves para el paisaje lejos de la carretera. */
function colinas(x: number, z: number) {
  return (
    60 +
    35 * Math.sin(x / 700 + 1) * Math.cos(z / 560) +
    18 * Math.sin((x + z) / 260) +
    8 * Math.cos((x - 2 * z) / 130)
  );
}

function suavizado(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Índice espacial del trazado para encontrar el punto de carretera más cercano. */
class IndiceCarretera {
  private celdas = new Map<number, number[]>();
  constructor(
    private tr: Trazado,
    private tamCelda = 250,
    paso = 4, // se indexa 1 de cada 4 puntos (cada 20 m)
  ) {
    for (let i = 0; i < tr.n; i += paso) {
      const k = this.clave(tr.x[i], tr.z[i]);
      const lista = this.celdas.get(k);
      if (lista) lista.push(i);
      else this.celdas.set(k, [i]);
    }
  }
  private clave(x: number, z: number) {
    return this.claveCelda(Math.floor(x / this.tamCelda), Math.floor(z / this.tamCelda));
  }
  private claveCelda(cx: number, cz: number) {
    return cx * 100003 + cz; // clave numérica: más rápida que un texto
  }
  /** Distancia a la carretera y altitud de la carretera en ese punto. */
  cercano(x: number, z: number) {
    const cx = Math.floor(x / this.tamCelda);
    const cz = Math.floor(z / this.tamCelda);
    let mejor = Infinity;
    let indice = -1;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const lista = this.celdas.get(this.claveCelda(cx + i, cz + j));
        if (!lista) continue;
        for (const k of lista) {
          const d = (this.tr.x[k] - x) ** 2 + (this.tr.z[k] - z) ** 2;
          if (d < mejor) {
            mejor = d;
            indice = k;
          }
        }
      }
    }
    return { distancia: Math.sqrt(mejor), alt: indice >= 0 ? altitud(indice * PASO_M) : 60 };
  }
}

// ---------------------------------------------------------------------------
// Texturas generadas por código
// ---------------------------------------------------------------------------

function texturaAsfalto() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#44484f';
  ctx.fillRect(0, 0, 128, 256);
  const rnd = aleatorio(7);
  for (let i = 0; i < 1500; i++) {
    const g = 55 + Math.floor(rnd() * 40);
    ctx.fillStyle = `rgb(${g},${g},${g + 4})`;
    ctx.fillRect(rnd() * 128, rnd() * 256, 1.5, 1.5);
  }
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(4, 0, 4, 256); // bordes
  ctx.fillRect(120, 0, 4, 256);
  ctx.fillRect(62, 0, 4, 140); // línea central discontinua
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function texturaTexto(texto: string, fondo: string, color: string, ancho = 512, alto = 128) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(alto * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, ancho / 2, alto / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------

export interface OtroCiclista {
  uid: string;
  nombre: string;
  avatar: Avatar;
  distancia: number; // m
  velocidad: number; // km/h
  cadencia: number;
}

interface EstadoOtro {
  c: Ciclista3D;
  nombre: string;
  sBase: number;
  v: number; // m/s
  cadencia: number;
  recibido: number;
  sRender: number;
  carril: number;
}

const CARRILES = [-2.6, -1.2, 0.2, 2.8, -3.2];
const MI_CARRIL = 1.5;

function hash(texto: string) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface DatosYo {
  distancia: number; // m (autoritativa, viene de la grabación)
  velocidad: number; // km/h
  cadencia: number;
}

export class EscenaRecorrido {
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private camara: THREE.PerspectiveCamera;
  private tr = crearTrazado();
  private indice: IndiceCarretera;
  private yo: Ciclista3D;
  private sYo = 0;
  private otros = new Map<string, EstadoOtro>();
  private reloj = new THREE.Clock();
  private animacion = 0;
  private observador: ResizeObserver;
  private camaraLista = false;

  constructor(
    private contenedor: HTMLElement,
    avatar: Avatar,
    private leerYo: () => DatosYo,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    contenedor.appendChild(this.renderer.domElement);

    this.camara = new THREE.PerspectiveCamera(60, 1, 0.3, 3500);
    this.escena.background = new THREE.Color(COLOR_CIELO);
    this.escena.fog = new THREE.Fog(COLOR_CIELO, 350, 3000);

    this.escena.add(new THREE.HemisphereLight(0xdff1ff, 0x5f7d45, 1.6));
    const sol = new THREE.DirectionalLight(0xfff2d6, 1.8);
    sol.position.set(0.4, 1, 0.3);
    this.escena.add(sol);

    this.indice = new IndiceCarretera(this.tr);
    this.crearTerreno();
    this.crearCarretera();
    this.crearArboles();
    this.crearSalidaYMarcas();

    this.yo = new Ciclista3D(avatar);
    this.escena.add(this.yo.raiz);
    this.sYo = leerYo().distancia;

    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(contenedor);
    this.ajustarTamano();
    this.bucle();
  }

  // ---- Construcción del mundo ----

  /** Altura del terreno: igual a la carretera cerca de ella y colinas lejos. */
  private alturaTerreno(x: number, z: number) {
    const { distancia, alt } = this.indice.cercano(x, z);
    const w = suavizado(ZONA_LLANA_M, 300, distancia);
    return alt * (1 - w) + colinas(x, z) * w;
  }

  private crearTerreno() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.tr.n; i++) {
      minX = Math.min(minX, this.tr.x[i]);
      maxX = Math.max(maxX, this.tr.x[i]);
      minZ = Math.min(minZ, this.tr.z[i]);
      maxZ = Math.max(maxZ, this.tr.z[i]);
    }
    const margen = 1800;
    const ancho = maxX - minX + margen * 2;
    const fondo = maxZ - minZ + margen * 2;
    const seg = 300;
    const geo = new THREE.PlaneGeometry(ancho, fondo, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colores = new Float32Array(pos.count * 3);
    const verde = new THREE.Color(0x6f9e4a);
    const verdeOscuro = new THREE.Color(0x4f7a36);
    const tierra = new THREE.Color(0x9c8a5a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const { distancia, alt } = this.indice.cercano(x, z);
      const w = suavizado(ZONA_LLANA_M, 300, distancia);
      const h = alt * (1 - w) + colinas(x, z) * w;
      // Junto a la carretera el terreno baja un poco para que nunca la tape
      pos.setY(i, h - 0.6 * (1 - suavizado(ZONA_LLANA_M, 2 * ZONA_LLANA_M, distancia)));
      // Color: arcén de tierra junto a la carretera, verdes variados lejos
      const mezcla = 0.5 + 0.5 * Math.sin(x / 90) * Math.cos(z / 110);
      c.copy(verde).lerp(verdeOscuro, mezcla);
      if (distancia < 16) c.lerp(tierra, 1 - distancia / 16);
      colores.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    geo.computeVertexNormals();
    this.escena.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  private crearCarretera() {
    const n = this.tr.n;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const indices: number[] = [];
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      const s = k * PASO_M;
      const y = altitud(s) + 0.3;
      // Derecha = dirección girada 90º en el plano
      const rx = -this.tr.dz[i];
      const rz = this.tr.dx[i];
      const h = ANCHO_CARRETERA / 2;
      pos.set([this.tr.x[i] - rx * h, y, this.tr.z[i] - rz * h], k * 6);
      pos.set([this.tr.x[i] + rx * h, y, this.tr.z[i] + rz * h], k * 6 + 3);
      uv.set([0, s / 12, 1, s / 12], k * 4);
      if (k < n) {
        const a = k * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: texturaAsfalto(), side: THREE.DoubleSide });
    this.escena.add(new THREE.Mesh(geo, mat));
  }

  private crearArboles() {
    const rnd = aleatorio(42);
    const cantidad = 1400;
    const troncos = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.35, 0.5, 4, 5),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
      cantidad,
    );
    const copas = new THREE.InstancedMesh(
      new THREE.ConeGeometry(2.6, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      cantidad,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const escala = new THREE.Vector3();
    const p = new THREE.Vector3();
    const color = new THREE.Color();
    let colocados = 0;
    for (let intento = 0; intento < cantidad * 6 && colocados < cantidad; intento++) {
      // Cerca de la carretera: elegimos un punto del trazado y nos apartamos a un lado
      const i = Math.floor(rnd() * this.tr.n);
      const lado = rnd() < 0.5 ? -1 : 1;
      const separacion = 12 + rnd() ** 2 * 350;
      const x = this.tr.x[i] - this.tr.dz[i] * lado * separacion + (rnd() - 0.5) * 30;
      const z = this.tr.z[i] + this.tr.dx[i] * lado * separacion + (rnd() - 0.5) * 30;
      if (this.indice.cercano(x, z).distancia < 11) continue;
      const tam = 0.7 + rnd() * 0.8;
      const y = this.alturaTerreno(x, z);
      escala.set(tam, tam, tam);
      m.compose(p.set(x, y + 2 * tam, z), q, escala);
      troncos.setMatrixAt(colocados, m);
      m.compose(p.set(x, y + 7 * tam, z), q, escala);
      copas.setMatrixAt(colocados, m);
      copas.setColorAt(colocados, color.setHSL(0.27 + rnd() * 0.08, 0.45, 0.22 + rnd() * 0.12));
      colocados++;
    }
    troncos.count = colocados;
    copas.count = colocados;
    this.escena.add(troncos, copas);
  }

  private crearSalidaYMarcas() {
    // Arco de salida/meta en el km 0
    const i = 0;
    const rx = -this.tr.dz[i];
    const rz = this.tr.dx[i];
    const y = altitud(0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x222831 });
    for (const lado of [-1, 1]) {
      const poste = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), mat);
      poste.position.set(this.tr.x[i] + rx * lado * 5.5, y + 3, this.tr.z[i] + rz * lado * 5.5);
      this.escena.add(poste);
    }
    const pancarta = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 1.6, 0.3),
      [mat, mat, mat, mat,
        new THREE.MeshBasicMaterial({ map: texturaTexto('SALIDA · META', '#ff6a1a', '#111111') }),
        new THREE.MeshBasicMaterial({ map: texturaTexto('SALIDA · META', '#ff6a1a', '#111111') })],
    );
    pancarta.position.set(this.tr.x[i], y + 6.2, this.tr.z[i]);
    pancarta.rotation.y = Math.atan2(-this.tr.dz[i], this.tr.dx[i]) + Math.PI / 2;
    this.escena.add(pancarta);

    // Carteles de kilómetro
    for (let km = 1; km < LONGITUD_VUELTA_M / 1000; km++) {
      const k = Math.round((km * 1000) / PASO_M) % this.tr.n;
      const sx = -this.tr.dz[k];
      const sz = this.tr.dx[k];
      const cartel = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texturaTexto(`${km} km`, '#ffffff', '#1a1a1a', 256, 128) }),
      );
      cartel.scale.set(2, 1, 1);
      cartel.position.set(this.tr.x[k] + sx * 6, altitud(km * 1000) + 2.2, this.tr.z[k] + sz * 6);
      this.escena.add(cartel);
    }
  }

  // ---- Posición en la carretera ----

  /** Punto de la carretera a la distancia s, desplazado lateralmente. */
  private puntoEn(s: number, lateral: number) {
    const x = enVuelta(s) / PASO_M;
    const i = Math.floor(x) % this.tr.n;
    const j = (i + 1) % this.tr.n;
    const f = x - Math.floor(x);
    const dx = this.tr.dx[i] * (1 - f) + this.tr.dx[j] * f;
    const dz = this.tr.dz[i] * (1 - f) + this.tr.dz[j] * f;
    const l = Math.hypot(dx, dz) || 1;
    const px = this.tr.x[i] * (1 - f) + this.tr.x[j] * f;
    const pz = this.tr.z[i] * (1 - f) + this.tr.z[j] * f;
    return {
      pos: new THREE.Vector3(px - (dz / l) * lateral, altitud(s) + 0.3, pz + (dx / l) * lateral),
      dx: dx / l,
      dz: dz / l,
    };
  }

  // ---- Otros ciclistas ----

  actualizarOtros(lista: OtroCiclista[]) {
    const ahora = performance.now();
    const vistos = new Set<string>();
    for (const o of lista) {
      vistos.add(o.uid);
      let e = this.otros.get(o.uid);
      if (!e) {
        const c = new Ciclista3D(o.avatar, o.nombre);
        this.escena.add(c.raiz);
        e = {
          c,
          nombre: o.nombre,
          sBase: o.distancia,
          v: o.velocidad / 3.6,
          cadencia: o.cadencia,
          recibido: ahora,
          sRender: o.distancia,
          carril: CARRILES[hash(o.uid) % CARRILES.length],
        };
        this.otros.set(o.uid, e);
      }
      if (o.nombre !== e.nombre) {
        e.c.ponerNombre(o.nombre);
        e.nombre = o.nombre;
      }
      e.c.cambiarAvatar(o.avatar);
      if (o.distancia !== e.sBase) {
        e.sBase = o.distancia;
        e.recibido = ahora;
      }
      e.v = o.velocidad / 3.6;
      e.cadencia = o.cadencia;
    }
    for (const [uid, e] of this.otros) {
      if (!vistos.has(uid)) {
        e.c.destruir();
        this.otros.delete(uid);
      }
    }
  }

  cambiarMiAvatar(avatar: Avatar) {
    this.yo.cambiarAvatar(avatar);
  }

  // ---- Bucle de dibujo ----

  private ajustarTamano() {
    const w = this.contenedor.clientWidth || 1;
    const h = this.contenedor.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  private bucle = () => {
    this.animacion = requestAnimationFrame(this.bucle);
    const dt = Math.min(0.1, this.reloj.getDelta());
    const yo = this.leerYo();
    const v = yo.velocidad / 3.6;

    // Mi posición: avanza suave con la velocidad y se corrige hacia la distancia real
    this.sYo += v * dt;
    const error = yo.distancia - this.sYo;
    this.sYo += Math.abs(error) > 50 ? error : error * Math.min(1, dt * 2);

    const p = this.puntoEn(this.sYo, MI_CARRIL);
    const pend = pendiente(this.sYo);
    this.yo.colocar(p.pos, p.dx, p.dz, pend);
    this.yo.pedalear(v, yo.cadencia, dt);

    // Otros: extrapolamos con su velocidad entre actualizaciones (llegan 1 vez/s)
    const ahora = performance.now();
    for (const e of this.otros.values()) {
      const objetivo = e.sBase + e.v * Math.min(3, (ahora - e.recibido) / 1000);
      const dif = objetivo - e.sRender;
      e.sRender += Math.abs(dif) > 60 ? dif : dif * Math.min(1, dt * 3);
      const q = this.puntoEn(e.sRender, e.carril);
      e.c.colocar(q.pos, q.dx, q.dz, pendiente(e.sRender));
      e.c.pedalear(e.v, e.cadencia, dt);
    }

    // Cámara en tercera persona, detrás y un poco por encima
    const detras = new THREE.Vector3(p.pos.x - p.dx * 7, p.pos.y + 2.6, p.pos.z - p.dz * 7);
    detras.y = Math.max(detras.y, this.alturaTerreno(detras.x, detras.z) + 1.2);
    const mira = new THREE.Vector3(p.pos.x + p.dx * 8, p.pos.y + 1.1, p.pos.z + p.dz * 8);
    if (!this.camaraLista) {
      this.camara.position.copy(detras);
      this.camaraLista = true;
    } else {
      this.camara.position.lerp(detras, 1 - Math.exp(-dt * 5));
    }
    this.camara.lookAt(mira);

    this.renderer.render(this.escena, this.camara);
  };

  destruir() {
    cancelAnimationFrame(this.animacion);
    this.observador.disconnect();
    this.escena.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m: THREE.Material & { map?: THREE.Texture | null }) => {
          m.map?.dispose();
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
