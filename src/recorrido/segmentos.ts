/**
 * Segmentos cronometrados del circuito (subidas, metas volantes y la vuelta completa) y el
 * cronómetro que detecta cuándo se cruza su inicio y su final.
 *
 * Todo va por circuito (`CIRCUITO_ID`) para que, cuando haya más recorridos, cada uno tenga
 * sus segmentos, sus récords y su fantasma.
 */
import { LONGITUD_VUELTA_M, SUBIDAS } from './perfil';

export const CIRCUITO_ID = 'vuelta17';

export type TipoSegmento = 'subida' | 'meta' | 'vuelta';

export interface Segmento {
  id: string;
  nombre: string;
  tipo: TipoSegmento;
  /** Metros dentro de la vuelta. */
  inicio: number;
  fin: number;
}

const km = (m: number) => (m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 });

export const SEGMENTOS: Segmento[] = [
  ...SUBIDAS.map((s, i) => ({
    id: `subida-${i + 1}`,
    nombre: i === 0 ? 'Puerto' : `Repecho del km ${km(s.inicio)}`,
    tipo: 'subida' as const,
    inicio: s.inicio,
    fin: s.fin,
  })),
  // Metas volantes en las dos zonas llanas (solo cuentan en la salida en grupo)
  { id: 'meta-1', nombre: 'Meta volante del km 0,8', tipo: 'meta', inicio: 800, fin: 1100 },
  { id: 'meta-2', nombre: 'Meta volante del km 8', tipo: 'meta', inicio: 8000, fin: 8300 },
  { id: 'vuelta', nombre: 'Vuelta completa', tipo: 'vuelta', inicio: 0, fin: LONGITUD_VUELTA_M },
];

export const segmentoPorId = (id: string) => SEGMENTOS.find((s) => s.id === id);

/** Un tramo en marcha. */
export interface TramoActivo {
  segmento: Segmento;
  /** Punto absoluto del circuito donde empezó (metros desde la salida, contando vueltas). */
  desdeS: number;
  /** Momento de inicio (ms, reloj de la página). */
  desdeT: number;
}

export type EventoCrono =
  | { tipo: 'inicio'; tramo: TramoActivo }
  | { tipo: 'fin'; tramo: TramoActivo; ms: number; muestras?: [number, number][] }
  | { tipo: 'cancelado'; tramo: TramoActivo };

/** Un salto mayor que esto entre dos lecturas no es pedalear (p. ej. «Ir junto a…»). */
const SALTO_M = 60;
/** La vuelta completa guarda su recorrido (ms, metros) cada medio segundo para el fantasma. */
const PASO_MUESTRA_MS = 500;

/**
 * Cronómetro de segmentos: se le pasa la posición y la hora unas diez veces por segundo y
 * devuelve lo que ha pasado (empieza un tramo, termina con su tiempo o se anula). Los tiempos
 * se interpolan en el punto exacto de la línea, así no dependen de cada cuánto se lea.
 */
export class CronoSegmentos {
  private anteriorS: number | null = null;
  private anteriorT = 0;
  readonly activos = new Map<string, TramoActivo>();
  private muestrasVuelta: [number, number][] = [];
  private ultimaMuestra = 0;

  constructor(private readonly segmentos: Segmento[] = SEGMENTOS) {}

  /** Anula todos los tramos (pausa, salto de posición, salir del recorrido). */
  cancelar(): EventoCrono[] {
    const eventos: EventoCrono[] = [...this.activos.values()].map((tramo) => ({ tipo: 'cancelado', tramo }));
    this.activos.clear();
    this.muestrasVuelta = [];
    this.anteriorS = null;
    return eventos;
  }

