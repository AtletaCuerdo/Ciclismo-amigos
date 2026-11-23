/**
 * Entrenamientos estructurados (modo ERG). Las potencias van en % del FTP de cada
 * ciclista, así el mismo entrenamiento vale para todos.
 */

export type Categoria =
  | 'recovery'
  | 'rapido'
  | 'test'
  | 'endurance'
  | 'sweetspot'
  | 'tapering'
  | 'tempo'
  | 'threshold'
  | 'vo2max';

export const CATEGORIAS: { id: Categoria; nombre: string; descripcion: string; color: string }[] = [
  { id: 'recovery', nombre: 'Recovery', descripcion: 'Rodajes muy suaves para recuperar', color: '#5aa9e6' },
  { id: 'rapido', nombre: 'Entrenamiento rápido', descripcion: 'Sesiones cortas para cuando vas con poco tiempo', color: '#ff8c42' },
  { id: 'test', nombre: 'Test', descripcion: 'Pruebas para calcular tu FTP', color: '#8e6ad8' },
  { id: 'endurance', nombre: 'Endurance', descripcion: 'Fondo aeróbico a ritmo cómodo', color: '#3cb371' },
  { id: 'sweetspot', nombre: 'Sweet Spot', descripcion: 'Entre tempo y umbral: mucho beneficio, fatiga moderada', color: '#e0b000' },
  { id: 'tapering', nombre: 'Tapering', descripcion: 'Activación y puesta a punto antes de una prueba', color: '#20b2aa' },
  { id: 'tempo', nombre: 'Tempo', descripcion: 'Ritmo sostenido algo exigente', color: '#f28c28' },
  { id: 'threshold', nombre: 'Threshold', descripcion: 'Trabajo en tu umbral (FTP)', color: '#e5533d' },
  { id: 'vo2max', nombre: 'VO2Max', descripcion: 'Series cortas e intensas por encima del umbral', color: '#c2185b' },
];

/** Bloques con los que se construye un entrenamiento (potencias en % del FTP). */
export type Bloque =
  /** `libre`: sin ERG, a tope (tests); la potencia es solo orientativa. */
  | { tipo: 'constante'; duracionS: number; potencia: number; libre?: boolean; horquilla?: number }
  | { tipo: 'rampa'; duracionS: number; desde: number; hasta: number }
  | {
      tipo: 'intervalos';
      repeticiones: number;
      onS: number;
      onPotencia: number;
      offS: number;
      offPotencia: number;
      /** Horquilla de la parte dura (W): ver `Tramo.horquilla`. */
      horquilla?: number;
    };

/** Horquillas que se pueden elegir (W arriba y abajo). */
export const HORQUILLAS = [5, 10, 15, 20] as const;

export interface Entrenamiento {
  id: string;
  nombre: string;
  categoria: Categoria;
  descripcion: string;
  bloques: Bloque[];
  /** true si lo ha creado el usuario (se guarda en su navegador). */
  propio?: boolean;
  /** Compartido con el grupo (llega de la nube). `mio`: lo compartí yo; si no, se puede guardar una copia. */
  deAmigo?: { autor: string; clave: string; t: number; mio?: boolean };
  /** Viene de TriCoach Entrenos (sesión de rodillo del entrenador): sale con la etiqueta «Entreno de TriCoach». */
  origen?: 'tricoach';
  /** Día para el que lo puso el entrenador («AAAA-MM-DD»), en «Tu semana con TriCoach». */
  fecha?: string;
  /** Tests: el FTP estimado es `factor` × la mejor media de `ventanaS` segundos. */
  estimaFtp?: { ventanaS: number; factor: number; texto: string };
}

/** Tramo ya desplegado: de `inicio` a `inicio + duracion` la potencia va de `desde` a `hasta`. */
export interface Tramo {
  inicio: number;
  duracion: number;
  desde: number;
  hasta: number;
  /** Sin ERG: el ciclista va a tope y el rodillo simula la pendiente del recorrido. */
  libre?: boolean;
  /**
   * Horquilla (W): el objetivo sube y baja hasta estos vatios arriba y abajo, como en la calle, y la
   * media del tramo sigue siendo la misma (ver `oscilacionW`).
   */
  horquilla?: number;
}

/**
 * Tramos «duros» a los que se pone la horquilla de todo el entreno (la que se elige al rodar
 * cualquier entreno, también los del catálogo): constantes, de al menos 1 minuto y desde el 76 % del
 * FTP (tempo o más). Calentamientos, rampas, descansos y series cortas se quedan fijos.
 */
const esDuro = (duracion: number, potencia: number) => duracion >= 60 && potencia >= 76;

/**
 * Despliega los bloques en tramos. `horquillaGeneral` (W, 0 = sin): la que se pone a los tramos
 * duros de cualquier entreno; la que lleve el propio bloque (puesta en el editor) manda sobre ella.
 */
export function desplegar(bloques: Bloque[], horquillaGeneral = 0): Tramo[] {
  const tramos: Tramo[] = [];
  let t = 0;
  const anadir = (duracion: number, desde: number, hasta: number, libre?: boolean, horquilla?: number) => {
    if (duracion <= 0) return;
    const h = libre ? 0 : (horquilla ?? (desde === hasta && esDuro(duracion, desde) ? horquillaGeneral : 0));
    tramos.push({ inicio: t, duracion, desde, hasta, ...(libre ? { libre } : {}), ...(h > 0 && duracion >= 20 ? { horquilla: h } : {}) });
    t += duracion;
  };
  for (const b of bloques) {
    if (b.tipo === 'constante') anadir(b.duracionS, b.potencia, b.potencia, b.libre, b.horquilla);
    else if (b.tipo === 'rampa') anadir(b.duracionS, b.desde, b.hasta, false, 0);
    else {
      for (let i = 0; i < b.repeticiones; i++) {
        anadir(b.onS, b.onPotencia, b.onPotencia, false, b.horquilla);
        anadir(b.offS, b.offPotencia, b.offPotencia, false, 0);
      }
    }
  }
  return tramos;
}

