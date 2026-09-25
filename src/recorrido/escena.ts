/**
 * Escenario virtual con Three.js: una vuelta cerrada de 17 km con terreno,
 * carretera, vegetación, casas, molinos y los ciclistas, en tercera persona.
 *
 * Todo se genera por código con semillas fijas: cada usuario ve exactamente
 * el mismo mundo sin descargar modelos. La calidad "media" reduce sombras,
 * resolución y cantidad de objetos para que vaya fluido en tablets.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Avatar, Calidad } from './avatar';
import { Ciclista3D } from './ciclista3d';
import { LONGITUD_VUELTA_M, altitud, enVuelta, pendiente } from './perfil';

const PASO_M = 5; // resolución del trazado
const ANCHO_CARRETERA = 8;
/** Franja a cada lado de la carretera donde el terreno tiene su misma altitud. */
const ZONA_LLANA_M = 30;
const COLOR_HORIZONTE = 0xcfe0ea;
const SOL = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(210));

// ---------------------------------------------------------------------------
// Utilidades
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

function suavizado(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hashEntero(a: number, b: number) {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Colinas suaves para el paisaje lejos de la carretera. */
function colinas(x: number, z: number) {
  return (
    60 +
    38 * Math.sin(x / 700 + 1) * Math.cos(z / 560) +
    18 * Math.sin((x + z) / 260) +
    8 * Math.cos((x - 2 * z) / 130) +
    3 * Math.sin(x / 41) * Math.cos(z / 37)
  );
}

// ---------------------------------------------------------------------------
// Trazado horizontal
// ---------------------------------------------------------------------------

interface Trazado {
  n: number;
  x: Float32Array;
  z: Float32Array;
  dx: Float32Array; // dirección unitaria
  dz: Float32Array;
  centroX: number;
  centroZ: number;
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
    centroX: 0,
    centroZ: 0,
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
    t.centroX += p.x / total;
    t.centroZ += p.z / total;
  }
  return t;
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
      const k = this.clave(Math.floor(tr.x[i] / tamCelda), Math.floor(tr.z[i] / tamCelda));
      const lista = this.celdas.get(k);
      if (lista) lista.push(i);
      else this.celdas.set(k, [i]);
    }
  }
  private clave(cx: number, cz: number) {
    return cx * 100003 + cz;
  }
  /** Distancia a la carretera, altitud de la carretera e índice del punto más cercano. */
  cercano(x: number, z: number) {
    const cx = Math.floor(x / this.tamCelda);
    const cz = Math.floor(z / this.tamCelda);
    let mejor = Infinity;
    let indice = -1;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const lista = this.celdas.get(this.clave(cx + i, cz + j));
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
    // Afinar con los puntos vecinos a resolución completa (el índice solo guarda 1 de cada 4)
    if (indice >= 0) {
      const n = this.tr.n;
      const base = indice;
      for (let k = base - 4; k <= base + 4; k++) {
        const j = ((k % n) + n) % n;
        const d = (this.tr.x[j] - x) ** 2 + (this.tr.z[j] - z) ** 2;
        if (d < mejor) {
          mejor = d;
          indice = j;
        }
      }
      // Distancia al segmento entre el punto más cercano y sus vecinos (no solo al vértice)
      for (const vecino of [(indice + 1) % n, (indice - 1 + n) % n]) {
        const ax = this.tr.x[indice];
        const az = this.tr.z[indice];
        const bx = this.tr.x[vecino] - ax;
        const bz = this.tr.z[vecino] - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)));
        const d = (ax + bx * t - x) ** 2 + (az + bz * t - z) ** 2;
        if (d < mejor) mejor = d;
      }
    }
    return { distancia: Math.sqrt(mejor), alt: indice >= 0 ? altitud(indice * PASO_M) : 60, indice };
  }
}

// ---------------------------------------------------------------------------
// Texturas generadas por código
// ---------------------------------------------------------------------------

function lienzo(ancho: number, alto: number) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  return { c, ctx: c.getContext('2d')! };
}

