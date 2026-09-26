/**
 * Bicicleta 3D con geometría real (talla 56) y piezas modeladas por código.
 * Ejes: +X hacia delante, +Y arriba, Z a los lados (+Z = lado de la transmisión). Metros.
 *
 * - Cuadro, horquilla y cockpit se generan con campos de distancia (sdf.ts): tubos ovalados
 *   unidos con curvas suaves, como un cuadro de carbono de verdad. Se calculan una vez por
 *   modelo y se reutilizan para todos los ciclistas.
 * - La rueda delantera se coloca a partir del ángulo de dirección y del avance de la
 *   horquilla, así nunca toca el tubo diagonal.
 * - Transmisión completa: platos y piñones dentados, cadena de eslabones que se mueve,
 *   cambio con roldanas, discos de freno perforados, pinzas, bielas y pedales automáticos.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ModeloBici, TipoRuedas } from './avatar';
import { mallaGuardada } from './cacheMallas';
import { caja, cilindroZ, mallaSdf, tubo, tuboCurvo, type Primitiva, type Vec } from './sdf';

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

export const RADIO_RUEDA = 0.336; // 700 × 25c
export const RADIO_LLANTA = 0.311;
export const BIELA = 0.1725;
export const EJE = V(0, 0.265); // pedalier (7 cm por debajo de los ejes de las ruedas)
const Z_CADENA = 0.044;
export const Z_PEDAL = 0.098;
/** Antebrazo de referencia para situar el acople de la cabra. */
const ANTEBRAZO_REF = 0.25;

// ---------------------------------------------------------------------------
// Geometría de cada modelo
// ---------------------------------------------------------------------------

export interface GeometriaBici {
  modelo: ModeloBici;
  cabra: boolean;
  bujeT: THREE.Vector3;
  bujeD: THREE.Vector3;
  /** Eje de dirección: parte alta y baja del tubo de dirección. */
  direccionArriba: THREE.Vector3;
  direccionAbajo: THREE.Vector3;
  sillinTubo: THREE.Vector3;
  /** Abrazadera del sillín (centro de los raíles). */
  sillin: THREE.Vector3;
  /** Postura: caderas sobre el sillín. */
  cadera: THREE.Vector3;
  /** Punto de agarre de la mano (parte alta de la maneta o punta del acople), lado +Z. */
  agarre: THREE.Vector3;
  /** Cabra: codo apoyado en el reposabrazos (lado +Z). */
  codo?: THREE.Vector3;
  /** Separación lateral de las manos. */
  zMano: number;
  // Para el ciclista sencillo (antes de cargar el humano)
  hombro: THREE.Vector3;
  cabeza: THREE.Vector3;
  mano: THREE.Vector3;
}

interface DefCuadro {
  angDireccion: number; // grados
  angSillin: number;
  stack: number;
  reach: number;
  largoDireccion: number;
  largoSillin: number; // del pedalier a la unión con el tubo superior
  alturaSillin: number; // del pedalier a la abrazadera, sobre el tubo de sillín
  avanceHorquilla: number;
  potencia: number; // largo de la potencia
  // Secciones (semiejes en el plano de la bici / lateral)
  superior: [number, number, number, number];
  diagonal: [number, number, number, number];
  tuboSillin: [number, number];
  direccion: [number, number, number, number]; // abajo fondo/ancho, arriba fondo/ancho
  vainas: [number, number];
  tirantes: [number, number];
  horquilla: [number, number, number, number];
  /** Unión de los tirantes a lo largo del tubo de sillín (1 = arriba del todo). */
  alturaTirantes: number;
  /** Curva del tubo diagonal (se separa de la rueda). */
  curvaDiagonal: number;
}

const DEFS: Record<ModeloBici, DefCuadro> = {
  ruta: {
    angDireccion: 73,
    angSillin: 73.5,
    stack: 0.57,
    reach: 0.385,
    largoDireccion: 0.155,
    largoSillin: 0.52,
    alturaSillin: 0.676,
    avanceHorquilla: 0.045,
    potencia: 0.095,
    superior: [0.0145, 0.0145, 0.0155, 0.0155],
    diagonal: [0.0185, 0.0185, 0.021, 0.021],
    tuboSillin: [0.0152, 0.0152],
    direccion: [0.024, 0.024, 0.0205, 0.0205],
    vainas: [0.0115, 0.0085],
    tirantes: [0.0085, 0.0068],
    horquilla: [0.0165, 0.012, 0.0095, 0.0075],
    alturaTirantes: 0.96,
    curvaDiagonal: 0,
  },
  aero: {
    angDireccion: 73,
    angSillin: 73.5,
    stack: 0.56,
    reach: 0.39,
    largoDireccion: 0.145,
    largoSillin: 0.5,
    alturaSillin: 0.676,
    avanceHorquilla: 0.045,
    potencia: 0.1,
    superior: [0.02, 0.0115, 0.0215, 0.012],
    diagonal: [0.03, 0.0165, 0.029, 0.018],
    tuboSillin: [0.025, 0.0135],
    direccion: [0.032, 0.02, 0.028, 0.019],
    vainas: [0.0125, 0.0095],
    tirantes: [0.0115, 0.0065],
    horquilla: [0.021, 0.0105, 0.012, 0.0075],
    alturaTirantes: 0.74,
    curvaDiagonal: 0.012,
  },
  escaladora: {
    angDireccion: 73,
    angSillin: 73.5,
    stack: 0.575,
    reach: 0.382,
    largoDireccion: 0.16,
    largoSillin: 0.47,
    alturaSillin: 0.676,
    avanceHorquilla: 0.045,
    potencia: 0.095,
    superior: [0.0125, 0.0125, 0.0135, 0.0135],
    diagonal: [0.0165, 0.0165, 0.0185, 0.0185],
    tuboSillin: [0.0135, 0.0135],
    direccion: [0.022, 0.022, 0.019, 0.019],
    vainas: [0.0105, 0.0078],
    tirantes: [0.0072, 0.006],
    horquilla: [0.015, 0.0112, 0.0088, 0.007],
    alturaTirantes: 0.9,
    curvaDiagonal: 0,
  },
  cabra: {
    angDireccion: 73,
    angSillin: 78,
    stack: 0.51,
    reach: 0.42,
    largoDireccion: 0.105,
    largoSillin: 0.5,
    alturaSillin: 0.673,
    avanceHorquilla: 0.045,
    potencia: 0.06,
    superior: [0.024, 0.0125, 0.03, 0.0135],
    diagonal: [0.033, 0.0165, 0.03, 0.0185],
    tuboSillin: [0.03, 0.0145],
    direccion: [0.038, 0.021, 0.036, 0.02],
    vainas: [0.013, 0.0095],
    tirantes: [0.012, 0.0065],
    horquilla: [0.024, 0.011, 0.013, 0.0075],
    alturaTirantes: 0.62,
    curvaDiagonal: 0.02,
  },
};

const dirAng = (grados: number) => V(-Math.cos((grados * Math.PI) / 180), Math.sin((grados * Math.PI) / 180));

interface PuntosCuadro {
  def: DefCuadro;
  ejeDir: THREE.Vector3; // eje de dirección (hacia arriba)
  ejeSillin: THREE.Vector3;
  htArriba: THREE.Vector3;
  htAbajo: THREE.Vector3;
  stArriba: THREE.Vector3;
  bujeT: THREE.Vector3;
  bujeD: THREE.Vector3;
  corona: THREE.Vector3;
  sillin: THREE.Vector3;
  potenciaBase: THREE.Vector3;
}

