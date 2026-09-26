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
  | { tipo: 'constante'; duracionS: number; potencia: number; libre?: boolean }
  | { tipo: 'rampa'; duracionS: number; desde: number; hasta: number }
  | { tipo: 'intervalos'; repeticiones: number; onS: number; onPotencia: number; offS: number; offPotencia: number };

export interface Entrenamiento {
  id: string;
  nombre: string;
  categoria: Categoria;
  descripcion: string;
  bloques: Bloque[];
  /** true si lo ha creado el usuario (se guarda en su navegador). */
  propio?: boolean;
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
}

export function desplegar(bloques: Bloque[]): Tramo[] {
  const tramos: Tramo[] = [];
  let t = 0;
  const anadir = (duracion: number, desde: number, hasta: number, libre?: boolean) => {
    if (duracion <= 0) return;
    tramos.push({ inicio: t, duracion, desde, hasta, ...(libre ? { libre } : {}) });
    t += duracion;
  };
  for (const b of bloques) {
    if (b.tipo === 'constante') anadir(b.duracionS, b.potencia, b.potencia, b.libre);
    else if (b.tipo === 'rampa') anadir(b.duracionS, b.desde, b.hasta);
    else {
      for (let i = 0; i < b.repeticiones; i++) {
        anadir(b.onS, b.onPotencia, b.onPotencia);
        anadir(b.offS, b.offPotencia, b.offPotencia);
      }
    }
  }
  return tramos;
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
