/**
 * Historial guardado en el propio navegador (IndexedDB).
 * Los resúmenes y las muestras van en almacenes separados para que listar
 * el historial sea rápido aunque haya muchas horas grabadas.
 * Más adelante esto se sustituirá (o se sincronizará) con el servidor.
 */
import type { Entreno, EntrenoGuardado, Muestra } from './tipos';

const BD = 'rodillos';
const VERSION = 1;
const RESUMENES = 'resumenes';
const MUESTRAS = 'muestras';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no permite guardar datos.'));
      return;
    }
    const peticion = indexedDB.open(BD, VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(RESUMENES)) db.createObjectStore(RESUMENES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MUESTRAS)) db.createObjectStore(MUESTRAS, { keyPath: 'id' });
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

/** Ejecuta una transacción y espera a que termine. */
async function transaccion<T>(
  almacenes: string[],
  modo: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await abrir();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(almacenes, modo);
      const peticion = fn(tx);
      tx.oncomplete = () => resolve(peticion ? peticion.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function guardarEntreno(e: Entreno) {
  const { muestras, ...resumen } = e;
  await transaccion([RESUMENES, MUESTRAS], 'readwrite', (tx) => {
    tx.objectStore(RESUMENES).put(resumen);
    tx.objectStore(MUESTRAS).put({ id: e.id, muestras });
  });
}

export async function listarEntrenos(): Promise<EntrenoGuardado[]> {
  const todos = await transaccion<EntrenoGuardado[]>([RESUMENES], 'readonly', (tx) =>
    tx.objectStore(RESUMENES).getAll(),
  );
  return (todos ?? []).sort((a, b) => b.inicio - a.inicio);
}

export async function cargarEntreno(g: EntrenoGuardado): Promise<Entreno> {
  const fila = await transaccion<{ id: string; muestras: Muestra[] } | undefined>(
    [MUESTRAS],
    'readonly',
    (tx) => tx.objectStore(MUESTRAS).get(g.id),
  );
  return { ...g, muestras: fila?.muestras ?? [] };
}

export async function borrarEntreno(id: string) {
  await transaccion([RESUMENES, MUESTRAS], 'readwrite', (tx) => {
    tx.objectStore(RESUMENES).delete(id);
    tx.objectStore(MUESTRAS).delete(id);
  });
}

export function nuevoId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
