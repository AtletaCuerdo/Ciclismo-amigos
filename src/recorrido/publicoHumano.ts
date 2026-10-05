/**
 * Público de cerca con cuerpos humanos de verdad (los mismos modelos que el ciclista: cara,
 * ojos, cejas, pelo y barba).
 *
 * Los cuerpos tienen esqueleto, pero animar decenas de esqueletos sería caro (sobre todo en el
 * iPad). Así que cada gesto se «hornea» una vez en dos posturas fijas (A y B) y el shader va y
 * viene entre ellas (brazos agitándose, manos aplaudiendo). Todo se dibuja con mallas
 * instanciadas: la ropa (camiseta, pantalón o pantalón corto, zapatillas) se elige por el hueso
 * que mueve cada vértice y su color va por persona.
 *
 * Solo se dibujan así las personas más cercanas al ciclista; las demás siguen siendo las figuras
 * sencillas de escena.ts (de lejos no se nota).
 */
import * as THREE from 'three';
import { clone as clonarConEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Sexo } from './avatar';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIEL_REFERENCIA, mallaCuerpo, type Plantillas } from './ciclistaHumano';
import { geometriaZapatilla } from './zapatilla';

/** Gestos: 0 brazos arriba agitándolos, 1 aplaudiendo, 2 brazos abajo (mirando). */
export const GESTOS_HUMANOS = 3;

/** Peinados del público por sexo (archivos de modelos/ciclista). */
const PEINADOS: Record<Sexo, string[]> = {
  hombre: ['pelo_simpleparted', 'pelo_buzzed'],
  mujer: ['pelo_long', 'pelo_buns'],
};

/** Una persona cercana tal como la pide escena.ts en cada imagen. */
export interface PersonaCercana {
  matriz: THREE.Matrix4;
  sexo: Sexo;
  gesto: number;
  peinado: number; // índice en PEINADOS[sexo]
  barba: boolean;
  fase: number;
  ritmo: number; // 0: quieto
  corto: boolean; // pantalón corto
  camiseta: THREE.Color;
  pantalon: THREE.Color;
  zapatillas: THREE.Color;
  piel: THREE.Color;
  pelo: THREE.Color;
}

/**
 * Ropa según los huesos que mueven cada vértice (mezclando sus pesos, sin bordes de dientes):
 * [camiseta, pantalón, zapatillas, tronco, gemelo]. El tronco es camiseta o pantalón según la
 * altura (la cintura se corta en el shader, recta); el gemelo es pantalón o piel si va de corto.
 * Lo que queda es piel: cabeza, cuello, antebrazos y manos.
 */
function zonasDeHueso(n: string): [number, number, number, number, number] {
  if (/spine_0[23]|clavicle|upperarm/i.test(n)) return [1, 0, 0, 0, 0];
  if (/spine|pelvis/i.test(n)) return [0, 0, 0, 1, 0];
  if (/thigh/i.test(n)) return [0, 1, 0, 0, 0];
  if (/foot|ball/i.test(n)) return [0, 0, 1, 0, 0];
  if (/calf/i.test(n)) return [0, 0, 0, 0, 1];
  return [0, 0, 0, 0, 0];
}

/**
 * Hornea una malla con esqueleto en su postura actual: posiciones y normales en coordenadas de
 * la raíz (que está en el origen), como hace la GPU con el skinning.
 */
