/**
 * Ciclista 3D construido con primitivas de Three.js (sin modelos externos).
 * Ejes locales: +X hacia delante, +Y arriba, Z a los lados. Unidades en metros.
 *
 * - 4 modelos de bici (ruta, aero, escaladora, cabra de triatlón) y 4 tipos de rueda.
 * - Las piernas siguen a los pedales con cinemática inversa de dos huesos.
 * - Al cambiar de bici o ruedas se reconstruye; al cambiar colores solo se repintan.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Avatar, ModeloBici, TipoRuedas } from './avatar';

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

const RADIO_RUEDA = 0.335;
const RADIO_LLANTA = 0.309; // donde apoya la cubierta
const BIELA = 0.17;
const MUSLO = 0.46;
const TIBIA = 0.45;
const BRAZO = 0.3;
const ANTEBRAZO = 0.29;

// ---------------------------------------------------------------------------
// Geometría de cada modelo
// ---------------------------------------------------------------------------

interface Geometria {
  sillinTubo: THREE.Vector3; // unión tubo superior / tubo de sillín
  direccionArriba: THREE.Vector3;
  direccionAbajo: THREE.Vector3;
  sillin: THREE.Vector3;
  radioTubo: number;
  perfil: number; // >1 = tubos aerodinámicos (más profundos que anchos)
  vainasBajas: boolean; // tirantes unidos más abajo (bicis aero)
  // Postura del ciclista
  cadera: THREE.Vector3;
  hombro: THREE.Vector3;
  cabeza: THREE.Vector3;
  mano: THREE.Vector3;
  codo?: THREE.Vector3; // fijo en la cabra (apoyado en los reposabrazos)
}

const EJE = V(-0.02, 0.27); // pedalier
const BUJE_T = V(-0.5, RADIO_RUEDA);
const BUJE_D = V(0.5, RADIO_RUEDA);

const POSTURA_RUTA = {
  cadera: V(-0.2, 0.99),
  hombro: V(0.26, 1.3),
  cabeza: V(0.41, 1.43),
  mano: V(0.6, 0.885),
};

const GEOMETRIAS: Record<ModeloBici, Geometria> = {
  ruta: {
    sillinTubo: V(-0.17, 0.8),
    direccionArriba: V(0.4, 0.8),
    direccionAbajo: V(0.44, 0.63),
    sillin: V(-0.21, 0.935),
    radioTubo: 0.019,
    perfil: 1,
    vainasBajas: false,
    ...POSTURA_RUTA,
  },
  aero: {
    sillinTubo: V(-0.17, 0.79),
    direccionArriba: V(0.4, 0.79),
    direccionAbajo: V(0.44, 0.62),
    sillin: V(-0.21, 0.935),
    radioTubo: 0.016,
    perfil: 2.3,
    vainasBajas: true,
    ...POSTURA_RUTA,
  },
  escaladora: {
    sillinTubo: V(-0.15, 0.76),
    direccionArriba: V(0.4, 0.82),
    direccionAbajo: V(0.44, 0.64),
    sillin: V(-0.21, 0.935),
    radioTubo: 0.014,
    perfil: 1,
    vainasBajas: false,
    ...POSTURA_RUTA,
  },
  cabra: {
    sillinTubo: V(-0.1, 0.78),
    direccionArriba: V(0.42, 0.74),
    direccionAbajo: V(0.45, 0.6),
    sillin: V(-0.13, 0.93),
    radioTubo: 0.015,
    perfil: 2.6,
    vainasBajas: true,
    cadera: V(-0.12, 0.98),
    hombro: V(0.37, 1.12),
    cabeza: V(0.53, 1.2),
    mano: V(0.76, 0.95),
    codo: V(0.53, 0.925),
  },
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const EJE_Y = V(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

/**
 * Pieza alargada (cilindro o cápsula de altura 1) que se estira entre dos puntos.
 * Con `perfil` > 1 queda ovalada en el plano de la bici (tubos aero).
 */
