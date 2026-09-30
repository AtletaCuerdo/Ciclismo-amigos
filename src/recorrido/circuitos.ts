/**
 * Los circuitos de RideCrew. Todo el mundo 3D se genera a partir de estos datos: el perfil de
 * altitud, la forma de la carretera, el lago (si lo hay) y el relieve de alrededor.
 *
 * Sin dependencias: lo usan tanto la app principal como la escena 3D.
 */

export interface DefCircuito {
  id: string;
  nombre: string;
  descripcion: string;
  /** Sala de la salida en grupo (la Vuelta del Lago conserva la de siempre). */
  sala: string;
  /** Puntos clave del perfil: [km, altitud m]. El último cierra la vuelta a la misma altitud. */
  puntos: [number, number][];
  /**
   * Forma de la carretera: una curva cerrada alrededor del centro con radios `rx`×`rz` (m,
   * antes de escalarla a la longitud exacta) deformada con ondas [amplitud, frecuencia, fase].
   */
  forma: { n: number; rx: number; rz: number; ondas: [number, number, number][] };
  /** Lago junto a la carretera: en el metro `s`, a `distancia` hacia dentro, de radio `r`. */
  lago: { s: number; distancia: number; r: number } | null;
  /** Colinas lejos de la carretera: altura media y cuánto se ondulan (1 = como el original). */
  relieve: { base: number; escala: number };
  /** Subidas con al menos este desnivel se cronometran como segmento. */
  desnivelSegmento: number;
  /** Segmentos extra (además de las subidas y la vuelta completa): [nombre, km inicio, km fin]. */
  extra: [string, number, number][];
  /** Metas volantes (en la salida en grupo): km de inicio (duran 300 m). */
  metas: number[];
}

export const CIRCUITOS: DefCircuito[] = [
  {
    id: 'vuelta17',
    nombre: 'Vuelta del Lago',
    descripcion: 'Mixto: un puerto de 2,5 km y dos repechos, entre colinas y junto a un lago.',
    sala: 'general',
    puntos: [
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
    ],
    forma: {
      n: 14,
      rx: 3100,
      rz: 2100,
      ondas: [
        [0.16, 3, 0.6],
        [0.09, 5, 1.3],
      ],
    },
    lago: { s: 8200, distancia: 270, r: 175 },
    relieve: { base: 60, escala: 1 },
    desnivelSegmento: 10,
    extra: [],
    metas: [0.8, 8],
  },
  {
    id: 'ribera',
    nombre: 'La Ribera',
    descripcion: 'Llano y rápido junto al río: para ir en grupo, a rueda y a tope en la contrarreloj.',
    sala: 'ribera',
    puntos: [
      [0, 22],
      [2.5, 25],
      [4.5, 36],
      [6.0, 30],
      [7.0, 33],
      [8.5, 22],
      [10.0, 22],
      [12.0, 30],
      [13.5, 41],
      [15.5, 29],
      [18.0, 23],
      [20.0, 22],
    ],
    // Alargada, como un valle: rectas largas y curvas suaves
    forma: {
      n: 12,
      rx: 4300,
      rz: 1250,
      ondas: [
        [0.07, 2, 0.4],
        [0.05, 4, 2.1],
      ],
    },
    lago: null,
    relieve: { base: 34, escala: 0.45 },
    desnivelSegmento: 7,
    extra: [['Contrarreloj de la Ribera', 16.5, 19.5]],
    metas: [1, 9.2, 14.8],
  },
];

export const CIRCUITO_POR_DEFECTO = CIRCUITOS[0].id;

export const circuitoPorId = (id: string) => CIRCUITOS.find((c) => c.id === id) ?? CIRCUITOS[0];

/** Longitud de una vuelta (m). */
export const longitudDe = (c: DefCircuito) => c.puntos[c.puntos.length - 1][0] * 1000;

/** Desnivel positivo de una vuelta (m). */
export const desnivelDe = (c: DefCircuito) =>
  c.puntos.slice(1).reduce((total, [, h], i) => total + Math.max(0, h - c.puntos[i][1]), 0);