function puntosCuadro(modelo: ModeloBici): PuntosCuadro {
  const def = DEFS[modelo];
  const ejeDir = dirAng(def.angDireccion);
  const ejeSillin = dirAng(def.angSillin);
  const htArriba = EJE.clone().add(V(def.reach, def.stack));
  const htAbajo = htArriba.clone().addScaledVector(ejeDir, -def.largoDireccion);
  // Eje delantero: a lo largo del eje de dirección hasta la altura de la rueda, más el avance
  const normal = V(ejeDir.y, -ejeDir.x); // perpendicular hacia delante
  const t = (htAbajo.y + def.avanceHorquilla * normal.y - RADIO_RUEDA) / ejeDir.y;
  const bujeD = htAbajo.clone().addScaledVector(ejeDir, -t).addScaledVector(normal, def.avanceHorquilla);
  bujeD.y = RADIO_RUEDA;
  // Vainas de 41 cm
  const bujeT = V(EJE.x - Math.sqrt(0.41 ** 2 - (RADIO_RUEDA - EJE.y) ** 2), RADIO_RUEDA);
  return {
    def,
    ejeDir,
    ejeSillin,
    htArriba,
    htAbajo,
    stArriba: EJE.clone().addScaledVector(ejeSillin, def.largoSillin),
    bujeT,
    bujeD,
    corona: htAbajo.clone().addScaledVector(ejeDir, -0.022),
    sillin: EJE.clone().addScaledVector(ejeSillin, def.alturaSillin),
    potenciaBase: htArriba.clone().addScaledVector(ejeDir, modelo === 'cabra' ? 0.022 : 0.036),
  };
}

const cacheGeo = new Map<ModeloBici, GeometriaBici>();

export function geometriaBici(modelo: ModeloBici): GeometriaBici {
  let g = cacheGeo.get(modelo);
  if (g) return g;
  const P = puntosCuadro(modelo);
  const cabra = modelo === 'cabra';
  const sillin = P.sillin;
  const cadera = cabra ? V(sillin.x + 0.005, sillin.y + 0.1) : V(sillin.x - 0.03, sillin.y + 0.097);
  const c = cockpit(P, modelo);
  g = {
    modelo,
    cabra,
    bujeT: P.bujeT,
    bujeD: P.bujeD,
    direccionArriba: P.htArriba,
    direccionAbajo: P.htAbajo,
    sillinTubo: P.stArriba,
    sillin,
    cadera,
    agarre: c.agarre,
    codo: c.codo,
    zMano: c.agarre.z,
    hombro: cabra ? V(0.33, 1.14) : V(0.16, 1.28),
    cabeza: cabra ? V(0.47, 1.22) : V(0.3, 1.42),
    mano: c.agarre.clone().setZ(0),
  };
  cacheGeo.set(modelo, g);
  return g;
}

// ---------------------------------------------------------------------------
// Zonas de material (atributo «zona» de las mallas SDF)
// ---------------------------------------------------------------------------

const Z = {
  pintura: 0,
  secundario: 1,
  carbono: 2,
  mate: 3,
  metal: 4,
  // Tubos con decoración propia
  diagonal: 10,
  direccion: 11,
  horquilla: 12,
  tuboSillin: 13,
  superior: 15,
};

type Peso = [number, number, number, number];
const PESOS: Record<number, Peso> = {
  0: [0, 0, 0, 0],
  1: [1, 0, 0, 0],
  2: [0, 1, 0, 0],
  3: [0, 0, 1, 0],
  4: [0, 0, 0, 1],
};

/** 1 dentro de [a, b] con bordes suaves de ancho «ancho» (para que la línea entre colores quede limpia). */
function rampa(t: number, a: number, b: number, ancho: number) {
  return THREE.MathUtils.clamp(Math.min(t - a, b - t) / ancho + 0.5, 0, 1);
}

/** Posición relativa (0..1) de un punto a lo largo del segmento a→b. */
function aLoLargo(x: number, y: number, a: THREE.Vector3, b: THREE.Vector3) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// Cuadro y horquilla
// ---------------------------------------------------------------------------

const vec = (v: THREE.Vector3, z = v.z): Vec => [v.x, v.y, z];

interface MallaCuadro {
  geometria: THREE.BufferGeometry;
  /** Tubo diagonal (para la rotulación del shader). */
  diagonalA: THREE.Vector3;
  diagonalB: THREE.Vector3;
  diagonalFondo: number;
}

const cacheCuadro = new Map<ModeloBici, MallaCuadro>();

/** Tubo diagonal: del pedalier a la parte trasera-baja del tubo de dirección (sin generar la malla). */
export function tuboDiagonal(modelo: ModeloBici) {
  const P = puntosCuadro(modelo);
  const d = P.def;
  return {
    diagonalA: EJE.clone(),
    diagonalB: P.htAbajo.clone().addScaledVector(P.ejeDir, 0.035).add(V(-0.012, 0)),
    diagonalFondo: (d.diagonal[0] + d.diagonal[2]) / 2,
  };
}

