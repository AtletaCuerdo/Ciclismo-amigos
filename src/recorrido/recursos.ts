/**
 * Carga de recursos externos (modelos glTF, texturas y cielo HDR) desde /public.
 * Todo se guarda en caché: al volver a entrar al recorrido no se descarga de nuevo.
 * Licencias y autores en public/CREDITOS.md (todo CC0).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/** Ruta pública (respeta la base de GitHub Pages, /Ciclismo-amigos/). */
export const rutaPublica = (ruta: string) => `${import.meta.env.BASE_URL}${ruta}`;

export interface ParteModelo {
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
}

const cacheModelos = new Map<string, Promise<ParteModelo[]>>();
/** Texturas de los modelos por archivo de imagen (varios modelos usan la misma). */
const texturasCompartidas = new Map<string, THREE.Texture>();

/**
 * Cada glTF crea su propia copia de las texturas aunque varios modelos usen la misma imagen
 * (la corteza y las hojas se subían a la tarjeta gráfica hasta 10 veces, unos 230 MB de más).
 * Aquí se sustituye cada textura por la primera cargada de ese mismo archivo.
 */
function compartirTexturas(material: THREE.MeshStandardMaterial) {
  for (const clave of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const) {
    const t = material[clave];
    if (!t) continue;
    const img = t.image as { src?: string; currentSrc?: string } | undefined;
    const archivo = (img?.currentSrc || img?.src || t.name || '').split('/').pop();
    if (!archivo) continue;
    const id = `${archivo}|${t.colorSpace}|${t.flipY}`;
    const previa = texturasCompartidas.get(id);
    if (previa) {
      if (previa !== t) {
        material[clave] = previa;
        t.dispose();
      }
    } else texturasCompartidas.set(id, t);
  }
}
const cacheTexturas = new Map<string, Promise<THREE.Texture>>();
const cacheCielo = new Map<string, Promise<THREE.DataTexture>>();

/** Tiempo (s) para el balanceo de hojas y hierba; lo actualiza la escena en cada imagen. */
export const tiempoViento = { value: 0 };

/**
 * Balanceo con el viento: se desplaza más cuanto más alto está el vértice.
 * La fase depende de la posición de cada ejemplar (instancia) para que no se muevan a la vez.
 */
