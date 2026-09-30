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
export function avanzarBots(bots: Bot[], dt: number, ciclistas: number[]) {
  for (const bot of bots) {
    // Los de la grupeta van en formación detrás de su líder
    if (bot.lider) continue;
    const delante = [...ciclistas, ...bots.filter((b) => b !== bot && (!bot.grupo || b.grupo !== bot.grupo)).map((b) => b.s)].map(
      (s) => hueco(bot.s, s),
    );
    // El líder de una grupeta también ahorra algo por ir en grupo (relevos)
    const objetivo = Math.max(ahorroRebufo(delante), bot.grupo ? 0.12 : 0);
    bot.rebufo += (objetivo - bot.rebufo) * Math.min(1, dt * 2);
    bot.fisica.cda = 0.29 * (1 - bot.rebufo);
    bot.fisica.actualizar(bot.vatios, pendiente(bot.s), dt);
    bot.s += bot.fisica.v * dt;
  }
  for (const bot of bots) {
    if (!bot.lider) continue;
    bot.s = bot.lider.s - (bot.retraso ?? 0);
    bot.fisica.v = bot.lider.fisica.v;
  }
}

/** Posiciones relativas de los bots respecto a ti (para tu rebufo). */
export const huecosBots = (bots: Bot[], miPosicion: number) => bots.map((b) => hueco(miPosicion, b.s));
