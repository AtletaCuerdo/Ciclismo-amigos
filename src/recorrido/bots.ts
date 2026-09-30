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
    const delante = [...ciclistas, ...bots.filter((b) => b !== bot).map((b) => b.s)].map((s) => hueco(bot.s, s));
    const objetivo = ahorroRebufo(delante);
    bot.rebufo += (objetivo - bot.rebufo) * Math.min(1, dt * 2);
    bot.fisica.cda = 0.29 * (1 - bot.rebufo);
    bot.fisica.actualizar(bot.vatios, pendiente(bot.s), dt);
    bot.s += bot.fisica.v * dt;
  }
}

/** Posiciones relativas de los bots respecto a ti (para tu rebufo). */
export const huecosBots = (bots: Bot[], miPosicion: number) => bots.map((b) => hueco(miPosicion, b.s));
