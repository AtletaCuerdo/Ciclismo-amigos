/**
 * Carga de recursos externos (modelos glTF, texturas y cielo HDR) desde /public.
 * Todo se guarda en caché: al volver a entrar al recorrido no se descarga de nuevo.
 * Licencias y autores en public/CREDITOS.md (todo CC0).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/** Ruta pública (respeta la base de GitHub Pages, /Ciclismo-amigos/). */
export const rutaPublica = (ruta: string) => `${import.meta.env.BASE_URL}${ruta}`;

export interface ParteModelo {
  geometria: THREE.BufferGeometry;
  material: THREE.Material;
}

const cacheModelos = new Map<string, Promise<ParteModelo[]>>();
const cacheTexturas = new Map<string, Promise<THREE.Texture>>();
let cacheCielo: Promise<THREE.DataTexture> | null = null;

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
          const material = o.material as THREE.MeshStandardMaterial;
          material.roughness = 0.9;
          material.envMapIntensity = 0.6;
          partes.push({ geometria, material });
        }
      });
      return partes;
    });
    cacheModelos.set(nombre, p);
  }
  return p;
}

/** Textura de la carpeta texturas/ con repetición activada. */
export function cargarTextura(archivo: string, esColor: boolean): Promise<THREE.Texture> {
  const clave = `${archivo}|${esColor}`;
  let p = cacheTexturas.get(clave);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(rutaPublica(`texturas/${archivo}`)).then((t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (esColor) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    cacheTexturas.set(clave, p);
  }
  return p;
}

/** Cielo fotográfico (HDR equirectangular). */
export function cargarCielo(): Promise<THREE.DataTexture> {
  if (!cacheCielo) {
    cacheCielo = new HDRLoader().loadAsync(rutaPublica('texturas/kloofendal_48d_partly_cloudy_puresky_2k.hdr')).then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      return t;
    });
  }
  return cacheCielo;
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
