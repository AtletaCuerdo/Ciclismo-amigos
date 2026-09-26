/**
 * Casco, gafas y correas del ciclista, generados por código a medida de la cabeza del modelo.
 *
 * - Se mide el cráneo (vértices del hueso de la cabeza) y se ajusta un elipsoide:
 *   el casco se construye sobre él, así nunca atraviesa la cabeza, sea hombre o mujer.
 * - Casco con carcasa exterior, espuma interior y borde; las rejillas de ventilación se
 *   recortan por píxel en el shader (bordes limpios a cualquier distancia).
 * - Las correas y las patillas de las gafas se proyectan sobre la piel.
 *
 * Todo está en coordenadas del modelo en reposo (+Z delante, +Y arriba, +X a la izquierda
 * del ciclista); quien lo usa lo cuelga del hueso de la cabeza.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Casco } from './avatar';
import { mallaGuardada } from './cacheMallas';
import { libre, mallaSdf, smax } from './sdf';

const GRADOS = Math.PI / 180;

// ---------------------------------------------------------------------------
// Medidas de la cabeza
// ---------------------------------------------------------------------------

export interface MedidasCabeza {
  /** Centro del cráneo. */
  centro: THREE.Vector3;
  /** Semiejes del elipsoide del cráneo: x (lados), y (arriba), zd (delante), zt (detrás). */
  ejes: { x: number; y: number; zd: number; zt: number };
  ojoY: number;
  ojoZ: number;
  /** Vértices de cabeza y cuello (x, y, z) y sus normales, para proyectar correas y gafas. */
  puntos: Float32Array;
  normales: Float32Array;
}

/** Hueso con más peso de cada vértice. */
function huesoPrincipal(malla: THREE.SkinnedMesh, i: number) {
  const indices = malla.geometry.attributes.skinIndex as THREE.BufferAttribute;
  const pesos = malla.geometry.attributes.skinWeight as THREE.BufferAttribute;
  let mejor = 0;
  let hueso = 0;
  for (let k = 0; k < 4; k++) {
    const w = pesos.getComponent(i, k);
    if (w > mejor) {
      mejor = w;
      hueso = indices.getComponent(i, k);
    }
  }
  return malla.skeleton.bones[hueso]?.name ?? '';
}

export function medirCabeza(cuerpo: THREE.SkinnedMesh, ojos: THREE.Mesh | null): MedidasCabeza {
  const geo = cuerpo.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const cabeza: THREE.Vector3[] = [];
  const puntos: number[] = [];
  const normales: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const h = huesoPrincipal(cuerpo, i);
    if (h !== 'Head' && h !== 'neck_01') continue;
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    puntos.push(p.x, p.y, p.z);
    normales.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    if (h === 'Head') cabeza.push(p);
  }

  let ojoY = 1.7;
  let ojoZ = 0.08;
  if (ojos) {
    ojos.geometry.computeBoundingBox();
    const b = ojos.geometry.boundingBox!;
    ojoY = (b.min.y + b.max.y) / 2;
    ojoZ = b.max.z;
  }

  // Elipsoide inicial con la parte alta del cráneo
  const alto = cabeza.filter((p) => p.y > ojoY + 0.02);
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxX = 0;
  let maxY = -Infinity;
  for (const p of alto) {
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
    maxX = Math.max(maxX, Math.abs(p.x));
    maxY = Math.max(maxY, p.y);
  }
  const centro = new THREE.Vector3(0, ojoY + 0.012, (minZ + maxZ) / 2);
  const ejes = { x: maxX, y: maxY - centro.y, zd: maxZ - centro.z, zt: centro.z - minZ };

  // Escala para que quepa todo lo que va a cubrir el casco (sin la cara)
  let escala = 1;
  const d = new THREE.Vector3();
  for (const p of cabeza) {
    d.subVectors(p, centro);
    const polar = Math.acos(THREE.MathUtils.clamp(d.y / d.length(), -1, 1));
    if (polar > 102 * GRADOS) continue;
    if (d.z > 0 && p.y < ojoY + 0.022) continue; // cara (cejas, nariz)
    const z = d.z > 0 ? ejes.zd : ejes.zt;
    escala = Math.max(escala, Math.hypot(d.x / ejes.x, d.y / ejes.y, d.z / z));
  }
  ejes.x *= escala;
  ejes.y *= escala;
  ejes.zd *= escala;
  ejes.zt *= escala;
  return { centro, ejes, ojoY, ojoZ, puntos: new Float32Array(puntos), normales: new Float32Array(normales) };
}

/** Distancia del centro al elipsoide del cráneo en la dirección `d` (unitaria). */
function radioCraneo(m: MedidasCabeza, d: THREE.Vector3) {
  const z = d.z > 0 ? m.ejes.zd : m.ejes.zt;
  return 1 / Math.sqrt((d.x / m.ejes.x) ** 2 + (d.y / m.ejes.y) ** 2 + (d.z / z) ** 2);
}