function hornear(m: THREE.SkinnedMesh, conZonas: boolean) {
  m.updateMatrixWorld(true);
  m.skeleton.update();
  const g = m.geometry;
  const P = g.attributes.position;
  const N = g.attributes.normal;
  const J = g.attributes.skinIndex;
  const W = g.attributes.skinWeight;
  const n = P.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const zonas = conZonas ? new Float32Array(n * 4) : null;
  const gemelo = conZonas ? new Float32Array(n) : null;
  const altura = conZonas ? new Float32Array(n) : null;
  const porHueso = m.skeleton.bones.map((b) => zonasDeHueso(b.name));
  const bm = m.skeleton.boneMatrices!;
  const final = new THREE.Matrix4().multiplyMatrices(m.matrixWorld, m.bindMatrixInverse);
  const M = new THREE.Matrix4();
  const total = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const e = M.elements;
  for (let i = 0; i < n; i++) {
    e.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = W.getComponent(i, k);
      if (w === 0) continue;
      const j = J.getComponent(i, k);
      for (let c = 0; c < 16; c++) e[c] += w * bm[j * 16 + c];
      if (zonas && gemelo) {
        const z = porHueso[j];
        for (let c = 0; c < 4; c++) zonas[i * 4 + c] += w * z[c];
        gemelo[i] += w * z[4];
      }
    }
    if (altura) altura[i] = P.getY(i);
    total.multiplyMatrices(final, M).multiply(m.bindMatrix);
    v.fromBufferAttribute(P, i).applyMatrix4(total);
    pos.set([v.x, v.y, v.z], i * 3);
    nm.getNormalMatrix(total);
    v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
    nor.set([v.x, v.y, v.z], i * 3);
  }
  return { pos, nor, zonas, gemelo, altura };
}

/** Geometría estática a partir de lo horneado (mismos índices y UV que la malla original). */
function geometriaHorneada(m: THREE.SkinnedMesh, h: ReturnType<typeof hornear>) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(h.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(h.nor, 3));
  if (m.geometry.attributes.uv) g.setAttribute('uv', m.geometry.attributes.uv);
  if (m.geometry.index) g.setIndex(m.geometry.index);
  if (h.zonas) g.setAttribute('zonas', new THREE.BufferAttribute(h.zonas, 4));
  if (h.gemelo && h.altura) {
    const extra = new Float32Array(h.gemelo.length * 2);
    h.gemelo.forEach((v, i) => extra.set([v, h.altura![i]], i * 2));
    g.setAttribute('extra', new THREE.BufferAttribute(extra, 2));
  }
  return g;
}

/** Postura: dirección (coordenadas del cuerpo; +Z hacia delante) del brazo y del antebrazo. */
type Postura = { brazo: THREE.Vector3; antebrazo: THREE.Vector3 };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();
/** [A, B] por gesto; x positiva = hacia fuera. */
const POSTURAS: [Postura, Postura][] = [
  [
    { brazo: V(0.5, 0.85, 0.15), antebrazo: V(0.35, 0.93, 0.1) },
    { brazo: V(0.78, 0.6, 0.15), antebrazo: V(0.72, 0.68, 0.1) },
  ],
  [
    { brazo: V(0.32, -0.5, 0.8), antebrazo: V(-0.25, 0.25, 0.93) },
    { brazo: V(0.25, -0.5, 0.83), antebrazo: V(-0.75, 0.2, 0.62) },
  ],
  [
    { brazo: V(0.12, -0.99, 0.03), antebrazo: V(0.06, -0.95, 0.3) },
    { brazo: V(0.12, -0.99, 0.03), antebrazo: V(0.06, -0.95, 0.3) },
  ],
];

/** Gira el hueso para que apunte (hacia su hijo) en la dirección dada, en coordenadas de la raíz. */
function apuntar(raiz: THREE.Object3D, h: THREE.Bone, hijo: THREE.Bone, dir: THREE.Vector3) {
  raiz.updateMatrixWorld(true);
  const a = h.getWorldPosition(new THREE.Vector3());
  const actual = hijo.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
  const giro = new THREE.Quaternion().setFromUnitVectors(actual, dir);
  const mundo = h.getWorldQuaternion(new THREE.Quaternion());
  const padre = h.parent!.getWorldQuaternion(new THREE.Quaternion());
  h.quaternion.copy(padre.invert().multiply(giro.multiply(mundo)));
}

