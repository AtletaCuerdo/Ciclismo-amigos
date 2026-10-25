/**
 * Bots: ciclistas virtuales a vatios fijos, con la misma física que tú. Dan y reciben rebufo,
 * así que si uno más fuerte te adelanta te puedes pegar a su rueda. Solo existen en tu pantalla.
 */
import { avatarAleatorio, type Avatar } from './avatar';
import { FisicaVirtual, ahorroRebufo } from './fisica';
import { LONGITUD_VUELTA_M, pendiente } from './perfil';

export interface Bot {
  id: string;
  vatios: number;
  avatar: Avatar;
  /** Punto del circuito (m, contando vueltas). */
  s: number;
  fisica: FisicaVirtual;
  /** Ahorro de aire actual por ir a rueda (para que no cambie a saltos). */
  rebufo: number;
  /** Grupeta a la que pertenece (el líder lleva la física; los demás van en formación detrás). */
  grupo?: string;
  /** Solo en los que no son líder: su líder y cuántos metros van por detrás de él. */
  lider?: Bot;
  retraso?: number;
  /** Posición lateral en la carretera (m), para que la grupeta ruede en formación. */
  carril?: number;
  /** Grupeta compartida de la salida en grupo: su posición la da esta simulación, igual en todas las pantallas. */
  sim?: SimGrupeta;
  /** Acompañante: va siempre a tu lado, a tu ritmo, a `delante` metros de ti (negativo: detrás). */
  acompana?: { delante: number; rebufo: boolean; fase: number };
  /** Grupo de triatlón: sale delante de ti a los vatios que elijas, con un cartel de la distancia. */
  triatlon?: boolean;
  /** Aerodinámica propia (m²) en lugar de la de una bici de carretera (p. ej. la tuya, si llevas cabra). */
  cda?: number;
}

/** Paso fijo de la simulación compartida (s): con el mismo paso, todas las pantallas calculan lo mismo. */
const PASO_SIM_S = 0.25;
/** Velocidad con la que sale una grupeta compartida (m/s). */
const V_SALIDA = 8;

/**
 * Grupeta compartida: sale del punto `s0` a la hora `t0` (del servidor) y avanza con la física a
 * `vatios`, con el ahorro de ir en grupo y sin depender de nadie más. Como todas las pantallas
 * parten de los mismos datos y usan el mismo paso, todas la ven en el mismo sitio.
 */
export class SimGrupeta {
  s: number;
  private t: number;
  readonly fisica = new FisicaVirtual(83);

  constructor(
    readonly vatios: number,
    readonly s0: number,
    readonly t0: number,
  ) {
    this.s = s0;
    this.t = t0;
    this.fisica.cda = 0.29 * (1 - 0.12);
    this.fisica.v = V_SALIDA;
  }

  /** Avanza hasta la hora `ahora` (ms del servidor) en pasos fijos. */
  hasta(ahora: number) {
    const paso = PASO_SIM_S * 1000;
    // Si hace mucho que salió (p. ej. alguien entra una hora después), se calcula todo de golpe
    while (this.t + paso <= ahora) {
      this.fisica.actualizar(this.vatios, pendiente(this.s), PASO_SIM_S);
      this.s += this.fisica.v * PASO_SIM_S;
      this.t += paso;
    }
  }
}

/** Grupetas compartidas (una por cada entrada de la ficha de la salida). */
export function grupetasCompartidas(lista: { vatios: number; s0: number }[], t0: number): Bot[] {
  return lista.flatMap(({ vatios, s0 }) => {
    const grupeta = crearGrupeta(vatios, s0, V_SALIDA);
    grupeta[0].sim = new SimGrupeta(vatios, s0, t0);
    return grupeta;
  });
}

/** Formación de una grupeta de 5: dos parejas y uno cerrando. [metros detrás del líder, carril] */
const FORMACION: [number, number][] = [
  [0, -1.3],
  [0, 0.1],
  [2.3, -1.3],
  [2.3, 0.1],
  [4.6, -0.6],
];

/** Ritmos de las grupetas, en % de tu FTP. */
export const RITMOS_GRUPETA = [
  { nombre: 'suave', pct: 60 },
  { nombre: 'media', pct: 75 },
  { nombre: 'rápida', pct: 90 },
];

