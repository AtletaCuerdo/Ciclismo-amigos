/**
 * Niveles del 1 al 100 (como en Zwift o MyWhoosh). Los puntos (XP) salen del historial, así que
 * cuentan también las sesiones de antes de que existieran los niveles:
 *   20 XP por km + 0,5 XP por metro de desnivel + 5 XP por minuto + 100 XP por logro.
 * Cada nivel pide algo más que el anterior: del 1 al 2, 500 XP; del 99 al 100, unos 7.850.
 * Una sesión de una hora suele dar unos 1.000 XP.
 */
import { calcularLogros } from './logros';
import type { EntrenoGuardado, Resumen } from './tipos';
import { NIVEL_MAX } from './nivelPublico';

export { NIVEL_MAX };

const XP_POR_LOGRO = 100;

/** XP para pasar del nivel n al n + 1. */
const paso = (n: number) => 500 + 75 * (n - 1);

/** XP de una sesión (sin los logros). */
export function xpSesion(r: Resumen) {
  return Math.round((r.distanciaM / 1000) * 20 + r.desnivelM * 0.5 + (r.duracionS / 60) * 5);
}

export function xpTotal(lista: EntrenoGuardado[]) {
  const sesiones = lista.reduce((a, g) => a + xpSesion(g.resumen), 0);
  const logros = calcularLogros(lista).filter((l) => l.conseguido).length;
  return sesiones + logros * XP_POR_LOGRO;
}

export interface Nivel {
  nivel: number;
  xp: number;
  /** XP dentro del nivel actual y los que pide el nivel (0 en el nivel máximo). */
  enNivel: number;
  delNivel: number;
}

export function nivelDeXp(xp: number): Nivel {
  let nivel = 1;
  let resto = xp;
  while (nivel < NIVEL_MAX && resto >= paso(nivel)) {
    resto -= paso(nivel);
    nivel++;
  }
  return nivel === NIVEL_MAX ? { nivel, xp, enNivel: 0, delNivel: 0 } : { nivel, xp, enNivel: resto, delNivel: paso(nivel) };
}

export const nivelDe = (lista: EntrenoGuardado[]) => nivelDeXp(xpTotal(lista));
