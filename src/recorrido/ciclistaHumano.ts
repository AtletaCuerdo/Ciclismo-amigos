/**
 * Ciclista humano con esqueleto (Universal Base Characters de Quaternius, CC0).
 *
 * - La equipación se pinta en el propio cuerpo según el hueso que mueve cada vértice
 *   (tronco → maillot con franja, muslos → culotte, manos → guantes, pies → zapatillas…),
 *   así los colores del avatar se aplican sin necesidad de modelos de ropa.
 * - Peinados, barba y cejas son mallas aparte que se enganchan al mismo esqueleto.
 * - Casco y gafas se construyen por código y se cuelgan del hueso de la cabeza.
 * - En cada imagen se coloca el cuerpo en la bici con cinemática inversa:
 *   las piernas siguen a los pedales y los brazos van al manillar.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarConEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Avatar, Casco, Peinado } from './avatar';
import { rutaPublica } from './recursos';

// ---------------------------------------------------------------------------
// Plantillas (se cargan una vez y se clonan para cada ciclista)
// ---------------------------------------------------------------------------

const ARCHIVOS_PELO: Record<Exclude<Peinado, 'calvo'>, { hombre: string; mujer: string }> = {
  rapado: { hombre: 'pelo_buzzed', mujer: 'pelo_buzzedfemale' },
  corto: { hombre: 'pelo_simpleparted', mujer: 'pelo_simpleparted' },
  largo: { hombre: 'pelo_long', mujer: 'pelo_long' },
  monos: { hombre: 'pelo_buns', mujer: 'pelo_buns' },
};

interface Plantillas {
  cuerpos: Record<'hombre' | 'mujer', THREE.Group>;
  pelos: Record<string, THREE.SkinnedMesh>;
  materialBase: Record<'hombre' | 'mujer', THREE.MeshStandardMaterial>;
}

let plantillas: Plantillas | null = null;
let promesa: Promise<Plantillas> | null = null;

/** Devuelve las plantillas si ya están cargadas (sin esperar). */
export function plantillasHumanas() {
  return plantillas;
}

async function cargarGltf(nombre: string) {
  return new GLTFLoader().loadAsync(rutaPublica(`modelos/ciclista/${nombre}.gltf`));
}

/** Carga cuerpos y peinados (unos 3 MB en total, se hace una sola vez). */
export function cargarPlantillasHumanas(): Promise<Plantillas> {
  if (!promesa) {
    promesa = (async () => {
      const nombresPelo = [...new Set(Object.values(ARCHIVOS_PELO).flatMap((p) => [p.hombre, p.mujer])), 'pelo_beard'];
      const [hombre, mujer, ...pelos] = await Promise.all([
        cargarGltf('cuerpo_hombre'),
        cargarGltf('cuerpo_mujer'),
        ...nombresPelo.map(cargarGltf),
      ]);
      const p: Plantillas = {
        cuerpos: { hombre: hombre.scene, mujer: mujer.scene },
        pelos: {},
        materialBase: {
          hombre: prepararCuerpo(hombre.scene),
          mujer: prepararCuerpo(mujer.scene),
        },
      };
      nombresPelo.forEach((n, i) => {
        let malla: THREE.SkinnedMesh | null = null;
        pelos[i].scene.traverse((o) => {
          if (o instanceof THREE.SkinnedMesh && !malla) malla = o;
        });
        if (malla) p.pelos[n] = malla;
      });
      plantillas = p;
      return p;
    })();
  }
  return promesa;
}

/** Malla del cuerpo (la que usa la textura de piel). */
function mallaCuerpo(raiz: THREE.Object3D) {
  let cuerpo: THREE.SkinnedMesh | null = null;
  raiz.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && /Superhero|SuperHero/i.test((o.material as THREE.Material).name + o.name)) {
      cuerpo = o;
    }
  });
  if (!cuerpo) throw new Error('No se encontró la malla del cuerpo');
  return cuerpo as THREE.SkinnedMesh;
}