/** Vatios de una grupeta a un % de tu FTP (redondeados a 10 W). */
export const vatiosGrupeta = (ftp: number, pct: number) => Math.max(80, Math.round((ftp * pct) / 1000) * 10);

/**
 * Crea una grupeta de 5 en el punto s del circuito. Rueda a `vatios` (con el ahorro de ir en
 * grupo) y, como los bots sueltos, da rebufo al que se pone detrás.
 */
export function crearGrupeta(vatios: number, s: number, velocidadMs: number): Bot[] {
  const grupo = `grupo-${++contador}`;
  const lider = crearBot(vatios, s, 0, velocidadMs);
  lider.s = Math.max(0, s);
  lider.grupo = grupo;
  lider.carril = FORMACION[0][1];
  const grupeta = [lider];
  for (const [retraso, carril] of FORMACION.slice(1)) {
    const b = crearBot(vatios, s, 0, velocidadMs);
    b.grupo = grupo;
    b.lider = lider;
    b.retraso = retraso;
    b.carril = carril;
    b.s = Math.max(0, lider.s - retraso);
    grupeta.push(b);
  }
  return grupeta;
}

/** Vatios que se ofrecen al añadir un bot. */
export const VATIOS_BOTS = [150, 200, 250, 300];

let contador = 0;

/**
 * Crea un bot cerca de ti: si es más fuerte que tú ahora mismo sale 40 m por detrás (para que te
 * alcance y te puedas enganchar); si es más flojo, 60 m por delante (para que lo alcances tú).
 */
export function crearBot(vatios: number, miPosicion: number, misVatios: number, miVelocidadMs: number): Bot {
  const fisica = new FisicaVirtual(83);
  fisica.cda = 0.29;
  fisica.v = miVelocidadMs;
  const detras = vatios >= misVatios;
  return {
    id: `bot-${++contador}`,
    vatios,
    avatar: avatarAleatorio(),
    s: Math.max(0, miPosicion + (detras ? -40 : 60)),
    fisica,
    rebufo: 0,
  };
}

/** Distancia a la que sale el grupo de triatlón por delante de ti (m). */
export const DISTANCIA_TRIATLON_M = 15;

/** Grupo de triatlón de 3: dos delante y uno detrás, que es el que lleva el cartel. [m detrás del líder, carril] */
const FORMACION_TRIATLON: [number, number][] = [
  [0, 0.8],
  [1.9, -0.5],
  [3.8, 1.5],
];

/**
 * Crea el grupo de triatlón con su último ciclista a 15 m por delante de ti, a tu velocidad, y
 * a `vatios` fijos desde ahí: si vas más fuerte te acercas y, si no, se te va. El cartel de la
 * espalda dice a cuántos metros lo llevas (en rojo si te metes en la zona de rebufo).
 */
export function crearGrupoTriatlon(
  vatios: number,
  miPosicion: number,
  miVelocidadMs: number,
  /** Tu aerodinámica y tu peso con la bici: así, a tus mismos vatios irían a tu misma velocidad. */
  como: { cda: number; masaKg: number },
): Bot[] {
  const grupo = `triatlon-${++contador}`;
  const ultimo = FORMACION_TRIATLON[FORMACION_TRIATLON.length - 1][0];
  const sLider = miPosicion + DISTANCIA_TRIATLON_M + ultimo;
  let lider: Bot | undefined;
  return FORMACION_TRIATLON.map(([retraso, carril]) => {
    const b = crearBot(vatios, miPosicion, 0, miVelocidadMs);
    b.grupo = grupo;
    b.triatlon = true;
    b.cda = como.cda;
    b.fisica.masaKg = como.masaKg;
    b.carril = carril;
    b.s = Math.max(0, sLider - retraso);
    if (lider) {
      b.lider = lider;
      b.retraso = retraso;
    } else lider = b;
    return b;
  });
}

/** Grupo de los acompañantes (para quitarlos todos de una vez). */
export const GRUPO_ACOMPANANTES = 'acompanantes';

/**
 * Colocación de los acompañantes: [metros delante de ti, carril]. Tu carril es el 1,5.
 * Con rebufo, uno va 2,7 m por delante en tu carril (ahí el rebufo es pleno); sin rebufo, nadie
 * se pone delante de ti (a tu lado o detrás), así que ruedas acompañado pero con todo el aire.
 */
