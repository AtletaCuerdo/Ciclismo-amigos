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
  /**
   * Río junto a la carretera, por fuera de la vuelta: del km `desde` al km `hasta` (si `hasta` es
   * menor, da la vuelta por la salida), a `distancia` m del eje y con `ancho` m de agua.
   */
  rio: { desde: number; hasta: number; distancia: number; ancho: number } | null;
  /** Paisaje: colinas verdes con cultivos, ribera con cereal dorado o sierra con pinares y roca. */
  paisaje: 'colinas' | 'ribera' | 'sierra';
  /**
   * Cómo se une el perfil entre puntos clave: con coseno (cada punto clave es un rellano) o
   * `suave` (un puerto largo sube seguido, sin rellanos). Sin indicar: coseno.
   */
  perfil?: 'suave';
  /** Nombre de la subida principal (la de más de 60 m). Sin indicar: «Puerto». */
  nombrePuerto?: string;
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
    rio: null,
    paisaje: 'colinas',
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
    // El río acompaña la carretera en la parte más baja: del km 16 a la salida y hasta el km 3
    rio: { desde: 16, hasta: 3, distancia: 75, ancho: 28 },
    paisaje: 'ribera',
    relieve: { base: 34, escala: 0.45 },
    desnivelSegmento: 7,
    extra: [['Contrarreloj de la Ribera', 16.5, 19.5]],
    metas: [1, 9.2, 14.8],
  },
  {
    id: 'sierra',
    nombre: 'Puerto de la Sierra',
    descripcion: 'Montaña: 6 km de puerto al 5,8 % con rampas al 9 %, entre pinares y roca, y bajada con curvas amplias.',
    sala: 'sierra',
    puntos: [
      [0, 300],
      [0.9, 318],
      [1.5, 322],
      [2.1, 316],
      // Subida al Puerto: 6 km
      [3.0, 360],
      [4.0, 412],
      [4.6, 466],
      [5.6, 506],
      [6.6, 560],
      [7.4, 612],
      [8.0, 664],
      [8.3, 676],
      // Bajada
      [8.8, 670],
      [9.6, 610],
      [10.6, 545],
      [11.4, 495],
      [12.0, 515],
      [13.0, 445],
      [14.0, 370],
      [15.0, 300],
    ],
    // Curvas amplias: un óvalo con ondulaciones largas, sin horquillas
    forma: {
      n: 14,
      rx: 2500,
      rz: 1700,
      ondas: [
        [0.12, 3, 1.1],
        [0.05, 6, 0.4],
      ],
    },
    lago: null,
    rio: null,
    paisaje: 'sierra',
    perfil: 'suave',
    nombrePuerto: 'Subida al Puerto',
    relieve: { base: 45, escala: 1.7 },
    desnivelSegmento: 25,
    extra: [
      ['Rampa final', 7.4, 8.3],
      ['Bajada del Puerto', 8.3, 11.4],
    ],
    metas: [0.9],
  },
];

export const CIRCUITO_POR_DEFECTO = CIRCUITOS[0].id;

export const circuitoPorId = (id: string) => CIRCUITOS.find((c) => c.id === id) ?? CIRCUITOS[0];

/** Longitud de una vuelta (m). */
export const longitudDe = (c: DefCircuito) => c.puntos[c.puntos.length - 1][0] * 1000;

/** Desnivel positivo de una vuelta (m). */
export const desnivelDe = (c: DefCircuito) =>
  c.puntos.slice(1).reduce((total, [, h], i) => total + Math.max(0, h - c.puntos[i][1]), 0);