function posar(raiz: THREE.Object3D, cuerpo: THREE.SkinnedMesh, p: Postura) {
  const hueso = (n: string) => cuerpo.skeleton.bones.find((b) => b.name === n)!;
  raiz.updateMatrixWorld(true);
  for (const lado of ['l', 'r'] as const) {
    const brazo = hueso(`upperarm_${lado}`);
    const fuera = Math.sign(brazo.getWorldPosition(new THREE.Vector3()).x) || 1;
    const d = (v: THREE.Vector3) => new THREE.Vector3(v.x * fuera, v.y, v.z);
    apuntar(raiz, brazo, hueso(`lowerarm_${lado}`), d(p.brazo));
    apuntar(raiz, hueso(`lowerarm_${lado}`), hueso(`hand_${lado}`), d(p.antebrazo));
  }
  raiz.updateMatrixWorld(true);
}

/** Material del cuerpo: piel con textura y la ropa con el color de cada persona. */
function materialCuerpo(base: THREE.MeshPhysicalMaterial, uTiempo: { value: number }, cintura: number) {
  const m = new THREE.MeshStandardMaterial({
    map: base.map,
    normalMap: base.normalMap,
    roughnessMap: base.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTiempo = uTiempo;
    s.uniforms.uCintura = { value: cintura };
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTiempo;
        attribute vec3 posB, norB;
        attribute vec4 zonas;
        attribute vec2 extra; // gemelo, altura en reposo
        attribute vec3 aCamiseta, aPantalon, aPiel;
        attribute vec4 aAnim; // fase, ritmo, pantalón corto, gris de las zapatillas
        varying vec4 vZonas;
        varying vec3 vCamiseta, vPantalon, vZapatillas, vPiel;
        varying float vGemelo, vAltura;
        float pesoB() { return aAnim.y > 0.0 ? 0.5 + 0.5 * sin(uTiempo * aAnim.y + aAnim.x) : 0.0; }`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(normal, norB, pesoB()));')
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = mix(position, posB, pesoB());
        vZonas = zonas;
        vGemelo = extra.x * (1.0 - aAnim.z);
        vAltura = extra.y;
        vCamiseta = aCamiseta; vPantalon = aPantalon; vZapatillas = vec3(aAnim.w); vPiel = aPiel;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uCintura;
        varying vec4 vZonas;
        varying vec3 vCamiseta, vPantalon, vZapatillas, vPiel;
        varying float vGemelo, vAltura;
        float vEsPiel;`,
      )
      .replace(
        '#include <map_fragment>',
        // La piel: textura teñida al tono de la persona; la ropa, color liso algo mate
        `#include <map_fragment>
        float arriba = step(uCintura, vAltura);
        float cam = vZonas.x + vZonas.w * arriba;
        float pan = vZonas.y + vZonas.w * (1.0 - arriba) + vGemelo;
        float zap = vZonas.z;
        // Bordes limpios: cada píxel es de una prenda o de piel
        float ropa = cam + pan + zap;
        vEsPiel = step(ropa, 0.5);
        vec3 prenda = cam >= pan && cam >= zap ? vCamiseta : pan >= zap ? vPantalon : vZapatillas;
        diffuseColor.rgb = mix(prenda, diffuseColor.rgb * vPiel, vEsPiel);`,
      )
      .replace(
        // La ropa no marca los músculos del modelo (el mapa de normales es de piel)
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize(mix(nonPerturbedNormal, normal, 0.15 + 0.85 * vEsPiel));',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.85, roughnessFactor, vEsPiel);',
      );
  };
  m.customProgramCacheKey = () => 'publico-humano-4';
  return m;
}

interface Capa {
  malla: THREE.InstancedMesh;
  usadas: number;
  atributos?: Record<string, THREE.InstancedBufferAttribute>;
}

export class PublicoHumano {
  readonly grupo = new THREE.Group();
  private uTiempo = { value: 0 };
  /** Cuerpos por sexo y gesto. */
  private cuerpos = new Map<string, Capa>();
  /** Ojos, cejas, peinados y barba por sexo (la cabeza es igual en todos los gestos). */
  private cabezas = new Map<string, Capa>();
  private materiales: THREE.Material[] = [];