export function mallaCuadro(modelo: ModeloBici): MallaCuadro {
  const hecho = cacheCuadro.get(modelo);
  if (hecho) return hecho;
  const P = puntosCuadro(modelo);
  const d = P.def;
  const K = 0.014; // radio de las uniones
  const prims: Primitiva[] = [];

  // Tubo de dirección (cónico)
  const htA = P.htAbajo.clone().addScaledVector(P.ejeDir, -0.008);
  const htB = P.htArriba.clone().addScaledVector(P.ejeDir, 0.004);
  prims.push(tubo(vec(htA), vec(htB), d.direccion[0], d.direccion[1], d.direccion[2], d.direccion[3], { id: Z.direccion }));

  // Tubo diagonal: del pedalier a la parte trasera-baja del tubo de dirección
  const { diagonalA: dtA, diagonalB: dtB } = tuboDiagonal(modelo);
  if (d.curvaDiagonal > 0) {
    const medio = dtA.clone().lerp(dtB, 0.5);
    const n = V(-(dtB.y - dtA.y), dtB.x - dtA.x).normalize();
    medio.addScaledVector(n, d.curvaDiagonal);
    prims.push(
      ...tuboCurvo(
        [vec(dtA), vec(medio), vec(dtB)],
        (t) => THREE.MathUtils.lerp(d.diagonal[0], d.diagonal[2], t),
        (t) => THREE.MathUtils.lerp(d.diagonal[1], d.diagonal[3], t),
        { k: K, id: Z.diagonal, divisiones: 18 },
      ),
    );
  } else {
    prims.push(tubo(vec(dtA), vec(dtB), d.diagonal[0], d.diagonal[1], d.diagonal[2], d.diagonal[3], { k: K, id: Z.diagonal }));
  }

  // Tubo superior
  const ttA = P.stArriba.clone();
  const ttB = P.htArriba.clone().addScaledVector(P.ejeDir, -0.025);
  prims.push(tubo(vec(ttA), vec(ttB), d.superior[0], d.superior[1], d.superior[2], d.superior[3], { k: K, id: Z.superior }));

  // Tubo de sillín (sube un poco por encima de la unión)
  const stB = P.stArriba.clone().addScaledVector(P.ejeSillin, 0.025);
  prims.push(tubo(vec(EJE), vec(stB), d.tuboSillin[0], d.tuboSillin[1], d.tuboSillin[0] * 0.85, d.tuboSillin[1], { k: K, id: Z.tuboSillin }));

  // Caja del pedalier
  prims.push(cilindroZ([EJE.x, EJE.y, 0], 0.0235, 0.043, { k: 0.01, bisel: 0.004 }));

  // Vainas y tirantes
  const uTirantes = EJE.clone().lerp(P.stArriba, d.alturaTirantes);
  for (const s of [-1, 1]) {
    const puntera: Vec = [P.bujeT.x + 0.004, P.bujeT.y + 0.002, s * 0.064];
    prims.push(
      ...tuboCurvo(
        [[EJE.x - 0.02, EJE.y + 0.004, s * 0.038], [EJE.x - 0.2, EJE.y + 0.03, s * 0.062], puntera],
        (t) => THREE.MathUtils.lerp(d.vainas[0] * 1.15, d.vainas[1], t),
        (t) => THREE.MathUtils.lerp(d.vainas[0], d.vainas[1] * 0.85, t),
        { k: K, divisiones: 16 },
      ),
    );
    prims.push(tubo(puntera, [uTirantes.x + 0.008, uTirantes.y - 0.008, s * 0.017], d.tirantes[1], d.tirantes[1] * 0.9, d.tirantes[0], d.tirantes[1], { k: K }));
    // Puntera
    prims.push(caja([P.bujeT.x, P.bujeT.y, s * 0.064], [0.022, 0.018, 0.005], 0.004, { k: 0.008 }));
  }
  // Soporte del freno trasero (flat mount) sobre la vaina izquierda
  prims.push(caja([P.bujeT.x + 0.075, P.bujeT.y - 0.004, -0.066], [0.03, 0.006, 0.008], 0.003, { k: 0.006 }));

  // Horquilla: corona y dos brazos con el avance hacia el eje
  const corona = P.corona;
  prims.push(
    tubo([corona.x, corona.y, -0.05], [corona.x, corona.y, 0.05], d.horquilla[0] * 1.1, d.horquilla[1] * 1.5, d.horquilla[0] * 1.1, d.horquilla[1] * 1.5, {
      k: 0.012,
      id: Z.horquilla,
      lateral: [0, 1, 0],
    }),
  );
  for (const s of [-1, 1]) {
    const arriba: Vec = [corona.x + 0.004, corona.y - 0.004, s * 0.05];
    const medio: Vec = [
      THREE.MathUtils.lerp(corona.x, P.bujeD.x, 0.5) + 0.006,
      THREE.MathUtils.lerp(corona.y, P.bujeD.y, 0.5),
      s * 0.052,
    ];
    const abajo: Vec = [P.bujeD.x - 0.004, P.bujeD.y + 0.01, s * 0.052];
    prims.push(
      ...tuboCurvo(
        [arriba, medio, abajo],
        (t) => THREE.MathUtils.lerp(d.horquilla[0], d.horquilla[2], t),
        (t) => THREE.MathUtils.lerp(d.horquilla[1], d.horquilla[3], t),
        { k: 0.012, id: Z.horquilla, divisiones: 16 },
      ),
    );
    prims.push(caja([P.bujeD.x, P.bujeD.y, s * 0.053], [0.016, 0.016, 0.005], 0.004, { k: 0.008, id: Z.horquilla }));
  }
  // Soporte del freno delantero (detrás del brazo izquierdo)
  prims.push(caja([P.bujeD.x - 0.035, P.bujeD.y + 0.06, -0.056], [0.008, 0.028, 0.007], 0.003, { k: 0.008, id: Z.horquilla }));

  // Tija (carbono, sin unión suave con el cuadro)
  const tija = tubo(vec(P.stArriba.clone().addScaledVector(P.ejeSillin, 0.02)), vec(P.sillin.clone().addScaledVector(P.ejeSillin, -0.005)), modelo === 'aero' || modelo === 'cabra' ? 0.02 : 0.0136, 0.0136, undefined, undefined, { id: Z.carbono });
  prims.push(tija);
  // Ejes pasantes
  for (const c of [P.bujeT, P.bujeD]) prims.push(cilindroZ([c.x, c.y, 0], 0.0072, 0.072, { id: Z.metal, bisel: 0.002 }));
  for (const [c, s] of [[P.bujeT, 1], [P.bujeD, 1], [P.bujeT, -1]] as const) {
    prims.push(cilindroZ([c.x, c.y, s * 0.072], 0.011, 0.004, { id: Z.metal, bisel: 0.002 }));
  }

  const sillinA = P.stArriba;
  const geometria = mallaGuardada(`cuadro|${modelo}`, () => mallaSdf(prims, {
    paso: 0.004,
    atributo: (x, y, _z, id) => {
      if (id === Z.carbono || id === Z.mate || id === Z.metal) return PESOS[id];
      // Tubo de dirección: por distancia a su eje (borde limpio en las uniones)
      const sHt = THREE.MathUtils.clamp(aLoLargo(x, y, htA, htB), 0, 1);
      const eje = htA.clone().lerp(htB, sHt);
      const rHt = Math.hypot(x - eje.x, y - eje.y, _z);
      const radioHt = THREE.MathUtils.lerp(Math.max(d.direccion[0], d.direccion[1]), Math.max(d.direccion[2], d.direccion[3]), sHt);
      let w = THREE.MathUtils.clamp((radioHt + 0.0025 - rHt) / 0.005 + 0.5, 0, 1);
      switch (id) {
        case Z.diagonal:
          w = Math.max(w, rampa(aLoLargo(x, y, dtA, dtB), 0.16, 0.62, 0.012));
          break;
        case Z.horquilla:
          w = Math.max(w, rampa(aLoLargo(x, y, corona, P.bujeD), 0.72, 2, 0.02));
          break;
        case Z.tuboSillin:
          w = Math.max(w, rampa(aLoLargo(x, y, EJE, sillinA), 0.58, 0.7, 0.012));
          break;
        case Z.superior:
          w = Math.max(w, rampa(aLoLargo(x, y, ttA, ttB), 0.8, 0.86, 0.01));
          break;
      }
      return [w, 0, 0, 0];
    },
  }));
  const m: MallaCuadro = { geometria, diagonalA: dtA, diagonalB: dtB, diagonalFondo: (d.diagonal[0] + d.diagonal[2]) / 2 };
  cacheCuadro.set(modelo, m);
  return m;
}

// ---------------------------------------------------------------------------
// Cockpit: potencia, manillar, manetas (o acople de cabra)
// ---------------------------------------------------------------------------

interface Cockpit {
  prims: Primitiva[];
  agarre: THREE.Vector3;
  codo?: THREE.Vector3;
}

