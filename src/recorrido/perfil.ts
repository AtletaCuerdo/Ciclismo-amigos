/**
 * Perfil de altitud del recorrido (sin dependencias de Three.js, para poder
 * usarlo en la app principal sin cargar el motor 3D).
 *
 * Perfil del circuito elegido (ver circuitos.ts).
 * Entre puntos clave se interpola con coseno, así las pendientes cambian suave.
 */

import { CIRCUITO_POR_DEFECTO, circuitoPorId, desnivelDe, longitudDe, type DefCircuito } from './circuitos';

/**
 * Circuito elegido. Estos valores se exportan con `let`: quien los importa ve siempre los del
 * circuito actual (los módulos de JavaScript exportan enlaces vivos, no copias).
 */
export let CIRCUITO: DefCircuito = circuitoPorId(CIRCUITO_POR_DEFECTO);
export let CIRCUITO_ID = CIRCUITO.id;
export let LONGITUD_VUELTA_M = longitudDe(CIRCUITO);

/** Puntos clave: [km, altitud en metros]. El último cierra la vuelta a la misma altitud. */
let PUNTOS: [number, number][] = CIRCUITO.puntos;

/** Posición dentro de la vuelta (0 … longitud), aunque se lleven varias vueltas. */
export function enVuelta(s: number) {
  return ((s % LONGITUD_VUELTA_M) + LONGITUD_VUELTA_M) % LONGITUD_VUELTA_M;
}

/**
 * Pendiente (tanto por uno) en cada punto clave para el perfil suave: 0 en cimas y valles y,
 * dentro de una subida o bajada, una media de los tramos de los lados (como un spline monótono).
 * Así un puerto largo sube seguido, sin rellanos en cada punto clave.
 */
export function pendientesClave(puntos: [number, number][]) {
  const n = puntos.length - 1; // el último punto es el primero (vuelta cerrada)
  const m = puntos.slice(1).map(([km, h], i) => (h - puntos[i][1]) / ((km - puntos[i][0]) * 1000));
  const l = puntos.slice(1).map(([km], i) => (km - puntos[i][0]) * 1000);
  const d = puntos.map((_, i) => {
    const a = (i - 1 + n) % n; // tramo anterior
    const b = i % n; // tramo siguiente
    if (m[a] * m[b] <= 0) return 0;
    return (3 * (l[a] + l[b])) / ((2 * l[b] + l[a]) / m[a] + (l[b] + 2 * l[a]) / m[b]);
  });
  return d;
}

let SUAVE = CIRCUITO.perfil === 'suave';
let PENDIENTES_CLAVE = pendientesClave(PUNTOS);

function tramo(s: number) {
  const x = enVuelta(s);
  for (let i = 0; i < PUNTOS.length - 1; i++) {
    const s0 = PUNTOS[i][0] * 1000;
    const s1 = PUNTOS[i + 1][0] * 1000;
    if (x < s1 || i === PUNTOS.length - 2) {
      return { s0, s1, h0: PUNTOS[i][1], h1: PUNTOS[i + 1][1], t: (x - s0) / (s1 - s0), i };
    }
  }
  throw new Error('Perfil mal definido');
}

/** Altitud (m) en la distancia s. */
export function altitud(s: number) {
  const { s0, s1, h0, h1, t, i } = tramo(s);
  if (SUAVE) {
    // Hermite cúbico con las pendientes de los puntos clave
    const L = s1 - s0;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * h0 +
      (t3 - 2 * t2 + t) * L * PENDIENTES_CLAVE[i] +
      (-2 * t3 + 3 * t2) * h1 +
      (t3 - t2) * L * PENDIENTES_CLAVE[i + 1]
    );
  }
  return h0 + (h1 - h0) * (1 - Math.cos(Math.PI * t)) / 2;
}