/**
 * Asigna a cada vértice una zona de la equipación según su hueso principal
 * (0 piel, 1 maillot, 2 franja, 3 culotte, 4 guantes, 5 zapatillas, 6 calcetín)
 * y crea el material que las pinta.
 */
function prepararCuerpo(raiz: THREE.Group) {
  raiz.updateMatrixWorld(true);
  const cuerpo = mallaCuerpo(raiz);
  const huesos = cuerpo.skeleton.bones;
  const posHueso = (n: string) => {
    const h = huesos.find((b) => b.name === n);
    return h ? h.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  };
  const segmento = (a: string, b: string) => [posHueso(a), posHueso(b)] as const;
  const t = (p: THREE.Vector3, [a, b]: readonly [THREE.Vector3, THREE.Vector3]) => {
    const ab = b.clone().sub(a);
    return p.clone().sub(a).dot(ab) / ab.lengthSq();
  };
  const muslo = { l: segmento('thigh_l', 'calf_l'), r: segmento('thigh_r', 'calf_r') };
  const gemelo = { l: segmento('calf_l', 'foot_l'), r: segmento('calf_r', 'foot_r') };
  const brazo = { l: segmento('upperarm_l', 'lowerarm_l'), r: segmento('upperarm_r', 'lowerarm_r') };
  const yPelvis = posHueso('pelvis').y;
  const yCuello = posHueso('neck_01').y;

  const geo = cuerpo.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const indices = geo.attributes.skinIndex as THREE.BufferAttribute;
  const pesos = geo.attributes.skinWeight as THREE.BufferAttribute;
  const zonas = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    // Hueso con más peso
    let mejor = 0;
    let hueso = 0;
    for (let k = 0; k < 4; k++) {
      const w = pesos.getComponent(i, k);
      if (w > mejor) {
        mejor = w;
        hueso = indices.getComponent(i, k);
      }
    }
    const nombre = huesos[hueso]?.name ?? '';
    const lado = nombre.endsWith('_l') ? 'l' : 'r';
    p.fromBufferAttribute(pos, i).applyMatrix4(cuerpo.matrixWorld);
    let z = 0;
    if (/^(spine_0[123]|clavicle_)/.test(nombre)) z = 1;
    else if (nombre === 'pelvis') z = 3;
    else if (nombre.startsWith('thigh_')) z = t(p, muslo[lado]) < 0.8 ? 3 : 0;
    else if (nombre.startsWith('upperarm_')) z = t(p, brazo[lado]) < 0.55 ? 1 : 0;
    else if (/^(hand_|index_|middle_|pinky_|ring_|thumb_)/.test(nombre)) z = 4;
    else if (/^(foot_|ball_)/.test(nombre)) z = 5;
    else if (nombre.startsWith('calf_')) z = t(p, gemelo[lado]) > 0.8 ? 6 : 0;
    zonas[i] = z;
  }
  geo.setAttribute('zona', new THREE.BufferAttribute(zonas, 1));

  const original = cuerpo.material as THREE.MeshStandardMaterial;
  const material = new THREE.MeshStandardMaterial({ map: original.map, roughness: 0.75, metalness: 0 });
  material.name = 'CuerpoCiclista';
  // La franja se calcula por píxel con la altura en reposo (así sale una banda limpia)
  material.userData.franja = [yPelvis + (yCuello - yPelvis) * 0.5, yPelvis + (yCuello - yPelvis) * 0.64];
  return material;
}

// ---------------------------------------------------------------------------
// Material con la equipación
// ---------------------------------------------------------------------------

/** Tono de referencia de la textura de piel (el más claro de la paleta). */
const PIEL_REFERENCIA = new THREE.Color('#f3d2b3');

