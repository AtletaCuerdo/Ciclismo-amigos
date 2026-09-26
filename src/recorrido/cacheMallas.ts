/**
 * Caché de las mallas generadas por código (cuadro, cockpit, casco) en IndexedDB.
 *
 * Generarlas cuesta un par de segundos la primera vez; después se guardan en el navegador y
 * en las visitas siguientes se leen al instante. Si IndexedDB no está disponible (modo privado,
 * datos bloqueados) todo funciona igual, solo que se generan cada vez.
 *
 * Hay que subir VERSION cuando cambie cómo se generan las mallas.
 */
import * as THREE from 'three';

const VERSION = 4;
const BD = 'ciclismo-mallas';
const ALMACEN = 'mallas';

interface Datos {
  pos: Float32Array;
  nor: Float32Array;
  zona: Float32Array | null;
  idx: Uint32Array;
}

const memoria = new Map<string, Datos>();
let listo = false;
let promesa: Promise<void> | null = null;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pet = indexedDB.open(BD, 1);
    pet.onupgradeneeded = () => pet.result.createObjectStore(ALMACEN);
    pet.onsuccess = () => resolver(pet.result);
    pet.onerror = () => rechazar(pet.error);
  });
}

/** Lee las mallas guardadas (y borra las de versiones anteriores). Nunca falla. */
export function precargarMallas(): Promise<void> {
  if (!promesa) {
    promesa = (async () => {
      try {
        const bd = await abrir();
        await new Promise<void>((resolver) => {
          const tx = bd.transaction(ALMACEN, 'readwrite');
          const almacen = tx.objectStore(ALMACEN);
          const cursor = almacen.openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            const clave = String(c.key);
            if (clave.endsWith(`|v${VERSION}`)) memoria.set(clave, c.value as Datos);
            else c.delete();
            c.continue();
          };
          tx.oncomplete = () => resolver();
          tx.onerror = () => resolver();
          tx.onabort = () => resolver();
        });
        bd.close();
      } catch {
        // Sin IndexedDB: se generan cada vez
      }
      listo = true;
    })();
  }
  return promesa;
}

export function mallasListas() {
  return listo;
}

function guardar(clave: string, datos: Datos) {
  abrir()
    .then((bd) => {
      const tx = bd.transaction(ALMACEN, 'readwrite');
      tx.objectStore(ALMACEN).put(datos, clave);
      tx.oncomplete = () => bd.close();
      tx.onerror = () => bd.close();
    })
    .catch(() => undefined);
}

function aGeometria(d: Datos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
  if (d.zona) g.setAttribute('zona', new THREE.BufferAttribute(d.zona, 4));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** Devuelve la malla guardada con esa clave o la genera (y la guarda para la próxima vez). */
export function mallaGuardada(clave: string, generar: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const k = `${clave}|v${VERSION}`;
  const guardada = memoria.get(k);
  if (guardada) return aGeometria(guardada);
  const g = generar();
  const zona = g.getAttribute('zona') as THREE.BufferAttribute | undefined;
  const datos: Datos = {
    pos: new Float32Array((g.getAttribute('position') as THREE.BufferAttribute).array),
    nor: new Float32Array((g.getAttribute('normal') as THREE.BufferAttribute).array),
    zona: zona ? new Float32Array(zona.array) : null,
    idx: new Uint32Array(g.getIndex()!.array),
  };
  memoria.set(k, datos);
  guardar(k, datos);
  return g;
}
