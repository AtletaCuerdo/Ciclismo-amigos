/**
 * Récords de los segmentos: los míos en el navegador y la tabla del grupo en Firebase.
 *
 *   records/{circuito}/{segmento}/{uid} = { nombre, ms, t }
 *
 * Cada ciclista solo escribe su propia marca y solo cuando la mejora. El recorrido de mi mejor
 * vuelta (para el fantasma) se queda en el navegador: son unos miles de puntos.
 */
import { circuitoPorId } from './circuitos';
import { CIRCUITO_ID } from './segmentos';

export interface MarcaGrupo {
  uid: string;
  nombre: string;
  ms: number;
  t: number;
}

const CLAVE_RECORDS = 'rodillos.records';
const claveFantasma = (circuito: string) => `rodillos.fantasma.${circuito}`;

/** Clave del segmento para sus récords: las subidas rehechas llevan su versión (`subida-1-v2`). */
function clave(segmento: string, circuito: string) {
  const v = circuitoPorId(circuito).versionSubidas;
  return v && segmento.startsWith('subida-') ? `${segmento}-v${v}` : segmento;
}

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
  return leer<Records>(CLAVE_RECORDS, {})[circuito]?.[clave(segmento, circuito)]?.ms;
}

/** Guarda la marca si es la mejor. Devuelve la anterior (undefined si era la primera). */
export function apuntarMarca(id: string, ms: number, circuito = CIRCUITO_ID) {
  const segmento = clave(id, circuito);
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
  const yo = await fb.usuarioActual();
  const ref = fb.ref(fb.db, `records/${circuito}/${clave(segmento, circuito)}/${yo.uid}`);
  const actual = await fb.get(ref);
  const previa = actual.val()?.ms;
  if (typeof previa === 'number' && previa <= ms) return false;
  await fb.set(ref, { nombre: nombre.slice(0, 30) || 'Ciclista', ms: Math.round(ms), t: fb.serverTimestamp() });
  return true;
}

/** Tabla del grupo de un segmento, de más rápido a más lento. */
export async function tablaGrupo(segmento: string, circuito = CIRCUITO_ID): Promise<{ tabla: MarcaGrupo[]; miUid: string }> {
  const fb = await import('../multijugador/firebase');
  const yo = await fb.usuarioActual();
  const snap = await fb.get(fb.ref(fb.db, `records/${circuito}/${clave(segmento, circuito)}`));
  const tabla: MarcaGrupo[] = [];
  snap.forEach((hijo) => {
    const v = hijo.val();
    if (v && typeof v.ms === 'number' && typeof v.nombre === 'string')
      tabla.push({ uid: hijo.key as string, nombre: v.nombre, ms: v.ms, t: Number(v.t) || 0 });
  });
  tabla.sort((a, b) => a.ms - b.ms);
  return { tabla, miUid: yo.uid };
}

/**
 * Recupera mis mejores marcas de la tabla del grupo (están en la nube con mi uid). Mis marcas
 * personales solo se guardaban en el navegador: si este perdía lo guardado (le pasa a Eric), cada
 * subida volvía a ser «tu primer tiempo». Se queda la mejor de las dos.
 */
export async function recuperarMisMarcas(): Promise<number> {
  try {
    const fb = await import('../multijugador/firebase');
    const yo = await fb.usuarioActual();
    const snap = await fb.get(fb.ref(fb.db, 'records'));
    const nube = (snap.val() ?? {}) as Record<string, Record<string, Record<string, { ms?: unknown; t?: unknown }>>>;
    const todos = leer<Records>(CLAVE_RECORDS, {});
    let recuperadas = 0;
    for (const [circuito, segmentos] of Object.entries(nube)) {
      for (const [segmento, filas] of Object.entries(segmentos ?? {})) {
        const mia = filas?.[yo.uid];
        const ms = typeof mia?.ms === 'number' ? mia.ms : undefined;
        if (ms === undefined || ms <= 0) continue;
        const local = todos[circuito]?.[segmento]?.ms;
        if (local === undefined || ms < local) {
          todos[circuito] = { ...todos[circuito], [segmento]: { ms, t: Number(mia?.t) || Date.now() } };
          recuperadas++;
        }
      }
    }
    if (recuperadas) escribir(CLAVE_RECORDS, todos);
    return recuperadas;
  } catch {
    return 0;
  }
}