/** Proyecta un punto sobre la piel (plano tangente del vértice más cercano) y lo separa `separacion`. */
function proyectarEnPiel(m: MedidasCabeza, p: THREE.Vector3, separacion: number) {
  let mejor = Infinity;
  let k = 0;
  const P = m.puntos;
  for (let i = 0; i < P.length; i += 3) {
    const dd = (P[i] - p.x) ** 2 + (P[i + 1] - p.y) ** 2 + (P[i + 2] - p.z) ** 2;
    if (dd < mejor) {
      mejor = dd;
      k = i;
    }
  }
  const v = new THREE.Vector3(P[k], P[k + 1], P[k + 2]);
  const n = new THREE.Vector3(m.normales[k], m.normales[k + 1], m.normales[k + 2]).normalize();
  const fuera = n.dot(p.clone().sub(v));
  return p.clone().addScaledVector(n, -fuera + separacion);
}

/** Suaviza una polilínea (media de vecinos, extremos fijos). */
function suavizar(pts: THREE.Vector3[], pasadas: number) {
  for (let k = 0; k < pasadas; k++) {
    const copia = pts.map((p) => p.clone());
    for (let i = 1; i < pts.length - 1; i++) pts[i].copy(copia[i - 1]).add(copia[i + 1]).multiplyScalar(0.25).addScaledVector(copia[i], 0.5);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Definición de cada casco
// ---------------------------------------------------------------------------

/** Rejilla: latitud central, longitud inicial y final, medio ancho (grados) y curvatura. */
type Rejilla = [lat: number, lon0: number, lon1: number, ancho: number, curva: number];

interface DefCasco {
  /** Ángulo polar del borde (grados) delante, a los lados y detrás. */
  borde: [number, number, number];
  holgura: number; // separación de la espuma interior al cráneo
  grosor: number;
  extra: (d: THREE.Vector3) => number; // forma (m añadidos al radio)
  rejillas: Rejilla[];
  banda: number; // grados de la banda inferior de otro color (0 = sin banda)
  tela?: boolean; // gorra
}

const campana = (x: number, centro: number, ancho: number) => Math.exp(-(((x - centro) / ancho) ** 2));
const suave = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

const DEFS: Record<Casco, DefCasco> = {
  ruta: {
    borde: [84, 97, 113],
    holgura: 0.004,
    grosor: 0.019,
    // Cola trasera ligeramente apuntada y frente algo más plano
    extra: (d) => 0.016 * suave(0.35, 0.95, -d.z) * campana(d.y, -0.2, 0.4) * (1 - Math.abs(d.x)) - 0.004 * suave(0.6, 1, d.z),
    rejillas: [
      // Tomas delanteras anchas
      [0, 52, 76, 5.2, 0],
      [17, 50, 74, 5.4, 2],
      [34, 44, 68, 4.8, 3.5],
      // Canales superiores
      [8.5, -22, 40, 3, 0.8],
      [25, -18, 34, 3.6, 2],
      [43, -12, 26, 3.4, 2.5],
      [58, 6, 40, 2.8, 1.5],
      // Salidas traseras
      [0, -96, -48, 3.2, 0],
      [16, -92, -36, 4.2, -2],
      [33, -84, -34, 4, -3.5],
      [50, -66, -30, 3.2, -2.5],
    ],
    banda: 4,
  },
  clasico: {
    borde: [82, 96, 105],
    holgura: 0.008,
    grosor: 0.022,
    extra: (d) => 0.006 * suave(0.2, 1, d.y) + 0.006 * suave(0.4, 1, -d.z),
    rejillas: [
      [0, 18, 66, 5.2, 0],
      [0, -62, -8, 5.2, 0],
      [21, 12, 62, 5.6, 2],
      [21, -66, -8, 5.6, -2],
      [41, 2, 50, 5.2, 3],
      [41, -62, -14, 4.8, -3],
    ],
    banda: 0,
  },
  aero: {
    borde: [82, 104, 110],
    holgura: 0.006,
    grosor: 0.02,
    // Gota: cola larga hacia atrás y algo caída
    extra: (d) => 0.105 * Math.max(0, -d.z) ** 6 * campana(d.y, -0.3, 0.45) + 0.008 * suave(0.3, 1, d.z),
    rejillas: [
      [11, 58, 71, 3.4, 0],
      [-11, 58, 71, 3.4, 0],
    ],
    banda: 5,
  },
  gorra: {
    borde: [85, 97, 103],
    holgura: 0.0035,
    grosor: 0.0025,
    extra: () => 0,
    rejillas: [],
    banda: 0,
    tela: true,
  },
};

function bordePolar(def: DefCasco, az: number) {
  const [pf, pl, pt] = def.borde;
  const k = (1 - Math.cos(az)) / 2;
  const p = pf * 2 * (k - 0.5) * (k - 1) + pl * -4 * k * (k - 1) + pt * 2 * k * (k - 0.5);
  return p * GRADOS;
}

const direccion = (az: number, polar: number, v = new THREE.Vector3()) =>
  v.set(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));

/** Distancia (en grados) al borde de la rejilla más cercana; negativa dentro. Igual que en el shader. */
function distanciaRejillas(def: DefCasco, d: THREE.Vector3) {
  const lat = Math.asin(THREE.MathUtils.clamp(d.x, -1, 1)) / GRADOS;
  const lon = Math.atan2(d.z, d.y) / GRADOS;
  const cosLat = Math.cos(lat * GRADOS);
  let sd = 1e3;
  for (const [lc, l0, l1, ancho, curva] of def.rejillas) {
    for (const s of lc === 0 ? [1] : [1, -1]) {
      const centro = s * (lc + (curva * (lon - (l0 + l1) / 2)) / 30);
      const t = THREE.MathUtils.clamp(lon, l0, l1);
      const w = ancho * THREE.MathUtils.lerp(0.75, 1.1, (t - l0) / Math.max(l1 - l0, 1));
      sd = Math.min(sd, Math.hypot(lat - centro, (lon - t) * cosLat) - w);
    }
  }
  return sd;
}

/** Punto de la carcasa (capa exterior o interior). */
function puntoCasco(m: MedidasCabeza, def: DefCasco, az: number, polar: number, exterior: boolean) {
  const d = direccion(az, polar);
  let r = radioCraneo(m, d) + def.holgura;
  // La carcasa se estrecha hacia el borde: así el casco abraza la cabeza y no parece un cuenco
  const haciaBorde = THREE.MathUtils.smoothstep(polar / bordePolar(def, az), 0.72, 1);
  if (exterior) {
    r += def.grosor * (1 - 0.45 * haciaBorde) + def.extra(d);
    // Labio redondeado alrededor de cada rejilla (la carcasa se hunde hacia el agujero)
    if (def.rejillas.length) {
      const h = 1 - THREE.MathUtils.smoothstep(distanciaRejillas(def, d), -0.3, 3.2);
      r -= def.grosor * 0.5 * h * h;
    }
  } else r += def.extra(d) * 0.35;
  return d.multiplyScalar(r).add(m.centro);
}

/**
 * Superficie parametrizada (u, v) ∈ [0, 1]² → punto, con normales calculadas por diferencias.
 * La normal apunta a cross(dP/dv, dP/du).
 */
function superficie(nU: number, nV: number, f: (u: number, v: number) => THREE.Vector3, cerradaU = false) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const e = 1e-3;
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  for (let j = 0; j <= nV; j++) {
    for (let i = 0; i <= nU; i++) {
      const u = i / nU;
      const v = j / nV;
      const p = f(u, v);
      du.subVectors(f(Math.min(u + e, cerradaU ? u + e : 1), v), f(Math.max(u - e, cerradaU ? u - e : 0), v));
      dv.subVectors(f(u, Math.min(v + e, 1)), f(u, Math.max(v - e, 0)));
      const n = new THREE.Vector3().crossVectors(dv, du);
      if (n.lengthSq() < 1e-14) n.set(0, 1, 0);
      n.normalize();
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nV; j++) {
    for (let i = 0; i < nU; i++) {
      const a = j * (nU + 1) + i;
      const b = a + nU + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Cinta plana que sigue una polilínea; `fuera` da la dirección de la normal en cada punto. */
function cinta(pts: THREE.Vector3[], ancho: number, fuera: (p: THREE.Vector3) => THREE.Vector3) {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const t = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
    const n = fuera(pts[i]).normalize();
    const b = new THREE.Vector3().crossVectors(t, n).normalize().multiplyScalar(ancho / 2);
    n.crossVectors(b, t).normalize();
    const a = pts[i].clone().add(b);
    const c = pts[i].clone().sub(b);
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z);
    nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------
// Geometrías (se calculan una vez por cuerpo y tipo de casco)
// ---------------------------------------------------------------------------

export interface GeometriasCasco {
  exterior: THREE.BufferGeometry;
  interior: THREE.BufferGeometry | null;
  borde: THREE.BufferGeometry | null;
  correas: THREE.BufferGeometry | null;
  hebilla: THREE.BufferGeometry | null;
  visera: THREE.BufferGeometry | null; // visera de plástico (clásico) o de tela (gorra)
  pantalla: THREE.BufferGeometry | null; // pantalla transparente del casco aero
  gafas: GeometriasGafas | null;
}

interface GeometriasGafas {
  lente: THREE.BufferGeometry;
  montura: THREE.BufferGeometry;
}

const cache = new Map<string, GeometriasCasco>();

export function geometriasCasco(clave: string, m: MedidasCabeza, tipo: Casco): GeometriasCasco {
  const k = `${clave}|${tipo}`;
  let g = cache.get(k);
  if (!g) {
    g = construirGeometrias(m, tipo, clave);
    cache.set(k, g);
  }
  return g;
}

/**
 * Carcasa del casco como sólido de verdad: capa entre el cráneo (con holgura) y la superficie
 * exterior, borde inferior redondeado y rejillas que la atraviesan con los cantos suavizados.
 * El atributo «zona» marca la espuma (paredes de las rejillas e interior), la banda inferior
 * y el filete de color.
 */
function cascoSdf(m: MedidasCabeza, def: DefCasco): THREE.BufferGeometry {
  const c = m.centro;
  const dir = new THREE.Vector3();
  const radios = (x: number, y: number, z: number) => {
    const r = Math.hypot(x, y, z) || 1e-6;
    dir.set(x / r, y / r, z / r);
    const polar = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
    const az = Math.atan2(dir.x, dir.z);
    const borde = bordePolar(def, az);
    const base = radioCraneo(m, dir) + def.holgura;
    const extra = def.extra(dir);
    const hb = THREE.MathUtils.smoothstep(polar / borde, 0.72, 1);
    return { r, polar, borde, rin: base + extra * 0.35, rout: base + def.grosor * (1 - 0.45 * hb) + extra };
  };
  // Todo lo que depende solo de la dirección se tabula cada medio grado (acimut × polar)
  const NA = 720;
  const NP = 280; // hasta 140°
  const tIn = new Float32Array((NA + 1) * (NP + 1));
  const tOut = new Float32Array((NA + 1) * (NP + 1));
  const tRej = new Float32Array((NA + 1) * (NP + 1));
  const tBorde = new Float32Array(NA + 1);
  for (let a = 0; a <= NA; a++) {
    const az = (a / NA) * Math.PI * 2 - Math.PI;
    tBorde[a] = bordePolar(def, az);
    for (let p = 0; p <= NP; p++) {
      const polar = (p / 2) * GRADOS;
      direccion(az, polar, dir);
      const { rin, rout } = radios(dir.x, dir.y, dir.z);
      const n = a * (NP + 1) + p;
      tIn[n] = rin;
      tOut[n] = rout;
      tRej[n] = def.rejillas.length ? distanciaRejillas(def, dir) * GRADOS : 1;
    }
  }
  const campo = (px: number, py: number, pz: number) => {
    const x = px - c.x;
    const y = py - c.y;
    const z = pz - c.z;
    const r = Math.hypot(x, y, z) || 1e-6;
    const polar = Math.acos(THREE.MathUtils.clamp(y / r, -1, 1));
    const fa = ((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * NA;
    const fp = Math.min(NP - 0.001, (polar / GRADOS) * 2);
    const a0 = Math.min(NA - 1, Math.floor(fa));
    const p0 = Math.floor(fp);
    const ta = fa - a0;
    const tp = fp - p0;
    const n = a0 * (NP + 1) + p0;
    const bil = (t: Float32Array) =>
      (t[n] * (1 - tp) + t[n + 1] * tp) * (1 - ta) + (t[n + NP + 1] * (1 - tp) + t[n + NP + 2] * tp) * ta;
    const borde = tBorde[a0] * (1 - ta) + tBorde[a0 + 1] * ta;
    const capa = Math.max(r - bil(tOut), bil(tIn) - r);
    let f = smax(capa, (polar - borde) * r, 0.006);
    if (f > 0.012 || !def.rejillas.length) return f;
    f = smax(f, -bil(tRej) * r, 0.0045);
    return f;
  };
  const e = m.ejes;
  const h = Math.max(e.x, e.y, e.zd, e.zt) + def.grosor + 0.1;
  const g = mallaSdf([libre(campo, [c.x - e.x - 0.05, c.y - 0.08, c.z - e.zt - 0.12], [c.x + e.x + 0.05, c.y + h, c.z + e.zd + 0.06])], {
    paso: 0.0024,
    atributo: (px, py, pz) => {
      const { r, polar, borde, rout } = radios(px - c.x, py - c.y, pz - c.z);
      // Piel exterior (lo demás es espuma: paredes de las rejillas, canto e interior)
      const fuera = THREE.MathUtils.clamp((r - (rout - 0.004)) / 0.0025 + 0.5, 0, 1);
      const w = 0.004 / r; // ancho del borde de color (rad)
      const banda = def.banda ? THREE.MathUtils.clamp((polar - (borde - def.banda * GRADOS)) / w + 0.5, 0, 1) : 0;
      const b0 = borde - def.banda * GRADOS - 0.035;
      const filete = def.banda ? THREE.MathUtils.clamp(Math.min(polar - b0, b0 + 0.013 - polar) / w + 0.5, 0, 1) : 0;
      return [1 - fuera, fuera * banda, fuera * filete * (1 - banda), 0];
    },
  });
  return g;
}

/** Material de la carcasa SDF: pintura con barniz, espuma mate, banda negra y filete de color. */
function materialCascoSdf(color: string, uniformes: Record<string, THREE.IUniform>) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformes);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 zona;\nvarying vec4 vZonaC;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZonaC = zona;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vZonaC;\nuniform vec3 uAcento;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float zB = 1.0 - clamp( vZonaC.x + vZonaC.y + vZonaC.z, 0.0, 1.0 );
        float zRugC = 0.3;
        float zCapaC = 1.0;
        float zM = zB;
        if ( vZonaC.x > zM ) { zM = vZonaC.x; diffuseColor.rgb = vec3( 0.045, 0.047, 0.052 ); zRugC = 0.9; zCapaC = 0.0; }
        if ( vZonaC.y > zM ) { zM = vZonaC.y; diffuseColor.rgb = vec3( 0.03 ); zRugC = 0.35; }
        if ( vZonaC.z > zM ) { diffuseColor.rgb = uAcento; }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = zRugC;')
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= zCapaC;
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => 'casco-sdf-1';
  return mat;
}

function construirGeometrias(m: MedidasCabeza, tipo: Casco, clave: string): GeometriasCasco {
  const def = DEFS[tipo];
  const nAz = 240;
  const nPolar = 72;
  // az de -π a π: la costura queda detrás, en el centro
  const az = (u: number) => (u - 0.5) * Math.PI * 2;
  // Los cascos rígidos son una sola pieza con grosor (campo de distancia); la gorra, una tela
  const exterior = def.tela
    ? superficie(nAz, nPolar, (u, v) => puntoCasco(m, def, az(u), v * bordePolar(def, az(u)), true), true)
    : mallaGuardada(`casco|${clave}|${tipo}`, () => cascoSdf(m, def));
  const interior: THREE.BufferGeometry | null = null;
  const borde: THREE.BufferGeometry | null = null;

  let visera: THREE.BufferGeometry | null = null;
  if (tipo === 'clasico' || tipo === 'gorra') {
    const gorra = tipo === 'gorra';
    const abertura = (gorra ? 52 : 50) * GRADOS;
    visera = superficie(32, 6, (u, v) => {
      const a = (u - 0.5) * 2 * abertura;
      const base = puntoCasco(m, def, a, bordePolar(def, a) - (gorra ? 1 : 3) * GRADOS, true);
      const forma = Math.sqrt(Math.max(0, 1 - ((u - 0.5) * 2) ** 2));
      const largo = (gorra ? 0.05 : 0.034) * forma + 0.004;
      // Hacia delante; la de la gorra, levantada como en las gorras de ciclista clásicas
      const dir = new THREE.Vector3(Math.sin(a), gorra ? 0.55 : -0.42, Math.cos(a)).normalize();
      const curva = gorra ? 0 : -0.012 * v * v;
      return base.addScaledVector(dir, largo * v).add(new THREE.Vector3(0, curva, 0));
    });
  }

  let pantalla: THREE.BufferGeometry | null = null;
  if (tipo === 'aero') {
    const abertura = 78 * GRADOS;
    pantalla = superficie(40, 10, (u, v) => {
      const s = (u - 0.5) * 2;
      const a = s * abertura;
      const arriba = puntoCasco(m, def, a, bordePolar(def, a) - 2 * GRADOS, true);
      const r = Math.hypot(arriba.x - m.centro.x, arriba.z - m.centro.z);
      const yAbajo = m.ojoY - 0.04 + 0.03 * s * s;
      const y = THREE.MathUtils.lerp(arriba.y, yAbajo, v);
      const rr = r + 0.003 + 0.012 * Math.sin(v * Math.PI * 0.8);
      return new THREE.Vector3(m.centro.x + Math.sin(a) * rr, y, m.centro.z + Math.cos(a) * rr);
    });
  }

  // Correas (no en la gorra) y gafas (no con la pantalla del aero)
  let correas: THREE.BufferGeometry | null = null;
  let hebilla: THREE.BufferGeometry | null = null;
  if (!def.tela) {
    const partes: THREE.BufferGeometry[] = [];
    const fuera = (p: THREE.Vector3) => p.clone().sub(m.centro).setY((p.y - m.centro.y) * 0.3);
    for (const lado of [-1, 1]) {
      const ancla = (grados: number) => {
        const a = grados * GRADOS * lado;
        return puntoCasco(m, def, a, bordePolar(def, a) - 3 * GRADOS, false);
      };
      const x = m.ejes.x * 0.98 * lado;
      const union = new THREE.Vector3(x * 0.97, m.ojoY - 0.05, m.centro.z + 0.005);
      const recorridos = [
        [ancla(62), new THREE.Vector3(x, m.ojoY - 0.012, m.centro.z + 0.03), union],
        [ancla(128), new THREE.Vector3(x, m.ojoY - 0.015, m.centro.z - 0.05), union],
        [
          union,
          new THREE.Vector3(x * 0.75, m.ojoY - 0.09, m.centro.z + 0.045),
          new THREE.Vector3(x * 0.3, m.ojoY - 0.118, m.centro.z + 0.082),
          new THREE.Vector3(0, m.ojoY - 0.122, m.centro.z + 0.09),
        ],
      ];
      for (const [i, r] of recorridos.entries()) {
        const curva = new THREE.CatmullRomCurve3(r);
        const pts = curva.getPoints(30).map((p) => proyectarEnPiel(m, p, 0.0035));
        suavizar(pts, 4);
        partes.push(cinta(pts, i === 2 ? 0.012 : 0.009, fuera));
      }
    }
    // Ajuste trasero (cincha bajo el casco) con su rueda
    const cincha: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const a = (125 + (i / 30) * 110) * GRADOS;
      const d = direccion(a, bordePolar(def, a) + 7 * GRADOS);
      cincha.push(proyectarEnPiel(m, d.clone().multiplyScalar(radioCraneo(m, d)).add(m.centro), 0.009));
    }
    suavizar(cincha, 3);
    partes.push(cinta(cincha, 0.014, fuera));
    correas = mergeGeometries(partes.map((p) => p.toNonIndexed()));
    partes.forEach((p) => p.dispose());

    const piezas: THREE.BufferGeometry[] = [];
    const cierre = new THREE.BoxGeometry(0.03, 0.012, 0.012);
    cierre.translate(0, m.ojoY - 0.124, m.centro.z + 0.093);
    piezas.push(cierre);
    const rueda = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 16);
    rueda.rotateX(Math.PI / 2);
    const trasera = cincha[Math.floor(cincha.length / 2)];
    rueda.translate(trasera.x, trasera.y, trasera.z - 0.004);
    piezas.push(rueda);
    hebilla = mergeGeometries(piezas.map((p) => p.toNonIndexed()));
    piezas.forEach((p) => p.dispose());
  }

  return {
    exterior,
    interior,
    borde,
    correas,
    hebilla,
    visera,
    pantalla,
    gafas: tipo === 'aero' ? null : construirGafas(m),
  };
}

/** Gafas de pantalla envolventes (lente única con hueco para la nariz), montura y patillas. */
function construirGafas(m: MedidasCabeza): GeometriasGafas {
  const cz = m.centro.z;
  const cy = m.ojoY + 0.003;
  // Radio de la cara (en horizontal) por azimut, a la altura de los ojos
  const N = 90; // de -180 a 180, cada 4 grados
  const radio = new Array<number>(N).fill(0);
  const P = m.puntos;
  for (let i = 0; i < P.length; i += 3) {
    if (Math.abs(P[i + 1] - cy) > 0.03) continue;
    const a = Math.atan2(P[i], P[i + 2] - cz);
    const k = Math.min(N - 1, Math.floor(((a / Math.PI + 1) / 2) * N));
    radio[k] = Math.max(radio[k], Math.hypot(P[i], P[i + 2] - cz));
  }
  for (let k = 0; k < N; k++) if (!radio[k]) radio[k] = Math.max(radio[(k + 1) % N], radio[(k + N - 1) % N], 0.07);
  // Envolvente suave: máximo con vecinos y después media
  const max = radio.map((_, k) => Math.max(radio[(k + N - 1) % N], radio[k], radio[(k + 1) % N]));
  const suaveR = max.map((_, k) => (max[(k + N - 2) % N] + max[(k + N - 1) % N] + max[k] + max[(k + 1) % N] + max[(k + 2) % N]) / 5);
  const radioEn = (a: number) => {
    const f = ((a / Math.PI + 1) / 2) * N - 0.5;
    const k0 = Math.floor(f);
    const t = f - k0;
    return THREE.MathUtils.lerp(suaveR[(k0 + N) % N], suaveR[(k0 + 1 + N) % N], t);
  };

  const abertura = 74 * GRADOS;
  const arriba = (s: number) => 0.025 - 0.006 * s * s;
  const abajo = (s: number) => -0.021 + 0.013 * s * s * s * s + 0.019 * Math.exp(-((s / 0.11) ** 2));
  const separacion = (a: number) => 0.016 - 0.006 * Math.abs(Math.sin(a));
  const punto = (s: number, h: number, extra = 0) => {
    const a = s * abertura;
    const r = radioEn(a) + separacion(a) + extra - 0.004 * (1 - h);
    return new THREE.Vector3(Math.sin(a) * r, cy + THREE.MathUtils.lerp(abajo(s), arriba(s), h), cz + Math.cos(a) * r);
  };
  const lente = superficie(48, 10, (u, v) => punto((u - 0.5) * 2, v));

  // Montura: barra superior y patillas hasta detrás de la oreja
  const piezas: THREE.BufferGeometry[] = [];
  const barra = new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => punto(-1 + i / 12, 1.02, 0.001)));
  piezas.push(new THREE.TubeGeometry(barra, 48, 0.0032, 6, false));
  for (const lado of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (72 + i * 3) * GRADOS * lado;
      const r = radioEn(a) + 0.007 - 0.002 * (i / 16);
      pts.push(new THREE.Vector3(Math.sin(a) * r, cy + 0.016 - 0.012 * (i / 16) ** 2, cz + Math.cos(a) * r));
    }
    piezas.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0026, 5, false));
  }
  // Almohadillas de la nariz
  for (const lado of [-1, 1]) {
    const p = punto(0.1 * lado, 0.2, -0.004);
    const alm = new THREE.SphereGeometry(0.0045, 8, 6);
    alm.scale(0.6, 1.4, 1);
    alm.translate(p.x, p.y, p.z);
    piezas.push(alm);
  }
  const montura = mergeGeometries(piezas.map((p) => (p.index ? p.toNonIndexed() : p)));
  piezas.forEach((p) => p.dispose());
  return { lente, montura };
}