function cockpit(P: PuntosCuadro, modelo: ModeloBici): Cockpit {
  const prims: Primitiva[] = [];
  const base = P.potenciaBase;
  // Tapa y espaciadores sobre el tubo de dirección
  prims.push(tubo(vec(P.htArriba), vec(base.clone().addScaledVector(P.ejeDir, 0.004)), 0.0175, 0.0175, 0.0165, 0.0165, { id: Z.carbono }));

  if (modelo !== 'cabra') {
    // Potencia ligeramente negativa
    const C = base.clone().add(V(P.def.potencia, -0.012));
    prims.push(tubo(vec(base.clone().addScaledVector(P.ejeDir, -0.012)), vec(C), 0.018, 0.0165, 0.0175, 0.019, { k: 0.008, id: Z.carbono }));
    // Parte alta del manillar (plana, aero en la «aero»)
    const aero = modelo === 'aero';
    prims.push(tubo([C.x, C.y, -0.13], [C.x, C.y, 0.13], aero ? 0.02 : 0.0125, aero ? 0.0075 : 0.0118, undefined, undefined, { k: 0.01, id: Z.carbono, lateral: [0, 1, 0] }));
    // Abrazadera de la potencia
    prims.push(tubo([C.x, C.y, -0.024], [C.x, C.y, 0.024], 0.0175, 0.0175, undefined, undefined, { k: 0.006, id: Z.carbono, lateral: [0, 1, 0] }));
    for (const s of [-1, 1]) {
      // Curva y bajos del manillar con cinta
      const pts: Vec[] = [
        [C.x, C.y, s * 0.12],
        [C.x + 0.012, C.y - 0.001, s * 0.172],
        [C.x + 0.045, C.y - 0.003, s * 0.198],
        [C.x + 0.074, C.y - 0.014, s * 0.202],
        [C.x + 0.09, C.y - 0.052, s * 0.205],
        [C.x + 0.083, C.y - 0.1, s * 0.21],
        [C.x + 0.05, C.y - 0.124, s * 0.212],
        [C.x - 0.008, C.y - 0.13, s * 0.212],
      ];
      prims.push(
        ...tuboCurvo(pts, (t) => (t < 0.1 ? THREE.MathUtils.lerp(aero ? 0.02 : 0.0125, 0.0125, t / 0.1) : 0.0128), (t) => (t < 0.1 ? THREE.MathUtils.lerp(aero ? 0.0075 : 0.0118, 0.0128, t / 0.1) : 0.0128), {
          k: 0.006,
          id: 30,
          divisiones: 40,
        }),
      );
      // Maneta: cuerpo (goma), cuerno y palanca
      prims.push(tubo([C.x + 0.052, C.y + 0.004, s * 0.201], [C.x + 0.098, C.y + 0.026, s * 0.2], 0.0165, 0.0138, 0.0115, 0.0112, { k: 0.008, id: Z.mate }));
      prims.push(tubo([C.x + 0.094, C.y + 0.03, s * 0.2], [C.x + 0.106, C.y + 0.038, s * 0.2], 0.0085, 0.0085, 0.0065, 0.007, { k: 0.008, id: Z.mate }));
      prims.push(tubo([C.x + 0.088, C.y + 0.014, s * 0.2], [C.x + 0.084, C.y - 0.018, s * 0.204], 0.013, 0.012, 0.011, 0.011, { k: 0.008, id: Z.mate }));
      prims.push(
        ...tuboCurvo(
          [[C.x + 0.1, C.y + 0.016, s * 0.2], [C.x + 0.112, C.y - 0.035, s * 0.201], [C.x + 0.101, C.y - 0.086, s * 0.205], [C.x + 0.08, C.y - 0.114, s * 0.208]],
          (t) => THREE.MathUtils.lerp(0.0095, 0.0065, t),
          (t) => THREE.MathUtils.lerp(0.006, 0.0042, t),
          { k: 0.004, id: Z.carbono, divisiones: 14 },
        ),
      );
    }
    // Ciclocomputador en soporte adelantado
    prims.push(tubo([C.x + 0.01, C.y + 0.004, 0], [C.x + 0.07, C.y + 0.01, 0], 0.006, 0.01, undefined, undefined, { k: 0.006, id: Z.carbono }));
    prims.push(caja([C.x + 0.082, C.y + 0.02, 0], [0.034, 0.009, 0.026], 0.006, { k: 0.004, id: Z.carbono }));
    return { prims, agarre: V(C.x + 0.074, C.y + 0.026, 0.201) };
  }

  // Cabra: manillar base con cuernos, reposabrazos y acoples
  const Cb = base.clone().add(V(P.def.potencia, -0.01));
  prims.push(tubo(vec(base.clone().addScaledVector(P.ejeDir, -0.01)), vec(Cb), 0.02, 0.019, 0.02, 0.02, { k: 0.01, id: Z.carbono }));
  prims.push(tubo([Cb.x, Cb.y, -0.17], [Cb.x, Cb.y, 0.17], 0.026, 0.0085, undefined, undefined, { k: 0.012, id: Z.carbono, lateral: [0, 1, 0] }));
  for (const s of [-1, 1]) {
    prims.push(
      ...tuboCurvo(
        [[Cb.x, Cb.y, s * 0.165], [Cb.x + 0.03, Cb.y + 0.002, s * 0.2], [Cb.x + 0.09, Cb.y + 0.008, s * 0.208], [Cb.x + 0.14, Cb.y + 0.018, s * 0.208]],
        (t) => THREE.MathUtils.lerp(0.02, 0.0122, Math.min(1, t * 2)),
        (t) => THREE.MathUtils.lerp(0.0085, 0.0122, Math.min(1, t * 2)),
        { k: 0.008, id: 31, divisiones: 18 },
      ),
    );
    // Palanca de freno en la punta del cuerno
    prims.push(tubo([Cb.x + 0.145, Cb.y + 0.02, s * 0.208], [Cb.x + 0.175, Cb.y - 0.005, s * 0.208], 0.007, 0.006, 0.005, 0.005, { k: 0.004, id: Z.carbono }));
  }
  // Codo sobre el reposabrazos y antebrazo casi horizontal sobre el acople
  const codo = V(Cb.x - 0.1, Cb.y + 0.118, 0.1);
  const dirAntebrazo = V(1, 0.1).normalize();
  const muneca = codo.clone().addScaledVector(dirAntebrazo, ANTEBRAZO_REF).setZ(0.072);
  const yPad = codo.y - 0.04;
  for (const s of [-1, 1]) {
    // Reposabrazos (almohadilla y cazoleta)
    prims.push(caja([codo.x + 0.01, yPad - 0.008, s * 0.098], [0.058, 0.008, 0.042], 0.007, { id: Z.mate }));
    prims.push(caja([codo.x + 0.01, yPad - 0.019, s * 0.098], [0.056, 0.0045, 0.04], 0.004, { id: Z.carbono, k: 0.004 }));
    // Soporte hasta el manillar base
    prims.push(tubo([codo.x + 0.03, yPad - 0.022, s * 0.09], [Cb.x - 0.005, Cb.y + 0.004, s * 0.09], 0.012, 0.01, 0.014, 0.011, { k: 0.01, id: Z.carbono }));
    // Acople bajo el antebrazo; la punta sube en vertical dentro del puño
    const xP = muneca.x + 0.05;
    prims.push(
      ...tuboCurvo(
        [
          [codo.x + 0.03, yPad - 0.028, s * 0.086],
          [muneca.x - 0.05, muneca.y - 0.05, s * 0.062],
          [muneca.x + 0.028, muneca.y - 0.046, s * 0.051],
          [xP, muneca.y - 0.012, s * 0.05],
          [xP - 0.004, muneca.y + 0.036, s * 0.05],
        ],
        () => 0.011,
        () => 0.011,
        { k: 0.006, id: 32, divisiones: 28 },
      ),
    );
  }
  return { prims, agarre: muneca.clone(), codo };
}

const cacheCockpit = new Map<ModeloBici, THREE.BufferGeometry>();

export function mallaCockpit(modelo: ModeloBici): THREE.BufferGeometry {
  let g = cacheCockpit.get(modelo);
  if (g) return g;
  const P = puntosCuadro(modelo);
  const c = cockpit(P, modelo);
  const C = P.potenciaBase;
  g = mallaGuardada(`cockpit|${modelo}`, () => mallaSdf(c.prims, {
    paso: 0.0026,
    atributo: (x, _y, z, id) => {
      if (id === 30) {
        // Cinta en curvas y bajos
        const w = THREE.MathUtils.clamp((Math.abs(z) - 0.165) / 0.006 + 0.5, 0, 1);
        return [0, 1 - w, w, 0];
      }
      if (id === 31) return x > C.x + P.def.potencia + 0.06 ? PESOS[Z.mate] : PESOS[Z.carbono];
      if (id === 32) {
        const w = THREE.MathUtils.clamp((x - c.agarre.x - 0.01) / 0.006 + 0.5, 0, 1);
        return [0, 1 - w, w, 0];
      }
      return PESOS[id] ?? PESOS[Z.carbono];
    },
  }));
  cacheCockpit.set(modelo, g);
  return g;
}

// ---------------------------------------------------------------------------
// Materiales
// ---------------------------------------------------------------------------

let texturaLogo: THREE.CanvasTexture | null = null;

function logo() {
  if (!texturaLogo) {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1024;
    lienzo.height = 128;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 900 104px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AMIGOS', 512, 70, 1000);
    texturaLogo = new THREE.CanvasTexture(lienzo);
    texturaLogo.anisotropy = 8;
  }
  return texturaLogo;
}

/**
 * Material de las piezas SDF: el atributo «zona» elige pintura principal, secundaria,
 * carbono (con textura de tejido), goma/cinta mate o metal. Rotula el tubo diagonal.
 */
