/**
 * Ciclista humano con esqueleto (Universal Base Characters de Quaternius, CC0).
 *
 * - La equipación se pinta en el propio cuerpo, píxel a píxel, a partir de la posición en
 *   reposo: cada píxel se asigna al hueso (segmento) más cercano y los cortes (mangas,
 *   culotte, calcetines, guantes…) son planos a lo largo de ese hueso, con bordes limpios.
 *   Incluye cremallera, cuello, puños, paneles laterales, bolsillos traseros y rotulación.
 * - Piel con mapa de normales y de rugosidad; la ropa con brillo de lycra (sheen).
 * - Peinados, barba y cejas son mallas aparte que se enganchan al mismo esqueleto; el pelo
 *   que quedaría por encima del casco se recorta en el shader.
 * - Casco, gafas y correas: ver equipamiento.ts.
 * - En cada imagen se coloca el cuerpo en la bici con cinemática inversa:
 *   las piernas siguen a los pedales y los brazos van al manillar.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarConEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Avatar, Peinado, Sexo } from './avatar';
import { EquipoCabeza, GLSL_RECORTE_PELO, medirCabeza, type MedidasCabeza } from './equipamiento';
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
  cuerpos: Record<Sexo, THREE.Group>;
  pelos: Record<string, THREE.SkinnedMesh>;
  materialBase: Record<Sexo, THREE.MeshPhysicalMaterial>;
  medidas: Record<Sexo, MedidasCabeza>;
  normalPelo: Record<string, THREE.Texture>;
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

/** Textura con las UV de glTF (sin voltear). */
async function cargarTexturaCuerpo(nombre: string, esColor = false) {
  const t = await new THREE.TextureLoader().loadAsync(rutaPublica(`modelos/ciclista/${nombre}`));
  t.flipY = false;
  t.anisotropy = 8;
  if (esColor) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Carga cuerpos, peinados y texturas (unos 6 MB en total, se hace una sola vez). */
export function cargarPlantillasHumanas(): Promise<Plantillas> {
  if (!promesa) {
    promesa = (async () => {
      const nombresPelo = [...new Set(Object.values(ARCHIVOS_PELO).flatMap((p) => [p.hombre, p.mujer])), 'pelo_beard'];
      const [hombre, mujer, nH, nM, rH, rM, np1, np2, ...pelos] = await Promise.all([
        cargarGltf('cuerpo_hombre'),
        cargarGltf('cuerpo_mujer'),
        cargarTexturaCuerpo('normal_hombre.jpg'),
        cargarTexturaCuerpo('normal_mujer.jpg'),
        cargarTexturaCuerpo('rugosidad_hombre.jpg'),
        cargarTexturaCuerpo('rugosidad_mujer.jpg'),
        cargarTexturaCuerpo('pelo_1_normal.jpg'),
        cargarTexturaCuerpo('pelo_2_normal.jpg'),
        ...nombresPelo.map(cargarGltf),
      ]);
      const cuerpoH = prepararCuerpo(hombre.scene, nH, rH);
      const cuerpoM = prepararCuerpo(mujer.scene, nM, rM);
      const p: Plantillas = {
        cuerpos: { hombre: hombre.scene, mujer: mujer.scene },
        pelos: {},
        materialBase: { hombre: cuerpoH.material, mujer: cuerpoM.material },
        medidas: { hombre: cuerpoH.medidas, mujer: cuerpoM.medidas },
        normalPelo: { pelo_1: np1, pelo_2: np2 },
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

function mallaOjos(raiz: THREE.Object3D) {
  let ojos: THREE.Mesh | null = null;
  raiz.traverse((o) => {
    if (o instanceof THREE.Mesh && /eye/i.test((o.material as THREE.Material).name) && !ojos) ojos = o;
  });
  return ojos as THREE.Mesh | null;
}

/** Segmentos (hueso inicial → final) con los que se decide la zona de cada píxel. */
const SEGMENTOS: [string, string | [string, number]][] = [
  ['pelvis', 'neck_01'], // 0 tronco
  ['neck_01', 'Head'], // 1 cuello
  ['Head', ['Head', 0.2]], // 2 cabeza
  ['upperarm_l', 'lowerarm_l'], // 3 brazo
  ['upperarm_r', 'lowerarm_r'], // 4
  ['lowerarm_l', 'hand_l'], // 5 antebrazo
  ['lowerarm_r', 'hand_r'], // 6
  ['hand_l', 'middle_02_l'], // 7 mano
  ['hand_r', 'middle_02_r'], // 8
  ['thigh_l', 'calf_l'], // 9 muslo
  ['thigh_r', 'calf_r'], // 10
  ['calf_l', 'foot_l'], // 11 gemelo
  ['calf_r', 'foot_r'], // 12
  ['foot_l', 'ball_l'], // 13 pie
  ['foot_r', 'ball_r'], // 14
];

/**
 * Mide el cuerpo en reposo (posición de los huesos y de la cabeza) y crea el material base.
 */
function prepararCuerpo(raiz: THREE.Group, normal: THREE.Texture, rugosidad: THREE.Texture) {
  raiz.updateMatrixWorld(true);
  const cuerpo = mallaCuerpo(raiz);
  const sk = cuerpo.skeleton;
  // Posición de cada hueso en la pose de enlace (coordenadas de la malla)
  const enReposo = (n: string) => {
    const i = sk.bones.findIndex((b) => b.name === n);
    if (i < 0) return new THREE.Vector3();
    return new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
  };
  const a: THREE.Vector3[] = [];
  const b: THREE.Vector3[] = [];
  for (const [ini, fin] of SEGMENTOS) {
    a.push(enReposo(ini));
    b.push(typeof fin === 'string' ? enReposo(fin) : enReposo(fin[0]).add(new THREE.Vector3(0, fin[1], 0)));
  }
  const yPelvis = enReposo('pelvis').y;
  const cuello = enReposo('neck_01');
  const yCadera = enReposo('thigh_l').y;
  const bajo = yCadera + 0.035; // bajo del maillot
  const franja = [yPelvis + (cuello.y - yPelvis) * 0.5, yPelvis + (cuello.y - yPelvis) * 0.62];

  const original = cuerpo.material as THREE.MeshStandardMaterial;
  const material = new THREE.MeshPhysicalMaterial({
    map: original.map,
    normalMap: normal,
    roughnessMap: rugosidad,
    roughness: 1,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(1, 1, 1),
  });
  material.name = 'CuerpoCiclista';
  material.userData.medidas = {
    segA: a,
    segB: b,
    bajo,
    franja,
    // Cuello del maillot: altura detrás, cuánto baja por delante y z del cuello
    cuello: new THREE.Vector3(cuello.y + 0.05, 0.028, cuello.z + 0.02),
    // Rotulación: espalda (sobre los bolsillos) y pecho (dentro de la franja)
    textoY: new THREE.Vector2(bajo + 0.125, franja[0] + (franja[1] - franja[0]) * 0.22),
    textoTam: new THREE.Vector4(0.3, 0.045, 0.22, (franja[1] - franja[0]) * 0.56),
  };
  return { material, medidas: medirCabeza(cuerpo, mallaOjos(raiz)) };
}

// ---------------------------------------------------------------------------
// Material con la equipación
// ---------------------------------------------------------------------------

/** Tono de referencia de la textura de piel (el más claro de la paleta). */
const PIEL_REFERENCIA = new THREE.Color('#f3d2b3');

let texturaTexto: THREE.CanvasTexture | null = null;

/** Rotulación del maillot (blanco sobre transparente; el color lo pone el shader). */
function rotulacion() {
  if (!texturaTexto) {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1024;
    lienzo.height = 128;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 92px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CICLISMO AMIGOS', 512, 68, 1000);
    texturaTexto = new THREE.CanvasTexture(lienzo);
    texturaTexto.anisotropy = 4;
  }
  return texturaTexto;
}

function materialEquipacion(base: THREE.MeshPhysicalMaterial) {
  const m = base.clone();
  const md = base.userData.medidas;
  const uniformes = {
    uTono: { value: new THREE.Color(1, 1, 1) },
    uMaillot: { value: new THREE.Color() },
    uFranja: { value: new THREE.Color() },
    uCulotte: { value: new THREE.Color() },
    uGuantes: { value: new THREE.Color('#1c1c1f') },
    uZapatillas: { value: new THREE.Color('#f1f1f1') },
    uCalcetin: { value: new THREE.Color('#ffffff') },
    uSegA: { value: md.segA },
    uSegB: { value: md.segB },
    uFranjaY: { value: new THREE.Vector2(...(md.franja as [number, number])) },
    uBajo: { value: md.bajo },
    uCuello: { value: md.cuello },
    uTexto: { value: rotulacion() },
    uTextoY: { value: md.textoY },
    uTextoTam: { value: md.textoTam },
  };
  m.userData.uniformes = uniformes;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformes);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nvarying vec3 vRestN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;\nvRestN = normal;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRest;
        varying vec3 vRestN;
        uniform vec3 uTono, uMaillot, uFranja, uCulotte, uGuantes, uZapatillas, uCalcetin;
        uniform vec3 uSegA[ 15 ];
        uniform vec3 uSegB[ 15 ];
        uniform vec2 uFranjaY;
        uniform float uBajo;
        uniform vec3 uCuello;
        uniform sampler2D uTexto;
        uniform vec2 uTextoY;
        uniform vec4 uTextoTam;
        float cE( float x, float e, float w ) { return smoothstep( e - w, e + w, x ); }
        float bE( float x, float a, float b, float w ) { return cE( x, a, w ) * ( 1.0 - cE( x, b, w ) ); }
        float letra( vec2 uv ) {
          float dentro = step( 0.0, uv.x ) * step( uv.x, 1.0 ) * step( 0.0, uv.y ) * step( uv.y, 1.0 );
          return texture2D( uTexto, clamp( uv, 0.0, 1.0 ) ).a * dentro;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float lum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        // Los pliegues pintados en la textura se conservan un poco en la ropa
        float pliegue = clamp( lum / 0.42, 0.86, 1.06 );
        vec3 pielC = diffuseColor.rgb * uTono;

        // Segmento (hueso) más cercano en reposo
        float mejorD = 1e9;
        int seg = 0;
        float tS = 0.0;
        for ( int i = 0; i < 15; i++ ) {
          vec3 ab = uSegB[ i ] - uSegA[ i ];
          float t = dot( vRest - uSegA[ i ], ab ) / dot( ab, ab );
          float d = length( vRest - ( uSegA[ i ] + ab * clamp( t, 0.0, 1.0 ) ) );
          if ( i == 0 ) d *= 0.7; // el tronco es más ancho que los miembros
          if ( d < mejorD ) { mejorD = d; seg = i; tS = t; }
        }
        vec3 nR = normalize( vRestN );
        // Anchos de antialias (fuera de ramas)
        float wT = fwidth( tS ) * 0.75 + 1e-4;
        float wY = fwidth( vRest.y ) * 0.75 + 1e-5;
        float wX = fwidth( vRest.x ) * 0.75 + 1e-5;
        float wN = fwidth( nR.x ) * 0.75 + 1e-4;
        float letraEsp = letra( vec2( 0.5 - vRest.x / uTextoTam.x, ( vRest.y - uTextoY.x ) / uTextoTam.y ) );
        float letraPecho = letra( vec2( 0.5 + vRest.x / uTextoTam.z, ( vRest.y - uTextoY.y ) / uTextoTam.w ) );

        vec3 col = pielC;
        float zTela = 0.0;   // 1 = lycra
        float zRug = -1.0;   // rugosidad fija (-1 = la del mapa)
        float lateral = cE( abs( nR.x ), 0.66, wN );
        float frente = cE( nR.z, 0.2, 0.05 );
        float espalda = 1.0 - cE( nR.z, -0.3, 0.05 );
        // Eje del hueso en este punto: para franjas laterales finas y del mismo ancho
        vec3 ejeSeg = uSegA[ seg ] + ( uSegB[ seg ] - uSegA[ seg ] ) * clamp( tS, 0.0, 1.0 );
        float wZ = fwidth( vRest.z ) * 0.75 + 1e-5;
        float franjaLateral = cE( abs( nR.x ), 0.5, wN ) * ( 1.0 - cE( abs( vRest.z - ejeSeg.z ), 0.0075, wZ ) );

        if ( seg <= 1 ) {
          // Tronco y cuello: maillot hasta el cuello (más bajo por delante), culotte bajo el maillot
          // Cuello: la línea sube al alejarse del eje del cuello (los trapecios quedan dentro)
          float rCuello = length( vRest.xz - vec2( 0.0, uCuello.z ) );
          float cuelloY = uCuello.x - uCuello.y * smoothstep( 0.0, 0.07, vRest.z - uCuello.z ) + 2.0 * max( 0.0, rCuello - 0.066 );
          float enCuello = 1.0;
          float ropa = 1.0 - cE( vRest.y, cuelloY, wY );
          vec3 m = mix( uMaillot, uCulotte, lateral * 0.9 );
          m = mix( m, uFranja, bE( vRest.y, uFranjaY.x, uFranjaY.y, wY ) );
          m = mix( m, uFranja, bE( vRest.y, uFranjaY.y + 0.012, uFranjaY.y + 0.018, wY ) );
          m = mix( m, uFranja, bE( vRest.y, uFranjaY.x - 0.018, uFranjaY.x - 0.012, wY ) );
          m = mix( m, uMaillot, letraPecho * cE( nR.z, 0.55, 0.05 ) );
          m = mix( m, uFranja, letraEsp * ( 1.0 - cE( nR.z, -0.55, 0.05 ) ) );
          // Bolsillos traseros: costura superior y divisiones
          float bolsillo = bE( vRest.y, uBajo + 0.086, uBajo + 0.092, wY )
            + bE( abs( abs( vRest.x ) - 0.052 ), -0.0025, 0.0025, wX ) * bE( vRest.y, uBajo, uBajo + 0.09, wY );
          m *= 1.0 - 0.4 * clamp( bolsillo, 0.0, 1.0 ) * espalda;
          // Cremallera
          float crem = frente * ( 1.0 - cE( abs( vRest.x ), 0.0035, wX ) ) * cE( vRest.y, uBajo + 0.01, wY );
          m = mix( m, vec3( 0.16 ), crem );
          // Cuello del maillot en el color de la franja
          m = mix( m, uFranja, bE( vRest.y, cuelloY - 0.012, cuelloY + 0.01, wY ) * enCuello );
          // Culotte con franja lateral
          vec3 c = mix( uCulotte, uFranja, franjaLateral );
          vec3 ropaC = mix( c, m, cE( vRest.y, uBajo, wY ) );
          col = mix( pielC, ropaC * pliegue, ropa );
          zTela = ropa;
          zRug = mix( -1.0, 0.62, ropa );
          if ( crem > 0.5 ) zRug = 0.3;
        } else if ( seg == 3 || seg == 4 ) {
          // Manga con puño
          float manga = 1.0 - cE( tS, 0.5, wT );
          vec3 m = mix( uMaillot, uFranja, bE( tS, 0.42, 0.5, wT ) );
          col = mix( pielC, m * pliegue, manga );
          zTela = manga;
          zRug = mix( -1.0, 0.62, manga );
        } else if ( seg == 5 || seg == 6 ) {
          // Antebrazo: piel; el guante empieza en la muñeca
          float g = cE( tS, 0.93, wT );
          col = mix( pielC, uGuantes * pliegue, g );
          zRug = mix( -1.0, 0.75, g );
        } else if ( seg == 7 || seg == 8 ) {
          // Guante sin dedos
          float g = 1.0 - cE( tS, 0.74, wT );
          vec3 guante = mix( uGuantes, uFranja, bE( tS, 0.0, 0.06, wT ) );
          col = mix( pielC, guante * pliegue, g );
          zRug = mix( -1.0, 0.75, g );
        } else if ( seg == 9 || seg == 10 ) {
          // Muslo: culotte con banda elástica y franja lateral
          float c = 1.0 - cE( tS, 0.7, wT );
          float exterior = cE( nR.x * sign( vRest.x ), 0.3, wN );
          vec3 cul = mix( uCulotte, uFranja, exterior * franjaLateral );
          cul = mix( cul, uFranja, bE( tS, 0.645, 0.7, wT ) );
          col = mix( pielC, cul * pliegue, c );
          zTela = c;
          zRug = mix( -1.0, 0.62, c );
        } else if ( seg == 11 || seg == 12 ) {
          // Calcetín con una raya
          float cal = cE( tS, 0.72, wT );
          vec3 ca = mix( uCalcetin, uFranja, bE( tS, 0.75, 0.78, wT ) );
          col = mix( pielC, ca * pliegue, cal );
          zTela = cal * 0.6;
          zRug = mix( -1.0, 0.8, cal );
        } else if ( seg >= 13 ) {
          // Zapatilla con suela; lo que asoma por encima del tobillo es calcetín
          float suela = 1.0 - cE( vRest.y, 0.03, wY );
          float calcetin = cE( vRest.y, 0.08, wY );
          vec3 z = mix( uZapatillas, vec3( 0.05 ), suela );
          z = mix( z, uFranja, bE( vRest.y, 0.03, 0.037, wY ) );
          col = mix( z, uCalcetin * pliegue, calcetin );
          zRug = mix( mix( 0.28, 0.8, suela ), 0.8, calcetin );
        }
        diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        if ( zRug >= 0.0 ) roughnessFactor = zRug;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize( mix( nonPerturbedNormal, normal, 1.0 - 0.5 * zTela ) );`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          material.sheenColor = mix( vec3( 0.05 ), diffuseColor.rgb * 0.6 + 0.25, zTela );
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'equipacion-ciclista-2';
  return m;
}

/** Material del pelo: normal del pelo y recorte bajo el casco. */
function materialPelo(
  plantilla: THREE.MeshStandardMaterial,
  color: string,
  normales: Record<string, THREE.Texture>,
  recorte: { centro: THREE.Vector3; borde: THREE.Vector3 } | null,
) {
  const mat = plantilla.clone();
  mat.color.set(color);
  mat.roughness = 0.62;
  const origen = (plantilla.map?.image as HTMLImageElement | undefined)?.src ?? '';
  mat.normalMap = origen.includes('pelo_2') ? normales.pelo_2 : normales.pelo_1;
  mat.normalScale.set(0.8, 0.8);
  const uniformes = {
    uCascoCentro: { value: recorte?.centro ?? new THREE.Vector3() },
    uCascoBorde: { value: recorte?.borde ?? new THREE.Vector3() },
    uCascoActivo: { value: recorte ? 1 : 0 },
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformes);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPelo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPelo = position;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vPelo;\nuniform vec3 uCascoCentro, uCascoBorde;\nuniform float uCascoActivo;',
      )
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${GLSL_RECORTE_PELO}`);
  };
  mat.customProgramCacheKey = () => 'pelo-recortado';
  return mat;
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
  private material: THREE.MeshPhysicalMaterial;
  private equipo: EquipoCabeza;
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
    this.materiales.push(this.material);

    // Casco, gafas y correas (a medida de esta cabeza)
    this.equipo = new EquipoCabeza(p.medidas[sexo], sexo, avatar.cascoModelo, {
      casco: avatar.casco,
      acento: avatar.franja,
    });

    // Cejas del color del pelo
    this.raiz.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (o !== cuerpo && /hair/i.test((o.material as THREE.Material).name)) {
          const pelo = materialPelo(o.material as THREE.MeshStandardMaterial, avatar.colorPelo, p.normalPelo, null);
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

    // Peinado y barba: se enganchan al esqueleto del cuerpo (el pelo bajo el casco se recorta)
    const engancharPelo = (archivo: string, recortar: boolean) => {
      const plantilla = p.pelos[archivo];
      if (!plantilla) return;
      const pelo = plantilla.clone() as THREE.SkinnedMesh;
      const mat = materialPelo(
        plantilla.material as THREE.MeshStandardMaterial,
        avatar.colorPelo,
        p.normalPelo,
        recortar ? this.equipo.recorte : null,
      );
      this.materiales.push(mat);
      pelo.material = mat;
      pelo.castShadow = true;
      pelo.frustumCulled = false;
      cuerpo.parent!.add(pelo);
      pelo.bind(cuerpo.skeleton, pelo.bindMatrix);
    };
    if (avatar.pelo !== 'calvo') engancharPelo(ARCHIVOS_PELO[avatar.pelo][sexo], true);
    if (avatar.barba) engancharPelo('pelo_beard', false);

    // El equipo se construye en coordenadas de reposo: se cuelga del hueso de la cabeza
    const cabeza = H.Head;
    this.equipo.grupo.applyMatrix4(cabeza.matrixWorld.clone().invert());
    this.equipo.grupo.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    cabeza.add(this.equipo.grupo);

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
    this.equipo.actualizarColores({ casco: a.casco, acento: a.franja });
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
    this.equipo.destruir();
    this.raiz.removeFromParent();
  }
}
