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
import { esDispositivoIos, type Avatar, type Calidad } from './avatar';
import { Ciclista3D } from './ciclista3d';
import { LONGITUD_VUELTA_M, altitud, enVuelta, pendiente } from './perfil';
import {
  cargarCielo,
  cargarModelo,
  cargarTextura,
  direccionSolDelCielo,
  prepararTexturasComprimidas,
  tiempoViento,
  type ParteModelo,
} from './recursos';
import { crestas, datosRuidoPeriodico, fbm } from './ruido';

/** Luminancia media (lineal) de la textura de hierba: sirve para usarla como detalle sin oscurecer. */
const LUMINANCIA_HIERBA = 0.05;

const PASO_M = 5; // resolución del trazado
const ANCHO_CARRETERA = 8;
/** Franja a cada lado de la carretera donde el terreno tiene su misma altitud. */
const ZONA_LLANA_M = 30;
const COLOR_HORIZONTE = 0xcfe0ea;
const SOL = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(210));

/** Mallas instanciadas de una zona del mapa (centro de la celda). */
interface ZonaInstancias {
  x: number;
  z: number;
  mallas: THREE.InstancedMesh[];
}

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

/** Línea central discontinua: 3 m pintados y 6 m sin pintar (la textura se repite cada 9 m). */
function texturaDiscontinua() {
  const { c, ctx } = lienzo(4, 96);
  ctx.clearRect(0, 0, 4, 96);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 4, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
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
  /** Mallas que solo se ven cerca del ciclista (o solo lejos, si `lejos`). */
  private zonasCercanas: { x: number; z: number; radio: number; mallas: THREE.Object3D[]; lejos?: boolean }[] = [];
  private impostor: {
    material: THREE.MeshBasicMaterial;
    lista: string[];
    medidas: { ancho: number; alto: number; base: number }[];
    planos: THREE.BufferGeometry;
  } | null = null;
  /** Árboles sencillos del fondo (copa y tronco de cada zona); se cambian por impostores. */
  private atlasImpostores: THREE.WebGLRenderTarget | null = null;
  private arbolesSencillos: { tipo: 'pino' | 'frondoso' | 'chopo'; zonas: ZonaInstancias[] }[] = [];
  private proximaRevisionZonas = 0;
  // Resolución dinámica
  private ratioPixeles: number;
  private ratioMaximo: number;
  private sumaFrames = 0;
  private numFrames = 0;
  private proximoAjuste = 0;
  private bloqueoSubida = 0;
  private factor: number; // 1 en alta, menos en media
  private movil: boolean; // iPhone/iPad
  /** Se llama si el sistema corta el 3D por falta de memoria (quien usa la escena la recrea). */
  onContextoPerdido: (() => void) | null = null;
  private punto: PuntoRuta = { pos: new THREE.Vector3(), dx: 1, dz: 0 };
  /** Dirección del sol (se ajusta a la del cielo fotográfico cuando carga). */
  private dirSol = SOL.clone();
  private destruida = false;
  private materialTerreno: THREE.MeshStandardMaterial | null = null;
  private materialGrava: THREE.MeshStandardMaterial | null = null;
  private texturaRuido: THREE.DataTexture | null = null;
  private materialAsfalto: THREE.MeshStandardMaterial | null = null;
  private detras = new THREE.Vector3();
  private mira = new THREE.Vector3();

  constructor(
    private contenedor: HTMLElement,
    avatar: Avatar,
    private leerYo: () => DatosYo,
    private calidad: Calidad = 'alta',
  ) {
    const alta = calidad === 'alta';
    // iPhone/iPad: la web tiene un límite de memoria gráfica estricto (si se pasa, el sistema
    // corta el 3D y la página se queda en blanco). Sin suavizado de bordes por hardware, con
    // menos resolución, sombras más pequeñas y el cielo de 2k.
    this.movil = esDispositivoIos();
    this.factor = alta ? 1 : 0.5;
    this.renderer = new THREE.WebGLRenderer({ antialias: alta && !this.movil, powerPreference: 'high-performance' });
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (!this.destruida) this.onContextoPerdido?.();
    });
    prepararTexturasComprimidas(this.renderer);
    this.ratioMaximo = Math.min(window.devicePixelRatio, this.movil ? (alta ? 1.25 : 1) : alta ? 1.5 : 1);
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
    this.sol.shadow.mapSize.setScalar(this.movil ? 1024 : 2048);
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
    // Recursos externos (cielo, texturas): se aplican cuando terminan de descargar
    void this.cargarCieloYTexturas();
    // Solo en desarrollo: acceso desde la consola para medir rendimiento
    if (import.meta.env.DEV) (window as unknown as { __escena: EscenaRecorrido }).__escena = this;
  }

  // =========================================================================
  // Construcción del mundo
  // =========================================================================

  /** Cielo fotográfico, asfalto y detalle de hierba reales (si fallan, se queda lo generado por código). */
  private async cargarCieloYTexturas() {
    try {
      const [cielo, asfalto, asfaltoNormal, asfaltoRugosidad, hierba, hierbaNormal, grava, gravaNormal, gravaRugosidad] =
        await Promise.all([
          // El de 4k ocupa más de 100 MB mientras se descomprime: solo en ordenador
          cargarCielo(this.calidad === 'alta' && !this.movil ? '4k' : '2k'),
          cargarTextura('asphalt_02_diff_2k.jpg', true),
          cargarTextura('asphalt_02_nor_gl_2k.jpg', false),
          cargarTextura('asphalt_02_rough_1k.jpg', false),
          cargarTextura('sparse_grass_diff_2k.jpg', true),
          cargarTextura('sparse_grass_nor_gl_2k.jpg', false),
          cargarTextura('gravel_floor_02_diff_2k.jpg', true),
          cargarTextura('gravel_floor_02_nor_gl_2k.jpg', false),
          cargarTextura('gravel_floor_02_rough_1k.jpg', false),
        ]);
      if (this.destruida) return;

      // Cielo y luz ambiental a partir de la foto; el sol se alinea con el de la imagen
      this.escena.background = cielo;
      this.escena.backgroundIntensity = 0.9;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.escena.environment?.dispose();
      this.escena.environment = pmrem.fromEquirectangular(cielo).texture;
      this.escena.environmentIntensity = 0.6;
      pmrem.dispose();
      this.dirSol.copy(direccionSolDelCielo(cielo));
      if (this.dirSol.y < 0.25) this.dirSol.setY(0.25).normalize(); // que las sombras no sean eternas
      this.cielo.removeFromParent();

      // Asfalto: 2 × 2 m por repetición (las líneas van aparte)
      if (this.materialAsfalto) {
        for (const t of [asfalto, asfaltoNormal, asfaltoRugosidad]) t.repeat.set(4, 1);
        this.materialAsfalto.map = asfalto;
        this.materialAsfalto.normalMap = asfaltoNormal;
        this.materialAsfalto.roughnessMap = asfaltoRugosidad;
        this.materialAsfalto.roughness = 1;
        this.materialAsfalto.color.set(0xffffff);
        this.materialAsfalto.needsUpdate = true;
      }
      // Arcenes de grava real (1,3 m de ancho; la textura se repite cada 1,3 × 2,6 m)
      if (this.materialGrava) {
        this.materialGrava.map = grava;
        this.materialGrava.normalMap = gravaNormal;
        this.materialGrava.roughnessMap = gravaRugosidad;
        this.materialGrava.color.set(0xd8d2c4);
        this.materialGrava.needsUpdate = true;
      }
      // Terreno: la hierba real se usa como detalle sobre los colores de campos y praderas
      if (this.materialTerreno) {
        this.materialTerreno.map = hierba;
        this.materialTerreno.normalMap = hierbaNormal;
        this.materialTerreno.normalScale.set(0.6, 0.6);
        this.materialTerreno.needsUpdate = true;
      }
    } catch (e) {
      console.warn('No se pudieron cargar el cielo o las texturas; se usa lo generado por código', e);
    }
  }

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
    const praderas = [0x5d8a3c, 0x557f37, 0x68904a];
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
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.35 });
    // Ruido que se repite sin costuras: manchas de hierba seca, zonas más oscuras y tierra
    const ruido = new THREE.DataTexture(datosRuidoPeriodico(256), 256, 256, THREE.RGBAFormat);
    ruido.wrapS = ruido.wrapT = THREE.RepeatWrapping;
    ruido.magFilter = THREE.LinearFilter;
    ruido.minFilter = THREE.LinearMipmapLinearFilter;
    ruido.generateMipmaps = true;
    ruido.needsUpdate = true;
    this.texturaRuido = ruido;
    // La textura de hierba (cuando carga) aporta solo el detalle de luces y sombras:
    // se divide por su luminancia media para no cambiar el color de campos y praderas.
    // Se mezclan dos escalas giradas para que no se note la repetición.
    material.onBeforeCompile = (sombreador) => {
      sombreador.uniforms.uRuido = { value: ruido };
      sombreador.vertexShader = sombreador.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSuelo;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSuelo = position.xz;');
      sombreador.fragmentShader = sombreador.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSuelo;\nuniform sampler2D uRuido;')
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec3 detA = texture2D( map, vMapUv ).rgb;
            vec3 detB = texture2D( map, mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv * 0.31 + 0.37 ).rgb;
            float lum = dot( mix( detA, detB, 0.45 ), vec3( 0.2126, 0.7152, 0.0722 ) );
            diffuseColor.rgb *= mix( 1.0, clamp( lum / ${LUMINANCIA_HIERBA.toFixed(3)}, 0.35, 2.2 ), 0.8 );
          #endif
          vec3 rG = texture2D( uRuido, vSuelo / 1100.0 ).rgb;
          vec3 rM = texture2D( uRuido, vSuelo / 170.0 + 0.31 ).rgb;
          vec3 rP = texture2D( uRuido, vSuelo / 23.0 + 0.77 ).rgb;
          // Hierba seca amarillenta a manchas grandes
          float seco = smoothstep( 0.52, 0.7, rG.r ) * 0.55;
          diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.35, 1.12, 0.55 ), seco );
          // Zonas más frondosas (oscuras) y variación suave de brillo
          diffuseColor.rgb *= mix( 1.0, 0.7, smoothstep( 0.5, 0.72, rM.g ) * 0.8 );
          diffuseColor.rgb *= 0.86 + 0.28 * rP.b;
          // Calvas de tierra pequeñas
          float tierra = smoothstep( 0.68, 0.8, rP.r * 0.6 + rM.b * 0.4 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.15, 0.09 ), tierra * 0.55 );`,
        );
    };
    this.materialTerreno = material;
    const terreno = new THREE.Mesh(geo, material);
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
    // Mientras carga la textura real, asfalto de color liso
    const asfalto = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.92, side: THREE.DoubleSide });
    this.materialAsfalto = asfalto;
    this.cinta(-ANCHO_CARRETERA / 2, ANCHO_CARRETERA / 2, 0.3, 0.3, 0, LONGITUD_VUELTA_M, asfalto, 2);
    // Líneas pintadas (encima del asfalto real): bordes continuos y central discontinua
    const pintura = new THREE.MeshStandardMaterial({
      color: 0xf2f2ee,
      roughness: 0.55,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const lado of [-1, 1]) {
      this.cinta(lado * 3.55, lado * 3.72, 0.31, 0.31, 0, LONGITUD_VUELTA_M, pintura);
    }
    const discontinua = pintura.clone();
    discontinua.map = texturaDiscontinua();
    discontinua.alphaTest = 0.5;
    this.cinta(-0.07, 0.07, 0.31, 0.31, 0, LONGITUD_VUELTA_M, discontinua, 9);
    // Arcenes de grava un poco más bajos
    const grava = new THREE.MeshStandardMaterial({ color: 0x8a8272, roughness: 1, side: THREE.DoubleSide });
    this.materialGrava = grava;
    this.cinta(-ANCHO_CARRETERA / 2 - 1.3, -ANCHO_CARRETERA / 2, 0.05, 0.28, 0, LONGITUD_VUELTA_M, grava, 2.6);
    this.cinta(ANCHO_CARRETERA / 2, ANCHO_CARRETERA / 2 + 1.3, 0.28, 0.05, 0, LONGITUD_VUELTA_M, grava, 2.6);
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
      opciones: { celda: number; visibleHasta?: number; hundir?: number; sombra?: boolean },
    ) => {
      const { celda, visibleHasta, hundir = 0, sombra = false } = opciones;
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
      const creadas: ZonaInstancias[] = [];
      for (const zona of zonas.values()) {
        const mallas = geometrias.map(([g, mat, sinColor]) => {
          const im = new THREE.InstancedMesh(g, mat, zona.matrices.length);
          zona.matrices.forEach((mm, i) => {
            im.setMatrixAt(i, mm);
            im.setColorAt(i, sinColor ? blanco : zona.colores[i]);
          });
          im.computeBoundingSphere();
          // Proyectan sombra, pero no la reciben (en hojas de doble cara saldrían manchas)
          im.castShadow = sombra && this.calidad === 'alta';
          this.escena.add(im);
          return im;
        });
        if (visibleHasta) {
          this.zonasCercanas.push({ x: zona.x, z: zona.z, radio: visibleHasta + celda * 0.75, mallas });
        }
        creadas.push({ x: zona.x, z: zona.z, mallas });
      }
      return creadas;
    };

    // Árboles sencillos (hechos por código) solo para los bosques y el paisaje lejano;
    // junto a la carretera se ponen modelos reales (ver vegetacionReal)
    const pinos = instanciar(
      [[pino, matCopa], [tronco, matTronco, true]],
      Math.round(1000 * f),
      () => (rnd() < 0.6 ? enBosque() : junto(150, 450)),
      () => {
        const s = 0.7 + rnd() * 0.9;
        return [s, s * (0.9 + rnd() * 0.3), s];
      },
      (c) => c.setHSL(0.3 + rnd() * 0.06, 0.4, 0.2 + rnd() * 0.08),
      { celda: 1500 },
    );
    // Árboles frondosos
    const frondosos = instanciar(
      [[copaFrondosa, matCopa], [tronco, matTronco, true]],
      Math.round(900 * f),
      () => (rnd() < 0.5 ? enBosque() : junto(150, 450)),
      () => {
        const s = 0.7 + rnd() * 0.8;
        return [s, s, s];
      },
      (c) => c.setHSL(0.2 + rnd() * 0.1, 0.45, 0.25 + rnd() * 0.1),
      { celda: 1500 },
    );
    // Chopos alrededor del lago y en hileras junto a los llanos
    const chopos = instanciar(
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
    this.arbolesSencillos = [
      { tipo: 'pino', zonas: pinos },
      { tipo: 'frondoso', zonas: frondosos },
      { tipo: 'chopo', zonas: chopos },
    ];
    // Vegetación cercana con modelos reales; si no se pueden descargar, la versión por código
    void this.vegetacionReal(instanciar, junto).catch((e) => {
      console.warn('No se pudieron cargar los modelos de vegetación; se usan los generados por código', e);
      if (!this.destruida) vegetacionCercanaPorCodigo();
    });

    const vegetacionCercanaPorCodigo = () => {
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
    };
  }

  /**
   * Vegetación junto a la carretera con modelos reales (Stylized Nature MegaKit, CC0):
   * árboles de hoja, pinos, arbustos, rocas, piedras, hierba, flores, helechos y tréboles.
   */
  private async vegetacionReal(
    instanciar: (
      geometrias: [THREE.BufferGeometry, THREE.Material, boolean?][],
      cantidad: number,
      lugar: () => { x: number; z: number; y: number } | null,
      escala: () => [number, number, number],
      colorear: (c: THREE.Color) => THREE.Color,
      opciones: { celda: number; visibleHasta?: number; hundir?: number; sombra?: boolean },
    ) => ZonaInstancias[],
    junto: (min: number, max: number, sesgo?: number) => { x: number; z: number; y: number } | null,
  ) {
    const nombres = [
      'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
      'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5', 'TwistedTree_1', 'TwistedTree_3', 'TwistedTree_5',
      'DeadTree_1', 'DeadTree_3',
      'Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
      'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Grass_Common_Short', 'Grass_Common_Tall',
      'Grass_Wispy_Short', 'Grass_Wispy_Tall', 'Flower_3_Group', 'Flower_4_Group', 'Fern_1', 'Clover_1',
      'Clover_2', 'Plant_1_Big', 'Plant_7_Big', 'Mushroom_Common',
    ];
    const cargados = await Promise.all(nombres.map((n) => cargarModelo(n)));
    if (this.destruida) return;
    const modelos = Object.fromEntries(nombres.map((n, i) => [n, cargados[i]])) as Record<string, ParteModelo[]>;
    const piezas = (n: string) =>
      modelos[n].map((p) => [p.geometria, p.material] as [THREE.BufferGeometry, THREE.Material]);
    const rnd = aleatorio(4242);
    const f = this.factor;
    // Variación suave de tono por ejemplar (el color real viene de la textura)
    const tono = (c: THREE.Color, v = 0.18) => c.setRGB(1 - rnd() * v, 1 - rnd() * v * 0.6, 1 - rnd() * v);
    const escalaUniforme = (min: number, max: number) => (): [number, number, number] => {
      const s = min + rnd() * (max - min);
      return [s, s, s];
    };

    const poner = (
      lista: string[],
      total: number,
      lugar: () => { x: number; z: number; y: number } | null,
      escala: () => [number, number, number],
      opciones: { celda: number; visibleHasta?: number; hundir?: number; sombra?: boolean; lod?: boolean },
      variacion = 0.18,
    ) => {
      for (const n of lista) {
        const zonas = instanciar(piezas(n), Math.round((total / lista.length) * f), lugar, escala, (c) => tono(c, variacion), opciones);
        // Árboles: a partir de cierta distancia se cambian por su impostor
        if (opciones.lod && opciones.visibleHasta) this.impostoresDeZonas(n, zonas, opciones.visibleHasta + opciones.celda * 0.75);
      }
    };
    this.crearImpostores(modelos);

    // Árboles junto a la carretera (hasta 170 m; más allá están los bosques sencillos)
    const sombra = true;
    // Árboles: modelo real hasta unos 250 m y su impostor más lejos (LOD)
    const lod = true;
    poner(['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'], 2200, () => junto(11, 200, 1.5), escalaUniforme(0.9, 1.5), { celda: 200, visibleHasta: 110, sombra, lod });
    poner(['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'], 1900, () => junto(11, 200, 1.5), escalaUniforme(0.9, 1.45), { celda: 200, visibleHasta: 110, sombra, lod });
    this.construirImpostoresLod();
    poner(['TwistedTree_1', 'TwistedTree_3', 'TwistedTree_5'], 200, () => junto(16, 160, 1.4), escalaUniforme(0.55, 0.85), { celda: 300, visibleHasta: 300, sombra });
    poner(['DeadTree_1', 'DeadTree_3'], 40, () => junto(14, 140, 1.4), escalaUniforme(0.6, 0.9), { celda: 300, visibleHasta: 300 });
    // Arbustos, rocas y piedras
    poner(['Bush_Common', 'Bush_Common_Flowers'], 2200, () => junto(7, 110, 1.6), escalaUniforme(0.8, 1.6), { celda: 250, visibleHasta: 300 });
    poner(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], 700, () => junto(7, 220, 1.6), escalaUniforme(0.7, 2.6), { celda: 250, visibleHasta: 320, hundir: 0.15 }, 0.25);
    poner(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3'], 1800, () => junto(5.4, 12, 1.5), escalaUniforme(0.8, 2), { celda: 250, visibleHasta: 120 }, 0.25);
    // Hierba baja, flores y plantas en las cunetas (la alta, solo de vez en cuando)
    poner(['Grass_Common_Short', 'Grass_Wispy_Short'], 13000, () => junto(5.4, 35, 2.2), escalaUniforme(0.7, 1.3), { celda: 250, visibleHasta: 160 });
    poner(['Grass_Common_Tall', 'Grass_Wispy_Tall'], 4000, () => junto(7, 40, 1.8), escalaUniforme(0.6, 1.05), { celda: 250, visibleHasta: 160 });
    poner(['Flower_3_Group', 'Flower_4_Group'], 2400, () => junto(6, 40, 1.8), escalaUniforme(0.7, 1.2), { celda: 250, visibleHasta: 140 }, 0.1);
    poner(['Fern_1', 'Clover_1', 'Clover_2'], 3000, () => junto(6, 60, 1.8), escalaUniforme(0.8, 1.4), { celda: 250, visibleHasta: 140 });
    poner(['Plant_1_Big', 'Plant_7_Big'], 1400, () => junto(6.5, 50, 1.8), escalaUniforme(0.7, 1.3), { celda: 250, visibleHasta: 140 });
    poner(['Mushroom_Common'], 300, () => junto(8, 40, 1.5), escalaUniforme(0.8, 1.6), { celda: 250, visibleHasta: 80 });
  }

  /**
   * Impostores: cada árbol real se dibuja una vez en una textura (atlas) y los bosques
   * lejanos pasan a ser tres planos cruzados con esa imagen. Se ven como los árboles de
   * cerca y cuestan casi lo mismo que los conos y bolas que sustituyen.
   */
  private crearImpostores(modelos: Record<string, ParteModelo[]>) {
    const variantes = {
      frondoso: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'],
      pino: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'],
    };
    const lista = [...variantes.frondoso, ...variantes.pino];
    const N = lista.length;
    const CW = 256;
    const CH = 512;
    const rt = new THREE.WebGLRenderTarget(CW * N, CH, {
      type: THREE.HalfFloatType,
      samples: 4,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    // Iluminación parecida a la del recorrido, desde arriba (se ve igual desde todos lados)
    const estudio = new THREE.Scene();
    const sol = new THREE.DirectionalLight(0xfff1dc, 3.0);
    sol.position.set(0.35, 1, 0.55);
    estudio.add(sol, new THREE.HemisphereLight(0xcfe6ff, 0x55683a, 0.9), new THREE.AmbientLight(0xdfe8f0, 0.45));
    const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const medidas: { ancho: number; alto: number; base: number }[] = [];
    const r = this.renderer;
    const colorAntes = r.getClearColor(new THREE.Color());
    const alfaAntes = r.getClearAlpha();
    const autoAntes = r.autoClear;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.autoClear = false;
    lista.forEach((nombre, i) => {
      const grupo = new THREE.Group();
      for (const parte of modelos[nombre]) grupo.add(new THREE.Mesh(parte.geometria, parte.material));
      estudio.add(grupo);
      const caja = new THREE.Box3().setFromObject(grupo);
      const ancho = Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z) * 1.04;
      const alto = (caja.max.y - caja.min.y) * 1.02;
      medidas.push({ ancho, alto, base: caja.min.y });
      const cx = (caja.min.x + caja.max.x) / 2;
      const cz = (caja.min.z + caja.max.z) / 2;
      camara.left = -ancho / 2;
      camara.right = ancho / 2;
      camara.bottom = 0;
      camara.top = alto;
      camara.position.set(cx, caja.min.y, cz + 50);
      camara.lookAt(cx, caja.min.y, cz);
      camara.updateProjectionMatrix();
      rt.viewport.set(i * CW, 0, CW, CH);
      rt.scissor.set(i * CW, 0, CW, CH);
      rt.scissorTest = true;
      r.setRenderTarget(rt); // el viewport del destino se lee al activarlo
      r.render(estudio, camara);
      estudio.remove(grupo);
    });
    rt.scissorTest = false;
    rt.viewport.set(0, 0, CW * N, CH);
    r.setRenderTarget(null);
    r.setClearColor(colorAntes, alfaAntes);
    r.autoClear = autoAntes;
    this.atlasImpostores = rt;

    // Tres planos cruzados de 1 × 1 con la base en el suelo
    const planos = mergeGeometries(
      [0, 1, 2].map((k) => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY((k * Math.PI) / 3)),
    )!;
    const alta = this.calidad === 'alta';
    const material = new THREE.MeshBasicMaterial({
      map: rt.texture,
      alphaTest: alta ? 0.3 : 0.45,
      alphaToCoverage: alta,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aVariante;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv.x = ( vMapUv.x + aVariante ) / ${N.toFixed(1)};`);
    };
    material.customProgramCacheKey = () => 'impostor-arbol';
    this.impostor = { material, lista, medidas, planos };

    const rnd = aleatorio(777);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const esc = new THREE.Vector3();
    const color = new THREE.Color();
    for (const grupo of this.arbolesSencillos) {
      const opciones = grupo.tipo === 'pino' ? variantes.pino : variantes.frondoso;
      for (const { mallas: [copa, tronco] } of grupo.zonas) {
        const geo = planos.clone();
        const variante = new Float32Array(copa.count);
        const im = new THREE.InstancedMesh(geo, material, copa.count);
        let n = 0;
        for (let i = 0; i < copa.count; i++) {
          copa.getMatrixAt(i, m);
          m.decompose(pos, q, esc);
          // Junto a la carretera ya hay árboles reales: un plano tan cerca se notaría
          if (this.indice.cercano(pos.x, pos.z).distancia < 90) continue;
          const v = lista.indexOf(opciones[Math.floor(rnd() * opciones.length)]);
          const md = medidas[v];
          // Tamaño parecido al del árbol sencillo (los reales miden unos 8 m)
          const s = esc.y * (grupo.tipo === 'chopo' ? 1.15 : 1.05);
          const estrecho = grupo.tipo === 'chopo' ? 0.55 : 1;
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2);
          m.compose(pos.setY(pos.y + md.base * s), q, esc.set(md.ancho * s * estrecho, md.alto * s, md.ancho * s * estrecho));
          im.setMatrixAt(n, m);
          const t = 1.1 + rnd() * 0.3;
          im.setColorAt(n, color.setRGB(t, t * (0.97 + rnd() * 0.06), t * 0.95));
          variante[n] = v;
          n++;
        }
        im.count = n;
        geo.setAttribute('aVariante', new THREE.InstancedBufferAttribute(variante, 1));
        im.computeBoundingSphere();
        this.escena.add(im);
        copa.removeFromParent();
        tronco?.removeFromParent();
      }
    }
  }

  /** Instancias de árboles reales pendientes de su impostor lejano, por zona. */
  private lodPendiente = new Map<string, { x: number; z: number; radio: number; mat: THREE.Matrix4[]; v: number[] }>();

  /** Apunta las instancias de un modelo de árbol (por zonas) para crear su versión lejana. */
  private impostoresDeZonas(nombre: string, zonas: ZonaInstancias[], radio: number) {
    const imp = this.impostor;
    if (!imp) return;
    const v = imp.lista.indexOf(nombre);
    if (v < 0) return;
    const md = imp.medidas[v];
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const esc = new THREE.Vector3();
    for (const zona of zonas) {
      const clave = `${zona.x},${zona.z}`;
      let p = this.lodPendiente.get(clave);
      if (!p) {
        p = { x: zona.x, z: zona.z, radio, mat: [], v: [] };
        this.lodPendiente.set(clave, p);
      }
      const im = zona.mallas[0] as THREE.InstancedMesh;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        m.decompose(pos, q, esc);
        pos.y += md.base * esc.y;
        p.mat.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(md.ancho * esc.x, md.alto * esc.y, md.ancho * esc.z)));
        p.v.push(v);
      }
    }
  }

  /** Una malla de impostores por zona (todas las variantes juntas): solo se ve lejos del ciclista. */
  private construirImpostoresLod() {
    const imp = this.impostor;
    if (!imp) return;
    const rnd = aleatorio(31);
    const color = new THREE.Color();
    for (const p of this.lodPendiente.values()) {
      if (!p.mat.length) continue;
      const geo = imp.planos.clone();
      geo.setAttribute('aVariante', new THREE.InstancedBufferAttribute(new Float32Array(p.v), 1));
      const im = new THREE.InstancedMesh(geo, imp.material, p.mat.length);
      p.mat.forEach((m, i) => {
        im.setMatrixAt(i, m);
        const t = 1.1 + rnd() * 0.25;
        im.setColorAt(i, color.setRGB(t, t, t * 0.97));
      });
      im.computeBoundingSphere();
      im.visible = false;
      this.escena.add(im);
      this.zonasCercanas.push({ x: p.x, z: p.z, radio: p.radio, mallas: [im], lejos: true });
    }
    this.lodPendiente.clear();
    this.proximaRevisionZonas = 0; // aplicar la visibilidad en la próxima imagen
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

  /**
   * Cordillera alrededor de todo el paisaje: un anillo de relieve fractal con crestas,
   * prados abajo, bosque, roca en las pendientes y nieve en las cumbres. Los colores
   * se aclaran con la distancia (perspectiva aérea), porque la niebla no llega tan lejos.
   */
  private crearMontanas() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.tr.n; i++) {
      minX = Math.min(minX, this.tr.x[i]);
      maxX = Math.max(maxX, this.tr.x[i]);
      minZ = Math.min(minZ, this.tr.z[i]);
      maxZ = Math.max(maxZ, this.tr.z[i]);
    }
    const cx = this.tr.centroX;
    const cz = this.tr.centroZ;
    // El terreno llega 2600 m más allá del trazado: la cordillera empieza algo antes de su borde
    const r0 = Math.min(maxX - minX, maxZ - minZ) / 2 + 1200;
    const r1 = 8400;
    const nA = this.calidad === 'alta' ? 720 : 400;
    const nR = this.calidad === 'alta' ? 110 : 64;
    const altura = (x: number, z: number, r: number) => {
      const e = suavizado(r0, r0 + 1700, r);
      const macizo = 0.45 + 0.9 * fbm(x / 7000 + 3, z / 7000 - 2, 3, 5);
      const h = 120 + 1150 * crestas(x / 2300, z / 2300, 7, 11) ** 1.25 * macizo;
      return colinas(x, z) - 4 + e * h;
    };
    const pos = new Float32Array((nA + 1) * (nR + 1) * 3);
    const col = new Float32Array((nA + 1) * (nR + 1) * 3);
    for (let j = 0; j <= nR; j++) {
      // Más anillos cerca (donde se ve el detalle)
      const r = r0 + (r1 - r0) * (j / nR) ** 1.4;
      for (let i = 0; i <= nA; i++) {
        const a = (i / nA) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const k = (j * (nA + 1) + i) * 3;
        pos[k] = x;
        pos[k + 1] = altura(x, z, r);
        pos[k + 2] = z;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let j = 0; j < nR; j++) {
      for (let i = 0; i < nA; i++) {
        const a = j * (nA + 1) + i;
        const b = a + nA + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    geo.setIndex(idx);
    geo.computeVertexNormals();

    // Color según altura, pendiente y distancia
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const prado = new THREE.Color(0x5b7a3a);
    const bosque = new THREE.Color(0x2c4526);
    const roca = new THREE.Color(0x7a746b);
    const rocaOscura = new THREE.Color(0x57534d);
    const nieve = new THREE.Color(0xf2f5f8);
    const lejos = new THREE.Color(0x9fb4c8);
    const c = new THREE.Color();
    for (let v = 0; v < pos.length / 3; v++) {
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      const pend = 1 - nor.getY(v); // 0 plano, 1 vertical
      const manchas = fbm(x / 400, z / 400, 3, 21);
      c.copy(prado).lerp(bosque, suavizado(0.35, 0.65, manchas) * (1 - suavizado(700, 950, y)));
      c.lerp(manchas > 0.5 ? roca : rocaOscura, suavizado(0.18, 0.4, pend) + suavizado(900, 1150, y) * 0.8);
      const lineaNieve = 950 + 180 * (fbm(x / 600, z / 600, 3, 33) - 0.5) + 400 * pend;
      c.lerp(nieve, suavizado(lineaNieve, lineaNieve + 90, y));
      const d = Math.hypot(x - cx, z - cz);
      c.lerp(lejos, 0.15 + 0.55 * suavizado(r0, r1, d));
      col.set([c.r, c.g, c.b], v * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const montes = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false }));
    montes.receiveShadow = false;
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
      const dentro = (zona.x - x) ** 2 + (zona.z - z) ** 2 < zona.radio * zona.radio;
      for (const m of zona.mallas) m.visible = zona.lejos ? !dentro : dentro;
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
    tiempoViento.value = performance.now() / 1000;
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
    this.sol.position.set(miX + this.dirSol.x * 150, miY + this.dirSol.y * 150, miZ + this.dirSol.z * 150);
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
    this.destruida = true; // las cargas pendientes ya no añadirán nada
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
    this.texturaRuido?.dispose();
    this.atlasImpostores?.dispose();
    this.impostor?.planos.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