function texturaAsfalto() {
  const { c, ctx } = lienzo(256, 512);
  ctx.fillStyle = '#4a4d52';
  ctx.fillRect(0, 0, 256, 512);
  const rnd = aleatorio(7);
  // Grano del asfalto
  for (let i = 0; i < 9000; i++) {
    const g = 58 + Math.floor(rnd() * 45);
    ctx.fillStyle = `rgba(${g},${g},${g + 3},0.7)`;
    ctx.fillRect(rnd() * 256, rnd() * 512, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // Rodadas algo más oscuras y pulidas
  for (const x of [70, 186]) {
    const grad = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(20,20,24,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 30, 0, 60, 512);
  }
  // Líneas: bordes continuos y central discontinua
  ctx.fillStyle = '#ecebe6';
  ctx.fillRect(8, 0, 7, 512);
  ctx.fillRect(241, 0, 7, 512);
  ctx.fillRect(125, 0, 6, 290);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Detalle de hierba casi blanco: multiplica los colores del terreno. */
function texturaHierba() {
  const { c, ctx } = lienzo(256, 256);
  ctx.fillStyle = '#e6e6e6';
  ctx.fillRect(0, 0, 256, 256);
  const rnd = aleatorio(11);
  for (let i = 0; i < 7000; i++) {
    const g = 170 + Math.floor(rnd() * 85);
    ctx.strokeStyle = `rgba(${g - 10},${g},${g - 25},0.55)`;
    ctx.lineWidth = 1;
    const x = rnd() * 256;
    const y = rnd() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function texturaTexto(texto: string, fondo: string, color: string, ancho = 512, alto = 128) {
  const { c, ctx } = lienzo(ancho, alto);
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

function texturaNube(semilla: number) {
  const { c, ctx } = lienzo(256, 128);
  const rnd = aleatorio(semilla);
  for (let i = 0; i < 14; i++) {
    const x = 40 + rnd() * 176;
    const y = 50 + rnd() * 40;
    const r = 18 + rnd() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface OtroCiclista {
  uid: string;
  nombre: string;
  avatar: Avatar;
  distancia: number; // m
  velocidad: number; // km/h
  cadencia: number;
}

export interface DatosYo {
  distancia: number; // m (autoritativa, viene de la grabación, 1 vez/s)
  velocidad: number; // km/h
  cadencia: number;
}

interface EstadoOtro {
  c: Ciclista3D;
  nombre: string;
  sBase: number; // última distancia recibida
  recibido: number; // cuándo llegó (ms)
  vObjetivo: number; // m/s recibida
  v: number; // m/s suavizada
  cadencia: number;
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

interface PuntoRuta {
  pos: THREE.Vector3;
  dx: number;
  dz: number;
}

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------

export class EscenaRecorrido {
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private camara: THREE.PerspectiveCamera;
  private sol: THREE.DirectionalLight;
  private cielo: Sky;
  private tr = crearTrazado();
  private indice: IndiceCarretera;
  private lago: { x: number; z: number; r: number; nivel: number };
  private yo: Ciclista3D;
  private sYo = 0;
  private vYo = 0;
  private ultimaDist = 0;
  private tUltimaDist = 0;
  private otros = new Map<string, EstadoOtro>();
  private ultimaMarca = 0;
  private animacion = 0;
  private observador: ResizeObserver;
  private camaraLista = false;
  private rotores: { g: THREE.Object3D; vel: number }[] = [];
  private nubes: THREE.Sprite[] = [];
  /** Grupos de vegetación pequeña que solo se dibujan cerca del ciclista. */
  private zonasCercanas: { x: number; z: number; radio: number; mallas: THREE.Object3D[] }[] = [];
  private proximaRevisionZonas = 0;
  // Resolución dinámica
  private ratioPixeles: number;
  private ratioMaximo: number;
  private sumaFrames = 0;
  private numFrames = 0;
  private proximoAjuste = 0;
  private bloqueoSubida = 0;
  private factor: number; // 1 en alta, menos en media
  private punto: PuntoRuta = { pos: new THREE.Vector3(), dx: 1, dz: 0 };
  private detras = new THREE.Vector3();
  private mira = new THREE.Vector3();

  constructor(
    private contenedor: HTMLElement,
    avatar: Avatar,
    private leerYo: () => DatosYo,
    private calidad: Calidad = 'alta',
  ) {
    const alta = calidad === 'alta';
    this.factor = alta ? 1 : 0.5;
    this.renderer = new THREE.WebGLRenderer({ antialias: alta, powerPreference: 'high-performance' });
    this.ratioMaximo = Math.min(window.devicePixelRatio, alta ? 1.5 : 1);
    this.ratioPixeles = this.ratioMaximo;
    this.renderer.setPixelRatio(this.ratioPixeles);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.renderer.shadowMap.enabled = alta;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    contenedor.appendChild(this.renderer.domElement);

    this.camara = new THREE.PerspectiveCamera(55, 1, 0.3, 9000);
    this.escena.fog = new THREE.Fog(COLOR_HORIZONTE, 500, 4200);

    // Cielo físico con sol, y luz ambiental calculada a partir de él
    this.cielo = new Sky();
    this.cielo.scale.setScalar(8000);
    const u = this.cielo.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(SOL);
    this.escena.add(this.cielo);
    this.crearIluminacionAmbiente();

    this.sol = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sol.castShadow = alta;
    this.sol.shadow.mapSize.set(2048, 2048);
    const sc = this.sol.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 400;
    this.sol.shadow.bias = -0.0004;
    this.sol.shadow.normalBias = 0.03;
    this.escena.add(this.sol, this.sol.target);
    this.escena.add(new THREE.HemisphereLight(0xcfe6ff, 0x55683a, 0.5));

    this.indice = new IndiceCarretera(this.tr);
    this.lago = this.situarLago();

    this.crearTerreno();
    this.crearCarretera();
    this.crearQuitamiedosYVallas();
    this.crearVegetacion();
    this.crearCasas();
    this.crearMolinos();
    this.crearAgua();
    this.crearMontanas();
    this.crearNubes();
    this.crearSalidaYMarcas();

    this.yo = new Ciclista3D(avatar);
    this.escena.add(this.yo.raiz);
    this.sYo = leerYo().distancia;
    this.ultimaDist = this.sYo;
    this.tUltimaDist = performance.now();

    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(contenedor);
    this.ajustarTamano();
    this.bucle();
    // Solo en desarrollo: acceso desde la consola para medir rendimiento
    if (import.meta.env.DEV) (window as unknown as { __escena: EscenaRecorrido }).__escena = this;
  }

  // =========================================================================
  // Construcción del mundo
  // =========================================================================

  private crearIluminacionAmbiente() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const escenaCielo = new THREE.Scene();
    const cielo = new Sky();
    cielo.scale.setScalar(50);
    Object.entries(this.cielo.material.uniforms).forEach(([k, v]) => {
      const destino = cielo.material.uniforms[k];
      if (destino && v.value?.copy) destino.value.copy(v.value);
      else if (destino) destino.value = v.value;
    });
    escenaCielo.add(cielo);
    this.escena.environment = pmrem.fromScene(escenaCielo).texture;
    this.escena.environmentIntensity = 0.55;
    cielo.geometry.dispose();
    cielo.material.dispose();
    pmrem.dispose();
  }

  /** Lago junto al llano del km 8, hacia el interior de la vuelta. */
  private situarLago() {
    const i = Math.round(8200 / PASO_M);
    const px = this.tr.x[i];
    const pz = this.tr.z[i];
    const hx = this.tr.centroX - px;
    const hz = this.tr.centroZ - pz;
    const l = Math.hypot(hx, hz) || 1;
    return { x: px + (hx / l) * 270, z: pz + (hz / l) * 270, r: 175, nivel: altitud(8200) - 2 };
  }

  /** Altura del terreno: igual a la carretera cerca de ella, colinas lejos y el hueco del lago. */
  private alturaTerreno(x: number, z: number, cercano = this.indice.cercano(x, z)) {
    const w = suavizado(ZONA_LLANA_M, 300, cercano.distancia);
    let h = cercano.alt * (1 - w) + colinas(x, z) * w;
    const dl = Math.hypot(x - this.lago.x, z - this.lago.z);
    if (dl < this.lago.r + 90) {
      const fondo = this.lago.nivel - 3 - 4 * (1 - dl / (this.lago.r + 90));
      h = THREE.MathUtils.lerp(fondo, h, suavizado(this.lago.r - 20, this.lago.r + 90, dl));
    }
    return h;
  }

  private enLago(x: number, z: number, margen = 15) {
    return Math.hypot(x - this.lago.x, z - this.lago.z) < this.lago.r + margen;
  }

  /** Color base del terreno: cunetas, praderas junto a la carretera y campos de cultivo lejos. */
  private colorTerreno(x: number, z: number, distancia: number, h: number, c: THREE.Color) {
    const praderas = [0x6b9a45, 0x5f8f3e, 0x77a24d];
    const campos = [0xc9b35d, 0x86a24a, 0x8e6f48, 0x6f9e4a, 0x4f7a36, 0xd2c23d, 0xa7b35a];
    // Parcelas giradas para que no parezcan una cuadrícula
    const rx = x * 0.8 + z * 0.6;
    const rz = -x * 0.6 + z * 0.8;
    const celda = hashEntero(Math.floor(rx / 230), Math.floor(rz / 150));
    const campo = new THREE.Color(campos[Math.floor(celda * campos.length)]);
    // Surcos
    campo.multiplyScalar(0.94 + 0.06 * Math.sin(rx * 0.9));
    const pradera = new THREE.Color(praderas[Math.floor(hashEntero(Math.floor(x / 90), Math.floor(z / 90)) * 3)]);
    c.copy(pradera).lerp(campo, suavizado(110, 260, distancia));
    // Zonas altas más secas
    if (h > 95) c.lerp(new THREE.Color(0x9a9a58), suavizado(95, 140, h) * 0.5);
    // Cuneta de tierra y grava junto al asfalto
    if (distancia < 9) c.lerp(new THREE.Color(0x8c7f63), 1 - distancia / 9);
    // Orilla del lago
    const dl = Math.hypot(x - this.lago.x, z - this.lago.z);
    if (dl < this.lago.r + 30) c.lerp(new THREE.Color(0xb8a98a), 1 - suavizado(this.lago.r - 10, this.lago.r + 30, dl));
    return c;
  }

  private crearTerreno() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.tr.n; i++) {
      minX = Math.min(minX, this.tr.x[i]);
      maxX = Math.max(maxX, this.tr.x[i]);
      minZ = Math.min(minZ, this.tr.z[i]);
      maxZ = Math.max(maxZ, this.tr.z[i]);
    }
    const margen = 2600;
    const ancho = maxX - minX + margen * 2;
    const fondo = maxZ - minZ + margen * 2;
    const seg = this.calidad === 'alta' ? 256 : 200;
    const geo = new THREE.PlaneGeometry(ancho, fondo, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const colores = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const cerca = this.indice.cercano(x, z);
      const h = this.alturaTerreno(x, z, cerca);
      // Junto a la carretera el terreno baja un poco para que nunca la tape
      pos.setY(i, h - 0.6 * (1 - suavizado(ZONA_LLANA_M, 2 * ZONA_LLANA_M, cerca.distancia)));
      this.colorTerreno(x, z, cerca.distancia, h, c);
      colores.set([c.r, c.g, c.b], i * 3);
      // Coordenadas de textura en metros (la hierba se repite cada 6 m)
      uv.setXY(i, x / 6, z / 6);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    geo.computeVertexNormals();
    const terreno = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, map: texturaHierba(), roughness: 1, envMapIntensity: 0.35 }),
    );
    terreno.receiveShadow = true;
    this.escena.add(terreno);
  }

  /** Cinta que sigue la carretera (asfalto, arcenes, raíles…). */
  private cinta(
    lateralA: number,
    lateralB: number,
    alturaA: number,
    alturaB: number,
    desde: number,
    hasta: number,
    material: THREE.Material,
    uvRepetir = 12,
  ) {
    const i0 = Math.floor(desde / PASO_M);
    const i1 = Math.ceil(hasta / PASO_M);
    const n = i1 - i0;
    const pos = new Float32Array((n + 1) * 6);
    const uv = new Float32Array((n + 1) * 4);
    const indices: number[] = [];
    for (let k = 0; k <= n; k++) {
      const i = (((i0 + k) % this.tr.n) + this.tr.n) % this.tr.n;
      const s = (i0 + k) * PASO_M;
      const y = altitud(s);
      const rx = -this.tr.dz[i];
      const rz = this.tr.dx[i];
      pos.set([this.tr.x[i] + rx * lateralA, y + alturaA, this.tr.z[i] + rz * lateralA], k * 6);
      pos.set([this.tr.x[i] + rx * lateralB, y + alturaB, this.tr.z[i] + rz * lateralB], k * 6 + 3);
      uv.set([0, s / uvRepetir, 1, s / uvRepetir], k * 4);
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
    const malla = new THREE.Mesh(geo, material);
    malla.receiveShadow = true;
    this.escena.add(malla);
    return malla;
  }

  private crearCarretera() {
    const asfalto = new THREE.MeshStandardMaterial({ map: texturaAsfalto(), roughness: 0.92, side: THREE.DoubleSide });
    this.cinta(-ANCHO_CARRETERA / 2, ANCHO_CARRETERA / 2, 0.3, 0.3, 0, LONGITUD_VUELTA_M, asfalto);
    // Arcenes de grava un poco más bajos
    const grava = new THREE.MeshStandardMaterial({ color: 0x8a8272, roughness: 1, side: THREE.DoubleSide });
    this.cinta(-ANCHO_CARRETERA / 2 - 1.3, -ANCHO_CARRETERA / 2, 0.05, 0.28, 0, LONGITUD_VUELTA_M, grava);
    this.cinta(ANCHO_CARRETERA / 2, ANCHO_CARRETERA / 2 + 1.3, 0.28, 0.05, 0, LONGITUD_VUELTA_M, grava);
  }

  /** Postes repetidos a lo largo de la carretera (instanciados). */
  private postes(
    tramos: [number, number][],
    lateral: number,
    cada: number,
    geometria: THREE.BufferGeometry,
    material: THREE.Material,
    alturaCentro: number,
  ) {
    const lista: THREE.Matrix4[] = [];
    for (const [a, b] of tramos) {
      for (let s = a; s <= b; s += cada) {
        const i = Math.round(s / PASO_M) % this.tr.n;
        const m = new THREE.Matrix4().makeRotationY(Math.atan2(-this.tr.dz[i], this.tr.dx[i]));
        m.setPosition(
          this.tr.x[i] - this.tr.dz[i] * lateral,
          altitud(s) + alturaCentro,
          this.tr.z[i] + this.tr.dx[i] * lateral,
        );
        lista.push(m);
      }
    }
    const inst = new THREE.InstancedMesh(geometria, material, lista.length);
    lista.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = true;
    this.escena.add(inst);
  }

  private crearQuitamiedosYVallas() {
    // Quitamiedos metálicos en las bajadas (lado exterior)
    const metal = new THREE.MeshStandardMaterial({ color: 0xc7ccd1, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide });
    const bajadas: [number, number][] = [[5000, 7500], [13000, 15000], [10600, 11900]];
    for (const [a, b] of bajadas) this.cinta(6.2, 6.2, 0.55, 0.9, a, b, metal, 4);
    this.postes(bajadas, 6.25, 4, new THREE.BoxGeometry(0.1, 0.9, 0.12), metal, 0.45);

    // Vallas de madera en los llanos
    const madera = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9, side: THREE.DoubleSide });
    const llanos: [number, number][] = [[200, 1400], [7600, 8900], [15300, 16700]];
    for (const lado of [-9, 9]) {
      this.postes(llanos, lado, 3, new THREE.BoxGeometry(0.12, 1.2, 0.12), madera, 0.6);
      for (const alto of [0.5, 0.95]) {
        for (const [a, b] of llanos) this.cinta(lado, lado, alto, alto + 0.08, a, b, madera, 3);
      }
    }
  }

  private crearVegetacion() {
    const rnd = aleatorio(42);
    const f = this.factor;
    const q = new THREE.Quaternion();
    const e = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const color = new THREE.Color();

    // --- Geometrías (fusionadas para dibujar cada tipo de una vez) ---
    const pino = mergeGeometries([
      new THREE.ConeGeometry(2.6, 4.5, 8).translate(0, 4, 0),
      new THREE.ConeGeometry(2.1, 4, 8).translate(0, 6.3, 0),
      new THREE.ConeGeometry(1.5, 3.4, 8).translate(0, 8.4, 0),
    ])!;
    const copaFrondosa = mergeGeometries([
      new THREE.IcosahedronGeometry(2.6, 1).translate(0, 5.2, 0),
      new THREE.IcosahedronGeometry(2.0, 1).translate(1.6, 4.4, 0.6),
      new THREE.IcosahedronGeometry(2.1, 1).translate(-1.3, 4.6, -0.9),
      new THREE.IcosahedronGeometry(1.8, 1).translate(0.3, 6.6, 0.4),
    ])!;
    const chopo = new THREE.IcosahedronGeometry(1.6, 1).scale(1, 3.2, 1).translate(0, 7, 0);
    const tronco = new THREE.CylinderGeometry(0.25, 0.4, 4, 6).translate(0, 2, 0);
    const arbusto = new THREE.IcosahedronGeometry(1, 1).scale(1.3, 0.75, 1.1).translate(0, 0.45, 0);
    const roca = new THREE.DodecahedronGeometry(1, 0);
    // Mata de hierba: 7 hojas finas abiertas en abanico
    const mata = mergeGeometries(
      Array.from({ length: 7 }, (_, k) => {
        const a = (k / 7) * Math.PI * 2;
        const alto = 0.35 + ((k * 37) % 10) / 40;
        return new THREE.ConeGeometry(0.035, alto, 3)
          .translate(0, alto / 2, 0)
          .rotateX(Math.sin(a) * 0.45)
          .rotateZ(Math.cos(a) * 0.45)
          .translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
      }),
    )!;
    const flor = new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0.35, 0);

    const matCopa = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const matTronco = new THREE.MeshStandardMaterial({ color: 0x5e4330, roughness: 1 });
    const matRoca = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const matHierba = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });

    // --- Colocación ---
    type Lugar = { x: number; z: number; y: number };
    /** Punto junto a la carretera, entre min y max metros, fuera del asfalto y del lago. */
    const junto = (min: number, max: number, sesgo = 2): Lugar | null => {
      const i = Math.floor(rnd() * this.tr.n);
      const lado = rnd() < 0.5 ? -1 : 1;
      const sep = min + rnd() ** sesgo * (max - min);
      const x = this.tr.x[i] - this.tr.dz[i] * lado * sep + (rnd() - 0.5) * 8;
      const z = this.tr.z[i] + this.tr.dx[i] * lado * sep + (rnd() - 0.5) * 8;
      const cerca = this.indice.cercano(x, z);
      // Nunca sobre el asfalto ni el arcén (la calzada llega a 4 m del eje y el arcén a 5,3 m)
      if (cerca.distancia < Math.max(min, 5.6) || this.enLago(x, z)) return null;
      return { x, z, y: this.alturaTerreno(x, z, cerca) };
    };
    // Bosquecillos repartidos por el paisaje
    const bosques = Array.from({ length: 32 }, () => {
      const l = junto(180, 1300, 1);
      return l ? { ...l, r: 60 + rnd() * 90 } : null;
    }).filter((b): b is Lugar & { r: number } => b !== null);
    const enBosque = (): Lugar | null => {
      const b = bosques[Math.floor(rnd() * bosques.length)];
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * b.r;
      const x = b.x + Math.cos(a) * d;
      const z = b.z + Math.sin(a) * d;
      const cerca = this.indice.cercano(x, z);
      if (cerca.distancia < 14 || this.enLago(x, z)) return null;
      return { x, z, y: this.alturaTerreno(x, z, cerca) };
    };

    /**
     * Coloca objetos instanciados agrupados por zonas (celdas de `celda` metros).
     * Cada zona es una malla aparte: así Three.js descarta las que no se ven, y las
     * que tienen `visibleHasta` solo se dibujan cerca del ciclista.
     */
    const instanciar = (
      geometrias: [THREE.BufferGeometry, THREE.Material, boolean?][], // boolean: sin color de instancia (troncos)
      cantidad: number,
      lugar: () => Lugar | null,
      escala: () => [number, number, number],
      colorear: (c: THREE.Color) => THREE.Color,
      opciones: { celda: number; visibleHasta?: number; hundir?: number },
    ) => {
      const { celda, visibleHasta, hundir = 0 } = opciones;
      const zonas = new Map<number, { x: number; z: number; matrices: THREE.Matrix4[]; colores: THREE.Color[] }>();
      let n = 0;
      for (let intento = 0; intento < cantidad * 4 && n < cantidad; intento++) {
        const l = lugar();
        if (!l) continue;
        const [sx, sy, sz] = escala();
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2);
        m.compose(e.set(l.x, l.y - hundir * sy, l.z), q, new THREE.Vector3(sx, sy, sz));
        colorear(color);
        const cx = Math.floor(l.x / celda);
        const cz = Math.floor(l.z / celda);
        const clave = cx * 100003 + cz;
        let zona = zonas.get(clave);
        if (!zona) {
          zona = { x: (cx + 0.5) * celda, z: (cz + 0.5) * celda, matrices: [], colores: [] };
          zonas.set(clave, zona);
        }
        zona.matrices.push(m.clone());
        zona.colores.push(color.clone());
        n++;
      }
      const blanco = new THREE.Color(1, 1, 1);
      for (const zona of zonas.values()) {
        const mallas = geometrias.map(([g, mat, sinColor]) => {
          const im = new THREE.InstancedMesh(g, mat, zona.matrices.length);
          zona.matrices.forEach((mm, i) => {
            im.setMatrixAt(i, mm);
            im.setColorAt(i, sinColor ? blanco : zona.colores[i]);
          });
          im.computeBoundingSphere();
          this.escena.add(im);
          return im;
        });
        if (visibleHasta) {
          this.zonasCercanas.push({ x: zona.x, z: zona.z, radio: visibleHasta + celda * 0.75, mallas });
        }
      }
    };

    // Pinos (junto a la carretera y en bosques)
    instanciar(
      [[pino, matCopa], [tronco, matTronco, true]],
      Math.round(1900 * f),
      () => (rnd() < 0.55 ? enBosque() : junto(13, 260)),
      () => {
        const s = 0.7 + rnd() * 0.9;
        return [s, s * (0.9 + rnd() * 0.3), s];
      },
      (c) => c.setHSL(0.3 + rnd() * 0.06, 0.4, 0.2 + rnd() * 0.08),
      { celda: 1500 },
    );
    // Árboles frondosos
    instanciar(
      [[copaFrondosa, matCopa], [tronco, matTronco, true]],
      Math.round(1500 * f),
      () => (rnd() < 0.5 ? enBosque() : junto(12, 320)),
      () => {
        const s = 0.7 + rnd() * 0.8;
        return [s, s, s];
      },
      (c) => c.setHSL(0.2 + rnd() * 0.1, 0.45, 0.25 + rnd() * 0.1),
      { celda: 1500 },
    );
    // Chopos alrededor del lago y en hileras junto a los llanos
    instanciar(
      [[chopo, matCopa], [tronco, matTronco, true]],
      Math.round(320 * f),
      () => {
        if (rnd() < 0.6) {
          const a = rnd() * Math.PI * 2;
          const d = this.lago.r + 15 + rnd() * 40;
          const x = this.lago.x + Math.cos(a) * d;
          const z = this.lago.z + Math.sin(a) * d;
          const cerca = this.indice.cercano(x, z);
          if (cerca.distancia < 14) return null;
          return { x, z, y: this.alturaTerreno(x, z, cerca) };
        }
        return junto(14, 60);
      },
      () => {
        const s = 0.8 + rnd() * 0.5;
        return [s, s, s];
      },
      (c) => c.setHSL(0.22 + rnd() * 0.05, 0.5, 0.3 + rnd() * 0.08),
      { celda: 1500 },
    );
    // Arbustos
    instanciar(
      [[arbusto, matCopa]],
      Math.round(1800 * f),
      () => junto(7, 200),
      () => {
        const s = 0.5 + rnd() * 1.1;
        return [s, s, s];
      },
      (c) => c.setHSL(0.24 + rnd() * 0.08, 0.45, 0.2 + rnd() * 0.1),
      { celda: 300, visibleHasta: 700 },
    );
    // Rocas
    instanciar(
      [[roca, matRoca]],
      Math.round(600 * f),
      () => junto(8, 400, 1.5),
      () => {
        const s = 0.3 + rnd() ** 2 * 2.2;
        return [s * (1 + rnd() * 0.5), s * (0.6 + rnd() * 0.5), s];
      },
      (c) => c.setHSL(0.08, 0.05 + rnd() * 0.06, 0.45 + rnd() * 0.15),
      { celda: 300, visibleHasta: 600, hundir: 0.35 },
    );
    // Matas de hierba alta junto a la carretera
    instanciar(
      [[mata, matHierba]],
      // Muchas, pero solo se dibujan las cercanas
      Math.round(34000 * f),
      () => junto(5.2, 45, 2.2),
      () => {
        const s = 1.1 + rnd() * 1.2;
        return [s * 1.3, s * (0.8 + rnd() * 0.5), s * 1.3];
      },
      (c) => c.setHSL(0.24 + rnd() * 0.06, 0.5 + rnd() * 0.2, 0.17 + rnd() * 0.1),
      { celda: 150, visibleHasta: 220 },
    );
    // Flores silvestres
    const coloresFlor = [0xffffff, 0xf5d90a, 0xb57bd6, 0xe04a4a, 0xf2a0c0];
    instanciar(
      [[flor, matHierba]],
      Math.round(3500 * f),
      () => junto(5.5, 35, 2),
      () => [1, 0.8 + rnd() * 0.6, 1],
      (c) => c.setHex(coloresFlor[Math.floor(rnd() * coloresFlor.length)]),
      { celda: 150, visibleHasta: 160 },
    );
  }

  private crearCasas() {
    const rnd = aleatorio(99);
    const paredes = [0xefe6d6, 0xe8dcc2, 0xf3efe6, 0xd9c6a5];
    const matTejado = new THREE.MeshStandardMaterial({ color: 0xa2482b, roughness: 0.8, flatShading: true });
    const matVentana = new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.2, metalness: 0.4 });
    const matMadera = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.9 });
    let colocadas = 0;
    for (let intento = 0; intento < 400 && colocadas < 18; intento++) {
      const i = Math.floor(rnd() * this.tr.n);
      const lado = rnd() < 0.5 ? -1 : 1;
      const sep = 40 + rnd() * 320;
      const x = this.tr.x[i] - this.tr.dz[i] * lado * sep;
      const z = this.tr.z[i] + this.tr.dx[i] * lado * sep;
      const cerca = this.indice.cercano(x, z);
      if (cerca.distancia < 32 || this.enLago(x, z, 40)) continue;
      // Terreno bastante llano
      const h = this.alturaTerreno(x, z, cerca);
      const pendienteLocal = Math.abs(this.alturaTerreno(x + 8, z) - this.alturaTerreno(x - 8, z)) +
        Math.abs(this.alturaTerreno(x, z + 8) - this.alturaTerreno(x, z - 8));
      if (pendienteLocal > 5) continue;

      const casa = new THREE.Group();
      const w = 8 + rnd() * 6;
      const d = 6 + rnd() * 3;
      const alto = 3.2 + (rnd() < 0.4 ? 2.8 : 0);
      const matPared = new THREE.MeshStandardMaterial({ color: paredes[Math.floor(rnd() * paredes.length)], roughness: 0.9 });
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(w, alto + 2, d), matPared);
      cuerpo.position.y = alto / 2 - 1; // se hunde 2 m por si el suelo no es plano
      // Tejado a dos aguas: prisma triangular
      const forma = new THREE.Shape();
      forma.moveTo(-d / 2 - 0.4, 0);
      forma.lineTo(d / 2 + 0.4, 0);
      forma.lineTo(0, 2.2);
      forma.closePath();
      const tejado = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: w + 0.8, bevelEnabled: false }), matTejado);
      tejado.rotation.y = Math.PI / 2;
      tejado.position.set(-(w + 0.8) / 2, alto, 0);
      const chimenea = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), matPared);
      chimenea.position.set(w * 0.25, alto + 1.6, d * 0.15);
      casa.add(cuerpo, tejado, chimenea);
      // Ventanas y puerta
      for (const cara of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const v = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 0.1), matVentana);
          v.position.set(-w / 2 + (w / 4) * (k + 1), alto * 0.55, (d / 2) * cara + 0.02 * cara);
          casa.add(v);
        }
      }
      const puerta = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), matMadera);
      puerta.position.set(0, 1.05, d / 2 + 0.03);
      casa.add(puerta);
      casa.position.set(x, h, z);
      casa.rotation.y = Math.atan2(-this.tr.dz[i], this.tr.dx[i]) + (rnd() < 0.5 ? 0 : Math.PI / 2);
      casa.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.escena.add(casa);
      colocadas++;
    }
  }

  private crearMolinos() {
    const rnd = aleatorio(5);
    const blanco = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.45 });
    let n = 0;
    for (let intento = 0; intento < 300 && n < 8; intento++) {
      const i = Math.floor(rnd() * this.tr.n);
      const lado = rnd() < 0.5 ? -1 : 1;
      const sep = 500 + rnd() * 1300;
      const x = this.tr.x[i] - this.tr.dz[i] * lado * sep;
      const z = this.tr.z[i] + this.tr.dx[i] * lado * sep;
      const cerca = this.indice.cercano(x, z);
      if (cerca.distancia < 400 || this.enLago(x, z, 100)) continue;
      const h = this.alturaTerreno(x, z, cerca);
      if (h < 70) continue; // en lo alto de las colinas
      const molino = new THREE.Group();
      const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 62, 12), blanco);
      torre.position.y = 31;
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.6), blanco);
      gondola.position.set(0.5, 63, 0);
      const rotor = new THREE.Group();
      rotor.position.set(3.8, 63, 0);
      rotor.add(new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), blanco));
      for (let k = 0; k < 3; k++) {
        const pala = new THREE.Mesh(new THREE.BoxGeometry(0.3, 26, 1.5).translate(0, 13.5, 0), blanco);
        pala.rotation.x = (k * Math.PI * 2) / 3;
        rotor.add(pala);
      }
      molino.add(torre, gondola, rotor);
      molino.position.set(x, h - 1, z);
      molino.rotation.y = rnd() * Math.PI * 2;
      this.escena.add(molino);
      this.rotores.push({ g: rotor, vel: 0.6 + rnd() * 0.5 });
      n++;
    }
  }

  private crearAgua() {
    const agua = new THREE.Mesh(
      new THREE.CircleGeometry(this.lago.r + 35, 64),
      new THREE.MeshStandardMaterial({
        color: 0x2e6a86,
        roughness: 0.06,
        metalness: 0.25,
        transparent: true,
        opacity: 0.92,
        envMapIntensity: 1.2,
      }),
    );
    agua.rotation.x = -Math.PI / 2;
    agua.position.set(this.lago.x, this.lago.nivel, this.lago.z);
    this.escena.add(agua);
  }

  private crearMontanas() {
    const rnd = aleatorio(3);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rnd() * 0.1;
      const d = 5200 + rnd() * 900;
      const alto = 380 + rnd() * 620;
      const radio = 900 + rnd() * 900;
      const g = new THREE.ConeGeometry(radio, alto, 12, 6);
      // Deformar según el ángulo y la altura (sin grietas en la costura del cono)
      const p = g.attributes.position as THREE.BufferAttribute;
      const fase = rnd() * 10;
      const colores = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      const bajo = new THREE.Color(0x6d8398);
      const medio = new THREE.Color(0x93a7ba);
      const nieve = new THREE.Color(0xe8eef3);
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k);
        const z = p.getZ(k);
        const y = p.getY(k);
        const ang = Math.atan2(z, x);
        const h = (y + alto / 2) / alto; // 0 abajo, 1 en la cima
        const irregular = 1 + 0.18 * Math.sin(3 * ang + fase) + 0.1 * Math.sin(7 * ang + fase * 2) * (1 - h);
        p.setXYZ(k, x * irregular, y * (1 + 0.08 * Math.sin(5 * ang + fase)), z * irregular);
        c.copy(bajo).lerp(medio, Math.min(1, h * 1.6));
        if (alto > 750 && h > 0.72) c.lerp(nieve, suavizado(0.72, 0.85, h));
        colores.set([c.r, c.g, c.b], k * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
      g.translate(this.tr.centroX + Math.cos(a) * d, alto / 2 - 20, this.tr.centroZ + Math.sin(a) * d);
      geos.push(g.toNonIndexed());
      g.dispose();
    }
    const montes = new THREE.Mesh(
      mergeGeometries(geos)!,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, fog: false }),
    );
    this.escena.add(montes);
  }

  private crearNubes() {
    const rnd = aleatorio(17);
    const texturas = [1, 2, 3, 4].map((s) => texturaNube(s));
    for (let i = 0; i < Math.round(36 * this.factor + 8); i++) {
      const nube = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texturas[i % 4], fog: false, transparent: true, depthWrite: false, opacity: 0.85 }),
      );
      const a = rnd() * Math.PI * 2;
      const d = 800 + rnd() * 4200;
      const ancho = 500 + rnd() * 700;
      nube.scale.set(ancho, ancho * 0.45, 1);
      nube.position.set(this.tr.centroX + Math.cos(a) * d, 650 + rnd() * 500, this.tr.centroZ + Math.sin(a) * d);
      this.escena.add(nube);
      this.nubes.push(nube);
    }
  }

  private crearSalidaYMarcas() {
    // Arco de salida/meta en el km 0
    const i = 0;
    const rx = -this.tr.dz[i];
    const rz = this.tr.dx[i];
    const y = altitud(0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 });
    for (const lado of [-1, 1]) {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 6.5, 12), mat);
      poste.position.set(this.tr.x[i] + rx * lado * 5.8, y + 3.25, this.tr.z[i] + rz * lado * 5.8);
      poste.castShadow = true;
      this.escena.add(poste);
    }
    const cartel = new THREE.MeshStandardMaterial({ map: texturaTexto('SALIDA · META', '#ff6a1a', '#111111'), roughness: 0.6 });
    const pancarta = new THREE.Mesh(new THREE.BoxGeometry(12.2, 1.7, 0.35), [mat, mat, mat, mat, cartel, cartel]);
    pancarta.position.set(this.tr.x[i], y + 6.4, this.tr.z[i]);
    pancarta.rotation.y = Math.atan2(-this.tr.dz[i], this.tr.dx[i]) + Math.PI / 2;
    pancarta.castShadow = true;
    this.escena.add(pancarta);

    // Carteles de kilómetro sobre un poste
    const matPoste = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.6 });
    for (let km = 1; km < LONGITUD_VUELTA_M / 1000; km++) {
      const k = Math.round((km * 1000) / PASO_M) % this.tr.n;
      const sx = -this.tr.dz[k];
      const sz = this.tr.dx[k];
      const base = new THREE.Vector3(this.tr.x[k] + sx * 6.5, altitud(km * 1000), this.tr.z[k] + sz * 6.5);
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), matPoste);
      poste.position.copy(base).add(new THREE.Vector3(0, 1.1, 0));
      const placa = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.55, 0.05),
        new THREE.MeshStandardMaterial({ map: texturaTexto(`${km} km`, '#ffffff', '#1a1a1a', 256, 128), roughness: 0.5 }),
      );
      placa.position.copy(base).add(new THREE.Vector3(0, 2.1, 0));
      placa.rotation.y = Math.atan2(-this.tr.dz[k], this.tr.dx[k]) + Math.PI / 2;
      this.escena.add(poste, placa);
    }
  }

  // =========================================================================
  // Posición en la carretera
  // =========================================================================

  /** Punto de la carretera a la distancia s, desplazado lateralmente (escribe en `salida`). */
  private puntoEn(s: number, lateral: number, salida: PuntoRuta) {
    const x = enVuelta(s) / PASO_M;
    const i = Math.floor(x) % this.tr.n;
    const j = (i + 1) % this.tr.n;
    const f = x - Math.floor(x);
    const dx = this.tr.dx[i] * (1 - f) + this.tr.dx[j] * f;
    const dz = this.tr.dz[i] * (1 - f) + this.tr.dz[j] * f;
    const l = Math.hypot(dx, dz) || 1;
    const px = this.tr.x[i] * (1 - f) + this.tr.x[j] * f;
    const pz = this.tr.z[i] * (1 - f) + this.tr.z[j] * f;
    salida.pos.set(px - (dz / l) * lateral, altitud(s) + 0.3, pz + (dx / l) * lateral);
    salida.dx = dx / l;
    salida.dz = dz / l;
    return salida;
  }

  // =========================================================================
  // Otros ciclistas
  // =========================================================================

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
          recibido: ahora,
          vObjetivo: o.velocidad / 3.6,
          v: o.velocidad / 3.6,
          cadencia: o.cadencia,
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
      e.vObjetivo = o.velocidad / 3.6;
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

  // =========================================================================
  // Bucle de dibujo
  // =========================================================================

  private ajustarTamano() {
    const w = this.contenedor.clientWidth || 1;
    const h = this.contenedor.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  /**
   * Movimiento suave: la distancia real llega 1 vez por segundo, así que se
   * predice la posición con la velocidad desde el último dato y se acerca a
   * esa predicción poco a poco (sin correcciones hacia atrás).
   */
  private avanzar(
    sActual: number,
    sDato: number,
    tDato: number,
    v: number,
    ahora: number,
    dt: number,
    margen: number, // diferencia que se tolera sin corregir (m)
    tasa: number, // rapidez de la corrección (1/s)
  ) {
    const prediccion = sDato + v * Math.min(2, (ahora - tDato) / 1000);
    const siguiente = sActual + v * dt;
    const error = prediccion - siguiente;
    if (Math.abs(error) > 40) return prediccion; // salto grande (p. ej. al entrar): colocar directamente
    if (Math.abs(error) <= margen) return siguiente; // dentro del margen: avance limpio con la velocidad
    const exceso = error - Math.sign(error) * margen;
    return siguiente + exceso * Math.min(1, dt * tasa);
  }

  /** Muestra solo la vegetación pequeña cercana (se revisa 4 veces por segundo). */
  private revisarZonas(x: number, z: number, ahora: number) {
    if (ahora < this.proximaRevisionZonas) return;
    this.proximaRevisionZonas = ahora + 250;
    for (const zona of this.zonasCercanas) {
      const visible = (zona.x - x) ** 2 + (zona.z - z) ** 2 < zona.radio * zona.radio;
      for (const m of zona.mallas) m.visible = visible;
    }
  }

  /**
   * Resolución dinámica: si el dispositivo no llega a ~45 imágenes por segundo se
   * baja la resolución; si va sobrado, se sube hasta el máximo de la calidad elegida.
   */
  private resolucionDinamica(dt: number, ahora: number) {
    this.sumaFrames += dt;
    this.numFrames++;
    if (ahora < this.proximoAjuste) return;
    const media = (this.sumaFrames / this.numFrames) * 1000;
    this.sumaFrames = 0;
    this.numFrames = 0;
    this.proximoAjuste = ahora + 1500;
    let nuevo = this.ratioPixeles;
    if (media > 22 && this.ratioPixeles > 0.6) {
      nuevo = Math.max(0.6, this.ratioPixeles - 0.15);
      this.bloqueoSubida = ahora + 10000;
    } else if (media < 17.5 && this.ratioPixeles < this.ratioMaximo && ahora > this.bloqueoSubida) {
      nuevo = Math.min(this.ratioMaximo, this.ratioPixeles + 0.1);
    }
    if (nuevo !== this.ratioPixeles) {
      this.ratioPixeles = nuevo;
      this.renderer.setPixelRatio(nuevo);
      this.ajustarTamano();
    }
  }

  private bucle = (marca?: number) => {
    this.animacion = requestAnimationFrame(this.bucle);
    // La marca de tiempo del navegador va sincronizada con el refresco de pantalla:
    // usarla (y no un reloj propio) hace el movimiento más regular
    const ahora = marca ?? performance.now();
    const dt = this.ultimaMarca ? Math.min(0.1, Math.max(0, (ahora - this.ultimaMarca) / 1000)) : 0;
    this.ultimaMarca = ahora;
    const yo = this.leerYo();

    // Mi ciclista
    if (yo.distancia !== this.ultimaDist) {
      this.ultimaDist = yo.distancia;
      this.tUltimaDist = ahora;
    }
    this.vYo += (yo.velocidad / 3.6 - this.vYo) * Math.min(1, dt * 3);
    // Yo: la física y la grabación integran la misma velocidad, así que casi no hace falta corregir
    this.sYo = this.avanzar(this.sYo, this.ultimaDist, this.tUltimaDist, this.vYo, ahora, dt, 1.5, 0.3);
    const p = this.puntoEn(this.sYo, MI_CARRIL, this.punto);
    this.yo.colocar(p.pos, p.dx, p.dz, pendiente(this.sYo));
    this.yo.pedalear(this.vYo, yo.cadencia, dt);
    const miX = p.pos.x;
    const miY = p.pos.y;
    const miZ = p.pos.z;
    const dirX = p.dx;
    const dirZ = p.dz;

    // Otros ciclistas
    for (const e of this.otros.values()) {
      e.v += (e.vObjetivo - e.v) * Math.min(1, dt * 2);
      // Otros: sus datos llegan por internet con retrasos variables → algo más de margen
      e.sRender = this.avanzar(e.sRender, e.sBase, e.recibido, e.v, ahora, dt, 2.5, 0.6);
      const q = this.puntoEn(e.sRender, e.carril, this.punto);
      e.c.colocar(q.pos, q.dx, q.dz, pendiente(e.sRender));
      e.c.pedalear(e.v, e.cadencia, dt);
    }

    this.revisarZonas(miX, miZ, ahora);
    this.resolucionDinamica(dt, ahora);

    // Molinos y nubes
    for (const r of this.rotores) r.g.rotation.x += r.vel * dt;
    for (const n of this.nubes) n.position.x += 3 * dt;

    // Sol y sombras siguiendo al ciclista
    this.sol.position.set(miX + SOL.x * 150, miY + SOL.y * 150, miZ + SOL.z * 150);
    this.sol.target.position.set(miX, miY, miZ);
    this.cielo.position.set(this.camara.position.x, 0, this.camara.position.z);

    // Cámara en tercera persona, detrás y un poco por encima
    this.detras.set(miX - dirX * 6, miY + 2.3, miZ - dirZ * 6);
    this.detras.y = Math.max(this.detras.y, this.alturaTerreno(this.detras.x, this.detras.z) + 1.2);
    this.mira.set(miX + dirX * 8, miY + 1.1, miZ + dirZ * 8);
    if (!this.camaraLista) {
      this.camara.position.copy(this.detras);
      this.camaraLista = true;
    } else {
      this.camara.position.lerp(this.detras, 1 - Math.exp(-dt * 6));
    }
    this.camara.lookAt(this.mira);

    this.renderer.render(this.escena, this.camara);
  };

  destruir() {
    cancelAnimationFrame(this.animacion);
    this.observador.disconnect();
    for (const e of this.otros.values()) e.c.destruir();
    this.yo.destruir();
    const materiales = new Set<THREE.Material>();
    this.escena.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => materiales.add(m));
      }
    });
    materiales.forEach((m) => {
      (m as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
      m.dispose();
    });
    this.escena.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
