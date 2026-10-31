/**
 * RideCoins: la moneda de RideCrew. Se ganan rodando (según el esfuerzo respecto a tu propio FTP,
 * para que un ciclista de 150 W y otro de 300 W que se esfuerzan igual ganen lo mismo) y se gastan
 * en nutrición que, tomada durante la sesión, te hace ir un poco más rápido unos minutos.
 *
 * Lo ganado va en cada sesión del historial (`resumen.monedas`, ya se sincroniza); lo comprado y
 * gastado, en el perfil (`perfil.despensa`). Así no hacen falta reglas nuevas en Firebase.
 * Los contadores de la despensa solo suben: al juntar dos aparatos se queda el mayor de cada uno.
 */
import type { EntrenoGuardado, Muestra } from './tipos';

export type IdNutricion = 'guayaba' | 'gel30' | 'gel30c' | 'gel50' | 'gel50c';

export interface Nutricion {
  id: IdNutricion;
  nombre: string;
  emoji: string;
  carbos: number;
  cafeina: boolean;
  precio: number;
  /** Velocidad de más mientras dura (0,02 = +2 %). */
  mejora: number;
  duracionS: number;
}

export const NUTRICION: Nutricion[] = [
  { id: 'guayaba', nombre: 'Guayaba', emoji: '🍬', carbos: 22, cafeina: false, precio: 15, mejora: 0.02, duracionS: 180 },
  { id: 'gel30', nombre: 'Gel 30 g', emoji: '🧃', carbos: 30, cafeina: false, precio: 25, mejora: 0.025, duracionS: 240 },
  { id: 'gel30c', nombre: 'Gel 30 g con cafeína', emoji: '⚡', carbos: 30, cafeina: true, precio: 35, mejora: 0.035, duracionS: 240 },
  { id: 'gel50', nombre: 'Gel 50 g', emoji: '🧪', carbos: 50, cafeina: false, precio: 40, mejora: 0.03, duracionS: 360 },
  { id: 'gel50c', nombre: 'Gel 50 g con cafeína', emoji: '🚀', carbos: 50, cafeina: true, precio: 55, mejora: 0.04, duracionS: 360 },
];

export const nutricionPorId = (id: IdNutricion) => NUTRICION.find((n) => n.id === id)!;

export interface Despensa {
  /** RideCoins gastados en total. */
  gastado: number;
  /** Unidades compradas y tomadas de cada producto, desde siempre. */
  compradas: Partial<Record<IdNutricion, number>>;
  usadas: Partial<Record<IdNutricion, number>>;
}

export const despensaVacia = (): Despensa => ({ gastado: 0, compradas: {}, usadas: {} });

const contador = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Math.round(Number(x))) : 0);

/** Despensa válida a partir de lo guardado (lo que no cuadre se descarta). */
export function normalizarDespensa(x: unknown): Despensa {
  const d = (x ?? {}) as Record<string, unknown>;
  const lista = (o: unknown) => {
    const r: Partial<Record<IdNutricion, number>> = {};
    for (const n of NUTRICION) {
      const v = contador((o as Record<string, unknown> | undefined)?.[n.id]);
      if (v) r[n.id] = v;
    }
    return r;
  };
  return { gastado: contador(d.gastado), compradas: lista(d.compradas), usadas: lista(d.usadas) };
}

/** Junta la despensa de dos aparatos: los contadores solo suben, así que gana el mayor. */
export function mezclarDespensa(a?: Despensa, b?: Despensa): Despensa {
  const x = normalizarDespensa(a);
  const y = normalizarDespensa(b);
  const max = (p: Partial<Record<IdNutricion, number>>, q: Partial<Record<IdNutricion, number>>) => {
    const r: Partial<Record<IdNutricion, number>> = {};
    for (const n of NUTRICION) {
      const v = Math.max(p[n.id] ?? 0, q[n.id] ?? 0);
      if (v) r[n.id] = v;
    }
    return r;
  };
  return { gastado: Math.max(x.gastado, y.gastado), compradas: max(x.compradas, y.compradas), usadas: max(x.usadas, y.usadas) };
}

export const existencias = (d: Despensa | undefined, id: IdNutricion) =>
  Math.max(0, (d?.compradas[id] ?? 0) - (d?.usadas[id] ?? 0));