class Tubo {
  readonly malla: THREE.Mesh;
  private estirar: boolean;
  constructor(
    geometria: THREE.BufferGeometry,
    material: THREE.Material,
    padre: THREE.Object3D,
    private perfil = 1,
    estirar = true,
  ) {
    this.malla = new THREE.Mesh(geometria, material);
    this.malla.castShadow = true;
    this.estirar = estirar;
    padre.add(this.malla);
  }
  entre(a: THREE.Vector3, b: THREE.Vector3) {
    tmpA.subVectors(b, a);
    const largo = tmpA.length();
    this.malla.position.copy(a).addScaledVector(tmpA, 0.5);
    this.malla.scale.set(this.perfil, this.estirar ? largo : 1, 1);
    this.malla.quaternion.setFromUnitVectors(EJE_Y, tmpA.divideScalar(largo || 1));
    return this;
  }
}

const cilindro = (r: number, lados = 8) => new THREE.CylinderGeometry(r, r, 1, lados);

function etiquetaNombre(texto: string) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 256;
  lienzo.height = 64;
  const ctx = lienzo.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,17,21,0.75)';
  ctx.beginPath();
  // roundRect no existe en iOS antiguos
  if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 8, 248, 48, 24);
  else ctx.rect(4, 8, 248, 48);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto.slice(0, 16), 128, 33);
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      transparent: true,
      sizeAttenuation: false, // mismo tamaño en pantalla esté cerca o lejos
    }),
  );
  sprite.scale.set(0.14, 0.035, 1);
  sprite.position.set(0.1, 2.0, 0);
  sprite.renderOrder = 10;
  return sprite;
}

/** Resuelve la articulación intermedia (rodilla o codo) de una cadena de dos huesos en el plano XY. */
function articulacion(
  origen: THREE.Vector3,
  fin: THREE.Vector3,
  l1: number,
  l2: number,
  haciaDelante: boolean,
  salida: THREE.Vector3,
) {
  const dx = fin.x - origen.x;
  const dy = fin.y - origen.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.001);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const ang = haciaDelante ? base + a : base - a;
  return salida.set(origen.x + l1 * Math.cos(ang), origen.y + l1 * Math.sin(ang), origen.z);
}

// ---------------------------------------------------------------------------
// Ruedas
// ---------------------------------------------------------------------------

const PERFIL_LLANTA: Record<TipoRuedas, number> = { bajo: 0.025, medio: 0.045, alto: 0.07, lenticular: 0.07 };
const RADIOS: Record<TipoRuedas, number> = { bajo: 24, medio: 20, alto: 18, lenticular: 18 };

