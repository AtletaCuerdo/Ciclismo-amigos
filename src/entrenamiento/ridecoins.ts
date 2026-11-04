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
  /** Material comprado (ids de MATERIAL): se tiene para siempre. */
  material?: string[];
}

export const despensaVacia = (): Despensa => ({ gastado: 0, compradas: {}, usadas: {} });

// ---------------------------------------------------------------------------
// Material: bicis, ruedas y cascos. Lo básico es gratis; lo demás se compra una vez.
// ---------------------------------------------------------------------------

export type TipoMaterial = 'bici' | 'ruedas' | 'casco';

export interface Material {
  /** «tipo:valor», con el valor del avatar (modelo, ruedas o cascoModelo). */
  id: string;
  tipo: TipoMaterial;
  valor: string;
  nombre: string;
  precio: number;
  /** Qué cambia al rodar (los efectos están en fisica.ts). */
  efecto: string;
  /** Para qué sirve, en palabras de ciclista. */
  descripcion: string;
}

export const MATERIAL: Material[] = [
  { id: 'ruedas:medio', tipo: 'ruedas', valor: 'medio', nombre: 'Ruedas de perfil medio', precio: 150, efecto: '−1,5 % de resistencia del aire', descripcion: 'Llantas de unos 40 mm: algo más rápidas en llano sin notarse en las subidas. La mejora más barata.' },
  { id: 'ruedas:alto', tipo: 'ruedas', valor: 'alto', nombre: 'Ruedas de perfil alto', precio: 300, efecto: '−2,5 % de resistencia del aire', descripcion: 'Llantas de 60 mm o más: para rodar rápido en llano y en grupeta.' },
  { id: 'ruedas:lenticular', tipo: 'ruedas', valor: 'lenticular', nombre: 'Rueda lenticular', precio: 450, efecto: '−3,5 % de resistencia del aire', descripcion: 'Trasera lenticular y delantera de perfil alto: lo más rápido en llano, para contrarreloj y triatlón.' },
  { id: 'casco:aero', tipo: 'casco', valor: 'aero', nombre: 'Casco aero de contrarreloj', precio: 250, efecto: '−3 % de resistencia del aire', descripcion: 'Casco largo de contrarreloj: de lo que más se nota en llano para lo que cuesta.' },
  { id: 'casco:clasico', tipo: 'casco', valor: 'clasico', nombre: 'Casco clásico con visera', precio: 80, efecto: 'Estético (+1 % de aire)', descripcion: 'Para ir con estilo: abriga un poco más y frena algo con el viento.' },
  { id: 'casco:gorra', tipo: 'casco', valor: 'gorra', nombre: 'Gorra retro', precio: 80, efecto: 'Estético (+2 % de aire)', descripcion: 'La gorra de toda la vida, de los de antes: puro estilo, frena un poco.' },
  { id: 'bici:escaladora', tipo: 'bici', valor: 'escaladora', nombre: 'Bici escaladora', precio: 400, efecto: '1 kg menos y +1 % en las subidas', descripcion: 'Ligera y nerviosa: la mejor para los puertos (Puerto de la Sierra). En llano, casi igual que la de ruta.' },
  { id: 'bici:aero', tipo: 'bici', valor: 'aero', nombre: 'Bici de ruta aero', precio: 500, efecto: '−5 % de aire en llano; −1 % en las subidas', descripcion: 'Tubos perfilados: más rápida en llano y en grupeta, algo peor cuando la carretera pica hacia arriba.' },
  { id: 'bici:cabra', tipo: 'bici', valor: 'cabra', nombre: 'Cabra de triatlón', precio: 700, efecto: '−17 % de aire en llano; −3 % en las subidas (rígida)', descripcion: 'Postura acoplada: la reina del llano y del triatlón, pero rígida y pesada en las subidas. En el recorrido no te pones de pie.' },
];

const IDS_MATERIAL = new Set(MATERIAL.map((m) => m.id));
export const materialPorId = (id: string) => MATERIAL.find((m) => m.id === id);

/** Lo que se tiene sin comprar: la bici de ruta, las ruedas de perfil bajo y el casco de ruta. */
export const materialGratis = (tipo: TipoMaterial, valor: string) =>
  (tipo === 'bici' && valor === 'ruta') || (tipo === 'ruedas' && valor === 'bajo') || (tipo === 'casco' && valor === 'ruta');

export const tieneMaterial = (d: Despensa | undefined, tipo: TipoMaterial, valor: string) =>
  materialGratis(tipo, valor) || !!d?.material?.includes(`${tipo}:${valor}`);

export function comprarMaterial(d: Despensa | undefined, id: string): Despensa {
  const x = normalizarDespensa(d);
  const m = materialPorId(id);
  if (!m || x.material?.includes(id)) return x;
  return { ...x, gastado: x.gastado + m.precio, material: [...(x.material ?? []), id] };
}

/** Se regala lo que ya se llevaba antes de existir la tienda (sin gastar nada). */
export function regalarMaterial(d: Despensa | undefined, ids: string[]): Despensa {
  const x = normalizarDespensa(d);
  const nuevos = ids.filter((id) => IDS_MATERIAL.has(id) && !x.material?.includes(id));
  return nuevos.length ? { ...x, material: [...(x.material ?? []), ...nuevos] } : x;
}

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
  const material = Array.isArray(d.material) ? d.material.filter((m): m is string => IDS_MATERIAL.has(m as string)) : [];
  return {
    gastado: contador(d.gastado),
    compradas: lista(d.compradas),
    usadas: lista(d.usadas),
    ...(material.length ? { material: [...new Set(material)].sort() } : {}),
  };
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
  const material = [...new Set([...(x.material ?? []), ...(y.material ?? [])])].sort();
  return {
    gastado: Math.max(x.gastado, y.gastado),
    compradas: max(x.compradas, y.compradas),
    usadas: max(x.usadas, y.usadas),
    ...(material.length ? { material } : {}),
  };
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