export function comprar(d: Despensa | undefined, id: IdNutricion): Despensa {
  const x = normalizarDespensa(d);
  return {
    ...x,
    gastado: x.gastado + nutricionPorId(id).precio,
    compradas: { ...x.compradas, [id]: (x.compradas[id] ?? 0) + 1 },
  };
}

export function tomar(d: Despensa | undefined, id: IdNutricion): Despensa {
  const x = normalizarDespensa(d);
  return { ...x, usadas: { ...x.usadas, [id]: (x.usadas[id] ?? 0) + 1 } };
}

/** RideCoins de una sesión guardada (las de antes de existir las monedas: 1 por minuto). */
export const monedasDe = (g: EntrenoGuardado) => g.resumen.monedas ?? Math.round(g.resumen.duracionS / 60);

export const monedasGanadas = (lista: EntrenoGuardado[]) => lista.reduce((a, g) => a + monedasDe(g), 0);

// ---------------------------------------------------------------------------
// Lo que se gana en una sesión
// ---------------------------------------------------------------------------

/** RideCoins por minuto según la zona (vatios / FTP). */
const POR_MINUTO = [
  { hasta: 0.75, monedas: 1 },
  { hasta: 1.05, monedas: 1.5 },
  { hasta: Infinity, monedas: 2 },
];
const POR_ENTRENO_COMPLETO = 20;
const EXTRA_CON_AMIGO = 0.25;
const PRIMERA_DEL_DIA = 10;
const RACHA_3_DIAS = 25;

const diaLocal = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export interface MonedasSesion {
  total: number;
  /** [concepto, RideCoins] para enseñarlo en el resumen. */
  detalle: [string, number][];
}

/**
 * RideCoins de la sesión que acaba de terminar.
 * `anteriores`: el historial sin esta sesión (para la primera del día y la racha).
 */
export function calcularMonedas(
  muestras: Muestra[],
  inicio: number,
  datos: { ftp: number; entrenosCompletados: number; segundosConAmigo: number; anteriores: EntrenoGuardado[] },
): MonedasSesion {
  // Rodando: cada muestra (≈ 1 s) con pedaleo o con la bici en marcha
  let esfuerzo = 0;
  let segundos = 0;
  for (const m of muestras) {
    if (!((m.p ?? 0) > 10 || (m.v ?? 0) > 3)) continue;
    segundos++;
    const pct = m.p !== undefined && datos.ftp > 0 ? m.p / datos.ftp : 0;
    esfuerzo += POR_MINUTO.find((z) => pct < z.hasta)!.monedas / 60;
  }
  const detalle: [string, number][] = [];
  const base = Math.round(esfuerzo);
  if (base) detalle.push([`${Math.round(segundos / 60)} min rodando`, base]);
  if (datos.segundosConAmigo > 0 && segundos > 0) {
    const extra = Math.round(esfuerzo * EXTRA_CON_AMIGO * Math.min(1, datos.segundosConAmigo / segundos));
    if (extra) detalle.push(['Rodando con amigos', extra]);
  }
  if (datos.entrenosCompletados) {
    detalle.push([
      datos.entrenosCompletados > 1 ? `${datos.entrenosCompletados} entrenos completados` : 'Entreno completado',
      POR_ENTRENO_COMPLETO * datos.entrenosCompletados,
    ]);
  }
  // Primera del día (y racha si también rodaste los dos días anteriores). Sesiones de menos de
  // 5 minutos no cuentan, para que no salga a cuenta empezar y parar.
  if (segundos >= 300) {
    const dias = new Set(datos.anteriores.filter((g) => g.resumen.duracionS >= 300).map((g) => diaLocal(g.inicio)));
    if (!dias.has(diaLocal(inicio))) {
      detalle.push(['Primera sesión del día', PRIMERA_DEL_DIA]);
      const dia = 24 * 3600 * 1000;
      if (dias.has(diaLocal(inicio - dia)) && dias.has(diaLocal(inicio - 2 * dia))) {
        detalle.push(['Racha de 3 días o más', RACHA_3_DIAS]);
      }
    }
  }
  return { total: detalle.reduce((a, [, n]) => a + n, 0), detalle };
}