/** Cada cuánto cambia de sentido la horquilla (s): el rodillo tarda 2-3 s en ajustarse. */
const PASO_HORQUILLA_S = 18;

/**
 * Lo que se suma al objetivo (W) en el segundo `t` del tramo por su horquilla: sube y baja con
 * suavidad entre puntos cada ~18 s, empieza y acaba en el objetivo, nunca se sale de ±horquilla y
 * la media del tramo es exactamente 0 (la media del bloque es la que se pedía). Siempre igual para
 * el mismo tramo (la semilla es su inicio), así no salta al repintar.
 */
export function oscilacionW(tr: Tramo, t: number) {
  const a = tr.horquilla ?? 0;
  if (!a || t < 0 || t > tr.duracion) return 0;
  const n = Math.max(2, Math.round(tr.duracion / PASO_HORQUILLA_S));
  const v = puntosHorquilla(n, a, tr.inicio);
  const x = (t / tr.duracion) * n;
  const k = Math.min(n - 1, Math.floor(x));
  const f = x - k;
  return v[k] + (v[k + 1] - v[k]) * f;
}

const cachePuntos = new Map<string, number[]>();
/** Puntos de la horquilla (n + 1, el primero y el último 0) con media 0 al unirlos con rectas. */
function puntosHorquilla(n: number, a: number, semilla: number) {
  const clave = `${n}|${a}|${semilla}`;
  const guardado = cachePuntos.get(clave);
  if (guardado) return guardado;
  let x = (Math.floor(semilla) * 2654435761) >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
  const v = new Array<number>(n + 1).fill(0);
  // Por dentro, arriba y abajo alternando (con algo de azar en cuánto y alguna repetición)
  let signo = rnd() < 0.5 ? 1 : -1;
  for (let k = 1; k < n; k++) {
    v[k] = signo * a * (0.45 + 0.55 * rnd());
    if (rnd() < 0.8) signo = -signo;
  }
  // Media 0: con rectas entre puntos y los extremos en 0, la media es la suma de los de dentro / n
  if (n > 1) {
    const media = v.slice(1, n).reduce((s, y) => s + y, 0) / (n - 1);
    for (let k = 1; k < n; k++) v[k] -= media;
    const max = Math.max(...v.map(Math.abs));
    if (max > a) for (let k = 1; k < n; k++) v[k] *= a / max;
  }
  cachePuntos.set(clave, v);
  return v;
}

export function duracionTotal(tramos: Tramo[]) {
  const u = tramos[tramos.length - 1];
  return u ? u.inicio + u.duracion : 0;
}

/** Tramo en curso en el segundo t. */
export function tramoEn(tramos: Tramo[], t: number) {
  return tramos.find((x) => t >= x.inicio && t < x.inicio + x.duracion);
}

/** Potencia objetivo (% FTP) en el segundo t. */
export function potenciaEn(tramos: Tramo[], t: number) {
  const tr = tramoEn(tramos, t);
  if (!tr) return undefined;
  const f = (t - tr.inicio) / tr.duracion;
  return tr.desde + (tr.hasta - tr.desde) * f;
}

/** Carga de entrenamiento aproximada (TSS) con FTP del 100 %. */
export function tss(tramos: Tramo[]) {
  let suma = 0;
  for (const tr of tramos) {
    const media = (tr.desde + tr.hasta) / 2 / 100;
    suma += tr.duracion * media * media;
  }
  return Math.round((suma / 3600) * 100);
}

export function formatoDuracion(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
}

/**
 * Segundos de calentamiento al principio (0 si no tiene): las rampas de subida y los bloques
 * muy suaves y cortos (≤ 60 % del FTP y ≤ 10′) del principio, hasta 25′ (los bloques de zona 2
 * de los fondos ya son parte del entreno). Si eso es casi todo el
 * entreno (rodajes suaves), no hay calentamiento que saltar.
 */
export function finCalentamiento(tramos: Tramo[]): number {
  let fin = 0;
  let soloRampas = 0; // hasta dónde llegan las rampas del principio (sin los bloques suaves)
  let i = 0;
  for (; i < tramos.length; i++) {
    const t = tramos[i];
    // Rampas de subida que empiezan suaves (las que salen ya fuertes son series, p. ej. «Rampas Sweet Spot»)
    const sube = t.hasta > t.desde && t.desde <= 65 && t.hasta <= 90;
    const suave = Math.max(t.desde, t.hasta) <= 60 && t.duracion <= 600;
    if (t.libre || !(sube || suave) || t.inicio + t.duracion > 1500) break;
    fin = t.inicio + t.duracion;
    if (sube && soloRampas === t.inicio) soloRampas = fin;
  }
  // Si después no viene nada más duro (rodajes de recuperación), solo cuenta la rampa inicial
  const siguiente = tramos[i];
  if (!siguiente || Math.max(siguiente.desde, siguiente.hasta) <= 60) fin = soloRampas;
  const total = tramos.length ? tramos[tramos.length - 1].inicio + tramos[tramos.length - 1].duracion : 0;
  return fin >= 120 && fin < total * 0.6 ? fin : 0;
}