const FORMACION_ACOMPANANTES: Record<'rebufo' | 'compania', [number, number][]> = {
  rebufo: [
    [2.7, 1.5],
    [-0.8, 0.1],
    [-3, 1.5],
  ],
  compania: [
    [-0.8, 0.1],
    [-2.8, 1.4],
    [-3.2, 0.1],
  ],
};

/** Crea 3 acompañantes que ruedan contigo a tus vatios, con o sin rebufo. */
export function crearAcompanantes(rebufo: boolean, miPosicion: number, misVatios: number, miVelocidadMs: number): Bot[] {
  return FORMACION_ACOMPANANTES[rebufo ? 'rebufo' : 'compania'].map(([delante, carril], i) => {
    const b = crearBot(misVatios, miPosicion, misVatios, miVelocidadMs);
    b.s = Math.max(0, miPosicion + delante);
    b.grupo = GRUPO_ACOMPANANTES;
    b.carril = carril;
    b.acompana = { delante, rebufo, fase: i * 2.1 };
    return b;
  });
}

/**
 * Coloca los acompañantes junto a ti. Se balancean un poco adelante y atrás (como al rodar de
 * verdad), pero el de delante no sale nunca de la zona de rebufo pleno.
 */
export function colocarAcompanantes(bots: Bot[], miPosicion: number, misVatios: number, miVelocidadMs: number, t: number) {
  for (const b of bots) {
    if (!b.acompana) continue;
    const vaiven = 0.25 * Math.sin(t * 0.4 + b.acompana.fase);
    b.s = Math.max(0, miPosicion + b.acompana.delante + vaiven);
    b.fisica.v = miVelocidadMs;
    b.vatios = Math.round(misVatios);
  }
}

/** Distancia de b respecto a a en el circuito (positiva: b va delante), aunque sea otra vuelta. */
function hueco(a: number, b: number) {
  let h = (b - a) % LONGITUD_VUELTA_M;
  if (h > LONGITUD_VUELTA_M / 2) h -= LONGITUD_VUELTA_M;
  if (h < -LONGITUD_VUELTA_M / 2) h += LONGITUD_VUELTA_M;
  return h;
}

/**
 * Avanza los bots dt segundos. `ciclistas`: posiciones de los demás (tú y tus amigos), para
 * que los bots también vayan a rueda.
 */
export function avanzarBots(bots: Bot[], dt: number, ciclistas: number[], ahoraServidor = Date.now()) {
  for (const bot of bots) {
    // Los de la grupeta van en formación detrás de su líder; los acompañantes, contigo
    if (bot.lider || bot.acompana) continue;
    // Grupeta compartida: su posición sale de la simulación común
    if (bot.sim) {
      bot.sim.hasta(ahoraServidor);
      bot.s = bot.sim.s;
      bot.fisica.v = bot.sim.fisica.v;
      continue;
    }
    const delante = [...ciclistas, ...bots.filter((b) => b !== bot && (!bot.grupo || b.grupo !== bot.grupo)).map((b) => b.s)].map(
      (s) => hueco(bot.s, s),
    );
    // El líder de una grupeta también ahorra algo por ir en grupo (relevos). El de triatlón no
    // (en triatlón no se va a rueda): rueda como uno solo a esos vatios
    const objetivo = bot.triatlon ? 0 : Math.max(ahorroRebufo(delante), bot.grupo ? 0.12 : 0);
    bot.rebufo += (objetivo - bot.rebufo) * Math.min(1, dt * 2);
    bot.fisica.cda = (bot.cda ?? 0.29) * (1 - bot.rebufo);
    bot.fisica.actualizar(bot.vatios, pendiente(bot.s), dt);
    bot.s += bot.fisica.v * dt;
  }
  for (const bot of bots) {
    if (!bot.lider) continue;
    bot.s = bot.lider.s - (bot.retraso ?? 0);
    bot.fisica.v = bot.lider.fisica.v;
  }
}

/** Posiciones relativas de los bots respecto a ti (para tu rebufo; los acompañantes sin rebufo no cuentan). */
export const huecosBots = (bots: Bot[], miPosicion: number) =>
  bots.filter((b) => !b.acompana || b.acompana.rebufo).map((b) => hueco(miPosicion, b.s));