  constructor(
    p: Plantillas,
    readonly maximo: number,
    sombras: boolean,
  ) {
    const capa = (geo: THREE.BufferGeometry, mat: THREE.Material, conAtributos: boolean): Capa => {
      const malla = new THREE.InstancedMesh(geo, mat, maximo);
      malla.count = 0;
      malla.frustumCulled = false;
      malla.castShadow = sombras;
      malla.receiveShadow = true;
      this.grupo.add(malla);
      const c: Capa = { malla, usadas: 0 };
      if (conAtributos) {
        c.atributos = {};
        for (const n of ['aCamiseta', 'aPantalon', 'aPiel', 'aAnim']) {
          const t = n === 'aAnim' ? 4 : 3;
          const a = new THREE.InstancedBufferAttribute(new Float32Array(maximo * t), t);
          a.setUsage(THREE.DynamicDrawUsage);
          geo.setAttribute(n, a);
          c.atributos[n] = a;
        }
      }
      return c;
    };

    for (const sexo of ['hombre', 'mujer'] as Sexo[]) {
      const sk = mallaCuerpo(p.cuerpos[sexo]).skeleton;
      const iCadera = sk.bones.findIndex((b) => b.name === 'thigh_l');
      const yCadera = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[iCadera].clone().invert()).y;
      const matCuerpo = materialCuerpo(p.materialBase[sexo], this.uTiempo, yCadera + 0.09);
      this.materiales.push(matCuerpo);
      for (let gesto = 0; gesto < GESTOS_HUMANOS; gesto++) {
        const horneados = POSTURAS[gesto].map((postura) => {
          const raiz = clonarConEsqueleto(p.cuerpos[sexo]);
          const cuerpo = mallaCuerpo(raiz);
          posar(raiz, cuerpo, postura);
          return { cuerpo, h: hornear(cuerpo, true), raiz };
        });
        const geo = geometriaHorneada(horneados[0].cuerpo, horneados[0].h);
        geo.setAttribute('posB', new THREE.BufferAttribute(horneados[1].h.pos, 3));
        geo.setAttribute('norB', new THREE.BufferAttribute(horneados[1].h.nor, 3));
        this.cuerpos.set(`${sexo}-${gesto}`, capa(geo, matCuerpo, true));

        // La cabeza (ojos, cejas, pelo) se hornea una vez, con la postura de brazos abajo
        if (gesto !== 2) continue;
        const { raiz, cuerpo } = horneados[1];
        raiz.traverse((o) => {
          if (!(o instanceof THREE.SkinnedMesh) || o === cuerpo) return;
          const nombreMat = (o.material as THREE.Material).name;
          const esPelo = /hair/i.test(nombreMat);
          const mat = (o.material as THREE.MeshStandardMaterial).clone();
          if (esPelo) Object.assign(mat, { color: new THREE.Color(1, 1, 1), alphaTest: 0.5, transparent: false });
          this.materiales.push(mat);
          this.cabezas.set(`${sexo}-${esPelo ? 'cejas' : 'ojos'}`, capa(geometriaHorneada(o, hornear(o, false)), mat, false));
        });
        // Zapatillas de verdad (las del ciclista: las piernas están en reposo, así que encajan)
        const zapas = mergeGeometries(
          (['l', 'r'] as const).map((lado) => {
            const g = geometriaZapatilla(cuerpo, sexo, lado).clone();
            for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
            return g;
          }),
        );
        if (zapas) {
          const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
          this.materiales.push(mat);
          this.cabezas.set(`${sexo}-zapatillas`, capa(zapas, mat, false));
        }
        const extras = [...PEINADOS[sexo], ...(sexo === 'hombre' ? ['pelo_beard'] : [])];
        extras.forEach((archivo) => {
          const plantilla = p.pelos[archivo];
          if (!plantilla) return;
          const pelo = plantilla.clone() as THREE.SkinnedMesh;
          cuerpo.parent!.add(pelo);
          pelo.bind(cuerpo.skeleton, pelo.bindMatrix);
          raiz.updateMatrixWorld(true);
          const mat = (plantilla.material as THREE.MeshStandardMaterial).clone();
          Object.assign(mat, { color: new THREE.Color(1, 1, 1), alphaTest: 0.5, transparent: false, side: THREE.DoubleSide });
          mat.roughness = 0.65;
          mat.normalMap = archivo === 'pelo_long' || archivo === 'pelo_buns' ? p.normalPelo.pelo_2 : p.normalPelo.pelo_1;
          this.materiales.push(mat);
          this.cabezas.set(`${sexo}-${archivo}`, capa(geometriaHorneada(pelo, hornear(pelo, false)), mat, false));
        });
      }
    }
  }

  /** Coloca a las personas cercanas de esta imagen (como mucho `maximo`). */
  actualizar(personas: PersonaCercana[], tiempo: number) {
    this.uTiempo.value = tiempo;
    for (const c of [...this.cuerpos.values(), ...this.cabezas.values()]) c.usadas = 0;
    const tono = new THREE.Color();
    const poner = (c: Capa | undefined, m: THREE.Matrix4, color?: THREE.Color) => {
      if (!c || c.usadas >= this.maximo) return -1;
      const i = c.usadas++;
      c.malla.setMatrixAt(i, m);
      if (color) c.malla.setColorAt(i, color);
      return i;
    };
    for (const p of personas.slice(0, this.maximo)) {
      const cuerpo = this.cuerpos.get(`${p.sexo}-${p.gesto}`);
      const i = poner(cuerpo, p.matriz);
      if (i >= 0 && cuerpo?.atributos) {
        const A = cuerpo.atributos;
        A.aCamiseta.setXYZ(i, p.camiseta.r, p.camiseta.g, p.camiseta.b);
        A.aPantalon.setXYZ(i, p.pantalon.r, p.pantalon.g, p.pantalon.b);
        // Tinte de la piel respecto al tono de la textura
        A.aPiel.setXYZ(i, p.piel.r / PIEL_REFERENCIA.r, p.piel.g / PIEL_REFERENCIA.g, p.piel.b / PIEL_REFERENCIA.b);
        A.aAnim.setXYZW(i, p.fase, p.ritmo, p.corto ? 1 : 0, p.zapatillas.r * 0.3 + p.zapatillas.g * 0.59 + p.zapatillas.b * 0.11);
      }
      poner(this.cabezas.get(`${p.sexo}-ojos`), p.matriz);
      poner(this.cabezas.get(`${p.sexo}-zapatillas`), p.matriz, p.zapatillas);
      poner(this.cabezas.get(`${p.sexo}-cejas`), p.matriz, p.pelo);
      poner(this.cabezas.get(`${p.sexo}-${PEINADOS[p.sexo][p.peinado]}`), p.matriz, p.pelo);
      if (p.barba && p.sexo === 'hombre') poner(this.cabezas.get('hombre-pelo_beard'), p.matriz, tono.copy(p.pelo));
    }
    for (const c of [...this.cuerpos.values(), ...this.cabezas.values()]) {
      c.malla.count = c.usadas;
      if (!c.usadas) continue;
      c.malla.instanceMatrix.needsUpdate = true;
      if (c.malla.instanceColor) c.malla.instanceColor.needsUpdate = true;
      if (c.atributos) for (const a of Object.values(c.atributos)) a.needsUpdate = true;
    }
  }

  liberar() {
    for (const m of this.grupo.children as THREE.InstancedMesh[]) m.geometry.dispose();
    for (const m of this.materiales) m.dispose();
  }
}

/** Número de peinados por sexo (para elegir uno al azar). */
export const peinadosDe = (sexo: Sexo) => PEINADOS[sexo].length;