export function materialCuadro(pintura: string, pintura2: string, cuadro?: ReturnType<typeof tuboDiagonal>) {
  const uniformes = {
    uPintura: { value: new THREE.Color(pintura) },
    uPintura2: { value: new THREE.Color(pintura2) },
    uLogo: { value: logo() },
    uDtA: { value: cuadro?.diagonalA.clone() ?? new THREE.Vector3(9, 9, 9) },
    uDtB: { value: cuadro?.diagonalB.clone() ?? new THREE.Vector3(9, 9, 10) },
    uDtF: { value: cuadro?.diagonalFondo ?? 0 },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  m.userData.uniformes = uniformes;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformes);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 zona;\nvarying vec4 vZona;\nvarying vec3 vPosB;\nvarying vec3 vNorB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZona = zona;\nvPosB = position;\nvNorB = normal;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vZona;
        varying vec3 vPosB;
        varying vec3 vNorB;
        uniform vec3 uPintura, uPintura2, uDtA, uDtB;
        uniform float uDtF;
        uniform sampler2D uLogo;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float wBase = 1.0 - clamp( vZona.x + vZona.y + vZona.z + vZona.w, 0.0, 1.0 );
        vec3 zCol = uPintura;
        float zRug = 0.3;
        float zMet = 0.25;
        float zCapa = 1.0;
        float zMax = wBase;
        if ( vZona.x > zMax ) { zMax = vZona.x; zCol = uPintura2; }
        if ( vZona.y > zMax ) {
          zMax = vZona.y;
          // Tejido de carbono (sarga) que se funde a gris lejos
          vec3 p = vPosB * 260.0;
          float fw = clamp( fwidth( p.x + p.y + p.z ) * 0.6, 0.0, 1.0 );
          float a = step( 0.5, fract( ( p.x + p.y + p.z ) * 0.5 ) );
          float b = step( 0.5, fract( ( p.x - p.y + p.z * 0.5 ) * 0.5 ) );
          float tejido = mix( abs( a - b ), 0.5, fw );
          zCol = vec3( 0.028 + 0.022 * tejido );
          zRug = 0.22 + 0.12 * tejido;
          zMet = 0.1;
        }
        if ( vZona.z > zMax ) { zMax = vZona.z; zCol = vec3( 0.03 ); zRug = 0.82; zMet = 0.0; zCapa = 0.0; }
        if ( vZona.w > zMax ) { zCol = vec3( 0.72 ); zRug = 0.28; zMet = 1.0; zCapa = 0.0; }
        // Rotulación en los lados del tubo diagonal, sobre el panel secundario
        vec3 dt = uDtB - uDtA;
        float lDt = length( dt.xy );
        vec2 eDt = dt.xy / max( lDt, 1e-4 );
        vec2 rel = vPosB.xy - uDtA.xy;
        float tDt = dot( rel, eDt ) / max( lDt, 1e-4 );
        float vDt = dot( rel, vec2( -eDt.y, eDt.x ) ) / max( uDtF, 1e-4 );
        vec3 nB = normalize( vNorB );
        if ( uDtF > 0.0 && vZona.x > 0.5 && tDt > 0.18 && tDt < 0.6 && abs( vDt ) < 0.8 && abs( nB.z ) > 0.35 ) {
          float u = ( tDt - 0.18 ) / 0.42;
          if ( vPosB.z < 0.0 ) u = 1.0 - u;
          float letra = texture2D( uLogo, vec2( u, 0.5 + vDt * 0.62 ) ).a;
          zCol = mix( zCol, uPintura, letra );
        }
        diffuseColor.rgb = zCol;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = zRug;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = zMet;')
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= zCapa;
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'cuadro-sdf-1';
  return m;
}

// ---------------------------------------------------------------------------
// Ruedas
// ---------------------------------------------------------------------------

const PERFIL_LLANTA: Record<TipoRuedas, number> = { bajo: 0.025, medio: 0.045, alto: 0.065, lenticular: 0.065 };
const RADIOS: Record<TipoRuedas, number> = { bajo: 24, medio: 21, alto: 18, lenticular: 18 };

/** Sólido de revolución alrededor del eje Z a partir de un perfil (radio, z). */
function revolucion(perfil: [number, number][], segmentos = 72) {
  const g = new THREE.LatheGeometry(
    perfil.map(([r, z]) => new THREE.Vector2(r, z)),
    segmentos,
  );
  g.rotateX(Math.PI / 2);
  return g;
}

/** Perfil de una llanta de carbono en U redondeada. */
function perfilLlanta(interior: number, ancho: number): [number, number][] {
  const p: [number, number][] = [];
  const n = 12;
  const forma = (t: number) => ancho * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) ** 0.55;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    p.push([interior + (RADIO_LLANTA - interior) * t, -forma(t)]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    p.push([interior + (RADIO_LLANTA - interior) * t, forma(t)]);
  }
  p.push([interior, -0.0005]);
  return p;
}

/** Perfil de la cubierta: sección redonda algo aplastada con banda de rodadura. */
function geometriaCubierta() {
  const p: [number, number][] = [];
  const r = 0.0138;
  const c = RADIO_RUEDA - r;
  for (let i = 0; i <= 28; i++) {
    const a = -Math.PI * 0.62 + (i / 28) * Math.PI * 1.24;
    p.push([c + Math.cos(a) * r, Math.sin(a) * r * 0.95]);
  }
  return revolucion(p.reverse(), 160);
}

export interface MaterialesBici {
  goma: THREE.MeshStandardMaterial;
  llanta: THREE.MeshPhysicalMaterial;
  metal: THREE.MeshStandardMaterial;
  aluminio: THREE.MeshStandardMaterial;
  negro: THREE.MeshPhysicalMaterial;
  mate: THREE.MeshStandardMaterial;
  disco: THREE.MeshStandardMaterial;
  cadena: THREE.MeshStandardMaterial;
  bici2: THREE.MeshPhysicalMaterial;
  cuadro: THREE.MeshPhysicalMaterial;
}

export function crearMaterialesBici(pintura: string, pintura2: string, modelo: ModeloBici): MaterialesBici {
  return {
    goma: new THREE.MeshStandardMaterial({ color: '#1c1c1d', roughness: 0.86 }),
    llanta: new THREE.MeshPhysicalMaterial({ color: '#141417', roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.22, metalness: 1 }),
    aluminio: new THREE.MeshStandardMaterial({ color: '#8d939b', roughness: 0.35, metalness: 1 }),
    negro: new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    mate: new THREE.MeshStandardMaterial({ color: '#19191b', roughness: 0.8 }),
    disco: new THREE.MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.3, metalness: 1, side: THREE.DoubleSide }),
    cadena: new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.35, metalness: 1 }),
    bici2: new THREE.MeshPhysicalMaterial({ color: pintura2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
    cuadro: materialCuadro(pintura, pintura2, tuboDiagonal(modelo)),
  };
}

export function crearRueda(tipo: TipoRuedas, trasera: boolean, m: MaterialesBici) {
  const g = new THREE.Group();
  const lenticular = tipo === 'lenticular' && trasera;
  const perfil = PERFIL_LLANTA[tipo];
  const interior = RADIO_LLANTA - perfil;
  const ANCHO = 0.0135;

  const cubierta = new THREE.Mesh(geometriaCubierta(), m.goma);
  cubierta.castShadow = true;
  g.add(cubierta);

  if (lenticular) {
    const disco: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      disco.push([0.02 + (RADIO_LLANTA - 0.02) * t, -(0.024 - 0.0115 * t * t)]);
    }
    for (let i = 20; i >= 0; i--) {
      const t = i / 20;
      disco.push([0.02 + (RADIO_LLANTA - 0.02) * t, 0.024 - 0.0115 * t * t]);
    }
    const d = new THREE.Mesh(revolucion(disco, 120), m.llanta);
    d.castShadow = true;
    g.add(d);
  } else {
    const llanta = new THREE.Mesh(revolucion(perfilLlanta(interior, ANCHO), 120), m.llanta);
    llanta.castShadow = true;
    g.add(llanta);
    // Pista de frenado / borde de la llanta en aluminio pulido fino
    const borde = new THREE.Mesh(new THREE.TorusGeometry(RADIO_LLANTA - 0.001, 0.0022, 6, 140), m.aluminio);
    g.add(borde);
    // Radios planos (aero) cruzados por pares, fusionados en una geometría
    const n = RADIOS[tipo];
    const radios: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lado = i % 2 === 0 ? 1 : -1;
      const desde = V(Math.cos(a) * 0.021, Math.sin(a) * 0.021, lado * 0.027);
      const hasta = V(Math.cos(a + 0.06 * lado) * (interior + 0.003), Math.sin(a + 0.06 * lado) * (interior + 0.003), lado * 0.002);
      const dir = hasta.clone().sub(desde);
      const geo = new THREE.BoxGeometry(0.0028, dir.length(), 0.0011);
      // El canto del radio mira hacia delante (perfil aero)
      geo.rotateY(Math.PI / 2 + 0.0);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
      geo.translate((desde.x + hasta.x) / 2, (desde.y + hasta.y) / 2, (desde.z + hasta.z) / 2);
      radios.push(geo);
    }
    const mr = new THREE.Mesh(mergeGeometries(radios), m.negro);
    mr.castShadow = true;
    g.add(mr);
    radios.forEach((r) => r.dispose());
  }

  // Rotulación de la llanta (banda del color secundario sobre el perfil)
  if (perfil >= 0.045 || lenticular) {
    const r0 = lenticular ? RADIO_LLANTA * 0.5 : interior + perfil * 0.32;
    const r1 = lenticular ? RADIO_LLANTA * 0.6 : interior + perfil * 0.66;
    for (const s of [-1, 1]) {
      const banda: [number, number][] = [];
      for (let i = 0; i <= 8; i++) {
        const r = r0 + ((r1 - r0) * i) / 8;
        const t = lenticular ? (r - 0.02) / (RADIO_LLANTA - 0.02) : (r - interior) / (RADIO_LLANTA - interior);
        const z = lenticular ? 0.024 - 0.0115 * t * t : ANCHO * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) ** 0.55;
        banda.push([r, s * (z + 0.0004)]);
      }
      if (s > 0) banda.reverse();
      g.add(new THREE.Mesh(revolucion(banda, 120), m.bici2));
    }
  }

  // Buje con pestañas
  const buje = revolucion(
    [
      [0.008, -0.058],
      [0.016, -0.058],
      [0.016, -0.036],
      [0.027, -0.031],
      [0.027, -0.026],
      [0.017, -0.022],
      [0.0145, 0.0],
      [0.017, 0.022],
      [0.027, 0.026],
      [0.027, 0.031],
      [0.016, 0.036],
      [0.016, 0.058],
      [0.008, 0.058],
    ],
    32,
  );
  const mb = new THREE.Mesh(buje, m.negro);
  mb.castShadow = true;
  g.add(mb);

  // Disco de freno perforado (lado izquierdo)
  const disco = new THREE.Mesh(geometriaDisco(trasera ? 0.08 : 0.08), m.disco);
  disco.position.z = -0.047;
  g.add(disco);
  return g;
}