function crearRueda(tipo: TipoRuedas, trasera: boolean, mat: Materiales) {
  const g = new THREE.Group();
  // La lenticular solo va detrás; delante se pone una de perfil alto
  const lenticular = tipo === 'lenticular' && trasera;
  const perfil = PERFIL_LLANTA[tipo];
  const interior = RADIO_LLANTA - perfil;

  const cubierta = new THREE.Mesh(new THREE.TorusGeometry(RADIO_RUEDA - 0.013, 0.013, 8, 56), mat.goma);
  cubierta.castShadow = true;
  g.add(cubierta);

  if (lenticular) {
    for (const z of [-0.013, 0.013]) {
      const disco = new THREE.Mesh(new THREE.CircleGeometry(RADIO_LLANTA, 48), mat.llanta);
      disco.position.z = z;
      if (z < 0) disco.rotation.y = Math.PI;
      disco.castShadow = true;
      g.add(disco);
    }
  } else {
    for (const z of [-0.0095, 0.0095]) {
      const llanta = new THREE.Mesh(new THREE.RingGeometry(interior, RADIO_LLANTA, 48), mat.llanta);
      llanta.position.z = z;
      if (z < 0) llanta.rotation.y = Math.PI;
      llanta.castShadow = true;
      g.add(llanta);
    }
    // Radios fusionados en una sola geometría (menos llamadas de dibujo)
    const n = RADIOS[tipo];
    const radios: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lado = i % 2 === 0 ? 1 : -1;
      const desde = V(Math.cos(a) * 0.028, Math.sin(a) * 0.028, lado * 0.022);
      const hasta = V(Math.cos(a + 0.12) * interior, Math.sin(a + 0.12) * interior, 0);
      const dir = hasta.clone().sub(desde);
      const geo = new THREE.CylinderGeometry(0.0022, 0.0022, dir.length(), 3);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(EJE_Y, dir.clone().normalize()));
      geo.translate((desde.x + hasta.x) / 2, (desde.y + hasta.y) / 2, (desde.z + hasta.z) / 2);
      radios.push(geo);
    }
    g.add(new THREE.Mesh(mergeGeometries(radios), mat.metal));
    radios.forEach((r) => r.dispose());
  }

  // Adhesivo de color en llantas medianas y altas
  if (perfil >= 0.045 || lenticular) {
    for (const z of [-0.0105, 0.0105]) {
      const r0 = lenticular ? RADIO_LLANTA * 0.55 : interior + perfil * 0.3;
      const r1 = lenticular ? RADIO_LLANTA * 0.62 : interior + perfil * 0.55;
      const pegatina = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), mat.bici2);
      pegatina.position.z = lenticular ? z * 1.3 : z;
      if (z < 0) pegatina.rotation.y = Math.PI;
      g.add(pegatina);
    }
  }

  const buje = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 12), mat.metal);
  buje.rotation.x = Math.PI / 2;
  g.add(buje);
  return g;
}

// ---------------------------------------------------------------------------
// Ciclista
// ---------------------------------------------------------------------------

interface Materiales {
  maillot: THREE.MeshStandardMaterial;
  franja: THREE.MeshStandardMaterial;
  culotte: THREE.MeshStandardMaterial;
  casco: THREE.MeshStandardMaterial;
  bici: THREE.MeshStandardMaterial;
  bici2: THREE.MeshStandardMaterial;
  piel: THREE.MeshStandardMaterial;
  goma: THREE.MeshStandardMaterial;
  llanta: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  negro: THREE.MeshStandardMaterial;
  blanco: THREE.MeshStandardMaterial;
  gafas: THREE.MeshStandardMaterial;
}

function crearMateriales(a: Avatar): Materiales {
  const m = (color: string, roughness: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    maillot: m(a.maillot, 0.55),
    franja: m(a.franja, 0.55),
    culotte: m(a.culotte, 0.6),
    casco: m(a.casco, 0.3),
    bici: m(a.bici, 0.25, 0.35),
    bici2: m(a.bici2, 0.3, 0.2),
    piel: m(a.piel, 0.65),
    goma: m('#161616', 0.85),
    llanta: m('#1c1c1f', 0.35, 0.3),
    metal: m('#b8bec6', 0.3, 0.9),
    negro: m('#18181a', 0.5),
    blanco: m('#f2f2f2', 0.6),
    gafas: m('#0d0f14', 0.08, 0.7),
  };
}

export class Ciclista3D {
  /** Grupo exterior: posición y rumbo. */
  readonly raiz = new THREE.Group();
  /** Grupo interior: inclinación según la pendiente. */
  private inclinacion = new THREE.Group();
  private cuerpo: THREE.Group | null = null;
  private mat: Materiales;
  private avatar: Avatar;
  private geo!: Geometria;
  private ruedas: THREE.Object3D[] = [];
  private bielas: { brazo: Tubo; pedal: THREE.Mesh; lado: number }[] = [];
  private piernas: { muslo: Tubo; tibia: Tubo; pie: THREE.Group; lado: number }[] = [];
  private plato: THREE.Object3D | null = null;
  private anguloBiela = Math.random() * Math.PI * 2;
  private etiqueta: THREE.Sprite | null = null;
  private pedalTmp = new THREE.Vector3();
  private caderaTmp = new THREE.Vector3();
  private rodillaTmp = new THREE.Vector3();