  actualizar(s: number, t: number, enMarcha: boolean): EventoCrono[] {
    if (!enMarcha) return this.activos.size || this.anteriorS !== null ? this.cancelar() : [];
    const a = this.anteriorS;
    const ta = this.anteriorT;
    this.anteriorS = s;
    this.anteriorT = t;
    if (a === null) return [];
    if (Math.abs(s - a) > SALTO_M || s < a) {
      const eventos = this.cancelar();
      this.anteriorS = s;
      this.anteriorT = t;
      return eventos;
    }
    if (s === a) return [];

    // Momento exacto en que se pasó por el punto p (entre a y s)
    const horaEn = (p: number) => ta + ((p - a) / (s - a)) * (t - ta);
    const eventos: EventoCrono[] = [];

    for (const seg of this.segmentos) {
      // Final: el tramo en marcha llega a su meta
      const activo = this.activos.get(seg.id);
      if (activo) {
        const meta = activo.desdeS + (seg.fin - seg.inicio);
        if (meta > a && meta <= s) {
          this.activos.delete(seg.id);
          const ms = Math.round(horaEn(meta) - activo.desdeT);
          const evento: EventoCrono = { tipo: 'fin', tramo: activo, ms };
          if (seg.tipo === 'vuelta') {
            this.muestrasVuelta.push([ms, seg.fin - seg.inicio]);
            evento.muestras = this.muestrasVuelta;
            this.muestrasVuelta = [];
          }
          eventos.push(evento);
        }
      }
      // Inicio: primera línea de salida del segmento entre a y s (en cualquier vuelta)
      const k = Math.ceil((a - seg.inicio) / LONGITUD_VUELTA_M);
      let salida = seg.inicio + k * LONGITUD_VUELTA_M;
      if (salida <= a) salida += LONGITUD_VUELTA_M;
      if (salida <= s && !this.activos.has(seg.id)) {
        const tramo: TramoActivo = { segmento: seg, desdeS: salida, desdeT: horaEn(salida) };
        this.activos.set(seg.id, tramo);
        if (seg.tipo === 'vuelta') {
          this.muestrasVuelta = [[0, 0]];
          this.ultimaMuestra = tramo.desdeT;
        }
        eventos.push({ tipo: 'inicio', tramo });
      }
    }

    // Recorrido de la vuelta en marcha (para el fantasma)
    const vuelta = this.activos.get('vuelta');
    if (vuelta && t - this.ultimaMuestra >= PASO_MUESTRA_MS) {
      this.ultimaMuestra = t;
      this.muestrasVuelta.push([Math.round(t - vuelta.desdeT), Math.round((s - vuelta.desdeS) * 10) / 10]);
    }
    return eventos;
  }
}

/** Posición (metros dentro de la vuelta) de un recorrido guardado a los `ms` de empezar. */
export function posicionEn(muestras: [number, number][], ms: number): number | null {
  if (!muestras.length || ms < 0) return null;
  const ultimo = muestras[muestras.length - 1];
  if (ms >= ultimo[0]) return null; // ya terminó
  let lo = 0;
  let hi = muestras.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (muestras[m][0] <= ms) lo = m;
    else hi = m;
  }
  const [t0, s0] = muestras[lo];
  const [t1, s1] = muestras[hi];
  return t1 > t0 ? s0 + ((ms - t0) / (t1 - t0)) * (s1 - s0) : s0;
}

/** Momento (ms) en que un recorrido guardado pasó por `metros` de la vuelta. */
export function tiempoEn(muestras: [number, number][], metros: number): number | null {
  if (!muestras.length) return null;
  for (let i = 1; i < muestras.length; i++) {
    const [t0, s0] = muestras[i - 1];
    const [t1, s1] = muestras[i];
    if (s1 >= metros) return s1 > s0 ? t0 + ((metros - s0) / (s1 - s0)) * (t1 - t0) : t1;
  }
  return null;
}

/** Tiempo en texto: «8:12», «1:02:05» o «21,4 s» (tramos cortos). */
export function textoTiempo(ms: number, conDecimas = false) {
  const totalS = ms / 1000;
  if (conDecimas && totalS < 60) return `${totalS.toFixed(1).replace('.', ',')} s`;
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
