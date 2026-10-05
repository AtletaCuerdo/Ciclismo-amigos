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
import { plantillasHumanas } from './ciclistaHumano';
import { PublicoHumano, peinadosDe, type PersonaCercana } from './publicoHumano';
import { ALTITUD_MAX, ALTITUD_MIN, CIRCUITO, LONGITUD_VUELTA_M, SUBIDAS, altitud, enVuelta, pendiente } from './perfil';
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
import { trazadoDe, type Trazado } from './trazado';
import { cieloActual } from './cielos';

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

/** Colinas suaves para el paisaje lejos de la carretera (altura y ondulación según el circuito). */
function colinas(x: number, z: number) {
  const { base, escala } = CIRCUITO.relieve;
  return (
    base +
    escala *
      (38 * Math.sin(x / 700 + 1) * Math.cos(z / 560) +
        18 * Math.sin((x + z) / 260) +
        8 * Math.cos((x - 2 * z) / 130) +
        3 * Math.sin(x / 41) * Math.cos(z / 37))
  );
}

// ---------------------------------------------------------------------------
// Trazado horizontal
// ---------------------------------------------------------------------------

/** Trazado del circuito elegido. */
const crearTrazado = () => trazadoDe(CIRCUITO, PASO_M);

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

/** Panel direccional de curva: chevrones blancos sobre rojo, hacia la derecha o la izquierda. */
function texturaChevron(derecha: boolean) {
  const { c, ctx } = lienzo(128, 160);
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = '#ffffff';
  for (const x0 of [18, 62]) {
    ctx.beginPath();
    ctx.moveTo(x0, 22);
    ctx.lineTo(x0 + 22, 22);
    ctx.lineTo(x0 + 52, 80);
    ctx.lineTo(x0 + 22, 138);
    ctx.lineTo(x0, 138);
    ctx.lineTo(x0 + 30, 80);
    ctx.closePath();
    ctx.fill();
  }
  if (!derecha) {
    // Espejo: el mismo dibujo apuntando a la izquierda
    const { c: c2, ctx: ctx2 } = lienzo(128, 160);
    ctx2.translate(128, 0);
    ctx2.scale(-1, 1);
    ctx2.drawImage(c, 0, 0);
    const t = new THREE.CanvasTexture(c2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Señal triangular de curva peligrosa (hacia la derecha o la izquierda). */
function texturaCurva(derecha: boolean) {
  const { c, ctx } = lienzo(256, 230);
  ctx.clearRect(0, 0, 256, 230);
  const triangulo = (m: number) => {
    ctx.beginPath();
    ctx.moveTo(128, 8 + m);
    ctx.lineTo(248 - m * 1.7, 222 - m);
    ctx.lineTo(8 + m * 1.7, 222 - m);
    ctx.closePath();
  };
  ctx.fillStyle = '#c8102e';
  triangulo(0);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  triangulo(26);
  ctx.fill();
  // Flecha curva
  ctx.save();
  if (!derecha) {
    ctx.translate(256, 0);
    ctx.scale(-1, 1);
  }
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(110, 190);
  ctx.lineTo(110, 140);
  ctx.quadraticCurveTo(110, 100, 150, 100);
  ctx.stroke();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.moveTo(176, 100);
  ctx.lineTo(146, 78);
  ctx.lineTo(146, 122);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
  /** El fantasma de tu mejor vuelta: transparente, en tu carril y sin rebufo. */
  fantasma?: boolean;
  /** Posición lateral fija (m), p. ej. para que una grupeta ruede en formación. */
  carril?: number;
  nombre: string;
  avatar: Avatar;
  distancia: number; // m
  velocidad: number; // km/h
  cadencia: number;
  /** Vatios (si se saben): con muchos, sprint de pie. */
  vatios?: number;
  /** Emoji que acaba de lanzar (se ve sobre su cabeza). */
  emoji?: string;
}

const CERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Una persona del público. */
interface Persona {
  pos: THREE.Vector3;
  rumbo: number;
  giro: number;
  fase: number;
  ritmo: number;
  s: number;
  gesto: number;
  talla: number;
  ancho: number;
  /** De cerca se dibuja con cuerpo humano (y la figura sencilla se oculta). */
  humano: boolean;
  sexo: 'hombre' | 'mujer';
  peinado: number;
  barba: boolean;
  corto: boolean;
  colores: { camiseta: THREE.Color; pantalon: THREE.Color; zapatillas: THREE.Color; piel: THREE.Color; pelo: THREE.Color };
}

/** El público de una zona (meta o cima): mallas instanciadas que se dibujan solo de cerca. */
interface ZonaPublico {
  grupo: THREE.Group;
  gente: Persona[];
  piernas: THREE.InstancedMesh;
  zapatos: THREE.InstancedMesh;
  cuerpo: THREE.InstancedMesh;
  cabeza: THREE.InstancedMesh;
  peinados: THREE.InstancedMesh[];
  peinado: number[];
  mangas: THREE.InstancedMesh;
  antebrazos: THREE.InstancedMesh;
}

export interface DatosYo {
  distancia: number; // m (autoritativa, viene de la grabación, 1 vez/s)
  velocidad: number; // km/h
  cadencia: number;
  /** Para ponerse de pie en los sprints. */
  potencia?: number;
  ftp?: number;
}

/**
 * ¿De pie? En rampas duras, a ratos (como en la realidad: unos segundos de pie y otra vez
 * sentado; cada ciclista a su ritmo según `semilla`), y siempre en un sprint.
 */
function tocaDePie(grado: number, sprint: boolean, velocidadMs: number, t: number, semilla: number) {
  if (velocidadMs < 1) return false;
  if (sprint) return true;
  if (grado < 7) return false;
  const [ciclo, dePie] = grado >= 10 ? [30, 14] : [40, 10];
  return (t / 1000 + semilla * 13.7) % ciclo < dePie;
}

interface EstadoOtro {
  c: Ciclista3D;
  nombre: string;
  sBase: number; // última distancia recibida
  recibido: number; // cuándo llegó (ms)
  vObjetivo: number; // m/s recibida
  v: number; // m/s suavizada
  cadencia: number;
  vatios?: number;
  sRender: number;
  carril: number;
  fantasma: boolean;
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
  /**
   * En montaña, puntos de la carretera cada 200 m con su altitud: el paisaje lejano sube y baja
   * con ella (si no, la carretera del puerto iría por encima de todo). En llano, null.
   */
  private muestrasRegion: { x: Float32Array; z: Float32Array; h: Float32Array } | null = null;
  /** Río del circuito: lado (+1/−1 respecto a la carretera), distancia, ancho, nivel del agua y tramo (m). */
  private rio: { lado: number; distancia: number; ancho: number; nivel: number; desde: number; hasta: number } | null =
    null;
  /**
   * Costa (circuito de costa): el mar está hacia la dirección (dx, dz) y la orilla es una curva
   * u = orilla(v), con u la distancia hacia el mar y v a lo largo de la costa (tabla cada 40 m).
   */
  private costa: { dx: number; dz: number; v0: number; paso: number; orilla: Float32Array } | null = null;
  private yo: Ciclista3D;
  private sYo = 0;
  private vYo = 0;
  /** Puntos de apoyo (cámara y curvas) para no crear objetos en cada imagen. */
  private puntoAtras: PuntoRuta = { pos: new THREE.Vector3(), dx: 0, dz: 0 };
  private puntoAdelante: PuntoRuta = { pos: new THREE.Vector3(), dx: 0, dz: 0 };
  private puntoCurva: PuntoRuta = { pos: new THREE.Vector3(), dx: 0, dz: 0 };
  /** Inclinación lateral suavizada de mi ciclista (rad). */
  private inclinacionYo = 0;
  /** Campo de visión base de la cámara (grados). */
  private readonly FOV_BASE = 55;
  /** Mi posición lateral: a rueda me pongo detrás del de delante. */
  private carrilYo = MI_CARRIL;
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
  private sprintYo = false;
  private ambiente = new THREE.HemisphereLight(0xcfe6ff, 0x55683a, 0.5);
  private destruida = false;
  private materialTerreno: THREE.MeshStandardMaterial | null = null;
  private materialGrava: THREE.MeshStandardMaterial | null = null;
  private texturaRuido: THREE.DataTexture | null = null;
  private materialAsfalto: THREE.MeshStandardMaterial | null = null;
  private materialParche: THREE.MeshStandardMaterial | null = null;
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
    this.escena.add(this.ambiente);

    this.indice = new IndiceCarretera(this.tr);
    if (CIRCUITO.paisaje === 'sierra') {
      const paso = Math.round(200 / PASO_M);
      const n = Math.floor(this.tr.n / paso);
      const m = { x: new Float32Array(n), z: new Float32Array(n), h: new Float32Array(n) };
      for (let k = 0; k < n; k++) {
        m.x[k] = this.tr.x[k * paso];
        m.z[k] = this.tr.z[k * paso];
        m.h[k] = altitud(k * paso * PASO_M);
      }
      this.muestrasRegion = m;
    }
    this.lago = this.situarLago();
    this.rio = this.situarRio();
    this.costa = this.situarCosta();

    this.crearTerreno();
    this.crearCarretera();
    this.crearQuitamiedosYVallas();
    this.crearVegetacion();
    this.crearCasas();
    this.crearMurosPiedra();
    this.crearEspectadores();
    this.crearPajaros();
    this.crearMolinos();
    this.crearAgua();
    this.crearMontanas();
    if (this.costa) this.crearFaro();
    this.crearNubes();
    this.crearSalidaYMarcas();
    this.crearTaludes();
    this.crearCartelesPendiente();

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
    // Cielo según la hora (o el elegido en Ajustes), con su luz
    const def = cieloActual();
    const cielo4k = def.con4k && this.calidad === 'alta' && !this.movil;
    try {
      const [cielo, asfalto, asfaltoNormal, asfaltoRugosidad, hierba, hierbaNormal, grava, gravaNormal, gravaRugosidad] =
        await Promise.all([
          // El de 4k ocupa más de 100 MB mientras se descomprime: solo en ordenador
          cargarCielo(cielo4k ? '4k' : '2k', def.archivo),
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
      // Que las sombras no sean eternas (al atardecer se permiten más largas)
      if (this.dirSol.y < def.solMinimo) this.dirSol.setY(def.solMinimo).normalize();
      this.sol.color.set(def.sol);
      this.sol.intensity = def.intensidad;
      this.renderer.toneMappingExposure = def.exposicion;
      (this.escena.fog as THREE.Fog).color.set(def.niebla);
      this.ambiente.color.set(def.ambiente);
      this.ambiente.intensity = def.intensidadAmbiente;
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
        if (this.materialParche) {
          this.materialParche.map = asfalto;
          this.materialParche.normalMap = asfaltoNormal;
          this.materialParche.color.set(0x8c8c8c);
          this.materialParche.needsUpdate = true;
        }
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

  /** Lago del circuito (junto a la carretera, hacia el interior de la vuelta). Sin lago: radio 0 y muy lejos. */
  private situarLago() {
    const lago = CIRCUITO.lago;
    if (!lago) return { x: 1e7, z: 1e7, r: 0, nivel: 0 };
    const i = Math.round(lago.s / PASO_M) % this.tr.n;
    const px = this.tr.x[i];
    const pz = this.tr.z[i];
    const hx = this.tr.centroX - px;
    const hz = this.tr.centroZ - pz;
    const l = Math.hypot(hx, hz) || 1;
    return { x: px + (hx / l) * lago.distancia, z: pz + (hz / l) * lago.distancia, r: lago.r, nivel: altitud(lago.s) - 2 };
  }

  /** Río: por fuera de la vuelta y con el agua un poco por debajo del punto más bajo de su tramo. */
  private situarRio() {
    const rio = CIRCUITO.rio;
    if (!rio) return null;
    const desde = rio.desde * 1000;
    const hasta = rio.hasta * 1000;
    const largo = hasta > desde ? hasta - desde : hasta + LONGITUD_VUELTA_M - desde;
    // Lado de fuera: el contrario al centro de la vuelta, mirando a mitad del tramo
    const i = Math.round(enVuelta(desde + largo / 2) / PASO_M) % this.tr.n;
    const haciaCentro = (this.tr.centroX - this.tr.x[i]) * -this.tr.dz[i] + (this.tr.centroZ - this.tr.z[i]) * this.tr.dx[i];
    let minimo = Infinity;
    for (let s = 0; s <= largo; s += 50) minimo = Math.min(minimo, altitud(desde + s));
    return { lado: haciaCentro > 0 ? -1 : 1, distancia: rio.distancia, ancho: rio.ancho, nivel: minimo - 1.5, desde, hasta };
  }

  /**
   * Costa: el mar queda del lado de la carretera que va junto a él (`CIRCUITO.mar`: del km
   * `desde` al `hasta`). La orilla sigue a la carretera por fuera, a 40-75 m, con calas, y más
   * allá de los extremos del trazado se retira poco a poco (el circuito está en un cabo).
   */
  private situarCosta() {
    const mar = CIRCUITO.mar;
    if (!mar) return null;
    // Dirección del mar: del centro de la vuelta hacia el tramo de costa
    let mx = 0;
    let mz = 0;
    let n = 0;
    for (let km = mar.desde; km <= mar.hasta; km += 0.25) {
      const i = Math.round((km * 1000) / PASO_M) % this.tr.n;
      mx += this.tr.x[i];
      mz += this.tr.z[i];
      n++;
    }
    let dx = mx / n - this.tr.centroX;
    let dz = mz / n - this.tr.centroZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Lo más hacia el mar de la carretera, por franjas de 40 m a lo largo de la costa
    const paso = 40;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 0; i < this.tr.n; i++) {
      const v = -this.tr.x[i] * dz + this.tr.z[i] * dx;
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }
    const v0 = vMin - 6000;
    const nb = Math.ceil((vMax + 6000 - v0) / paso) + 1;
    const env = new Float32Array(nb).fill(-Infinity);
    for (let i = 0; i < this.tr.n; i++) {
      const u = this.tr.x[i] * dx + this.tr.z[i] * dz;
      const b = Math.round((-this.tr.x[i] * dz + this.tr.z[i] * dx - v0) / paso);
      env[b] = Math.max(env[b], u);
    }
    // Máximo en ±160 m y media en ±200 m: una orilla suave que nunca pisa la carretera
    const maxV = new Float32Array(nb).fill(-Infinity);
    for (let b = 0; b < nb; b++) for (let k = -4; k <= 4; k++) if (env[b + k] !== undefined) maxV[b] = Math.max(maxV[b], env[b + k]);
    let primero = -1;
    let ultimo = -1;
    for (let b = 0; b < nb; b++)
      if (maxV[b] > -Infinity) {
        if (primero < 0) primero = b;
        ultimo = b;
      }
    // Más allá de los extremos, la costa se retira (el cabo)
    for (let b = 0; b < nb; b++) {
      if (b < primero) maxV[b] = maxV[primero] - 0.35 * (primero - b) * paso;
      if (b > ultimo) maxV[b] = maxV[ultimo] - 0.35 * (b - ultimo) * paso;
    }
    const orilla = new Float32Array(nb);
    for (let b = 0; b < nb; b++) {
      let suma = 0;
      let cuenta = 0;
      for (let k = -5; k <= 5; k++) {
        const v = maxV[b + k];
        if (v === undefined) continue;
        suma += v;
        cuenta++;
      }
      const v = v0 + b * paso;
      // Calas: la orilla entra y sale (siempre por fuera de la carretera)
      orilla[b] = Math.max(maxV[b] + 30, suma / cuenta + 38) + 22 * (0.5 + 0.5 * Math.sin(v / 170)) + 10 * (0.5 + 0.5 * Math.sin(v / 61 + 2));
    }
    return { dx, dz, v0, paso, orilla };
  }

  /** Distancia con signo a la orilla: positiva mar adentro, negativa tierra adentro (−∞ sin costa). */
  private mar(x: number, z: number) {
    const c = this.costa;
    if (!c) return -Infinity;
    const u = x * c.dx + z * c.dz;
    const t = Math.min(c.orilla.length - 1.001, Math.max(0, (-x * c.dz + z * c.dx - c.v0) / c.paso));
    const b = Math.floor(t);
    return u - (c.orilla[b] + (c.orilla[b + 1] - c.orilla[b]) * (t - b));
  }

  /** ¿Está el metro s de la vuelta en el tramo con río? */
  private tramoConRio(s: number) {
    const r = this.rio;
    if (!r) return false;
    const x = enVuelta(s);
    return r.hasta > r.desde ? x >= r.desde && x <= r.hasta : x >= r.desde || x <= r.hasta;
  }

  /** Distancia (m) de un punto al eje del río (Infinity si no hay río ahí). */
  private distanciaRio(x: number, z: number, cercano = this.indice.cercano(x, z)) {
    const r = this.rio;
    if (!r || cercano.indice < 0 || cercano.distancia > r.distancia + r.ancho + 80) return Infinity;
    const i = cercano.indice;
    if (!this.tramoConRio(i * PASO_M)) return Infinity;
    const lateral = (x - this.tr.x[i]) * -this.tr.dz[i] + (z - this.tr.z[i]) * this.tr.dx[i];
    return Math.abs(lateral - r.lado * r.distancia);
  }

  /**
   * Relieve lejos de la carretera: las colinas del circuito y, en montaña, sobre la altitud de la
   * carretera más cercana (media ponderada por distancia, para que no haya escalones).
   */
  private fondo(x: number, z: number) {
    const m = this.muestrasRegion;
    if (!m) return colinas(x, z);
    let suma = 0;
    let pesos = 0;
    for (let k = 0; k < m.h.length; k++) {
      const d2 = (x - m.x[k]) ** 2 + (z - m.z[k]) ** 2 + 150 * 150;
      const w = 1 / (d2 * Math.sqrt(d2));
      suma += w * m.h[k];
      pesos += w;
    }
    return suma / pesos + colinas(x, z);
  }

  /** Altura del terreno: igual a la carretera cerca de ella, colinas lejos y el hueco del lago. */
  private alturaTerreno(x: number, z: number, cercano = this.indice.cercano(x, z)) {
    const w = suavizado(ZONA_LLANA_M, 300, cercano.distancia);
    let h = cercano.alt * (1 - w) + (w > 0 ? this.fondo(x, z) * w : 0);
    const dl = Math.hypot(x - this.lago.x, z - this.lago.z);
    if (dl < this.lago.r + 90) {
      const fondo = this.lago.nivel - 3 - 4 * (1 - dl / (this.lago.r + 90));
      h = THREE.MathUtils.lerp(fondo, h, suavizado(this.lago.r - 20, this.lago.r + 90, dl));
    }
    if (this.rio) {
      const dr = this.distanciaRio(x, z, cercano);
      const mitad = this.rio.ancho / 2;
      if (dr < mitad + 34) h = THREE.MathUtils.lerp(this.rio.nivel - 2.5, h, suavizado(mitad - 4, mitad + 34, dr));
    }
    if (this.costa) {
      const d = this.mar(x, z);
      if (d > -220) {
        // Hacia la orilla el terreno baja hasta la playa (o cae en acantilado si la carretera va alta);
        // mar adentro, el fondo
        const costa = d < 0 ? THREE.MathUtils.lerp(h, 0.5, suavizado(-200, 0, d) ** 1.6) : 0.5 - Math.min(30, 3 + d * 0.1);
        h = THREE.MathUtils.lerp(h, costa, suavizado(ZONA_LLANA_M, ZONA_LLANA_M + 18, cercano.distancia));
      }
      if (d < -6) h = Math.max(h, 0.8); // tierra adentro, nunca bajo el nivel del mar
    }
    return h;
  }

  private enLago(x: number, z: number, margen = 15) {
    if (Math.hypot(x - this.lago.x, z - this.lago.z) < this.lago.r + margen) return true;
    // Ni en el mar ni en la playa
    if (this.costa && this.mar(x, z) > -margen - 25) return true;
    return !!this.rio && this.distanciaRio(x, z) < this.rio.ancho / 2 + margen;
  }

  /** Color base del terreno: cunetas, praderas junto a la carretera y campos de cultivo lejos. */
  private colorTerreno(x: number, z: number, distancia: number, h: number, c: THREE.Color) {
    const ribera = CIRCUITO.paisaje === 'ribera';
    const sierra = CIRCUITO.paisaje === 'sierra';
    const costa = CIRCUITO.paisaje === 'costa';
    const praderas = costa
      ? [0x7b8a45, 0x86904c, 0x6f8240]
      : ribera
      ? [0x6b8f3e, 0x7a9444, 0x668a3a]
      : sierra
        ? [0x4f7634, 0x5a7d38, 0x4a6b31]
        : [0x5d8a3c, 0x557f37, 0x68904a];
    // En la ribera, casi todo cereal (dorado y paja) con alguna parcela verde o de tierra;
    // en la sierra, pinar, matorral, prados de altura y pedregales
    // En la costa: olivares y viñas sobre tierra rojiza, monte bajo y pinar
    const campos = costa
      ? [0xb59a62, 0xa4874f, 0x8c8a4a, 0x9a7b55, 0x6f7f3e, 0xc8ad70, 0x5d7038]
      : ribera
      ? [0xd8c25a, 0xcdb44e, 0xe0cc6a, 0xc2a843, 0xd2c23d, 0x9fae52, 0x9c7f55, 0xe3d27a]
      : sierra
        ? [0x34502a, 0x2f4a26, 0x55693a, 0x6b7444, 0x7c9248, 0x7d6f52, 0x868276, 0x3a5a2c]
        : [0xc9b35d, 0x86a24a, 0x8e6f48, 0x6f9e4a, 0x4f7a36, 0xd2c23d, 0xa7b35a];
    // Parcelas giradas para que no parezcan una cuadrícula
    const rx = x * 0.8 + z * 0.6;
    const rz = -x * 0.6 + z * 0.8;
    const celda = hashEntero(Math.floor(rx / 230), Math.floor(rz / 150));
    const campo = new THREE.Color(campos[Math.floor(celda * campos.length)]);
    // Surcos
    campo.multiplyScalar(0.94 + 0.06 * Math.sin(rx * 0.9));
    const pradera = new THREE.Color(praderas[Math.floor(hashEntero(Math.floor(x / 90), Math.floor(z / 90)) * 3)]);
    c.copy(pradera).lerp(campo, ribera ? suavizado(40, 140, distancia) : suavizado(110, 260, distancia));
    // Orilla del río: arena y grava
    if (this.rio) {
      const dr = this.distanciaRio(x, z);
      const mitad = this.rio.ancho / 2;
      if (dr < mitad + 14) c.lerp(new THREE.Color(0xa89572), 1 - suavizado(mitad - 2, mitad + 14, dr));
    }
    if (sierra) {
      // Cerca de la cumbre: roca y pedregal entre el pasto
      const cima = ALTITUD_MAX - 50;
      if (h > cima) c.lerp(new THREE.Color(0x8b867a), suavizado(cima, cima + 120, h) * (0.35 + 0.4 * hashEntero(Math.floor(x / 60), Math.floor(z / 60))));
    } else if (h > ALTITUD_MIN + 75) {
      // Zonas altas más secas
      c.lerp(new THREE.Color(0x9a9a58), suavizado(ALTITUD_MIN + 75, ALTITUD_MIN + 120, h) * 0.5);
    }
    // Cuneta de tierra y grava junto al asfalto
    if (distancia < 9) c.lerp(new THREE.Color(0x8c7f63), 1 - distancia / 9);
    if (this.costa) {
      const d = this.mar(x, z);
      if (d > -60) {
        // Playa de arena donde llega bajo; roca en los acantilados (donde la orilla queda alta)
        const playa = suavizado(-75, -30, d);
        const roca = suavizado(4, 14, h) * suavizado(-60, -25, d);
        c.lerp(new THREE.Color(h < 6 ? 0xdcc9a0 : 0x8f8577), Math.max(playa * (h < 6 ? 1 : 0.85), roca));
        if (d > -12) c.lerp(new THREE.Color(0xb9ab88), 0.6); // arena mojada
      }
    }
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
    // En la costa, más fino: la orilla y la playa necesitan detalle
    const seg = (this.calidad === 'alta' ? 256 : 200) * (this.costa ? 1.4 : 1);
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
    // Parches de asfalto nuevo (más oscuros) aquí y allá, en un carril o en los dos
    const parche = new THREE.MeshStandardMaterial({
      color: 0x34373b,
      roughness: 0.75,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.materialParche = parche;
    const rndP = aleatorio(77);
    for (let s = 150; s < LONGITUD_VUELTA_M - 60; s += 180 + rndP() * 420) {
      const largo = 6 + rndP() ** 2 * 45;
      const carril = rndP();
      const [a, b] = carril < 0.4 ? [0.15, 3.4] : carril < 0.8 ? [-3.4, -0.15] : [-3.4, 3.4];
      this.cinta(a, b, 0.302, 0.302, s, s + largo, parche, 2);
    }
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

  /**
   * Curvas del circuito: tramos con radio menor que `radioMax` (m), con su sentido
   * (+1 a la derecha, -1 a la izquierda) y el radio más cerrado.
   */
  private curvas(radioMax: number) {
    const n = this.tr.n;
    const w = Math.round(25 / PASO_M);
    const giro = (i: number) => {
      const a = (i - w + n) % n;
      const b = (i + w) % n;
      const c = this.tr.dx[a] * this.tr.dz[b] - this.tr.dz[a] * this.tr.dx[b];
      const d = this.tr.dx[a] * this.tr.dx[b] + this.tr.dz[a] * this.tr.dz[b];
      return Math.atan2(c, d);
    };
    const lista: { desde: number; hasta: number; lado: number; radio: number }[] = [];
    let actual: (typeof lista)[number] | null = null;
    for (let i = 0; i < n; i++) {
      const g = giro(i);
      const radio = (2 * w * PASO_M) / Math.max(1e-6, Math.abs(g));
      const lado = Math.sign(g);
      if (radio < radioMax && (!actual || actual.lado === lado)) {
        if (!actual) actual = { desde: i * PASO_M, hasta: i * PASO_M, lado, radio };
        actual.hasta = i * PASO_M;
        actual.radio = Math.min(actual.radio, radio);
      } else if (actual) {
        if (actual.hasta - actual.desde >= 20) lista.push(actual);
        actual = null;
      }
    }
    if (actual && actual.hasta - actual.desde >= 20) lista.push(actual);
    return lista;
  }

  /** Una placa vertical junto a la carretera, mirando al ciclista que llega. */
  private placa(s: number, lateral: number, ancho: number, alto: number, altura: number, material: THREE.Material) {
    const k = Math.round(enVuelta(s) / PASO_M) % this.tr.n;
    const base = new THREE.Vector3(this.tr.x[k] - this.tr.dz[k] * lateral, altitud(s), this.tr.z[k] + this.tr.dx[k] * lateral);
    const malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), material);
    malla.position.copy(base).add(new THREE.Vector3(0, altura, 0));
    malla.rotation.y = Math.atan2(-this.tr.dz[k], this.tr.dx[k]) - Math.PI / 2;
    malla.castShadow = true;
    this.escena.add(malla);
    return base;
  }

  private crearQuitamiedosYVallas() {
    const metal = new THREE.MeshStandardMaterial({ color: 0xc7ccd1, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide });
    const matPoste = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5 });
    const geoPoste = new THREE.CylinderGeometry(0.04, 0.04, 1, 6);
    const poste = (base: THREE.Vector3, alto: number) => {
      const m = new THREE.Mesh(geoPoste, matPoste);
      m.scale.y = alto;
      m.position.copy(base).add(new THREE.Vector3(0, alto / 2, 0));
      this.escena.add(m);
    };
    const curvas = this.curvas(320);

    // Quitamiedos por fuera de las curvas cerradas y de las curvas en bajada
    const quitamiedos: [number, number, number][] = [];
    for (const c of curvas) {
      const bajada = altitud(c.hasta + 40) < altitud(c.desde - 40) - 3;
      if (c.radio < 230 || bajada) quitamiedos.push([c.desde - 50, c.hasta + 50, -c.lado]);
    }
    for (const [a, b, lado] of quitamiedos) {
      this.cinta(lado * 6.2, lado * 6.2, 0.55, 0.9, a, b, metal, 4);
      this.postes([[a, b]], lado * 6.25, 4, new THREE.BoxGeometry(0.1, 0.9, 0.12), metal, 0.45);
    }

    // Paneles de flechas por fuera de las curvas cerradas y señal de curva 120 m antes
    const chevron = { [1]: new THREE.MeshStandardMaterial({ map: texturaChevron(true), roughness: 0.5, side: THREE.DoubleSide }), [-1]: new THREE.MeshStandardMaterial({ map: texturaChevron(false), roughness: 0.5, side: THREE.DoubleSide }) };
    const senalCurva = {
      [1]: new THREE.MeshStandardMaterial({ map: texturaCurva(true), transparent: true, alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
      [-1]: new THREE.MeshStandardMaterial({ map: texturaCurva(false), transparent: true, alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
    };
    for (const c of curvas) {
      if (c.radio > 260) continue;
      const lado = c.lado as 1 | -1;
      const centro = (c.desde + c.hasta) / 2;
      const largo = Math.min(90, c.hasta - c.desde + 30);
      for (let s = centro - largo / 2; s <= centro + largo / 2; s += 16) {
        const base = this.placa(s, -lado * 7, 0.55, 0.7, 1.15, chevron[lado]);
        poste(base, 0.8);
      }
      // La señal va a la derecha del ciclista
      const base = this.placa(c.desde - 120, 6.6, 1.0, 0.9, 2.0, senalCurva[lado]);
      poste(base, 1.6);
    }

    // Vallas de madera en los llanos largos (no en la sierra)
    if (CIRCUITO.paisaje === 'sierra') return;
    const madera = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9, side: THREE.DoubleSide });
    const llanos: [number, number][] = [];
    let desde: number | null = null;
    for (let s = 0; s <= LONGITUD_VUELTA_M; s += 50) {
      const llano = s < LONGITUD_VUELTA_M && Math.abs(pendiente(s)) < 1.2;
      if (llano && desde === null) desde = s;
      if (!llano && desde !== null) {
        if (s - desde >= 600) llanos.push([desde + 100, Math.min(desde + 1500, s - 100)]);
        desde = null;
      }
    }
    const usados = llanos.slice(0, 4);
    for (const lado of [-9, 9]) {
      this.postes(usados, lado, 3, new THREE.BoxGeometry(0.12, 1.2, 0.12), madera, 0.6);
      for (const alto of [0.5, 0.95]) {
        for (const [a, b] of usados) this.cinta(lado, lado, alto, alto + 0.08, a, b, madera, 3);
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
    // En la sierra: pinares, poca hoja ancha y más roca
    const sierra = CIRCUITO.paisaje === 'sierra';
    // Bosquecillos repartidos por el paisaje
    const bosques = Array.from({ length: sierra ? 60 : 32 }, () => {
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
      Math.round((sierra ? 2000 : 1000) * f),
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
      Math.round((sierra ? 250 : 900) * f),
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
      Math.round((sierra ? 40 : 320) * f),
      () => {
        if (this.rio && rnd() < 0.65) {
          const r = this.rio;
          const largo = r.hasta > r.desde ? r.hasta - r.desde : r.hasta + LONGITUD_VUELTA_M - r.desde;
          const k = Math.round(enVuelta(r.desde + rnd() * largo) / PASO_M) % this.tr.n;
          const lat = r.lado * (r.distancia + (rnd() < 0.5 ? -1 : 1) * (r.ancho / 2 + 6 + rnd() * 16));
          const x = this.tr.x[k] - this.tr.dz[k] * lat;
          const z = this.tr.z[k] + this.tr.dx[k] * lat;
          const cerca = this.indice.cercano(x, z);
          if (cerca.distancia < 14) return null;
          return { x, z, y: this.alturaTerreno(x, z, cerca) };
        }
        if (this.lago.r > 0 && rnd() < 0.6) {
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
    // Cantidades según el paisaje: [normal, sierra]
    const sierra = CIRCUITO.paisaje === 'sierra';
    const cuantos = (normal: number, enSierra: number) => (sierra ? enSierra : normal);

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
    poner(['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'], cuantos(2200, 500), () => junto(11, 200, 1.5), escalaUniforme(0.9, 1.5), { celda: 200, visibleHasta: 110, sombra, lod });
    poner(['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'], cuantos(1900, 3400), () => junto(11, 200, 1.5), escalaUniforme(0.9, 1.45), { celda: 200, visibleHasta: 110, sombra, lod });
    this.construirImpostoresLod();
    poner(['TwistedTree_1', 'TwistedTree_3', 'TwistedTree_5'], 200, () => junto(16, 160, 1.4), escalaUniforme(0.55, 0.85), { celda: 300, visibleHasta: 300, sombra });
    poner(['DeadTree_1', 'DeadTree_3'], 40, () => junto(14, 140, 1.4), escalaUniforme(0.6, 0.9), { celda: 300, visibleHasta: 300 });
    // Arbustos
    poner(['Bush_Common', 'Bush_Common_Flowers'], 1600, () => junto(7, 110, 1.6), escalaUniforme(0.8, 1.6), { celda: 250, visibleHasta: 300 });
    // Rocas, piedras, tocones y plantas escaneadas (Poly Haven); si no cargan, las estilizadas
    const realistas = await this.cargarRealistas();
    if (this.destruida) return;
    if (realistas) {
      const r = (n: string) => realistas[n].map((pp) => [pp.geometria, pp.material] as [THREE.BufferGeometry, THREE.Material]);
      const ponerR = (
        lista: string[],
        total: number,
        lugar: () => { x: number; z: number; y: number } | null,
        escala: () => [number, number, number],
        opciones: { celda: number; visibleHasta?: number; hundir?: number; sombra?: boolean },
        variacion = 0.12,
      ) => {
        for (const n of lista) instanciar(r(n), Math.round((total / lista.length) * f), lugar, escala, (c) => tono(c, variacion), opciones);
      };
      ponerR(['rock_moss_set_01', 'rock_moss_set_02'], cuantos(480, 1000), () => junto(8, 200, 1.5), escalaUniforme(0.35, 1.3), { celda: 200, visibleHasta: 190, hundir: 0.15, sombra });
      ponerR(['rock_07', 'stone_01'], cuantos(1600, 2400), () => junto(5.4, 14, 1.4), () => {
        const s = 1.5 + rnd() * 3.5;
        return [s, s * (0.7 + rnd() * 0.5), s];
      }, { celda: 150, visibleHasta: 60 });
      ponerR(['tree_stump_01', 'tree_stump_02'], 140, () => junto(9, 90, 1.5), escalaUniforme(0.7, 1.1), { celda: 200, visibleHasta: 180, hundir: 0.05, sombra });
      ponerR(['dead_tree_trunk'], 90, () => junto(9, 80, 1.5), escalaUniforme(0.8, 1.3), { celda: 200, visibleHasta: 170, hundir: 0.08, sombra });
      ponerR(['dry_branches_medium_01'], 260, () => junto(6, 40, 1.6), escalaUniforme(0.8, 1.4), { celda: 150, visibleHasta: 60 });
      ponerR(['fern_02'], 1000, () => junto(6, 45, 1.8), escalaUniforme(0.7, 1.3), { celda: 150, visibleHasta: 70 });
      ponerR(['weed_plant_02', 'celandine_01', 'shrub_sorrel_01', 'shrub_03'], 2400, () => junto(5.5, 22, 2), escalaUniforme(1.2, 2.4), { celda: 150, visibleHasta: 45 });
      ponerR(['shrub_04'], 300, () => junto(5.5, 22, 2), escalaUniforme(1.2, 2.2), { celda: 150, visibleHasta: 45 });
    } else {
      poner(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], cuantos(700, 1400), () => junto(7, 220, 1.6), escalaUniforme(0.7, 2.6), { celda: 250, visibleHasta: 320, hundir: 0.15 }, 0.25);
      poner(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3'], 1800, () => junto(5.4, 12, 1.5), escalaUniforme(0.8, 2), { celda: 250, visibleHasta: 120 }, 0.25);
    }
    // Hierba baja, flores y plantas en las cunetas (la alta, solo de vez en cuando)
    poner(['Grass_Common_Short', 'Grass_Wispy_Short'], 13000, () => junto(5.4, 35, 2.2), escalaUniforme(0.7, 1.3), { celda: 250, visibleHasta: 160 });
    poner(['Grass_Common_Tall', 'Grass_Wispy_Tall'], 4000, () => junto(7, 40, 1.8), escalaUniforme(0.6, 1.05), { celda: 250, visibleHasta: 160 });
    poner(['Flower_3_Group', 'Flower_4_Group'], cuantos(2400, 900), () => junto(6, 40, 1.8), escalaUniforme(0.7, 1.2), { celda: 250, visibleHasta: 140 }, 0.1);
    poner(['Fern_1', 'Clover_1', 'Clover_2'], realistas ? 1500 : 3000, () => junto(6, 60, 1.8), escalaUniforme(0.8, 1.4), { celda: 250, visibleHasta: 140 });
    poner(['Plant_1_Big', 'Plant_7_Big'], realistas ? 700 : 1400, () => junto(6.5, 50, 1.8), escalaUniforme(0.7, 1.3), { celda: 250, visibleHasta: 140 });
    poner(['Mushroom_Common'], 300, () => junto(8, 40, 1.5), escalaUniforme(0.8, 1.6), { celda: 250, visibleHasta: 80 });
  }

  /** Modelos escaneados de Poly Haven (null si alguno no se puede descargar). */
  private async cargarRealistas(): Promise<Record<string, ParteModelo[]> | null> {
    const nombres = [
      'rock_moss_set_01', 'rock_moss_set_02', 'rock_07', 'stone_01', 'tree_stump_01',
      'tree_stump_02', 'dead_tree_trunk', 'dry_branches_medium_01', 'fern_02',
      'weed_plant_02', 'celandine_01', 'shrub_sorrel_01', 'shrub_03', 'shrub_04',
    ];
    try {
      const cargados = await Promise.all(nombres.map((n) => cargarModelo(`realistas/${n}`)));
      return Object.fromEntries(nombres.map((n, i) => [n, cargados[i]]));
    } catch (e) {
      console.warn('No se pudieron cargar los modelos escaneados; se usan los estilizados', e);
      return null;
    }
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

  /** ¿Terreno casi llano alrededor de (x, z)? (para poder poner una casa) */
  private llano(x: number, z: number, margen = 8, tolerancia = 5) {
    return (
      Math.abs(this.alturaTerreno(x + margen, z) - this.alturaTerreno(x - margen, z)) +
        Math.abs(this.alturaTerreno(x, z + margen) - this.alturaTerreno(x, z - margen)) <=
      tolerancia
    );
  }

  /** Una casa de pueblo (en la sierra, de piedra con tejado de pizarra). */
  private casa(x: number, z: number, rumbo: number, rnd: () => number, materiales: ReturnType<EscenaRecorrido['materialesCasa']>) {
    const casa = new THREE.Group();
    const w = 8 + rnd() * 6;
    const d = 6 + rnd() * 3;
    const alto = 3.2 + (rnd() < 0.4 ? 2.8 : 0);
    const matPared = materiales.paredes[Math.floor(rnd() * materiales.paredes.length)];
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(w, alto + 2, d), matPared);
    cuerpo.position.y = alto / 2 - 1; // se hunde 2 m por si el suelo no es plano
    // Tejado a dos aguas: prisma triangular
    const forma = new THREE.Shape();
    forma.moveTo(-d / 2 - 0.4, 0);
    forma.lineTo(d / 2 + 0.4, 0);
    forma.lineTo(0, 2.2);
    forma.closePath();
    const tejado = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: w + 0.8, bevelEnabled: false }), materiales.tejado);
    tejado.rotation.y = Math.PI / 2;
    tejado.position.set(-(w + 0.8) / 2, alto, 0);
    const chimenea = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), matPared);
    chimenea.position.set(w * 0.25, alto + 1.6, d * 0.15);
    casa.add(cuerpo, tejado, chimenea);
    // Ventanas y puerta
    for (const cara of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 0.1), materiales.ventana);
        v.position.set(-w / 2 + (w / 4) * (k + 1), alto * 0.55, (d / 2) * cara + 0.02 * cara);
        casa.add(v);
      }
    }
    const puerta = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), materiales.madera);
    puerta.position.set(0, 1.05, d / 2 + 0.03);
    casa.add(puerta);
    casa.position.set(x, this.alturaTerreno(x, z), z);
    casa.rotation.y = rumbo;
    casa.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.escena.add(casa);
  }

  private materialesCasa() {
    const sierra = CIRCUITO.paisaje === 'sierra';
    const costa = CIRCUITO.paisaje === 'costa';
    const paredes = (
      sierra ? [0x9a9286, 0x8c8478, 0xa79f92, 0xb3a996] : costa ? [0xf7f6f1, 0xf4f1e8, 0xfbfaf6, 0xefe9da] : [0xefe6d6, 0xe8dcc2, 0xf3efe6, 0xd9c6a5]
    ).map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
    );
    return {
      paredes,
      tejado: new THREE.MeshStandardMaterial({ color: sierra ? 0x3c3f45 : 0xa2482b, roughness: 0.8, flatShading: true }),
      ventana: new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.2, metalness: 0.4 }),
      madera: new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.9 }),
    };
  }

  private crearCasas() {
    const rnd = aleatorio(99);
    const materiales = this.materialesCasa();
    // Casas sueltas
    let colocadas = 0;
    for (let intento = 0; intento < 400 && colocadas < 12; intento++) {
      const i = Math.floor(rnd() * this.tr.n);
      const lado = rnd() < 0.5 ? -1 : 1;
      const sep = 40 + rnd() * 320;
      const x = this.tr.x[i] - this.tr.dz[i] * lado * sep;
      const z = this.tr.z[i] + this.tr.dx[i] * lado * sep;
      const cerca = this.indice.cercano(x, z);
      if (cerca.distancia < 32 || this.enLago(x, z, 40) || !this.llano(x, z)) continue;
      this.casa(x, z, Math.atan2(-this.tr.dz[i], this.tr.dx[i]) + (rnd() < 0.5 ? 0 : Math.PI / 2), rnd, materiales);
      colocadas++;
    }
    // Caseríos: grupos de 3 a 6 casas a la vista de la carretera; el primero con campanario
    let caserios = 0;
    for (let intento = 0; intento < 300 && caserios < 4; intento++) {
      const i = Math.floor(rnd() * this.tr.n);
      const lado = rnd() < 0.5 ? -1 : 1;
      const sep = 90 + rnd() * 220;
      const cx = this.tr.x[i] - this.tr.dz[i] * lado * sep;
      const cz = this.tr.z[i] + this.tr.dx[i] * lado * sep;
      if (this.indice.cercano(cx, cz).distancia < 70 || this.enLago(cx, cz, 80) || !this.llano(cx, cz, 25, 9)) continue;
      const rumbo = Math.atan2(-this.tr.dz[i], this.tr.dx[i]);
      const n = 3 + Math.floor(rnd() * 4);
      let puestas = 0;
      for (let k = 0; k < n * 4 && puestas < n; k++) {
        const a = rnd() * Math.PI * 2;
        const r = 12 + rnd() * 34;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (this.indice.cercano(x, z).distancia < 30 || this.enLago(x, z, 30)) continue;
        this.casa(x, z, rumbo + (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.3, rnd, materiales);
        puestas++;
      }
      if (caserios === 0) this.campanario(cx, cz, rumbo, materiales);
      caserios++;
    }
  }

  /** Torre de iglesia con tejado a cuatro aguas, en el centro de un caserío. */
  private campanario(x: number, z: number, rumbo: number, materiales: ReturnType<EscenaRecorrido['materialesCasa']>) {
    const torre = new THREE.Group();
    const piedra = materiales.paredes[0];
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(4.2, 16, 4.2), piedra);
    cuerpo.position.y = 7;
    const tejado = new THREE.Mesh(new THREE.ConeGeometry(3.4, 4, 4), materiales.tejado);
    tejado.position.y = 17;
    tejado.rotation.y = Math.PI / 4;
    torre.add(cuerpo, tejado);
    // Huecos de las campanas
    for (let k = 0; k < 4; k++) {
      const hueco = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.2), materiales.ventana);
      const a = (k * Math.PI) / 2;
      hueco.position.set(Math.sin(a) * 2.12, 12.5, Math.cos(a) * 2.12);
      hueco.rotation.y = a;
      torre.add(hueco);
    }
    torre.position.set(x, this.alturaTerreno(x, z), z);
    torre.rotation.y = rumbo;
    torre.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.escena.add(torre);
  }

  /**
   * Muros bajos de piedra seca junto a la carretera, a tramos (más en la sierra). Cada piedra es
   * una instancia: miles de piedras cuestan como una sola malla.
   */
  private crearMurosPiedra() {
    const rnd = aleatorio(321);
    const sierra = CIRCUITO.paisaje === 'sierra';
    const tramos = sierra ? 16 : 9;
    const geo = new THREE.DodecahedronGeometry(0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const matrices: THREE.Matrix4[] = [];
    const colores: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let t = 0; t < tramos; t++) {
      const s0 = rnd() * LONGITUD_VUELTA_M;
      // No en los llanos con vallas de madera (salvo en la sierra, que no las tiene)
      if (!sierra && Math.abs(pendiente(s0)) < 1.2) continue;
      const largo = 80 + rnd() * 200;
      const lado = rnd() < 0.5 ? -1 : 1;
      const lateral = lado * (11 + rnd() * 5);
      for (let d = 0; d < largo; d += 0.9) {
        const k = Math.round(enVuelta(s0 + d) / PASO_M) % this.tr.n;
        for (const fila of [0, 1]) {
          const lat = lateral + lado * fila * 0.05 + (rnd() - 0.5) * 0.15;
          const x = this.tr.x[k] - this.tr.dz[k] * lat;
          const z = this.tr.z[k] + this.tr.dx[k] * lat;
          if (this.enLago(x, z, 5)) continue;
          const y = this.alturaTerreno(x, z) + 0.15 + fila * 0.45;
          e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
          q.setFromEuler(e);
          const esc = 0.75 + rnd() * 0.5;
          matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(esc * 1.1, esc * 0.7, esc * 0.9)));
          const g = 0.5 + rnd() * 0.18;
          colores.push(new THREE.Color(g * 1.02, g, g * 0.94));
        }
      }
    }
    if (!matrices.length) return;
    const muro = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, i) => {
      muro.setMatrixAt(i, m);
      muro.setColorAt(i, colores[i]);
    });
    muro.castShadow = this.calidad === 'alta';
    muro.receiveShadow = true;
    this.escena.add(muro);
  }

  // ---- Espectadores animando en las cimas y en la meta ----
  // Cada zona (la meta y lo alto de cada subida) es un grupo aparte: solo se dibujan las cercanas.
  private espectadores: ZonaPublico[] = [];
  /** Público de cerca con cuerpos humanos (cuando ya están cargados los modelos del ciclista). */
  private publicoHumano: PublicoHumano | null = null;
  private publicoHumanoFallido = false;

  private crearEspectadores() {
    const rnd = aleatorio(555);
    const zonas: [number, number][] = [[-60, 40]];
    for (const t of SUBIDAS) if (t.desnivel >= 18) zonas.push([t.fin - 220, t.fin + 30]);

    // ---- Piezas (en metros, mirando hacia +Z) ----
    const torno = (puntos: [number, number][], seg: number) =>
      new THREE.LatheGeometry(puntos.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const pierna = (x: number) => new THREE.CylinderGeometry(0.078, 0.056, 0.84, 7).translate(x, 0.5, 0);
    const piernasGeo = mergeGeometries([
      pierna(0.09),
      pierna(-0.09),
      // Cadera
      new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.55, 0.78).rotateX(Math.PI).translate(0, 0.93, 0),
    ])!;
    const zapato = (x: number) => new THREE.BoxGeometry(0.105, 0.075, 0.25).translate(x, 0.04, 0.04);
    const zapatosGeo = mergeGeometries([zapato(0.09), zapato(-0.09)])!;
    // Tronco con cintura, pecho y hombros redondeados (más ancho que profundo)
    const cuerpoGeo = torno(
      [
        [0.001, 0.9],
        [0.17, 0.92],
        [0.155, 1.05],
        [0.18, 1.22],
        [0.195, 1.36],
        [0.18, 1.44],
        [0.1, 1.5],
        [0.001, 1.51],
      ],
      10,
    ).scale(1.18, 1, 0.72);
    // Cabeza: cuello, cráneo algo alargado, nariz y orejas
    const cabezaGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.052, 0.06, 0.13, 7).translate(0, 1.54, 0),
      new THREE.SphereGeometry(0.108, 10, 8).scale(0.9, 1.12, 1).translate(0, 1.69, 0.005),
      new THREE.ConeGeometry(0.022, 0.05, 5).rotateX(Math.PI / 2).translate(0, 1.67, 0.11),
      new THREE.SphereGeometry(0.025, 5, 4).scale(0.5, 1, 1).translate(0.098, 1.68, 0),
      new THREE.SphereGeometry(0.025, 5, 4).scale(0.5, 1, 1).translate(-0.098, 1.68, 0),
    ])!;
    // Peinados: corto, melena y gorra con visera (cada persona lleva uno)
    const casquete = (r: number, abajo: number) =>
      new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, abajo).scale(0.92, 1.12, 1.02).translate(0, 1.7, -0.008);
    const cortoGeo = casquete(0.116, Math.PI * 0.5);
    const melenaGeo = mergeGeometries([
      casquete(0.118, Math.PI * 0.55),
      // Pelo largo por detrás, hasta los hombros
      new THREE.CylinderGeometry(0.1, 0.12, 0.24, 8, 1, true, Math.PI * 0.6, Math.PI * 0.8).translate(0, 1.6, -0.01),
    ])!;
    const gorraGeo = mergeGeometries([
      casquete(0.118, Math.PI * 0.45),
      new THREE.CylinderGeometry(0.1, 0.1, 0.012, 10, 1, false, -Math.PI * 0.5, Math.PI).scale(1, 1, 0.9).translate(0, 1.73, 0.06),
    ])!;
    // Brazos (uno por instancia): cuelgan del hombro; manga y antebrazo con la mano
    const mangaGeo = new THREE.CylinderGeometry(0.062, 0.055, 0.28, 6).translate(0, -0.13, 0);
    const antebrazoGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.045, 0.038, 0.3, 6).translate(0, -0.42, 0),
      new THREE.SphereGeometry(0.048, 6, 4).scale(0.8, 1.15, 0.6).translate(0, -0.6, 0),
    ])!;

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const camisetas = [
      0xd62828, 0x1e5bd8, 0xf5d90a, 0x2fa84f, 0xff6a1a, 0xf4f4f4, 0x161616, 0xff4fa3, 0x12b5b0, 0x7a3fbf, 0x8fb8de,
      0xc9b28f, 0x5b6b3a, 0xb0413e,
    ];
    const pieles = [0xf3d2b3, 0xeac0a0, 0xe0ac85, 0xc68642, 0xa86b3c, 0x8d5524, 0x5e3a1f];
    const pantalones = [0x1d2433, 0x2b2b2b, 0x3a4f7a, 0x8a7a5c, 0x4a4a4a, 0x5d6f8e, 0xd8cfbf];
    const pelos = [0x1b1410, 0x2e1f14, 0x4a2f1b, 0x7a5232, 0xb08a52, 0xd8c08a, 0x9a9a9a, 0xe5e5e5];
    const gorras = [0xd62828, 0xf4f4f4, 0x1e5bd8, 0xf5d90a, 0x161616, 0xff6a1a];
    const zapatillas = [0x222222, 0xf2f2f2, 0x3b3b3b, 0x8a5a2b, 0x1e5bd8];
    const elegir = <T,>(l: T[]) => l[Math.floor(rnd() * l.length)];
    const c = new THREE.Color();
    const cero = new THREE.Matrix4().makeScale(0, 0, 0);

    for (const [a, b] of zonas) {
      const gente: Persona[] = [];
      for (let sv = a; sv < b; sv += rnd() < 0.15 ? 6 + rnd() * 10 : 0.8 + rnd() * 1.6) {
        const lado = rnd() < 0.5 ? -1 : 1;
        const k = Math.round(enVuelta(sv) / PASO_M) % this.tr.n;
        const lat = lado * (6 + rnd() * 2.5);
        const x = this.tr.x[k] - this.tr.dz[k] * lat;
        const z = this.tr.z[k] + this.tr.dx[k] * lat;
        // Miran hacia la carretera (+Z local hacia el asfalto)
        const rumbo = Math.atan2(-this.tr.dz[k], this.tr.dx[k]) + (lado > 0 ? Math.PI : 0);
        const r = rnd();
        gente.push({
          pos: new THREE.Vector3(x, this.alturaTerreno(x, z), z),
          rumbo,
          giro: rumbo,
          fase: rnd() * 10,
          ritmo: 4 + rnd() * 4,
          s: enVuelta(sv),
          // 0: brazos arriba agitando; 1: aplaudiendo; 2: un puño arriba; 3: mirando, brazos abajo
          gesto: r < 0.35 ? 0 : r < 0.65 ? 1 : r < 0.85 ? 2 : 3,
          talla: 0.88 + rnd() * 0.2,
          ancho: 0.9 + rnd() * 0.25,
          humano: false,
          sexo: 'hombre',
          peinado: 0,
          barba: false,
          corto: false,
          colores: {
            camiseta: new THREE.Color(),
            pantalon: new THREE.Color(),
            zapatillas: new THREE.Color(),
            piel: new THREE.Color(),
            pelo: new THREE.Color(),
          },
        });
      }
      if (!gente.length) continue;
      const n = gente.length;
      const grupo = new THREE.Group();
      const malla = (geo: THREE.BufferGeometry, cuantos = n) => {
        const m = new THREE.InstancedMesh(geo, mat, cuantos);
        m.castShadow = this.calidad === 'alta';
        grupo.add(m);
        return m;
      };
      const zona: ZonaPublico = {
        grupo,
        gente,
        piernas: malla(piernasGeo),
        zapatos: malla(zapatosGeo),
        cuerpo: malla(cuerpoGeo),
        cabeza: malla(cabezaGeo),
        peinados: [malla(cortoGeo), malla(melenaGeo), malla(gorraGeo)],
        peinado: [],
        mangas: malla(mangaGeo, n * 2),
        antebrazos: malla(antebrazoGeo, n * 2),
      };
      for (let i = 0; i < n; i++) {
        const camiseta = elegir(camisetas);
        const piel = elegir(pieles);
        const pantalon = elegir(pantalones);
        const zapas = elegir(zapatillas);
        const colorPelo = elegir(pelos);
        // De vez en cuando, chaqueta: la manga llega hasta la muñeca
        const chaqueta = rnd() < 0.2;
        zona.cuerpo.setColorAt(i, c.set(camiseta));
        zona.piernas.setColorAt(i, c.set(pantalon));
        zona.zapatos.setColorAt(i, c.set(zapas));
        zona.cabeza.setColorAt(i, c.set(piel));
        const tipoPelo = rnd() < 0.3 ? 2 : rnd() < 0.4 ? 1 : 0;
        zona.peinado.push(tipoPelo);
        zona.peinados.forEach((m, j) => {
          m.setColorAt(i, c.set(j === 2 ? elegir(gorras) : colorPelo));
          if (j !== tipoPelo) m.setMatrixAt(i, cero);
        });
        // Su versión humana (de cerca)
        const p = gente[i];
        p.sexo = tipoPelo === 1 || rnd() < 0.3 ? 'mujer' : 'hombre';
        p.peinado = Math.floor(rnd() * peinadosDe(p.sexo));
        p.barba = p.sexo === 'hombre' && rnd() < 0.35;
        p.corto = rnd() < 0.35;
        p.colores.camiseta.set(camiseta);
        p.colores.pantalon.set(pantalon);
        p.colores.zapatillas.set(zapas);
        p.colores.piel.set(piel);
        p.colores.pelo.set(colorPelo);
        for (let lado = 0; lado < 2; lado++) {
          zona.mangas.setColorAt(i * 2 + lado, c.set(camiseta));
          zona.antebrazos.setColorAt(i * 2 + lado, c.set(chaqueta ? camiseta : piel));
        }
      }
      this.escena.add(grupo);
      this.espectadores.push(zona);
      this.colocarPublico(zona, 0, true);
      for (const m of grupo.children as THREE.InstancedMesh[]) m.computeBoundingSphere();
    }
  }

  /** Mueve a la gente de las zonas cercanas (las lejanas ni se dibujan). */
  private animarEspectadores(t: number) {
    const yo = enVuelta(this.sYo);
    const relativa = (s: number) => {
      let h = s - yo;
      if (h > LONGITUD_VUELTA_M / 2) h -= LONGITUD_VUELTA_M;
      if (h < -LONGITUD_VUELTA_M / 2) h += LONGITUD_VUELTA_M;
      return h;
    };
    // Los más cercanos (sobre todo los de delante) se dibujan con cuerpo humano
    const humano = this.prepararPublicoHumano();
    const candidatos: { e: Persona; d: number }[] = [];
    for (const z of this.espectadores) {
      const h = relativa(z.gente[0].s);
      z.grupo.visible = h > -500 && h < 1500;
      if (!z.grupo.visible) continue;
      for (const e of z.gente) {
        const he = relativa(e.s);
        e.humano = false;
        if (humano && he > -40 && he < 160) candidatos.push({ e, d: Math.abs(he - 25) });
      }
    }
    if (humano) {
      candidatos.sort((a, b) => a.d - b.d);
      for (const c of candidatos.slice(0, humano.maximo)) c.e.humano = true;
    }
    this.cercanos.length = 0;
    for (const z of this.espectadores) if (z.grupo.visible) this.colocarPublico(z, t, false);
    if (humano) {
      this.cercanos.sort((a, b) => a.d - b.d);
      humano.actualizar(
        this.cercanos.map((c) => c.p),
        t,
      );
    }
  }

  private cercanos: { p: PersonaCercana; d: number }[] = [];

  /** Crea el público humano en cuanto están los modelos del ciclista (menos personas en el iPad). */
  private prepararPublicoHumano() {
    if (this.publicoHumano || this.publicoHumanoFallido) return this.publicoHumano;
    const p = plantillasHumanas();
    if (!p) return null;
    try {
      this.publicoHumano = new PublicoHumano(p, this.calidad === 'alta' && !esDispositivoIos() ? 44 : 26, this.calidad === 'alta');
      this.escena.add(this.publicoHumano.grupo);
    } catch (e) {
      console.warn('No se pudo crear el público humano', e);
      this.publicoHumanoFallido = true;
    }
    return this.publicoHumano;
  }

  /** Coloca a cada persona: se giran para verte pasar, saltan y mueven los brazos según su gesto. */
  private colocarPublico(z: ZonaPublico, t: number, todos: boolean) {
    const yo = enVuelta(this.sYo);
    const k = Math.round(yo / PASO_M) % this.tr.n;
    const rx = this.tr.x[k];
    const rz = this.tr.z[k];
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    const cuerpo = new THREE.Matrix4();
    const brazo = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const esc = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    let cambio = false;
    z.gente.forEach((e, i) => {
      let h = e.s - yo;
      if (h > LONGITUD_VUELTA_M / 2) h -= LONGITUD_VUELTA_M;
      if (h < -LONGITUD_VUELTA_M / 2) h += LONGITUD_VUELTA_M;
      const cerca = h > -60 && h < 300;
      if (!cerca && !todos) return;
      const fase = t * e.ritmo + e.fase;
      // Se giran hacia ti (sin darse la vuelta del todo)
      if (cerca) {
        let d = Math.atan2(rx - e.pos.x, rz - e.pos.z) - e.rumbo;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const objetivo = e.rumbo + Math.max(-1.1, Math.min(1.1, d));
        let g = objetivo - e.giro;
        g = Math.atan2(Math.sin(g), Math.cos(g));
        e.giro += g * 0.08;
      } else e.giro = e.rumbo;
      const salta = cerca && (e.gesto === 0 || e.gesto === 2);
      const salto = salta ? Math.max(0, Math.sin(fase)) * 0.1 : 0;
      q.setFromAxisAngle(Y, e.giro);
      p.copy(e.pos).setY(e.pos.y + salto);
      if (e.humano) {
        // Con cuerpo humano: la figura sencilla desaparece
        const gesto = e.gesto === 1 ? 1 : e.gesto === 3 ? 2 : 0;
        this.cercanos.push({
          d: Math.abs(h - 25),
          p: {
            matriz: new THREE.Matrix4().compose(p, q, esc.set(e.talla * 0.9, e.talla * 0.97, e.talla * 0.94)),
            sexo: e.sexo,
            gesto,
            peinado: e.peinado,
            barba: e.barba,
            fase: e.fase,
            ritmo: gesto === 2 ? 0 : gesto === 1 ? e.ritmo * 1.5 : e.ritmo * 0.7,
            corto: e.corto,
            ...e.colores,
          },
        });
        for (const malla of [z.piernas, z.zapatos, z.cuerpo, z.cabeza, z.peinados[z.peinado[i]]]) malla.setMatrixAt(i, CERO);
        z.mangas.setMatrixAt(i * 2, CERO);
        z.mangas.setMatrixAt(i * 2 + 1, CERO);
        z.antebrazos.setMatrixAt(i * 2, CERO);
        z.antebrazos.setMatrixAt(i * 2 + 1, CERO);
        cambio = true;
        return;
      }
      esc.set(e.talla * e.ancho, e.talla, e.talla * e.ancho);
      cuerpo.compose(p, q, esc);
      z.piernas.setMatrixAt(i, cuerpo);
      z.zapatos.setMatrixAt(i, cuerpo);
      z.cuerpo.setMatrixAt(i, cuerpo);
      z.cabeza.setMatrixAt(i, cuerpo);
      z.peinados[z.peinado[i]].setMatrixAt(i, cuerpo);
      // Brazos: desde cada hombro, según el gesto
      const mueve = cerca ? 1 : 0;
      for (let lado = 0; lado < 2; lado++) {
        const sg = lado === 0 ? 1 : -1;
        if (e.gesto === 0) {
          // Los dos arriba, en V, agitándolos
          tmp.makeRotationZ(sg * (2.55 + Math.sin(fase * 1.3 + lado) * 0.3 * mueve));
        } else if (e.gesto === 1) {
          // Aplaudiendo: brazos hacia delante y las manos se juntan
          const junta = 0.25 + (Math.sin(fase * 2.2) * 0.5 + 0.5) * 0.3 * mueve;
          tmp.makeRotationY(-sg * junta).multiply(rot.makeRotationX(-1.15));
        } else if (e.gesto === 2) {
          // Un puño arriba (el derecho) y el otro abajo
          tmp.makeRotationZ(lado === 0 ? 2.7 + Math.sin(fase * 1.6) * 0.25 * mueve : -0.12);
        } else {
          // Mirando: brazos abajo, algo separados
          tmp.makeRotationZ(sg * 0.12);
        }
        brazo.makeTranslation(sg * 0.215, 1.42, 0).multiply(tmp);
        m.multiplyMatrices(cuerpo, brazo);
        z.mangas.setMatrixAt(i * 2 + lado, m);
        z.antebrazos.setMatrixAt(i * 2 + lado, m);
      }
      cambio = true;
    });
    if (cambio) for (const m of z.grupo.children as THREE.InstancedMesh[]) m.instanceMatrix.needsUpdate = true;
  }

  // ---- Pájaros: bandadas volando en círculo sobre el paisaje ----
  private pajaros: { malla: THREE.InstancedMesh; bandadas: { c: THREE.Vector3; r: number; v: number; n: number }[] } | null = null;

  private crearPajaros() {
    const rnd = aleatorio(777);
    // Un pájaro: dos alas en V (se baten escalando en vertical)
    const ala = new THREE.BufferGeometry();
    ala.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, -0.45, 0.12, -0.15, -0.45, 0.12, 0.15, 0, 0, 0, 0.45, 0.12, 0.15, 0.45, 0.12, -0.15], 3),
    );
    ala.computeVertexNormals();
    const bandadas: { c: THREE.Vector3; r: number; v: number; n: number }[] = [];
    let total = 0;
    for (let b = 0; b < 7; b++) {
      const k = Math.floor(rnd() * this.tr.n);
      const lado = rnd() < 0.5 ? -1 : 1;
      const sep = 60 + rnd() * 200;
      const x = this.tr.x[k] - this.tr.dz[k] * lado * sep;
      const z = this.tr.z[k] + this.tr.dx[k] * lado * sep;
      const n = 5 + Math.floor(rnd() * 6);
      bandadas.push({ c: new THREE.Vector3(x, this.alturaTerreno(x, z) + 35 + rnd() * 30, z), r: 25 + rnd() * 35, v: (0.15 + rnd() * 0.15) * (rnd() < 0.5 ? -1 : 1), n });
      total += n;
    }
    const malla = new THREE.InstancedMesh(ala, new THREE.MeshBasicMaterial({ color: 0x1d1f22, side: THREE.DoubleSide }), total);
    malla.frustumCulled = false;
    this.escena.add(malla);
    this.pajaros = { malla, bandadas };
  }

  private animarPajaros(t: number) {
    const P = this.pajaros;
    if (!P) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const esc = new THREE.Vector3();
    const eje = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const b of P.bandadas) {
      for (let k = 0; k < b.n; k++) {
        // Cada pájaro algo desplazado en el círculo y en altura, batiendo las alas a su ritmo
        const a = t * b.v + k * 0.22;
        const r = b.r + Math.sin(k * 1.7) * 6;
        p.set(b.c.x + Math.cos(a) * r, b.c.y + Math.sin(k * 2.3 + t * 0.7) * 2, b.c.z + Math.sin(a) * r);
        q.setFromAxisAngle(eje, -a + (b.v > 0 ? 0 : Math.PI));
        const aleteo = 0.35 + 0.65 * Math.abs(Math.sin(t * 9 + k));
        m.compose(p, q, esc.set(1.4, aleteo * 1.4, 1.4));
        P.malla.setMatrixAt(i++, m);
      }
    }
    P.malla.instanceMatrix.needsUpdate = true;
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
    if (this.rio) this.crearRio();
    if (this.costa) this.crearMar();
    if (this.lago.r <= 0) return;
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

  /** El mar: un plano enorme a nivel 0 (tierra adentro lo tapa el terreno) y unos veleros. */
  private crearMar() {
    const mar = new THREE.Mesh(
      new THREE.CircleGeometry(16000, 96),
      new THREE.MeshStandardMaterial({ color: 0x0f5675, roughness: 0.22, metalness: 0.05, envMapIntensity: 0.55 }),
    );
    mar.rotation.x = -Math.PI / 2;
    mar.position.set(this.tr.centroX, 0, this.tr.centroZ);
    mar.receiveShadow = true;
    this.escena.add(mar);

    // Veleros fondeados o navegando despacio (casco blanco y vela)
    const rnd = aleatorio(808);
    const casco = new THREE.BoxGeometry(2.4, 0.9, 7).translate(0, 0.25, 0);
    const vela = new THREE.BufferGeometry();
    vela.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, -2.2, 0, 9.5, -0.4, 0, 1, 1.8], 3));
    vela.computeVertexNormals();
    const matCasco = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 });
    const matVela = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.8, side: THREE.DoubleSide });
    const c = this.costa!;
    for (let k = 0; k < 14; k++) {
      const i = Math.floor(rnd() * this.tr.n);
      const x0 = this.tr.x[i];
      const z0 = this.tr.z[i];
      const dentro = 250 + rnd() * 2200;
      // Mar adentro desde este punto de la carretera
      const x = x0 + c.dx * dentro;
      const z = z0 + c.dz * dentro;
      if (this.mar(x, z) < 120) continue;
      const barco = new THREE.Group();
      barco.add(new THREE.Mesh(casco, matCasco), new THREE.Mesh(vela, matVela));
      barco.position.set(x, 0, z);
      barco.rotation.y = rnd() * Math.PI * 2;
      barco.scale.setScalar(0.8 + rnd() * 0.6);
      this.escena.add(barco);
    }
  }

  /** Faro en lo alto del cabo: junto al punto más alto de la vuelta, del lado del mar. */
  private crearFaro() {
    let sMax = 0;
    for (let s = 0; s < LONGITUD_VUELTA_M; s += 50) if (altitud(s) > altitud(sMax)) sMax = s;
    const k = Math.round(sMax / PASO_M) % this.tr.n;
    let mejor: { x: number; z: number } | null = null;
    let dMejor = -Infinity;
    // Del lado del mar, en el rellano junto a la carretera (más allá el terreno cae en acantilado)
    let ladoMar = 1;
    for (const lado of [-1, 1]) {
      const d = this.mar(this.tr.x[k] - this.tr.dz[k] * lado * 60, this.tr.z[k] + this.tr.dx[k] * lado * 60);
      if (d > dMejor) {
        dMejor = d;
        ladoMar = lado;
      }
    }
    const lat = 20;
    const x0 = this.tr.x[k] - this.tr.dz[k] * ladoMar * lat;
    const z0 = this.tr.z[k] + this.tr.dx[k] * ladoMar * lat;
    if (this.mar(x0, z0) < -8) mejor = { x: x0, z: z0 };
    if (!mejor) return;
    const y = this.alturaTerreno(mejor.x, mejor.z);
    const faro = new THREE.Group();
    const blanco = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.7 });
    const rojo = new THREE.MeshStandardMaterial({ color: 0xb8302a, roughness: 0.6 });
    const gris = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.4 });
    const cristal = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: 0.8, roughness: 0.1 });
    const pieza = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const o = new THREE.Mesh(g, m);
      o.castShadow = true;
      o.receiveShadow = true;
      faro.add(o);
      return o;
    };
    // Torre troncocónica con franjas rojas
    const alto = 20;
    const franjas = 5;
    for (let i = 0; i < franjas; i++) {
      const y0 = (i / franjas) * alto;
      const y1 = ((i + 1) / franjas) * alto;
      const r = (yy: number) => 2.6 - (yy / alto) * 0.9;
      pieza(new THREE.CylinderGeometry(r(y1), r(y0), y1 - y0, 20).translate(0, (y0 + y1) / 2, 0), i % 2 ? rojo : blanco);
    }
    pieza(new THREE.CylinderGeometry(2.6, 2.6, 0.35, 20).translate(0, alto + 0.17, 0), gris); // galería
    pieza(new THREE.CylinderGeometry(1.15, 1.15, 2.2, 12).translate(0, alto + 1.45, 0), cristal); // linterna
    pieza(new THREE.ConeGeometry(1.4, 1.4, 12).translate(0, alto + 3.25, 0), rojo); // cúpula
    // Barandilla de la galería
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pieza(new THREE.CylinderGeometry(0.04, 0.04, 1, 4).translate(Math.cos(a) * 2.45, alto + 0.85, Math.sin(a) * 2.45), gris);
    }
    pieza(new THREE.TorusGeometry(2.45, 0.05, 4, 32).rotateX(Math.PI / 2).translate(0, alto + 1.35, 0), gris);
    // Casa del farero al pie
    pieza(new THREE.BoxGeometry(6, 3.2, 4.5).translate(4.5, 1.6, 0), blanco);
    pieza(new THREE.ConeGeometry(4.3, 1.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.75).translate(4.5, 4, 0), rojo);
    faro.position.set(mejor.x, y - 0.3, mejor.z);
    // La casa del farero, hacia el mar (no hacia la carretera)
    faro.rotation.y = Math.atan2(-this.tr.dx[k] * ladoMar, -this.tr.dz[k] * ladoMar);
    this.escena.add(faro);
  }

  /** Cinta de agua a lo largo del tramo con río (un poco más ancha que el cauce, que la tapa). */
  private crearRio() {
    const r = this.rio!;
    const largo = r.hasta > r.desde ? r.hasta - r.desde : r.hasta + LONGITUD_VUELTA_M - r.desde;
    const paso = 8;
    const n = Math.floor(largo / paso) + 1;
    const pos = new Float32Array(n * 2 * 3);
    const indices: number[] = [];
    const mitad = r.ancho / 2 + 5;
    for (let j = 0; j < n; j++) {
      const k = Math.round(enVuelta(r.desde + j * paso) / PASO_M) % this.tr.n;
      for (let lado = 0; lado < 2; lado++) {
        const lat = r.lado * r.distancia + (lado ? mitad : -mitad);
        const v = (j * 2 + lado) * 3;
        pos[v] = this.tr.x[k] - this.tr.dz[k] * lat;
        pos[v + 1] = r.nivel;
        pos[v + 2] = this.tr.z[k] + this.tr.dx[k] * lat;
      }
      if (j > 0) {
        const a = (j - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const agua = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x3b6f7c,
        roughness: 0.08,
        metalness: 0.25,
        transparent: true,
        opacity: 0.9,
        envMapIntensity: 1.2,
        side: THREE.DoubleSide,
      }),
    );
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
    const r0Base = Math.min(maxX - minX, maxZ - minZ) / 2 + 1200;
    const r1 = 8400;
    const nA = this.calidad === 'alta' ? 720 : 400;
    const nR = this.calidad === 'alta' ? 110 : 64;
    // Dónde empieza la cordillera en cada dirección: nunca encima de la carretera (en circuitos
    // alargados, como la Ribera, la carretera llega mucho más lejos en una dirección que en otra)
    const lejania = new Float32Array(nA + 1);
    for (let k = 0; k < this.tr.n; k += 4) {
      const dx = this.tr.x[k] - cx;
      const dz = this.tr.z[k] - cz;
      const a = (Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2);
      const i = Math.round((a / (Math.PI * 2)) * nA);
      lejania[i] = Math.max(lejania[i], Math.hypot(dx, dz));
    }
    const ventana = Math.round(nA / 24); // ±15°
    const inicioEn = new Float32Array(nA + 1);
    for (let i = 0; i <= nA; i++) {
      let m = 0;
      for (let d = -ventana; d <= ventana; d++) m = Math.max(m, lejania[(((i + d) % nA) + nA) % nA]);
      inicioEn[i] = Math.min(r1 - 2000, Math.max(r0Base, m + 300));
    }
    const altura = (x: number, z: number, r: number, r0: number) => {
      const e = suavizado(r0, r0 + 1700, r);
      const macizo = 0.45 + 0.9 * fbm(x / 7000 + 3, z / 7000 - 2, 3, 5);
      const h = 120 + 1150 * crestas(x / 2300, z / 2300, 7, 11) ** 1.25 * macizo;
      const monte = this.fondo(x, z) - 4 + e * h;
      // Hacia el mar, la cordillera se hunde bajo el agua
      return this.costa ? THREE.MathUtils.lerp(monte, -40, suavizado(-1500, -150, this.mar(x, z))) : monte;
    };
    const pos = new Float32Array((nA + 1) * (nR + 1) * 3);
    const col = new Float32Array((nA + 1) * (nR + 1) * 3);
    for (let j = 0; j <= nR; j++) {
      for (let i = 0; i <= nA; i++) {
        const r0 = inicioEn[i];
        // Más anillos cerca (donde se ve el detalle)
        const r = r0 + (r1 - r0) * (j / nR) ** 1.4;
        const a = (i / nA) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const k = (j * (nA + 1) + i) * 3;
        pos[k] = x;
        pos[k + 1] = altura(x, z, r, r0);
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
    // Perspectiva aérea: lo lejano se funde con la bruma del cielo que toca (azulada a mediodía,
    // cálida al atardecer)
    const lejos = new THREE.Color(0x9fb4c8).lerp(new THREE.Color(cieloActual().niebla), 0.3);
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
      // Más bruma abajo (en los valles) que en las cumbres
      const bajo = 1 - suavizado(ALTITUD_MIN + 60, ALTITUD_MIN + 700, y);
      c.lerp(lejos, Math.min(0.85, 0.15 + 0.55 * suavizado(inicioEn[v % (nA + 1)], r1, d) + 0.2 * bajo));
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
      nube.position.set(this.tr.centroX + Math.cos(a) * d, 650 + (ALTITUD_MIN - 20) + rnd() * 500, this.tr.centroZ + Math.sin(a) * d);
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

  /**
   * Taludes de roca y tierra junto a la carretera en las subidas y bajadas de más del 2,5 %:
   * más altos cuanto más dura es la pendiente, para que se note a la vista. En las subidas van a
   * la izquierda y en las bajadas a la derecha (como una carretera excavada en la ladera).
   */
  private crearTaludes() {
    const perfil: [number, number][] = [
      [7.6, 0.05],
      [10.5, 1],
      [16, 0.92],
      [26, 0],
    ];
    const altura = (s: number) => {
      const g = Math.abs(pendiente(s));
      return Math.min(4.5, Math.max(0, (g - 2.5) * 1.3));
    };
    const rnd = aleatorio(71);
    const matTalud = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    const roca = new THREE.Color(0x8a7d6c);
    const tierra = new THREE.Color(0x7b6a4f);
    const hierba = new THREE.Color(0x5f7f3a);
    const paso = PASO_M * 2;
    const tramos: { desde: number; lado: number }[] = [];
    let actual: { desde: number; lado: number } | null = null;
    for (let s = 0; s <= LONGITUD_VUELTA_M; s += paso) {
      const hay = altura(s) > 0.05 && s < LONGITUD_VUELTA_M;
      const lado = pendiente(s) > 0 ? 1 : -1;
      if (hay && (!actual || actual.lado !== lado)) {
        actual = { desde: s, lado };
        tramos.push(actual);
      } else if (!hay) actual = null;
      if (actual) (actual as { hasta?: number }).hasta = s;
    }
    for (const t of tramos as { desde: number; hasta: number; lado: number }[]) {
      const n = Math.max(1, Math.round((t.hasta - t.desde) / paso));
      const pos = new Float32Array((n + 1) * perfil.length * 3);
      const col = new Float32Array((n + 1) * perfil.length * 3);
      const idx: number[] = [];
      const c = new THREE.Color();
      for (let k = 0; k <= n; k++) {
        const s = t.desde + k * paso;
        const i = Math.round(enVuelta(s) / PASO_M) % this.tr.n;
        const y = altitud(s);
        // Suavizado en los extremos para que el talud nazca y muera poco a poco
        const h = altura(s) * Math.min(1, k / 6, (n - k) / 6);
        for (let m = 0; m < perfil.length; m++) {
          const [lat, f] = perfil[m];
          const l = lat * t.lado;
          const v = (k * perfil.length + m) * 3;
          const ruido = m === 1 || m === 2 ? (rnd() - 0.5) * 0.6 : 0;
          pos[v] = this.tr.x[i] - this.tr.dz[i] * l;
          pos[v + 1] = y + h * f + ruido * Math.min(1, h);
          pos[v + 2] = this.tr.z[i] + this.tr.dx[i] * l;
          // Roca en la pared, tierra y hierba arriba
          c.copy(m === 1 ? roca : m === 2 ? tierra : hierba).multiplyScalar(0.9 + rnd() * 0.2);
          col.set([c.r, c.g, c.b], v);
        }
        if (k < n) {
          for (let m = 0; m < perfil.length - 1; m++) {
            const a = k * perfil.length + m;
            const b = a + perfil.length;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      // Las caras deben mirar hacia arriba (hacia la luz): si no, se dan la vuelta
      const normales = geo.attributes.normal as THREE.BufferAttribute;
      let arriba = 0;
      for (let v = 0; v < normales.count; v++) arriba += normales.getY(v);
      if (arriba < 0) {
        for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]];
        geo.setIndex(idx);
        geo.computeVertexNormals();
      }
      const malla = new THREE.Mesh(geo, matTalud);
      malla.receiveShadow = true;
      malla.castShadow = this.calidad === 'alta';
      this.escena.add(malla);
    }
  }

  /**
   * Carteles de las subidas: al pie, el nombre con su longitud, pendiente media y desnivel, y
   * dentro, cada 500 m, la pendiente del tramo que viene.
   */
  private crearCartelesPendiente() {
    const matPoste = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5 });
    const cartel = (s: number, texto: string, ancho: number, fondo: string) => {
      const k = Math.round(enVuelta(s) / PASO_M) % this.tr.n;
      const sx = this.tr.dz[k];
      const sz = -this.tr.dx[k];
      const base = new THREE.Vector3(this.tr.x[k] + sx * 6.8, altitud(s), this.tr.z[k] + sz * 6.8);
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), matPoste);
      poste.position.copy(base).add(new THREE.Vector3(0, 1.7, 0));
      const placa = new THREE.Mesh(
        new THREE.BoxGeometry(ancho, 1.15, 0.08),
        new THREE.MeshStandardMaterial({
          map: texturaTexto(texto, fondo, '#ffffff', Math.round(ancho * 200), 230),
          roughness: 0.5,
        }),
      );
      placa.position.copy(base).add(new THREE.Vector3(0, 3.3, 0));
      placa.rotation.y = Math.atan2(-this.tr.dz[k], this.tr.dx[k]) + Math.PI / 2;
      this.escena.add(poste, placa);
    };
    const pct = (g: number) => `${g.toFixed(g < 10 ? 1 : 0).replace('.', ',')} %`;
    for (const t of SUBIDAS) {
      if (t.pendienteMedia < 2.5) continue;
      const largo = ((t.fin - t.inicio) / 1000).toFixed(1).replace('.', ',');
      cartel(t.inicio - 120, `${largo} km al ${pct(t.pendienteMedia)} · +${Math.round(t.desnivel)} m`, 5.2, '#1f5a2a');
      for (let s = t.inicio + 500; s < t.fin - 150; s += 500) {
        const g = (altitud(Math.min(t.fin, s + 500)) - altitud(s)) / (Math.min(t.fin, s + 500) - s) * 100;
        cartel(s - 30, pct(g), 2.0, g >= 7 ? '#a3221b' : g >= 5 ? '#c26512' : '#1f5a2a');
      }
      // Cartel azul en lo alto del puerto, con su nombre y la altitud
      if (CIRCUITO.nombrePuerto && t.desnivel >= 60) cartel(t.fin + 15, `${CIRCUITO.nombre} · ${Math.round(altitud(t.fin))} m`, 5.2, '#1d4f91');
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

  /**
   * Inclinación lateral en una curva a la velocidad v (m/s): la del ciclista real, atan(v²·k/g),
   * con k la curvatura (cuánto gira la carretera por metro). Positiva hacia la izquierda.
   */
  private inclinacionEn(s: number, v: number) {
    const a = this.puntoEn(s - 6, 0, this.puntoCurva);
    const ax = a.dx;
    const az = a.dz;
    const b = this.puntoEn(s + 6, 0, this.puntoCurva);
    // Giro hacia la izquierda (normal −dz, dx) por metro recorrido
    const k = ((b.dx - ax) * -az + (b.dz - az) * ax) / 12;
    return Math.max(-0.38, Math.min(0.38, Math.atan((v * v * k) / 9.81)));
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
          carril: o.fantasma ? MI_CARRIL : (o.carril ?? CARRILES[hash(o.uid) % CARRILES.length]),
          fantasma: !!o.fantasma,
        };
        if (o.fantasma) c.volverFantasma();
        this.otros.set(o.uid, e);
      }
      if (o.nombre !== e.nombre) {
        e.c.ponerNombre(o.nombre);
        e.nombre = o.nombre;
      }
      if (!e.fantasma) e.c.cambiarAvatar(o.avatar);
      if (o.distancia !== e.sBase) {
        e.sBase = o.distancia;
        e.recibido = ahora;
      }
      e.vObjetivo = o.velocidad / 3.6;
      e.cadencia = o.cadencia;
      e.vatios = o.vatios;
      e.c.ponerEmoji(o.emoji ?? null);
    }
    for (const [uid, e] of this.otros) {
      if (!vistos.has(uid)) {
        e.c.destruir();
        this.otros.delete(uid);
      }
    }
  }

  /** Mi dorsal (con mi nombre en la salida en grupo). */
  ponerMiDorsal(nombre: string | null) {
    this.yo.ponerDorsal(nombre);
  }

  /** Mi emoji (o null para quitarlo). */
  ponerMiEmoji(emoji: string | null) {
    this.yo.ponerEmoji(emoji);
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
    // A rueda (alguien 0,3-12 m por delante), mi ciclista se coloca detrás de él
    let carrilObjetivo = MI_CARRIL;
    let huecoMin = Infinity;
    for (const e of this.otros.values()) {
      if (e.fantasma) continue;
      let h = (e.sRender - this.sYo) % LONGITUD_VUELTA_M;
      if (h > LONGITUD_VUELTA_M / 2) h -= LONGITUD_VUELTA_M;
      if (h < -LONGITUD_VUELTA_M / 2) h += LONGITUD_VUELTA_M;
      if (h > 0.3 && h < 12 && h < huecoMin) {
        huecoMin = h;
        carrilObjetivo = e.carril;
      }
    }
    // Muy pegado (menos que una bici), medio cuerpo al lado para no atravesarlo al adelantar
    if (huecoMin < 2.2) carrilObjetivo += carrilObjetivo > 0 ? -0.9 : 0.9;
    this.carrilYo += (carrilObjetivo - this.carrilYo) * Math.min(1, dt * 0.8);
    const p = this.puntoEn(this.sYo, this.carrilYo, this.punto);
    const pxYo = p.pos.x;
    const pyYo = p.pos.y;
    const pzYo = p.pos.z;
    const dxYo = p.dx;
    const dzYo = p.dz;
    this.inclinacionYo += (this.inclinacionEn(this.sYo, this.vYo) - this.inclinacionYo) * Math.min(1, dt * 4);
    p.pos.set(pxYo, pyYo, pzYo);
    this.yo.colocar(p.pos, dxYo, dzYo, pendiente(this.sYo), this.inclinacionYo);
    // Sprint: muy por encima del FTP; se sienta al bajar (con margen, para que no parpadee)
    const umbral = Math.max(450, 1.5 * (yo.ftp ?? 250));
    if ((yo.potencia ?? 0) >= umbral) this.sprintYo = true;
    else if ((yo.potencia ?? 0) < umbral * 0.8) this.sprintYo = false;
    this.yo.ponerDePie(tocaDePie(pendiente(this.sYo), this.sprintYo, this.vYo, ahora, 0));
    this.yo.pedalear(this.vYo, yo.cadencia, dt);
    const miX = pxYo;
    const miY = pyYo;
    const miZ = pzYo;

    // Otros ciclistas
    for (const [uid, e] of this.otros) {
      e.v += (e.vObjetivo - e.v) * Math.min(1, dt * 2);
      // Otros: sus datos llegan por internet con retrasos variables → algo más de margen
      e.sRender = this.avanzar(e.sRender, e.sBase, e.recibido, e.v, ahora, dt, 2.5, 0.6);
      const q = this.puntoEn(e.sRender, e.carril, this.punto);
      const qx = q.pos.x;
      const qy = q.pos.y;
      const qz = q.pos.z;
      const qdx = q.dx;
      const qdz = q.dz;
      const lean = this.inclinacionEn(e.sRender, e.v);
      q.pos.set(qx, qy, qz);
      e.c.colocar(q.pos, qdx, qdz, pendiente(e.sRender), lean);
      // Los carteles de los bots y grupetas solo de cerca (los de tus amigos, siempre)
      if (uid.startsWith('bot-')) {
        let h = (e.sRender - this.sYo) % LONGITUD_VUELTA_M;
        if (h > LONGITUD_VUELTA_M / 2) h -= LONGITUD_VUELTA_M;
        if (h < -LONGITUD_VUELTA_M / 2) h += LONGITUD_VUELTA_M;
        e.c.mostrarNombre(h > -80 && h < 220);
      }
      if (!e.fantasma) e.c.ponerDePie(tocaDePie(pendiente(e.sRender), (e.vatios ?? 0) >= 650, e.v, ahora, (hash(uid) % 97) / 97));
      e.c.pedalear(e.v, e.cadencia, dt);
    }

    this.revisarZonas(miX, miZ, ahora);
    this.resolucionDinamica(dt, ahora);

    // Molinos, nubes, espectadores y pájaros
    for (const r of this.rotores) r.g.rotation.x += r.vel * dt;
    this.animarEspectadores(ahora / 1000);
    this.animarPajaros(ahora / 1000);
    for (const n of this.nubes) n.position.x += 3 * dt;

    // Sol y sombras siguiendo al ciclista
    this.sol.position.set(miX + this.dirSol.x * 150, miY + this.dirSol.y * 150, miZ + this.dirSol.z * 150);
    this.sol.target.position.set(miX, miY, miZ);
    this.cielo.position.set(this.camara.position.x, 0, this.camara.position.z);

    // Cámara en tercera persona: sobre la carretera 6 m por detrás y mirando a la carretera de
    // delante: la cámara se inclina con la carretera, así en las subidas el horizonte baja y se
    // ve la rampa por delante (y en las bajadas, la caída).
    const atras = this.puntoEn(this.sYo - 6, this.carrilYo, this.puntoAtras);
    this.detras.set(atras.pos.x, atras.pos.y + 2.3, atras.pos.z);
    this.detras.y = Math.max(this.detras.y, this.alturaTerreno(this.detras.x, this.detras.z) + 1.2);
    const delante = this.puntoEn(this.sYo + 16, this.carrilYo * 0.5, this.puntoAdelante);
    const subida = delante.pos.y - miY;
    this.mira.set(delante.pos.x, miY + 0.9 + subida, delante.pos.z);
    // Sensación de velocidad: se abre un poco el campo de visión a partir de 38 km/h
    const kmh = this.vYo * 3.6;
    const fov = this.FOV_BASE + 9 * suavizado(38, 70, kmh);
    if (Math.abs(fov - this.camara.fov) > 0.02) {
      this.camara.fov += (fov - this.camara.fov) * Math.min(1, dt * 1.5);
      this.camara.updateProjectionMatrix();
    }
    // Tras un salto (p. ej. «Ir junto a…») la cámara se coloca directamente
    if (!this.camaraLista || this.camara.position.distanceToSquared(this.detras) > 40 * 40) {
      this.camara.position.copy(this.detras);
      this.camaraLista = true;
    } else {
      this.camara.position.lerp(this.detras, 1 - Math.exp(-dt * 6));
    }
    this.camara.lookAt(this.mira);

    this.renderer.render(this.escena, this.camara);
  };

  destruir() {
    this.publicoHumano?.liberar();
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
    // Liberar el contexto ya (si no, en iPad se acumulan hasta que el sistema corta el 3D)
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