// ---------------------------------------------------------------------------
// Materiales y montaje
// ---------------------------------------------------------------------------

const MAX_REJILLAS = 16;

export interface ColoresCasco {
  casco: string;
  acento: string;
}

export class EquipoCabeza {
  readonly grupo = new THREE.Group();
  private materiales: THREE.Material[] = [];
  private matCasco: THREE.MeshPhysicalMaterial;
  private matVisera: THREE.MeshPhysicalMaterial | null = null;
  private matMontura: THREE.MeshPhysicalMaterial | null = null;
  private uniformes: Record<string, THREE.IUniform>;
  /** Datos del casco para ocultar el pelo que quedaría por encima del borde. */
  readonly recorte: { centro: THREE.Vector3; borde: THREE.Vector3 };

  constructor(m: MedidasCabeza, clave: string, private tipo: Casco, colores: ColoresCasco) {
    const def = DEFS[tipo];
    const g = geometriasCasco(clave, m, tipo);
    this.recorte = { centro: m.centro.clone(), borde: new THREE.Vector3(...def.borde).multiplyScalar(GRADOS) };

    const rejillas = def.rejillas.slice(0, MAX_REJILLAS);
    this.uniformes = {
      uCentro: { value: m.centro.clone() },
      uBorde: { value: this.recorte.borde.clone() },
      uRej: { value: Array.from({ length: MAX_REJILLAS }, (_, i) => new THREE.Vector4(...(rejillas[i]?.slice(0, 4) ?? [0, 0, 0, 0]))) },
      uCurva: { value: Array.from({ length: MAX_REJILLAS }, (_, i) => rejillas[i]?.[4] ?? 0) },
      uNRej: { value: rejillas.length },
      uAcento: { value: new THREE.Color(colores.acento) },
      uBanda: { value: def.banda * GRADOS },
      uTela: { value: def.tela ? 1 : 0 },
    };

    // Carcasa: pintura brillante con barniz (o tela en la gorra)
    this.matCasco = def.tela ? new THREE.MeshPhysicalMaterial({
      color: colores.casco,
      roughness: def.tela ? 0.85 : 0.32,
      metalness: 0,
      clearcoat: def.tela ? 0 : 1,
      clearcoatRoughness: 0.06,
      sheen: def.tela ? 1 : 0,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0.5, 0.5, 0.5),
      side: THREE.DoubleSide,
      alphaToCoverage: true,
    }) : materialCascoSdf(colores.casco, this.uniformes);
    if (def.tela) {
      this.matCasco.onBeforeCompile = (s) => this.shaderCasco(s);
      this.matCasco.customProgramCacheKey = () => 'casco-ciclista';
    }
    const exterior = new THREE.Mesh(g.exterior, this.matCasco);
    exterior.castShadow = true;
    this.grupo.add(exterior);
    this.materiales.push(this.matCasco);

