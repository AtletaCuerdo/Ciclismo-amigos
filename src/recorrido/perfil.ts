/**
 * Perfil de altitud del recorrido (sin dependencias de Three.js, para poder
 * usarlo en la app principal sin cargar el motor 3D).
 *
 * Una vuelta de 17 km con 150 m de desnivel positivo:
 *  - km 1,5 → 4,0: el puerto, +100 m (4 % de media, hasta ~6,3 %)
 *  - km 9,0 → 10,5: repecho de +25 m
 *  - km 12,0 → 13,0: repecho de +25 m
 * Entre puntos clave se interpola con coseno, así las pendientes cambian suave.
 */

export const LONGITUD_VUELTA_M = 17000;

/** Puntos clave: [km, altitud en metros]. El último cierra la vuelta a la misma altitud. */
const PUNTOS: [number, number][] = [
  [0, 20],
  [1.5, 20],
  [4.0, 120],
  [5.0, 115],
  [7.5, 45],
  [9.0, 45],
  [10.5, 70],
  [12.0, 55],
  [13.0, 80],
  [15.0, 30],
  [17.0, 20],
];

/** Posición dentro de la vuelta (0 … 17000), aunque se lleven varias vueltas. */
export function enVuelta(s: number) {
  return ((s % LONGITUD_VUELTA_M) + LONGITUD_VUELTA_M) % LONGITUD_VUELTA_M;
}

function tramo(s: number) {
  const x = enVuelta(s);
  for (let i = 0; i < PUNTOS.length - 1; i++) {
    const s0 = PUNTOS[i][0] * 1000;
    const s1 = PUNTOS[i + 1][0] * 1000;
    if (x < s1 || i === PUNTOS.length - 2) {
      return { s0, s1, h0: PUNTOS[i][1], h1: PUNTOS[i + 1][1], t: (x - s0) / (s1 - s0) };
    }
  }
  throw new Error('Perfil mal definido');
}

/** Altitud (m) en la distancia s. */
export function altitud(s: number) {
  const { h0, h1, t } = tramo(s);
  return h0 + (h1 - h0) * (1 - Math.cos(Math.PI * t)) / 2;
}

/** Pendiente (%) en la distancia s: derivada exacta de la interpolación coseno. */
export function pendiente(s: number) {
  const { s0, s1, h0, h1, t } = tramo(s);
  return (((h1 - h0) * Math.PI) / 2) * Math.sin(Math.PI * t) / (s1 - s0) * 100;
}

/** Desnivel positivo de una vuelta (150 m). */
export const DESNIVEL_VUELTA_M = PUNTOS.slice(1).reduce(
  (total, [, h], i) => total + Math.max(0, h - PUNTOS[i][1]),
  0,
);

export const ALTITUD_MIN = Math.min(...PUNTOS.map((p) => p[1]));
export const ALTITUD_MAX = Math.max(...PUNTOS.map((p) => p[1]));