function materialEquipacion(base: THREE.MeshStandardMaterial) {
  const m = base.clone();
  const uniformes = {
    uTono: { value: new THREE.Color(1, 1, 1) },
    uMaillot: { value: new THREE.Color() },
    uFranja: { value: new THREE.Color() },
    uCulotte: { value: new THREE.Color() },
    uGuantes: { value: new THREE.Color('#1c1c1f') },
    uZapatillas: { value: new THREE.Color('#202125') },
    uCalcetin: { value: new THREE.Color('#ffffff') },
    uFranjaY: { value: new THREE.Vector2(...((base.userData.franja as [number, number]) ?? [1.2, 1.28])) },
  };
  m.userData.uniformes = uniformes;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformes);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float zona;\nvarying float vZona;\nvarying float vAlturaReposo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZona = zona;\nvAlturaReposo = position.y;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vZona;
        varying float vAlturaReposo;
        uniform vec3 uTono, uMaillot, uFranja, uCulotte, uGuantes, uZapatillas, uCalcetin;
        uniform vec2 uFranjaY;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Los pliegues y volúmenes de la textura se conservan en la ropa
        float pliegue = clamp( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / 0.42, 0.72, 1.12 );
        int zonaI = int( vZona + 0.5 );
        if ( zonaI == 1 && vAlturaReposo > uFranjaY.x && vAlturaReposo < uFranjaY.y ) zonaI = 2;
        if ( zonaI == 0 ) diffuseColor.rgb *= uTono;
        else if ( zonaI == 1 ) diffuseColor.rgb = uMaillot * pliegue;
        else if ( zonaI == 2 ) diffuseColor.rgb = uFranja * pliegue;
        else if ( zonaI == 3 ) diffuseColor.rgb = uCulotte * pliegue;
        else if ( zonaI == 4 ) diffuseColor.rgb = uGuantes * pliegue;
        else if ( zonaI == 5 ) diffuseColor.rgb = uZapatillas * pliegue;
        else diffuseColor.rgb = uCalcetin * pliegue;`,
      );
  };
  m.customProgramCacheKey = () => 'equipacion-ciclista';
  return m;
}

// ---------------------------------------------------------------------------
// Casco y gafas (en coordenadas del modelo en reposo: +Z delante, +Y arriba)
// ---------------------------------------------------------------------------

function crearCasco(tipo: Casco, color: THREE.Material, oscuro: THREE.Material, centro: THREE.Vector3) {
  const g = new THREE.Group();
  const cupula = (r: number, escala: [number, number, number], abertura = 0.55) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI * abertura), color);
    m.scale.set(...escala);
    m.castShadow = true;
    return m;
  };
  if (tipo === 'ruta') {
    const c = cupula(0.156, [0.97, 0.95, 1.22], 0.52);
    c.position.y = -0.012;
    c.rotation.x = -0.15;
    g.add(c);
    // Borde inferior oscuro (como la carcasa interior de los cascos de carretera)
    const borde = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.009, 6, 32), oscuro);
    borde.rotation.x = Math.PI / 2 - 0.15;
    borde.scale.set(0.97, 1.22, 1);
    borde.position.y = -0.004;
    g.add(borde);
  } else if (tipo === 'aero') {
    // Gota alargada hacia atrás, con la cola algo caída
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.128, 24, 16), color);
    c.scale.set(0.98, 0.9, 1.6);
    c.position.set(0, 0.0, -0.07);
    c.rotation.x = -0.3;
    c.castShadow = true;
    g.add(c);
    const visera = new THREE.Mesh(
      new THREE.CylinderGeometry(0.122, 0.122, 0.05, 20, 1, true, -Math.PI * 0.3, Math.PI * 0.6),
      oscuro,
    );
    visera.position.set(0, -0.055, 0.012);
    g.add(visera);
  } else if (tipo === 'clasico') {
    const c = cupula(0.156, [1.0, 0.98, 1.1], 0.56);
    c.position.y = -0.012;
    g.add(c);
    const visera = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.07), color);
    visera.position.set(0, 0.025, 0.155);
    visera.rotation.x = 0.25;
    g.add(visera);
  } else {
    // Gorra de ciclista clásica (algo más grande para que asome sobre el pelo)
    const c = cupula(0.15, [1.02, 0.95, 1.08], 0.5);
    c.position.y = -0.01;
    g.add(c);
    const visera = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.07), color);
    visera.position.set(0, 0.0, 0.16);
    visera.rotation.x = -0.35;
    g.add(visera);
  }
  g.position.copy(centro);
  return g;
}

function crearGafas(material: THREE.Material, centro: THREE.Vector3) {
  const gafas = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.016, 6, 24, Math.PI * 0.62), material);
  gafas.rotation.set(Math.PI / 2, 0, Math.PI * 0.19 + Math.PI / 2);
  gafas.scale.set(1, 1, 0.8);
  gafas.position.copy(centro).add(new THREE.Vector3(0, -0.01, 0.0));
  return gafas;
}

// ---------------------------------------------------------------------------
// Cinemática inversa
// ---------------------------------------------------------------------------

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const q3 = new THREE.Quaternion();

/** Gira `hueso` para que su hijo `hacia` apunte a `objetivo` (todo en coordenadas del mundo). */
function apuntar(hueso: THREE.Bone, hacia: THREE.Object3D, objetivo: THREE.Vector3) {
  const origen = hueso.getWorldPosition(v1);
  const actual = hacia.getWorldPosition(v2).sub(origen).normalize();
  const deseada = v3.copy(objetivo).sub(origen).normalize();
  const giro = q1.setFromUnitVectors(actual, deseada);
  const mundo = hueso.getWorldQuaternion(q2);
  const padre = hueso.parent!.getWorldQuaternion(q3).invert();
  hueso.quaternion.copy(padre.multiply(giro.multiply(mundo)));
  hueso.updateMatrixWorld(true);
}

/** Articulación intermedia (rodilla/codo) de una cadena de dos huesos, doblada hacia `polo`. */
function articulacion3D(o: THREE.Vector3, fin: THREE.Vector3, l1: number, l2: number, polo: THREE.Vector3) {
  const dir = fin.clone().sub(o);
  const d = Math.min(Math.max(dir.length(), 1e-4), l1 + l2 - 1e-3);
  dir.normalize();
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const perp = polo.clone().addScaledVector(dir, -polo.dot(dir)).normalize();
  return o.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * Math.sqrt(1 - cosA * cosA));
}

// ---------------------------------------------------------------------------
// Jinete
// ---------------------------------------------------------------------------

export interface PosturaBici {
  cadera: THREE.Vector3; // coordenadas locales de la bici (+X delante, +Y arriba)
  hombro: THREE.Vector3;
  mano: THREE.Vector3;
  codo?: THREE.Vector3;
  cabra: boolean;
}

const ESCALA = 1.03;
const HUESOS = [
  'pelvis', 'spine_01', 'neck_01', 'Head',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r',
  'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
] as const;
type NombreHueso = (typeof HUESOS)[number];

export class JineteHumano {
  readonly raiz: THREE.Object3D;
  private huesos = {} as Record<NombreHueso, THREE.Bone>;
  private reposo = new Map<THREE.Bone, THREE.Quaternion>();
  private material: THREE.MeshStandardMaterial;
  private materialPelo: THREE.MeshStandardMaterial;
  private materialCasco: THREE.MeshStandardMaterial;
  private materiales: THREE.Material[] = [];
  private largos = { muslo: 0, gemelo: 0, brazo: 0, antebrazo: 0 };

  constructor(
    p: Plantillas,
    avatar: Avatar,
    private postura: PosturaBici,
    padre: THREE.Object3D,
  ) {
    const sexo = avatar.sexo;
    this.raiz = clonarConEsqueleto(p.cuerpos[sexo]);
    this.raiz.updateMatrixWorld(true);
    const cuerpo = mallaCuerpo(this.raiz);
    this.material = materialEquipacion(p.materialBase[sexo]);
    cuerpo.material = this.material;
    this.materialPelo = new THREE.MeshStandardMaterial({ color: avatar.colorPelo, roughness: 0.8 });
    this.materialCasco = new THREE.MeshStandardMaterial({ color: avatar.casco, roughness: 0.3 });
    const oscuro = new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.4 });
    const gafas = new THREE.MeshStandardMaterial({ color: '#0d0f14', roughness: 0.08, metalness: 0.7 });
    this.materiales.push(this.material, this.materialPelo, this.materialCasco, oscuro, gafas);

    // Cejas y demás mallas del cuerpo: cejas del color del pelo
    this.raiz.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (o !== cuerpo && /hair/i.test((o.material as THREE.Material).name)) {
          const pelo = (o.material as THREE.MeshStandardMaterial).clone();
          pelo.color.set(avatar.colorPelo);
          this.materiales.push(pelo);
          o.material = pelo;
        }
      }
    });

    for (const n of HUESOS) {
      const h = cuerpo.skeleton.bones.find((b) => b.name === n);
      if (!h) throw new Error(`Falta el hueso ${n}`);
      this.huesos[n] = h;
      this.reposo.set(h, h.quaternion.clone());
    }
    const H = this.huesos;
    const d = (a: THREE.Object3D, b: THREE.Object3D) =>
      a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3())) * ESCALA;
    this.largos = {
      muslo: d(H.thigh_l, H.calf_l),
      gemelo: d(H.calf_l, H.foot_l),
      brazo: d(H.upperarm_l, H.lowerarm_l),
      antebrazo: d(H.lowerarm_l, H.hand_l),
    };

    // Peinado y barba: se enganchan al esqueleto del cuerpo
    const engancharPelo = (archivo: string) => {
      const plantilla = p.pelos[archivo];
      if (!plantilla) return;
      const pelo = plantilla.clone() as THREE.SkinnedMesh;
      const mat = (plantilla.material as THREE.MeshStandardMaterial).clone();
      mat.color.set(avatar.colorPelo);
      mat.roughness = 0.85;
      this.materiales.push(mat);
      pelo.material = mat;
      pelo.castShadow = true;
      pelo.frustumCulled = false;
      cuerpo.parent!.add(pelo);
      pelo.bind(cuerpo.skeleton, pelo.bindMatrix);
    };
    // Bajo un casco, el pelo corto (que abulta por arriba) se sustituye por el rapado
    const peinado = avatar.pelo === 'corto' && avatar.cascoModelo !== 'gorra' ? 'rapado' : avatar.pelo;
    if (peinado !== 'calvo') engancharPelo(ARCHIVOS_PELO[peinado][sexo]);
    if (avatar.barba) engancharPelo('pelo_beard');

    // Casco y gafas colgados del hueso de la cabeza
    const cabeza = H.Head;
    const centro = cabeza.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.085, 0.02));
    const aLocal = cabeza.matrixWorld.clone().invert();
    const casco = crearCasco(avatar.cascoModelo, this.materialCasco, oscuro, centro);
    const lentes = crearGafas(gafas, centro.clone().add(new THREE.Vector3(0, 0, 0)));
    for (const o of [casco, lentes]) {
      o.applyMatrix4(aLocal);
      cabeza.add(o);
    }

    // Orientación: el modelo mira a +Z; la bici avanza en +X
    this.raiz.rotation.y = Math.PI / 2;
    this.raiz.scale.setScalar(ESCALA);
    this.raiz.updateMatrixWorld(true);
    padre.add(this.raiz);
    this.colocarCadera();
  }

  /** Coloca la pelvis de forma que las caderas queden sobre el sillín. */
  private colocarCadera() {
    this.raiz.position.set(0, 0, 0);
    this.raiz.updateMatrixWorld(true);
    const padre = this.raiz.parent!;
    const mitad = this.huesos.thigh_l
      .getWorldPosition(new THREE.Vector3())
      .add(this.huesos.thigh_r.getWorldPosition(new THREE.Vector3()))
      .multiplyScalar(0.5);
    const mitadLocal = padre.worldToLocal(mitad);
    this.raiz.position.copy(this.postura.cadera).sub(mitadLocal);
    this.raiz.updateMatrixWorld(true);
  }

  actualizarColores(a: Avatar) {
    const u = this.material.userData.uniformes;
    u.uMaillot.value.set(a.maillot);
    u.uFranja.value.set(a.franja);
    u.uCulotte.value.set(a.culotte);
    // Tono de piel relativo a la textura (que es de piel clara)
    const tono = new THREE.Color(a.piel);
    u.uTono.value.setRGB(
      Math.min(1.1, tono.r / PIEL_REFERENCIA.r),
      Math.min(1.1, tono.g / PIEL_REFERENCIA.g),
      Math.min(1.1, tono.b / PIEL_REFERENCIA.b),
    );
    this.materialCasco.color.set(a.casco);
  }

  /**
   * Coloca el cuerpo sobre la bici.
   * @param pedales posiciones de los pedales izquierdo y derecho (coordenadas de la bici)
   * @param anguloBiela para mover un poco los tobillos
   */
  posar(pedales: { izq: THREE.Vector3; der: THREE.Vector3 }, anguloBiela: number) {
    const H = this.huesos;
    const P = this.postura;
    const padre = this.raiz.parent!;
    padre.updateMatrixWorld(true);
    for (const [h, q] of this.reposo) h.quaternion.copy(q);
    this.raiz.updateMatrixWorld(true);
    const aMundo = (v: THREE.Vector3) => padre.localToWorld(v.clone());
    const dirMundo = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z).transformDirection(padre.matrixWorld);

    // Tronco inclinado hacia el manillar
    const cuello = P.hombro.clone().add(new THREE.Vector3(0.02, 0.07, 0));
    apuntar(H.spine_01, H.neck_01, aMundo(cuello));
    // Cabeza mirando al frente
    const pCuello = H.neck_01.getWorldPosition(new THREE.Vector3());
    apuntar(H.neck_01, H.Head, pCuello.add(dirMundo(P.cabra ? 0.62 : 0.48, P.cabra ? 0.78 : 0.88, 0)));

    // Brazos (izquierdo del modelo = lado -Z de la bici)
    for (const [lado, s] of [['l', -1], ['r', 1]] as const) {
      const hombro = H[`upperarm_${lado}`].getWorldPosition(new THREE.Vector3());
      const mano = aMundo(new THREE.Vector3(P.mano.x, P.mano.y, (P.cabra ? 0.075 : 0.2) * s));
      const codo = P.codo
        ? aMundo(new THREE.Vector3(P.codo.x, P.codo.y + 0.03, 0.11 * s))
        : articulacion3D(hombro, mano, this.largos.brazo, this.largos.antebrazo, dirMundo(-0.3, -1, 0.7 * s));
      apuntar(H[`upperarm_${lado}`], H[`lowerarm_${lado}`], codo);
      apuntar(H[`lowerarm_${lado}`], H[`hand_${lado}`], mano);
    }

    // Piernas siguiendo a los pedales, con las rodillas hacia delante
    for (const [lado, pedal, fase] of [['l', pedales.izq, Math.PI], ['r', pedales.der, 0]] as const) {
      const cadera = H[`thigh_${lado}`].getWorldPosition(new THREE.Vector3());
      const pie = aMundo(pedal.clone().add(new THREE.Vector3(-0.03, 0.06, 0)));
      const rodilla = articulacion3D(cadera, pie, this.largos.muslo, this.largos.gemelo, dirMundo(1, 0.3, 0));
      apuntar(H[`thigh_${lado}`], H[`calf_${lado}`], rodilla);
      apuntar(H[`calf_${lado}`], H[`foot_${lado}`], pie);
      // Punta del pie: algo hacia abajo, más en la parte baja del pedaleo
      const a = anguloBiela + fase;
      const inclinacion = -0.35 + 0.2 * Math.sin(a);
      const punta = H[`foot_${lado}`]
        .getWorldPosition(new THREE.Vector3())
        .add(dirMundo(Math.cos(inclinacion), Math.sin(inclinacion), 0).multiplyScalar(0.15));
      apuntar(H[`foot_${lado}`], H[`ball_${lado}`], punta);
    }
  }

  destruir() {
    this.materiales.forEach((m) => m.dispose());
    this.raiz.removeFromParent();
  }
}
