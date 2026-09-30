/**
 * Récords de los segmentos: los míos en el navegador y la tabla del grupo en Firebase.
 *
 *   records/{circuito}/{segmento}/{uid} = { nombre, ms, t }
 *
 * Cada ciclista solo escribe su propia marca y solo cuando la mejora. El recorrido de mi mejor
 * vuelta (para el fantasma) se queda en el navegador: son unos miles de puntos.
 */
import { CIRCUITO_ID } from './segmentos';

export interface MarcaGrupo {
  uid: string;
  nombre: string;
  ms: number;
  t: number;
}

const CLAVE_RECORDS = 'rodillos.records';
const claveFantasma = (circuito: string) => `rodillos.fantasma.${circuito}`;

type Records = Record<string, Record<string, { ms: number; t: number }>>;

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin sitio o sin almacenamiento: no es grave
  }
}

/** Mi mejor marca en un segmento (ms), si la hay. */
export function miRecord(segmento: string, circuito = CIRCUITO_ID): number | undefined {
  return leer<Records>(CLAVE_RECORDS, {})[circuito]?.[segmento]?.ms;
}

/** Guarda la marca si es la mejor. Devuelve la anterior (undefined si era la primera). */
export function apuntarMarca(segmento: string, ms: number, circuito = CIRCUITO_ID) {
  const todos = leer<Records>(CLAVE_RECORDS, {});
  const anterior = todos[circuito]?.[segmento]?.ms;
  if (anterior === undefined || ms < anterior) {
    todos[circuito] = { ...todos[circuito], [segmento]: { ms, t: Date.now() } };
    escribir(CLAVE_RECORDS, todos);
  }
  return anterior;
}

/** Recorrido de mi mejor vuelta: pares [ms desde el inicio, metros]. */
export function leerFantasma(circuito = CIRCUITO_ID): [number, number][] | null {
  const f = leer<[number, number][] | null>(claveFantasma(circuito), null);
  return Array.isArray(f) && f.length > 1 ? f : null;
}

export function guardarFantasma(muestras: [number, number][], circuito = CIRCUITO_ID) {
  escribir(claveFantasma(circuito), muestras);
}

/** Sube mi marca a la tabla del grupo si mejora la que había. */
export async function subirMarca(segmento: string, ms: number, nombre: string, circuito = CIRCUITO_ID) {
  const fb = await import('../multijugador/firebase');
  const yo = await fb.entrarAnonimo();
  const ref = fb.ref(fb.db, `records/${circuito}/${segmento}/${yo.uid}`);
  const actual = await fb.get(ref);
  const previa = actual.val()?.ms;
  if (typeof previa === 'number' && previa <= ms) return false;
  await fb.set(ref, { nombre: nombre.slice(0, 30) || 'Ciclista', ms: Math.round(ms), t: fb.serverTimestamp() });
  return true;
}

/** Tabla del grupo de un segmento, de más rápido a más lento. */
export async function tablaGrupo(segmento: string, circuito = CIRCUITO_ID): Promise<{ tabla: MarcaGrupo[]; miUid: string }> {
  const fb = await import('../multijugador/firebase');
  const yo = await fb.entrarAnonimo();
  const snap = await fb.get(fb.ref(fb.db, `records/${circuito}/${segmento}`));
  const tabla: MarcaGrupo[] = [];
  snap.forEach((hijo) => {
    const v = hijo.val();
    if (v && typeof v.ms === 'number' && typeof v.nombre === 'string')
      tabla.push({ uid: hijo.key as string, nombre: v.nombre, ms: v.ms, t: Number(v.t) || 0 });
  });
  tabla.sort((a, b) => a.ms - b.ms);
  return { tabla, miUid: yo.uid };
}