  constructor(avatar: Avatar, nombre?: string) {
    this.avatar = avatar;
    this.mat = crearMateriales(avatar);
    this.raiz.add(this.inclinacion);
    this.construir();
    if (nombre) this.ponerNombre(nombre);
  }

  private construir() {
    if (this.cuerpo) {
      this.cuerpo.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.inclinacion.remove(this.cuerpo);
    }
    const c = new THREE.Group();
    this.cuerpo = c;
    this.inclinacion.add(c);
    this.ruedas = [];
    this.bielas = [];
    this.piernas = [];
    const m = this.mat;
    const G = GEOMETRIAS[this.avatar.modelo];
    this.geo = G;
    const esCabra = this.avatar.modelo === 'cabra';

    const tubo = (a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material, perfil = 1) =>
      new Tubo(cilindro(r, 10), material, c, perfil).entre(a, b);
    const esfera = (p: THREE.Vector3, r: number, material: THREE.Material, escala?: [number, number, number]) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material);
      e.position.copy(p);
      if (escala) e.scale.set(...escala);
      e.castShadow = true;
      c.add(e);
      return e;
    };

    // ---- Ruedas ----
    for (const [centro, trasera] of [[BUJE_T, true], [BUJE_D, false]] as const) {
      const rueda = crearRueda(this.avatar.ruedas, trasera, m);
      rueda.position.copy(centro);
      c.add(rueda);
      this.ruedas.push(rueda);
    }

    // ---- Cuadro ----
    const r = G.radioTubo;
    const p = G.perfil;
    const unionTirantes = G.vainasBajas ? EJE.clone().lerp(G.sillinTubo, 0.62) : G.sillinTubo;
    for (const z of [-0.055, 0.055]) {
      tubo(BUJE_T.clone().setZ(z), EJE.clone().setZ(z * 0.5), r * 0.62, m.bici); // vainas
      tubo(BUJE_T.clone().setZ(z), unionTirantes.clone().setZ(z * 0.3), r * 0.55, m.bici); // tirantes
      tubo(G.direccionAbajo.clone().setZ(z * 0.5), BUJE_D.clone().setZ(z), r * 0.75, m.bici, p * 0.8); // horquilla
    }
    tubo(EJE, G.sillinTubo, r * 1.05, m.bici, p);
    tubo(G.sillinTubo, G.direccionArriba, r, m.bici, p * 0.8);
    tubo(EJE, G.direccionAbajo, r * 1.3, m.bici, p);
    tubo(G.direccionAbajo, G.direccionArriba.clone().add(V(-0.005, 0.03)), r * 1.35, m.bici, 1.1);
    // Tija y sillín
    tubo(G.sillinTubo, G.sillin.clone().add(V(0.02, -0.02)), 0.0135, m.negro);
    const sillin = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 10), m.negro);
    sillin.rotation.z = Math.PI / 2;
    sillin.scale.set(0.45, 1, 1.15);
    sillin.position.copy(G.sillin).add(V(0.0, 0.008));
    sillin.castShadow = true;
    c.add(sillin);
    // Decoración del cuadro: franja de color secundario en el tubo diagonal
    tubo(EJE.clone().lerp(G.direccionAbajo, 0.45), EJE.clone().lerp(G.direccionAbajo, 0.75), r * 1.34, m.bici2, p);

    // ---- Potencia y manillar ----
    const cabeza = G.direccionArriba.clone().add(V(-0.005, 0.035));
    if (!esCabra) {
      const potencia = cabeza.clone().add(V(0.11, 0.015));
      tubo(cabeza, potencia, 0.016, m.negro);
      tubo(potencia.clone().setZ(-0.21), potencia.clone().setZ(0.21), 0.013, m.negro);
      for (const z of [-0.21, 0.21]) {
        // Curva del manillar: maneta arriba y bajada hacia atrás
        const maneta = V(G.mano.x, G.mano.y - 0.01, z);
        const bajo = V(potencia.x + 0.07, potencia.y - 0.1, z);
        const final = V(potencia.x + 0.01, potencia.y - 0.14, z);
        tubo(potencia.clone().setZ(z), maneta, 0.013, m.negro);
        tubo(potencia.clone().setZ(z), bajo, 0.013, m.negro);
        tubo(bajo, final, 0.013, m.negro);
        const manetaPieza = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 3, 8), m.negro);
        manetaPieza.position.copy(maneta);
        manetaPieza.rotation.z = -0.9;
        c.add(manetaPieza);
      }
    } else {
      // Cabra: manillar de base, acoples y reposabrazos
      const base = cabeza.clone().add(V(0.08, -0.02));
      tubo(cabeza, base, 0.018, m.negro);
      tubo(base.clone().setZ(-0.2), base.clone().setZ(0.2), 0.014, m.negro, 1.8);
      for (const z of [-0.2, 0.2]) tubo(base.clone().setZ(z), V(base.x + 0.12, base.y + 0.04, z * 1.05), 0.014, m.negro);
      for (const z of [-0.065, 0.065]) {
        tubo(V(base.x - 0.02, base.y + 0.07, z), V(G.mano.x + 0.02, G.mano.y - 0.005, z * 0.8), 0.011, m.negro);
        tubo(base.clone().setZ(z), V(base.x - 0.02, base.y + 0.07, z), 0.012, m.negro);
        const reposa = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), m.negro);
        reposa.position.set(G.codo!.x, G.codo!.y - 0.035, z * 1.5);
        c.add(reposa);
      }
    }

    // ---- Transmisión ----
    const plato = new THREE.Group();
    plato.position.copy(EJE).setZ(0.065);
    const corona = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.006, 4, 40), m.metal);
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), m.negro);
    plato.add(corona, disco);
    c.add(plato);
    this.plato = plato;
    const pinon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), m.metal);
    pinon.rotation.x = Math.PI / 2;
    pinon.position.copy(BUJE_T).setZ(0.05);
    c.add(pinon);
    // Cadena (arriba y abajo)
    tubo(V(EJE.x, EJE.y + 0.1, 0.065), V(BUJE_T.x, BUJE_T.y + 0.045, 0.05), 0.004, m.metal);
    tubo(V(EJE.x, EJE.y - 0.1, 0.065), V(BUJE_T.x, BUJE_T.y - 0.045, 0.05), 0.004, m.metal);
    // Bidón en el tubo diagonal
    if (!esCabra) {
      const centroBidon = EJE.clone().lerp(G.direccionAbajo, 0.4).add(V(-0.03, 0.06));
      const bidon = new Tubo(new THREE.CylinderGeometry(0.036, 0.036, 1, 12), m.bici2, c, 1);
      bidon.entre(centroBidon.clone().add(V(-0.07, -0.05)), centroBidon.clone().add(V(0.07, 0.05)));
    }

    // Bielas y pedales (animados)
    for (const lado of [-1, 1]) {
      const brazo = new Tubo(new THREE.BoxGeometry(0.02, 1, 0.012), m.negro, c);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.07), m.negro);
      c.add(pedal);
      this.bielas.push({ brazo, pedal, lado });
    }

    // ---- Ciclista ----
    // Pelvis (culotte) y torso (maillot)
    esfera(G.cadera, 0.15, m.culotte, [1.15, 0.85, 1.25]);
    const dirTorso = tmpB.subVectors(G.hombro, G.cadera);
    const largoTorso = dirTorso.length();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, largoTorso - 0.12, 6, 16), m.maillot);
    torso.position.copy(G.cadera).addScaledVector(dirTorso, 0.5);
    torso.quaternion.setFromUnitVectors(EJE_Y, dirTorso.clone().normalize());
    torso.scale.set(0.85, 1, 1.32);
    torso.castShadow = true;
    c.add(torso);
    // Franja del maillot: un anillo alrededor del torso
    const franja = new THREE.Mesh(
      new THREE.CylinderGeometry(0.139, 0.139, largoTorso * 0.16, 20, 1, true),
      m.franja,
    );
    franja.position.copy(G.cadera).addScaledVector(dirTorso, 0.58);
    franja.quaternion.copy(torso.quaternion);
    franja.scale.set(0.86, 1, 1.33);
    c.add(franja);
    // Hombros
    esfera(G.hombro, 0.12, m.maillot, [0.9, 0.85, 1.75]);
    // Cuello, cabeza, casco y gafas
    new Tubo(cilindro(0.048), m.piel, c).entre(G.hombro, G.cabeza);
    esfera(G.cabeza, 0.098, m.piel, [1.08, 1, 0.92]);
    const casco = new THREE.Mesh(
      new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      m.casco,
    );
    casco.position.copy(G.cabeza).add(V(-0.012, 0.012));
    casco.scale.set(esCabra ? 1.75 : 1.28, 0.9, 1.02);
    casco.rotation.z = esCabra ? -0.12 : -0.28;
    casco.castShadow = true;
    c.add(casco);
    if (!esCabra) {
      // Ranuras de ventilación del casco
      for (const z of [-0.045, 0, 0.045]) {
        const ranura = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.012), m.negro);
        ranura.position.copy(G.cabeza).add(V(-0.01, 0.105, z));
        ranura.rotation.z = -0.28;
        c.add(ranura);
      }
    }
    const gafas = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 4, 8), m.gafas);
    gafas.rotation.x = Math.PI / 2;
    gafas.position.copy(G.cabeza).add(V(0.085, 0.012));
    c.add(gafas);

    // Brazos: manga (maillot) + antebrazo (piel) + guante
    for (const lado of [-1, 1]) {
      const hombro = G.hombro.clone().setZ(0.19 * lado);
      const mano = G.mano.clone().setZ((esCabra ? 0.075 : 0.2) * lado);
      const codo = G.codo
        ? G.codo.clone().setZ(0.1 * lado)
        : articulacion(hombro, mano, BRAZO, ANTEBRAZO, false, new THREE.Vector3());
      new Tubo(new THREE.CapsuleGeometry(0.052, 0.8, 4, 10), m.maillot, c).entre(hombro, hombro.clone().lerp(codo, 0.6));
      new Tubo(new THREE.CapsuleGeometry(0.046, 0.8, 4, 10), m.piel, c).entre(hombro.clone().lerp(codo, 0.55), codo);
      new Tubo(new THREE.CapsuleGeometry(0.04, 0.8, 4, 10), m.piel, c).entre(codo, mano);
      esfera(mano, 0.042, m.negro, [1.2, 0.9, 1]);
    }

    // Piernas (animadas): muslo con culotte, pierna con piel, calcetín y zapatilla
    for (const lado of [-1, 1]) {
      const muslo = new Tubo(new THREE.CapsuleGeometry(0.078, 0.85, 4, 12), m.culotte, c);
      const tibia = new Tubo(new THREE.CapsuleGeometry(0.052, 0.85, 4, 12), m.piel, c);
      const pie = new THREE.Group();
      const zapatilla = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.16, 4, 10), m.negro);
      zapatilla.rotation.z = Math.PI / 2;
      zapatilla.scale.set(0.8, 1, 1);
      zapatilla.position.set(0.035, -0.012, 0);
      zapatilla.castShadow = true;
      const calcetin = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.07, 10), m.blanco);
      calcetin.position.set(-0.01, 0.045, 0);
      pie.add(zapatilla, calcetin);
      c.add(pie);
      this.piernas.push({ muslo, tibia, pie, lado });
    }

    this.pedalear(0, 0, 0);
  }

  ponerNombre(nombre: string) {
    if (this.etiqueta) {
      this.etiqueta.material.map?.dispose();
      this.etiqueta.material.dispose();
      this.raiz.remove(this.etiqueta);
    }
    this.etiqueta = etiquetaNombre(nombre);
    this.raiz.add(this.etiqueta);
  }

  cambiarAvatar(avatar: Avatar) {
    const reconstruir = avatar.modelo !== this.avatar.modelo || avatar.ruedas !== this.avatar.ruedas;
    this.avatar = avatar;
    this.mat.maillot.color.set(avatar.maillot);
    this.mat.franja.color.set(avatar.franja);
    this.mat.culotte.color.set(avatar.culotte);
    this.mat.casco.color.set(avatar.casco);
    this.mat.bici.color.set(avatar.bici);
    this.mat.bici2.color.set(avatar.bici2);
    this.mat.piel.color.set(avatar.piel);
    if (reconstruir) this.construir();
  }

  /**
   * Avanza la animación.
   * @param velocidadMs velocidad en m/s (gira las ruedas)
   * @param cadenciaRpm cadencia (gira las bielas y mueve las piernas)
   */
  pedalear(velocidadMs: number, cadenciaRpm: number, dt: number) {
    for (const r of this.ruedas) r.rotation.z -= (velocidadMs / RADIO_RUEDA) * dt;
    this.anguloBiela -= (cadenciaRpm / 60) * Math.PI * 2 * dt;
    if (this.plato) this.plato.rotation.z = this.anguloBiela;
    const G = this.geo;

    for (const b of this.bielas) {
      const a = this.anguloBiela + (b.lado > 0 ? 0 : Math.PI);
      const z = 0.085 * b.lado;
      this.pedalTmp.set(EJE.x + BIELA * Math.cos(a), EJE.y + BIELA * Math.sin(a), z);
      b.brazo.entre(tmpC.copy(EJE).setZ(z), this.pedalTmp);
      b.pedal.position.copy(this.pedalTmp).setZ(z + 0.03 * b.lado);
    }

    for (const p of this.piernas) {
      const a = this.anguloBiela + (p.lado > 0 ? 0 : Math.PI);
      const z = 0.1 * p.lado;
      this.caderaTmp.copy(G.cadera).setZ(z);
      this.pedalTmp.set(EJE.x + BIELA * Math.cos(a), EJE.y + BIELA * Math.sin(a) + 0.045, z);
      articulacion(this.caderaTmp, this.pedalTmp, MUSLO, TIBIA, true, this.rodillaTmp);
      p.muslo.entre(this.caderaTmp, this.rodillaTmp);
      p.tibia.entre(this.rodillaTmp, this.pedalTmp);
      p.pie.position.copy(this.pedalTmp);
      // El pie acompaña un poco al pedaleo (talón abajo arriba, punta abajo abajo)
      p.pie.rotation.z = -0.15 + 0.2 * Math.sin(a);
    }
  }

  /** Coloca el ciclista: posición, rumbo (vector de dirección en XZ) y pendiente en %. */
  colocar(posicion: THREE.Vector3, direccionX: number, direccionZ: number, pendientePct: number) {
    this.raiz.position.copy(posicion);
    this.raiz.rotation.y = Math.atan2(-direccionZ, direccionX);
    this.inclinacion.rotation.z = Math.atan(pendientePct / 100);
  }

  destruir() {
    this.raiz.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    if (this.etiqueta) {
      this.etiqueta.material.map?.dispose();
      this.etiqueta.material.dispose();
    }
    Object.values(this.mat).forEach((m) => m.dispose());
    this.raiz.removeFromParent();
  }
}