/** Pendiente (%) en la distancia s: derivada exacta de la interpolación. */
export function pendiente(s: number) {
  const { s0, s1, h0, h1, t, i } = tramo(s);
  if (SUAVE) {
    const L = s1 - s0;
    const t2 = t * t;
    const derivada =
      ((6 * t2 - 6 * t) * h0 + (-6 * t2 + 6 * t) * h1) / L +
      (3 * t2 - 4 * t + 1) * PENDIENTES_CLAVE[i] +
      (3 * t2 - 2 * t) * PENDIENTES_CLAVE[i + 1];
    return derivada * 100;
  }
  return (((h1 - h0) * Math.PI) / 2) * Math.sin(Math.PI * t) / (s1 - s0) * 100;
}

/** Desnivel positivo de una vuelta. */
export let DESNIVEL_VUELTA_M = desnivelDe(CIRCUITO);

/**
 * Subidas de la vuelta (tramos en los que la altitud sube entre dos puntos clave). Con el perfil
 * suave (`unir`), los tramos de subida seguidos son una sola subida (no hay rellano entre ellos).
 */
export const subidasDe = (puntos: [number, number][], unir = false) =>
  puntos
    .slice(1)
    .map(([km, h], i) => ({
      inicio: puntos[i][0] * 1000,
      fin: km * 1000,
      desnivel: h - puntos[i][1],
    }))
    .filter((t) => t.desnivel > 0)
    .reduce<{ inicio: number; fin: number; desnivel: number }[]>((lista, t) => {
      const ultima = lista[lista.length - 1];
      if (unir && ultima && ultima.fin === t.inicio) {
        ultima.fin = t.fin;
        ultima.desnivel += t.desnivel;
      } else lista.push({ ...t });
      return lista;
    }, [])
    .map((t) => ({ ...t, pendienteMedia: (t.desnivel / (t.fin - t.inicio)) * 100 }));
const calcularSubidas = () => subidasDe(PUNTOS, SUAVE);
export let SUBIDAS = calcularSubidas();

export interface InfoSubidas {
  /** Metros de desnivel positivo que quedan hasta el final de la vuelta. */
  quedanVuelta: number;
  /** Subida en la que estás ahora (null si no estás subiendo). */
  actual: { quedanM: number; quedanDistancia: number } | null;
  /** Próxima subida por delante (puede ser de la vuelta siguiente). */
  proxima: { distancia: number; desnivel: number; longitud: number; pendienteMedia: number };
}

export function infoSubidas(s: number): InfoSubidas {
  const x = enVuelta(s);
  let quedanVuelta = 0;
  let actual: InfoSubidas['actual'] = null;
  for (const t of SUBIDAS) {
    if (x < t.inicio) quedanVuelta += t.desnivel;
    else if (x < t.fin) {
      const quedanM = altitud(t.fin) - altitud(x);
      quedanVuelta += quedanM;
      actual = { quedanM, quedanDistancia: t.fin - x };
    }
  }
  const siguiente = SUBIDAS.find((t) => t.inicio > x) ?? SUBIDAS[0];
  const distancia = siguiente.inicio > x ? siguiente.inicio - x : siguiente.inicio + LONGITUD_VUELTA_M - x;
  return {
    quedanVuelta,
    actual,
    proxima: {
      distancia,
      desnivel: siguiente.desnivel,
      longitud: siguiente.fin - siguiente.inicio,
      pendienteMedia: siguiente.pendienteMedia,
    },
  };
}

export let ALTITUD_MIN = Math.min(...PUNTOS.map((p) => p[1]));
export let ALTITUD_MAX = Math.max(...PUNTOS.map((p) => p[1]));

/** Cambia de circuito (antes de entrar en el recorrido). */
export function usarCircuito(id: string) {
  CIRCUITO = circuitoPorId(id);
  CIRCUITO_ID = CIRCUITO.id;
  LONGITUD_VUELTA_M = longitudDe(CIRCUITO);
  PUNTOS = CIRCUITO.puntos;
  SUAVE = CIRCUITO.perfil === 'suave';
  PENDIENTES_CLAVE = pendientesClave(PUNTOS);
  DESNIVEL_VUELTA_M = desnivelDe(CIRCUITO);
  SUBIDAS = calcularSubidas();
  ALTITUD_MIN = Math.min(...PUNTOS.map((p) => p[1]));
  ALTITUD_MAX = Math.max(...PUNTOS.map((p) => p[1]));
}