/** Disco de freno: pista perforada y araña de 6 brazos, extruido. */
function geometriaDisco(radio: number) {
  const f = new THREE.Shape();
  f.absarc(0, 0, radio, 0, Math.PI * 2, false);
  const interior = radio - 0.017;
  // Huecos entre los brazos de la araña
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.2;
    const a1 = a0 + Math.PI / 3 - 0.4;
    const h = new THREE.Path();
    h.absarc(0, 0, interior, a0, a1, false);
    h.absarc(0, 0, 0.026, a1, a0, true);
    h.closePath();
    f.holes.push(h);
  }
  // Agujeros de la pista
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const r = interior + 0.0085 + (i % 2 ? 0.003 : -0.003);
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * r, Math.sin(a) * r, 0.0023, 0, Math.PI * 2, true);
    f.holes.push(h);
  }
  const centro = new THREE.Path();
  centro.absarc(0, 0, 0.013, 0, Math.PI * 2, true);
  f.holes.push(centro);
  const g = new THREE.ExtrudeGeometry(f, { depth: 0.0018, bevelEnabled: false, curveSegments: 28 });
  g.translate(0, 0, -0.0009);
  return g;
}

// ---------------------------------------------------------------------------
// Transmisión y otras piezas
// ---------------------------------------------------------------------------

const PASO_CADENA = 0.0127;
const radioDientes = (n: number) => PASO_CADENA / (2 * Math.sin(Math.PI / n));

/** Plato o piñón dentado (perfil extruido) en el plano XY. */
function geometriaDentada(dientes: number, grosor: number, hueco: number) {
  const radio = radioDientes(dientes) + 0.0035;
  const forma = new THREE.Shape();
  const n = dientes * 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const f = (i % 6) / 6;
    // Diente redondeado: sube, meseta corta y baja
    const alto = f < 0.5 ? Math.sin(f * Math.PI * 2) ** 0.6 : 0;
    const r = radio - 0.006 + 0.006 * alto;
    if (i === 0) forma.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else forma.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hueco, 0, Math.PI * 2, true);
  forma.holes.push(h);
  const g = new THREE.ExtrudeGeometry(forma, { depth: grosor, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -grosor / 2);
  return g;
}

/** Araña de 4 brazos de la biela derecha (une los platos) y brazo de biela. */
function geometriaAranaBiela() {
  const piezas: THREE.BufferGeometry[] = [];
  const brazos = new THREE.Shape();
  const n = 4;
  const R = radioDientes(34) - 0.006;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    const s = new THREE.Shape();
    const ancho = 0.011;
    const px = -Math.sin(a) * ancho;
    const py = Math.cos(a) * ancho;
    s.moveTo(px * 1.6, py * 1.6);
    s.lineTo(Math.cos(a) * R + px * 0.7, Math.sin(a) * R + py * 0.7);
    s.absarc(Math.cos(a) * R, Math.sin(a) * R, ancho * 0.7, a + Math.PI / 2, a - Math.PI / 2, true);
    s.lineTo(-px * 1.6, -py * 1.6);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2 });
    piezas.push(g.toNonIndexed());
  }
  void brazos;
  const centro = new THREE.CylinderGeometry(0.024, 0.024, 0.01, 24);
  centro.rotateX(Math.PI / 2);
  centro.translate(0, 0, 0.003);
  piezas.push(centro.toNonIndexed());
  const g = mergeGeometries(piezas);
  piezas.forEach((p) => p.dispose());
  return g;
}

/** Brazo de biela: se estrecha hacia el pedal, con bordes redondeados (a lo largo de +X). */
function geometriaBrazo() {
  const s = new THREE.Shape();
  const L = BIELA;
  s.moveTo(0, -0.019);
  s.bezierCurveTo(L * 0.4, -0.0145, L * 0.75, -0.0115, L, -0.0115);
  s.absarc(L, 0, 0.0115, -Math.PI / 2, Math.PI / 2, false);
  s.bezierCurveTo(L * 0.75, 0.0115, L * 0.4, 0.0145, 0, 0.019);
  s.absarc(0, 0, 0.019, Math.PI / 2, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -0.004);
  return g;
}

/** Pedal automático (cuerpo triangular visto desde arriba) con la cala. */
function geometriaPedal() {
  const s = new THREE.Shape();
  s.moveTo(0.052, 0);
  s.bezierCurveTo(0.052, 0.03, 0.02, 0.043, -0.012, 0.042);
  s.bezierCurveTo(-0.045, 0.04, -0.05, 0.02, -0.05, 0);
  s.bezierCurveTo(-0.05, -0.02, -0.045, -0.04, -0.012, -0.042);
  s.bezierCurveTo(0.02, -0.043, 0.052, -0.03, 0.052, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 14 });
  g.rotateX(-Math.PI / 2); // en el plano XZ, grosor hacia arriba
  g.translate(0, -0.009, 0);
  const eje = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 12);
  eje.rotateX(Math.PI / 2);
  const piezas = [g.toNonIndexed(), eje.toNonIndexed()];
  const res = mergeGeometries(piezas);
  piezas.forEach((p) => p.dispose());
  return res;
}

/** Sillín visto desde arriba (punta en +X), con los bordes redondeados. */
function geometriaSillin(corto: boolean) {
  const f = new THREE.Shape();
  const L = corto ? 0.125 : 0.14;
  f.moveTo(L, 0);
  f.bezierCurveTo(L, 0.017, 0.06, 0.019, 0.0, 0.028);
  f.bezierCurveTo(-0.07, 0.072, -0.128, 0.074, -0.132, 0.038);
  f.bezierCurveTo(-0.136, 0.012, -0.136, -0.012, -0.132, -0.038);
  f.bezierCurveTo(-0.128, -0.074, -0.07, -0.072, 0.0, -0.028);
  f.bezierCurveTo(0.06, -0.019, L, -0.017, L, 0);
  // Canal central de descarga
  const canal = new THREE.Path();
  canal.moveTo(0.05, 0);
  canal.bezierCurveTo(0.03, 0.006, -0.03, 0.012, -0.075, 0.01);
  canal.bezierCurveTo(-0.085, 0.004, -0.085, -0.004, -0.075, -0.01);
  canal.bezierCurveTo(-0.03, -0.012, 0.03, -0.006, 0.05, 0);
  f.holes.push(canal);
  const g = new THREE.ExtrudeGeometry(f, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.009,
    bevelSize: 0.007,
    bevelSegments: 5,
    curveSegments: 20,
  });
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Punta algo caída, cola que sube, hundido suave en el centro y bordes que caen
    const perfil = x > 0.02 ? -0.9 * (x - 0.02) ** 2 : 0.6 * (x - 0.02) ** 2;
    pos.setY(i, pos.getY(i) + perfil - 0.004 * Math.exp(-(((x + 0.03) / 0.05) ** 2)) - 2.6 * z * z);
  }
  g.computeVertexNormals();
  return g;
}

