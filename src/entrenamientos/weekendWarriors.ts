/**
 * Sesiones de rodillo que llegan desde la app del club Weekend Warriors
 * (https://weekend-warriors.jfer-luna.workers.dev): su botón «Hacer en RideCrew» abre esta web con
 * `#ww=<base64url de JSON>` = { v: 1, e: [{ id, n: nombre, d: descripción, f: fecha, b: bloques }] }
 * (potencias en % del FTP, mismo formato de bloques que aquí).
 *
 * Al cargar la web se guardan como entrenamientos propios (ids `ww-…`; si llega otra vez el mismo,
 * se sustituye) y se sincronizan con la cuenta como cualquier otro propio. Sin reglas nuevas.
 */
import { cargarPropios, guardarPropios } from './propios';
import { categoriaSegunIntensidad } from './importar';
import { validar } from './compartidos';
import type { Bloque, Entrenamiento } from './tipos';

interface SesionWW {
  id?: string;
  n?: string;
  d?: string;
  f?: string;
  b?: Bloque[];
}

function deBase64url(t: string) {
  const s = t.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s.padEnd(s.length + ((4 - (s.length % 4)) % 4), '='));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Guarda las sesiones que vienen en la dirección y la limpia. Devuelve cuántas se han guardado. */
function recoger(): number {
  const m = window.location.hash.match(/ww=([A-Za-z0-9_-]+)/);
  if (!m) return 0;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const j = JSON.parse(deBase64url(m[1])) as { v?: number; e?: SesionWW[] };
    if (!Array.isArray(j.e)) return 0;
    const propios = cargarPropios();
    let n = 0;
    for (const s of j.e.slice(0, 20)) {
      if (!Array.isArray(s.b) || typeof s.n !== 'string') continue;
      const e = validar({ nombre: s.n, categoria: categoriaSegunIntensidad(s.b, s.n), descripcion: s.d ?? '', bloques: s.b });
      if (!e) continue;
      const id = `ww-${String(s.id ?? s.n).replace(/[^a-z0-9-]/gi, '').slice(0, 50)}`;
      const nuevo: Entrenamiento = { ...e, id, propio: true, recibido: Date.now(), ...(typeof s.f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.f) ? { fecha: s.f } : {}) };
      const i = propios.findIndex((p) => p.id === id);
      if (i >= 0) propios[i] = nuevo;
      else propios.push(nuevo);
      n++;
    }
    if (n) guardarPropios(propios);
    return n;
  } catch {
    return 0;
  }
}

/** Cuántos entrenamientos de Weekend Warriors se han guardado en esta carga (0 = ninguno). */
export const LLEGARON_DE_WW = typeof window !== 'undefined' ? recoger() : 0;
