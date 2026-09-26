/**
 * Mantiene la pantalla encendida mientras se rueda (si no, el iPad se oscurece y se bloquea
 * a los pocos minutos porque nadie toca la pantalla).
 *
 * NoSleep usa la API Wake Lock del navegador y, si no la hay (algunos iPad/Bluefy), un vídeo
 * invisible en bucle. Hay que activarlo dentro de un clic del usuario.
 */
import NoSleep from 'nosleep.js';

let noSleep: NoSleep | null = null;

export function mantenerPantallaEncendida() {
  try {
    noSleep ??= new NoSleep();
    if (!noSleep.isEnabled) void noSleep.enable().catch(() => undefined);
  } catch {
    // No es grave: la pantalla se apagará como siempre
  }
}

export function soltarPantalla() {
  try {
    noSleep?.disable();
  } catch {
    // nada
  }
}