/** Bidón (sólido de revolución a lo largo de Y). */
function geometriaBidon() {
  const perfil = [
    [0, -0.1],
    [0.03, -0.1],
    [0.036, -0.094],
    [0.037, -0.04],
    [0.033, -0.022],
    [0.037, -0.005],
    [0.037, 0.06],
    [0.031, 0.078],
    [0.016, 0.086],
    [0.013, 0.1],
    [0.007, 0.108],
    [0, 0.108],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(perfil, 28);
}

// ---------------------------------------------------------------------------
// Cadena
// ---------------------------------------------------------------------------

interface Rueda2D {
  c: THREE.Vector2;
  r: number;
  giro: 1 | -1; // 1 = antihorario, -1 = horario (visto desde +Z)
}

/**
 * Recorrido cerrado de la cadena alrededor de platos, piñón y roldanas:
 * tramos rectos tangentes y arcos, muestreado en puntos.
 */
function recorridoCadena(ruedas: Rueda2D[]) {
  const n = ruedas.length;
  // Tangente de la rueda i a la i+1: normal común con radios con signo (ver notas)
  const salidas: THREE.Vector2[] = [];
  const entradas: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = ruedas[i];
    const b = ruedas[(i + 1) % n];
    const ra = a.r * a.giro;
    const rb = b.r * b.giro;
    const d = b.c.clone().sub(a.c);
    const L = d.length();
    const u = d.clone().divideScalar(L);
    const perpU = new THREE.Vector2(-u.y, u.x);
    const cos = (ra - rb) / L;
    const sen = Math.sqrt(Math.max(0, 1 - cos * cos));
    let nrm = u.clone().multiplyScalar(cos).add(perpU.clone().multiplyScalar(sen));
    // El sentido de avance (perpendicular a la normal) debe ir de a hacia b
    if (d.dot(new THREE.Vector2(-nrm.y, nrm.x)) < 0) nrm = u.clone().multiplyScalar(cos).add(perpU.clone().multiplyScalar(-sen));
    salidas.push(a.c.clone().add(nrm.clone().multiplyScalar(ra)));
    entradas.push(b.c.clone().add(nrm.clone().multiplyScalar(rb)));
  }
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const w = ruedas[(i + 1) % n];
    const ent = entradas[i];
    const sal = salidas[(i + 1) % n];
    pts.push(salidas[i].clone(), ent.clone());
    // Arco sobre la rueda siguiente, en su sentido de giro
    let a0 = Math.atan2(ent.y - w.c.y, ent.x - w.c.x);
    let a1 = Math.atan2(sal.y - w.c.y, sal.x - w.c.x);
    if (w.giro > 0) while (a1 < a0) a1 += Math.PI * 2;
    else while (a1 > a0) a1 -= Math.PI * 2;
    const pasos = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.12));
    for (let k = 1; k < pasos; k++) {
      const a = a0 + ((a1 - a0) * k) / pasos;
      pts.push(new THREE.Vector2(w.c.x + Math.cos(a) * w.r, w.c.y + Math.sin(a) * w.r));
    }
  }
  return pts;
}

/** Eslabón: dos placas en «8» y dos rodillos (a lo largo de +X, centrado en el primer rodillo). */
function geometriaEslabon(exterior: boolean) {
  const s = new THREE.Shape();
  const r = exterior ? 0.0042 : 0.0039;
  const cintura = r * 0.72;
  const p = PASO_CADENA;
  s.moveTo(0, -r);
  s.bezierCurveTo(p * 0.3, -r, p * 0.35, -cintura, p * 0.5, -cintura);
  s.bezierCurveTo(p * 0.65, -cintura, p * 0.7, -r, p, -r);
  s.absarc(p, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.bezierCurveTo(p * 0.7, r, p * 0.65, cintura, p * 0.5, cintura);
  s.bezierCurveTo(p * 0.35, cintura, p * 0.3, r, 0, r);
  s.absarc(0, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  const piezas: THREE.BufferGeometry[] = [];
  const z = exterior ? 0.0036 : 0.0026;
  for (const lado of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.0008, bevelEnabled: false, curveSegments: 5 });
    g.translate(0, 0, lado * z - 0.0004);
    piezas.push(g.toNonIndexed());
  }
  if (!exterior) {
    for (const x of [0, p]) {
      const rod = new THREE.CylinderGeometry(0.0038, 0.0038, 0.0048, 8);
      rod.rotateX(Math.PI / 2);
      rod.translate(x, 0, 0);
      piezas.push(rod.toNonIndexed());
    }
  }
  const res = mergeGeometries(piezas);
  piezas.forEach((q) => q.dispose());
  return res;
}

export class Cadena {
  readonly grupo = new THREE.Group();
  private curva: THREE.CatmullRomCurve3;
  private n: number;
  private mallas: THREE.InstancedMesh[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private t = new THREE.Vector3();
  private escala = new THREE.Vector3(1, 1, 1);

  constructor(ruedas: Rueda2D[], z: number, material: THREE.Material) {
    const pts = recorridoCadena(ruedas).map((p) => new THREE.Vector3(p.x, p.y, z));
    this.curva = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.1);
    const largo = this.curva.getLength();
    this.n = Math.round(largo / PASO_CADENA / 2) * 2;
    this.mallas = [geometriaEslabon(false), geometriaEslabon(true)].map((g) => {
      const im = new THREE.InstancedMesh(g, material, this.n / 2);
      im.castShadow = true;
      im.frustumCulled = false;
      this.grupo.add(im);
      return im;
    });
    this.colocar(0);
  }

  /** Coloca los eslabones desplazados `avance` metros a lo largo del recorrido. */
  colocar(avance: number) {
    const largo = this.curva.getLength();
    const fase = (((avance / largo) % 1) + 1) % 1;
    for (let i = 0; i < this.n; i++) {
      const u0 = (i / this.n + fase) % 1;
      const u1 = ((i + 1) / this.n + fase) % 1;
      this.curva.getPointAt(u0, this.p);
      this.curva.getPointAt(u1, this.t);
      this.t.sub(this.p);
      const ang = Math.atan2(this.t.y, this.t.x);
      this.q.setFromAxisAngle(EJE_Z, ang);
      this.escala.set(this.t.length() / PASO_CADENA, 1, 1);
      this.m.compose(this.p, this.q, this.escala);
      this.mallas[i % 2].setMatrixAt(i >> 1, this.m);
    }
    for (const im of this.mallas) im.instanceMatrix.needsUpdate = true;
  }

  destruir() {
    for (const im of this.mallas) {
      im.geometry.dispose();
      im.dispose();
    }
  }
}

const EJE_Z = V(0, 0, 1);

// ---------------------------------------------------------------------------
// Montaje de la bici
// ---------------------------------------------------------------------------

export interface PiezasBici {
  /** Grupo de toda la bici (sin bielas ni pedales). */
  grupo: THREE.Group;
  ruedas: THREE.Object3D[];
  /** Grupo que gira con el pedaleo (platos y biela derecha). */
  platos: THREE.Group;
  bielaIzq: THREE.Group;
  pedales: [THREE.Mesh, THREE.Mesh];
  cadena: Cadena;
  radioPlato: number;
  /** Mallas creadas aquí (para liberarlas); las geometrías en caché no se liberan. */
  propias: THREE.BufferGeometry[];
}