function anadirViento(material: THREE.MeshStandardMaterial, fuerza: number) {
  material.onBeforeCompile = (s) => {
    s.uniforms.uTiempoViento = tiempoViento;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTiempoViento;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 faseV = instanceMatrix[ 3 ].xz;
        #else
          vec2 faseV = vec2( 0.0 );
        #endif
        float altoV = max( position.y, 0.0 );
        float rafaga = sin( uTiempoViento * 1.3 + faseV.x * 0.05 + faseV.y * 0.04 ) * 0.5 + 0.5;
        float vaiven = sin( uTiempoViento * 2.4 + faseV.x * 0.9 + faseV.y * 0.7 + position.x * 0.8 ) * ( 0.4 + 0.6 * rafaga );
        transformed.x += vaiven * ${fuerza.toFixed(4)} * altoV * altoV;
        transformed.z += vaiven * ${(fuerza * 0.6).toFixed(4)} * altoV * altoV;`,
      );
  };
  material.customProgramCacheKey = () => `viento-${fuerza}`;
}

/**
 * Carga un modelo de la carpeta modelos/naturaleza y lo devuelve como piezas
 * (geometría + material) con las transformaciones ya aplicadas, listas para instanciar.
 */
export function cargarModelo(nombre: string): Promise<ParteModelo[]> {
  let p = cacheModelos.get(nombre);
  if (!p) {
    p = new GLTFLoader().loadAsync(rutaPublica(`modelos/naturaleza/${nombre}.gltf`)).then((gltf) => {
      const partes: ParteModelo[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const geometria = (o.geometry as THREE.BufferGeometry).clone();
          geometria.applyMatrix4(o.matrixWorld);
          // Los colores de vértice del paquete son una oclusión muy marcada (helechos y hierba
          // salían casi negros): se suaviza a un 55-100 %
          const colores = geometria.attributes.color as THREE.BufferAttribute | undefined;
          if (colores) {
            for (let i = 0; i < colores.count; i++) {
              for (let c = 0; c < 3; c++) colores.setComponent(i, c, 0.55 + 0.45 * colores.getComponent(i, c));
            }
          }
          const material = o.material as THREE.MeshStandardMaterial;
          compartirTexturas(material);
          material.roughness = 0.9;
          material.envMapIntensity = 0.6;
          // La textura de las rocas es muy oscura: a pleno sol parecían manchas negras
          if (/rocks/i.test(material.name) && !material.userData.aclarada) {
            material.userData.aclarada = true;
            material.color.multiplyScalar(1.9);
          }
          // Hojas y hierba se mueven con el viento (los troncos y las piedras no)
          if (/leaf|leaves|grass|flower/i.test(material.name) && !material.userData.viento) {
            material.userData.viento = true;
            anadirViento(material, /Tree|Pine/.test(nombre) ? 0.0016 : 0.05);
          }
          partes.push({ geometria, material });
        }
      });
      return partes;
    });
    cacheModelos.set(nombre, p);
  }
  return p;
}

let ktx2: KTX2Loader | null = null;

/**
 * Activa las texturas comprimidas (KTX2): la tarjeta gráfica las guarda tal cual, en unas
 * 4 veces menos memoria que un JPG descomprimido. Es lo que evita que el iPad se quede sin
 * memoria. Hay que llamarla con el renderer antes de cargar texturas.
 */
export function prepararTexturasComprimidas(renderer: THREE.WebGLRenderer) {
  if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath(rutaPublica('basis/'));
  ktx2.detectSupport(renderer);
}

/**
 * Textura de la carpeta texturas/. Si las texturas comprimidas están activas se usa la
 * versión .ktx2 (y si falla, el JPG).
 */
export function cargarTextura(archivo: string, esColor: boolean): Promise<THREE.Texture> {
  const clave = `${archivo}|${esColor}|${ktx2 ? 'ktx2' : 'jpg'}`;
  let p = cacheTexturas.get(clave);
  if (!p) {
    const jpg = () => new THREE.TextureLoader().loadAsync(rutaPublica(`texturas/${archivo}`));
    const origen: Promise<THREE.Texture> = ktx2
      ? ktx2.loadAsync(rutaPublica(`texturas/${archivo.replace(/\.jpg$/, '.ktx2')}`)).catch((e) => {
          console.warn('Textura comprimida no disponible, se usa el JPG', archivo, e);
          return jpg();
        })
      : jpg();
    p = origen.then((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.colorSpace = esColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    });
    cacheTexturas.set(clave, p);
  }
  return p;
}

/** Cielo fotográfico (HDR equirectangular): 4k en calidad alta, 2k en media. */
export function cargarCielo(resolucion: '2k' | '4k' = '2k'): Promise<THREE.DataTexture> {
  let p = cacheCielo.get(resolucion);
  if (!p) {
    p = new HDRLoader()
      .loadAsync(rutaPublica(`texturas/kloofendal_48d_partly_cloudy_puresky_${resolucion}.hdr`))
      .then((t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        return t;
      });
    cacheCielo.set(resolucion, p);
  }
  return p;
}

/**
 * Busca el píxel más brillante del HDR (el sol) y devuelve su dirección.
 * Sirve para que la luz y las sombras coincidan con el sol que se ve en el cielo.
 */
export function direccionSolDelCielo(t: THREE.DataTexture): THREE.Vector3 {
  const { data, width, height } = t.image as { data: ArrayLike<number>; width: number; height: number };
  const esMedia = data instanceof Uint16Array; // HalfFloat
  const valor = (i: number) => (esMedia ? THREE.DataUtils.fromHalfFloat((data as Uint16Array)[i]) : data[i]);
  let mejor = -1;
  let mejorI = 0;
  // Solo la mitad superior de la imagen (el cielo), saltando píxeles para ir rápido
  for (let y = 0; y < height / 2; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const l = valor(i) * 0.2126 + valor(i + 1) * 0.7152 + valor(i + 2) * 0.0722;
      if (l > mejor) {
        mejor = l;
        mejorI = y * width + x;
      }
    }
  }
  const u = (mejorI % width) / width;
  const v = Math.floor(mejorI / width) / height;
  // Convención equirectangular de Three.js (flipY: v=0 arriba)
  const fi = (u - 0.5) * Math.PI * 2; // azimut
  const theta = (0.5 - v) * Math.PI; // elevación
  return new THREE.Vector3(Math.cos(theta) * Math.cos(fi), Math.sin(theta), Math.cos(theta) * Math.sin(fi)).normalize();
}