    if (g.interior && g.borde) {
      const espuma = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.95, side: THREE.DoubleSide });
      const canto = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.5, side: THREE.DoubleSide });
      this.materiales.push(espuma, canto);
      this.grupo.add(new THREE.Mesh(g.interior, espuma), new THREE.Mesh(g.borde, canto));
    }

    if (g.correas && g.hebilla) {
      const correa = new THREE.MeshStandardMaterial({ color: '#16171b', roughness: 0.7, side: THREE.DoubleSide });
      const plastico = new THREE.MeshStandardMaterial({ color: '#0e0f12', roughness: 0.35 });
      this.materiales.push(correa, plastico);
      this.grupo.add(new THREE.Mesh(g.correas, correa), new THREE.Mesh(g.hebilla, plastico));
    }

    if (g.visera) {
      this.matVisera = new THREE.MeshPhysicalMaterial({
        color: tipo === 'gorra' ? colores.acento : colores.casco,
        roughness: tipo === 'gorra' ? 0.85 : 0.35,
        clearcoat: tipo === 'gorra' ? 0 : 1,
        side: THREE.DoubleSide,
      });
      this.materiales.push(this.matVisera);
      const v = new THREE.Mesh(g.visera, this.matVisera);
      v.castShadow = true;
      this.grupo.add(v);
    }

    if (g.pantalla) {
      const cristal = new THREE.MeshPhysicalMaterial({
        color: '#1b2a3a',
        metalness: 0.85,
        roughness: 0.04,
        transparent: true,
        opacity: 0.78,
        iridescence: 1,
        iridescenceIOR: 1.6,
        side: THREE.DoubleSide,
      });
      this.materiales.push(cristal);
      this.grupo.add(new THREE.Mesh(g.pantalla, cristal));
    }

    if (g.gafas) {
      const lente = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#0c1016').lerp(new THREE.Color(colores.acento), 0.25),
        metalness: 0.9,
        roughness: 0.05,
        iridescence: 0.8,
        iridescenceIOR: 1.5,
        side: THREE.DoubleSide,
      });
      this.matMontura = new THREE.MeshPhysicalMaterial({ color: '#17181c', roughness: 0.35, clearcoat: 0.6 });
      this.materiales.push(lente, this.matMontura);
      this.grupo.add(new THREE.Mesh(g.gafas.lente, lente), new THREE.Mesh(g.gafas.montura, this.matMontura));
    }
  }

  actualizarColores(c: ColoresCasco) {
    this.matCasco.color.set(c.casco);
    (this.uniformes.uAcento.value as THREE.Color).set(c.acento);
    this.matVisera?.color.set(this.tipo === 'gorra' ? c.acento : c.casco);
  }

  private shaderCasco(s: THREE.WebGLProgramParametersWithUniforms) {
    Object.assign(s.uniforms, this.uniformes);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCasco;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCasco = position;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCasco;
        uniform vec3 uCentro, uBorde, uAcento;
        uniform vec4 uRej[${MAX_REJILLAS}];
        uniform float uCurva[${MAX_REJILLAS}];
        uniform int uNRej;
        uniform float uBanda, uTela;
        float bordeCasco( float az ) {
          float k = ( 1.0 - cos( az ) ) * 0.5;
          return uBorde.x * 2.0 * ( k - 0.5 ) * ( k - 1.0 ) - uBorde.y * 4.0 * k * ( k - 1.0 ) + uBorde.z * 2.0 * k * ( k - 0.5 );
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 dC = normalize( vCasco - uCentro );
        float latC = degrees( asin( clamp( dC.x, -1.0, 1.0 ) ) );
        float lonC = degrees( atan( dC.z, dC.y ) );
        float cosLat = cos( radians( latC ) );
        // Rejillas: cápsulas en coordenadas (latitud, longitud); se recortan con antialias
        float sd = 1e3;
        for ( int i = 0; i < ${MAX_REJILLAS}; i++ ) {
          if ( i >= uNRej ) break;
          vec4 r = uRej[ i ];
          for ( int lado = 0; lado < 2; lado++ ) {
            float s = lado == 0 ? 1.0 : -1.0;
            if ( lado == 1 && r.x == 0.0 ) break;
            float centroLat = s * ( r.x + uCurva[ i ] * ( lonC - ( r.y + r.z ) * 0.5 ) / 30.0 );
            float t = clamp( lonC, r.y, r.z );
            float ancho = r.w * mix( 0.75, 1.1, ( t - r.y ) / max( r.z - r.y, 1.0 ) );
            vec2 q = vec2( latC - centroLat, ( lonC - t ) * cosLat );
            sd = min( sd, length( q ) - ancho );
          }
        }
        float cobertura = clamp( sd / max( fwidth( sd ), 1e-4 ) + 0.5, 0.0, 1.0 );
        if ( cobertura < 0.01 ) discard;
        diffuseColor.a = cobertura;
        // Bisel oscuro alrededor de cada rejilla
        diffuseColor.rgb *= mix( 0.62, 1.0, smoothstep( 0.0, 1.0, sd ) );
        // Banda inferior de otro color (con filete fino)
        float azC = atan( dC.x, dC.z );
        float polarC = acos( clamp( dC.y, -1.0, 1.0 ) );
        float bordeC = bordeCasco( azC );
        float fw = fwidth( polarC );
        float banda = smoothstep( bordeC - uBanda - fw, bordeC - uBanda + fw, polarC ) * step( 0.001, uBanda );
        float filete = smoothstep( bordeC - uBanda - 0.035 - fw, bordeC - uBanda - 0.035 + fw, polarC ) * ( 1.0 - smoothstep( bordeC - uBanda - 0.022 - fw, bordeC - uBanda - 0.022 + fw, polarC ) ) * step( 0.001, uBanda );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05 ), banda );
        diffuseColor.rgb = mix( diffuseColor.rgb, uAcento, filete );
        // Gorra: franjas del color de acento y costuras
        if ( uTela > 0.5 ) {
          float franja = 1.0 - smoothstep( 5.0, 5.0 + fwidth( latC ) * 1.5, abs( latC ) );
          float franja2 = smoothstep( 17.0, 17.0 + fwidth( latC ), abs( latC ) ) * ( 1.0 - smoothstep( 23.0, 23.0 + fwidth( latC ), abs( latC ) ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, uAcento, max( franja, franja2 ) );
          float costura = 1.0 - smoothstep( 0.0, 0.8, min( abs( abs( latC ) - 36.0 ), abs( abs( latC ) - 11.0 ) ) );
          diffuseColor.rgb *= 1.0 - 0.3 * costura;
          diffuseColor.rgb *= 1.0 - 0.35 * smoothstep( bordeC - 0.05, bordeC, polarC );
        }
        if ( !gl_FrontFacing ) diffuseColor.rgb = vec3( 0.07 );`,
      );
  }

  destruir() {
    this.materiales.forEach((m) => m.dispose());
    this.grupo.removeFromParent();
  }
}

/**
 * Código GLSL para el pelo: descarta lo que quedaría por encima del borde del casco
 * (así ningún peinado atraviesa el casco). Necesita `vPelo` = posición en reposo.
 */
export const GLSL_RECORTE_PELO = `
  vec3 dP = normalize( vPelo - uCascoCentro );
  float azP = atan( dP.x, dP.z );
  float kP = ( 1.0 - cos( azP ) ) * 0.5;
  float bordeP = uCascoBorde.x * 2.0 * ( kP - 0.5 ) * ( kP - 1.0 ) - uCascoBorde.y * 4.0 * kP * ( kP - 1.0 ) + uCascoBorde.z * 2.0 * kP * ( kP - 0.5 );
  if ( uCascoActivo > 0.5 && acos( clamp( dP.y, -1.0, 1.0 ) ) < bordeP - 0.03 ) discard;
`;