export function montarBici(modelo: ModeloBici, ruedasTipo: TipoRuedas, m: MaterialesBici): PiezasBici {
  const G = geometriaBici(modelo);
  const grupo = new THREE.Group();
  const propias: THREE.BufferGeometry[] = [];
  const malla = (g: THREE.BufferGeometry, mat: THREE.Material, propia = true) => {
    const o = new THREE.Mesh(g, mat);
    o.castShadow = true;
    if (propia) propias.push(g);
    grupo.add(o);
    return o;
  };

  // Ruedas
  const ruedas: THREE.Object3D[] = [];
  for (const [centro, trasera] of [[G.bujeT, true], [G.bujeD, false]] as const) {
    const r = crearRueda(ruedasTipo, trasera, m);
    r.position.copy(centro);
    r.traverse((o) => {
      if (o instanceof THREE.Mesh) propias.push(o.geometry);
    });
    grupo.add(r);
    ruedas.push(r);
  }

  // Cuadro, horquilla y cockpit
  malla(mallaCuadro(modelo).geometria, m.cuadro, false);
  malla(mallaCockpit(modelo), m.cuadro, false);

  // Sillín con raíles
  const sillin = malla(geometriaSillin(G.cabra), m.negro);
  sillin.position.copy(G.sillin).add(V(-0.012, 0.012));
  if (G.cabra) sillin.rotation.z = -0.04;
  for (const z of [-0.022, 0.022]) {
    const rail = malla(new THREE.CylinderGeometry(0.0035, 0.0035, 0.11, 8), m.metal);
    rail.rotation.z = Math.PI / 2;
    rail.position.copy(G.sillin).add(V(-0.01, 0.004, z));
  }

  // Transmisión
  const radioPlato = radioDientes(50);
  const platos = new THREE.Group();
  platos.position.copy(EJE).setZ(Z_CADENA + 0.002);
  const grande = new THREE.Mesh(geometriaDentada(50, 0.004, radioPlato - 0.018), m.negro);
  const pequeno = new THREE.Mesh(geometriaDentada(34, 0.004, radioDientes(34) - 0.013), m.aluminio);
  pequeno.position.z = -0.0065;
  const arana = new THREE.Mesh(geometriaAranaBiela(), m.negro);
  arana.position.z = 0.0022;
  const brazoD = new THREE.Mesh(geometriaBrazo(), m.negro);
  brazoD.position.z = Z_PEDAL - Z_CADENA - 0.04;
  for (const o of [grande, pequeno, arana, brazoD]) {
    o.castShadow = true;
    propias.push(o.geometry);
    platos.add(o);
  }
  grupo.add(platos);
  const bielaIzq = new THREE.Group();
  bielaIzq.position.copy(EJE).setZ(-(Z_PEDAL - 0.04));
  const brazoI = new THREE.Mesh(geometriaBrazo(), m.negro);
  brazoI.castShadow = true;
  propias.push(brazoI.geometry);
  bielaIzq.add(brazoI);
  // Eje del pedalier
  const eje = malla(new THREE.CylinderGeometry(0.012, 0.012, 2 * (Z_PEDAL - 0.04), 16), m.negro);
  eje.rotation.x = Math.PI / 2;
  eje.position.copy(EJE);
  grupo.add(bielaIzq);

  // Casete 11-30 dentado
  const casete = [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30];
  const zPinon = (i: number) => 0.058 - i * 0.0039;
  casete.forEach((dientes, i) => {
    const p = malla(geometriaDentada(dientes, 0.0018, 0.0175), i < 6 ? m.metal : m.aluminio);
    p.position.copy(G.bujeT).setZ(zPinon(i));
  });
  // Piñón en uso: 17 (sexto), alineado con la cadena
  const pinon = { dientes: 17, z: zPinon(5) };
  void pinon;

  // Cambio trasero: patilla, paralelogramo y jaula con dos roldanas
  const roldanaA = G.bujeT.clone().add(V(0.004, -0.058));
  const roldanaB = G.bujeT.clone().add(V(0.034, -0.124));
  const rRoldana = radioDientes(11);
  for (const c of [roldanaA, roldanaB]) {
    const r = malla(geometriaDentada(11, 0.004, 0.004), m.negro);
    r.position.copy(c).setZ(Z_CADENA);
    const tapa = malla(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 16), m.metal);
    tapa.rotation.x = Math.PI / 2;
    tapa.position.copy(c).setZ(Z_CADENA);
  }
  {
    // Jaula: dos placas que unen las roldanas
    const dir = roldanaB.clone().sub(roldanaA);
    const largo = dir.length();
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.014, Math.PI / 2, Math.PI * 1.5, false);
    s.lineTo(largo, -0.0165);
    s.absarc(largo, 0, 0.0165, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(0, 0.014);
    const ang = Math.atan2(dir.y, dir.x);
    for (const dz of [-0.0068, 0.0068]) {
      const placa = malla(new THREE.ExtrudeGeometry(s, { depth: 0.0018, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1 }), dz > 0 ? m.negro : m.aluminio);
      placa.position.copy(roldanaA).setZ(Z_CADENA + dz);
      placa.rotation.z = ang;
    }
    // Cuerpo y paralelogramo
    const cuerpo = malla(new RoundedBoxGeometry(0.03, 0.05, 0.022, 3, 0.007), m.negro);
    cuerpo.position.copy(G.bujeT).add(V(-0.012, -0.026, Z_CADENA + 0.022));
    cuerpo.rotation.z = -0.5;
    const nudillo = malla(new RoundedBoxGeometry(0.026, 0.03, 0.02, 3, 0.006), m.aluminio);
    nudillo.position.copy(G.bujeT).add(V(-0.005, -0.012, 0.074));
    const patilla = malla(new RoundedBoxGeometry(0.02, 0.04, 0.005, 2, 0.002), m.aluminio);
    patilla.position.copy(G.bujeT).add(V(0.0, -0.014, 0.068));
  }

  const cadena = new Cadena(
    [
      { c: new THREE.Vector2(EJE.x, EJE.y), r: radioPlato, giro: -1 },
      { c: new THREE.Vector2(roldanaB.x, roldanaB.y), r: rRoldana, giro: -1 },
      { c: new THREE.Vector2(roldanaA.x, roldanaA.y), r: rRoldana, giro: 1 },
      { c: new THREE.Vector2(G.bujeT.x, G.bujeT.y), r: radioDientes(17), giro: -1 },
    ],
    Z_CADENA,
    m.cadena,
  );
  grupo.add(cadena.grupo);

  // Desviador delantero sobre el tubo de sillín
  {
    const ejeS = G.sillinTubo.clone().sub(EJE).normalize();
    const d = malla(new RoundedBoxGeometry(0.06, 0.022, 0.02, 3, 0.006), m.negro);
    d.position.copy(EJE).addScaledVector(ejeS, 0.155).add(V(0.018, 0, 0.03));
    d.rotation.z = Math.atan2(radioPlato, 0) * 0 - 0.1;
  }

  // Pinzas de freno de disco (flat mount)
  const pinzaT = malla(new RoundedBoxGeometry(0.058, 0.03, 0.028, 3, 0.008), m.negro);
  pinzaT.position.copy(G.bujeT).add(V(0.072, 0.024, -0.052));
  pinzaT.rotation.z = 0.28;
  const pinzaD = malla(new RoundedBoxGeometry(0.058, 0.03, 0.028, 3, 0.008), m.negro);
  pinzaD.position.copy(G.bujeD).add(V(-0.052, 0.06, -0.053));
  pinzaD.rotation.z = -1.0;

  // Portabidón y bidón encima del tubo diagonal
  if (!G.cabra) {
    const cuadro = tuboDiagonal(modelo);
    const dir = cuadro.diagonalB.clone().sub(cuadro.diagonalA).normalize();
    const nrm = V(-dir.y, dir.x);
    const centro = cuadro.diagonalA.clone().lerp(cuadro.diagonalB, 0.5).addScaledVector(nrm, cuadro.diagonalFondo + 0.042);
    const bidon = malla(geometriaBidon(), m.bici2);
    bidon.position.copy(centro);
    bidon.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
    const portabidon = malla(new THREE.TorusGeometry(0.039, 0.0028, 6, 24, Math.PI * 1.2), m.negro);
    portabidon.position.copy(centro).addScaledVector(dir, -0.03);
    portabidon.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
    portabidon.rotateZ(-Math.PI * 1.1);
  }

  // Pedales (se colocan en cada imagen)
  const pedales: [THREE.Mesh, THREE.Mesh] = [0, 1].map(() => {
    const p = new THREE.Mesh(geometriaPedal(), m.negro);
    p.castShadow = true;
    propias.push(p.geometry);
    grupo.add(p);
    return p;
  }) as unknown as [THREE.Mesh, THREE.Mesh];

  return { grupo, ruedas, platos, bielaIzq, pedales, cadena, radioPlato, propias };
}
