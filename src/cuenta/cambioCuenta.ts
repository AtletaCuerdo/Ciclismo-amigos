/**
 * Varias cuentas en el mismo navegador (p. ej. un matrimonio en el mismo ordenador): lo guardado en el
 * navegador es solo de una cuenta, la «dueña» (`rodillos.cuenta`).
 *
 * - Al cerrar sesión (`cerrarSesionSegura` en App) primero se comprueba que todo está en la nube y luego se
 *   vacía lo personal de este navegador; la siguiente cuenta recupera lo suyo desde la nube.
 * - Si entra una cuenta distinta de la dueña sin haber pasado por ahí (sesión cerrada de otra forma), lo
 *   guardado es de la otra: se vacía antes de sincronizar, para no subirlo a la cuenta equivocada.
 * - Lo del aparato se queda: rodillo y sensores recordados, calidad, cámara, radio, circuito…
 */
import { vaciarHistorialLocal } from '../entrenamiento/almacen';

const CLAVE_DUENA = 'rodillos.cuenta';

/** Lo que es de cada persona (no del aparato). */
const PERSONALES = [
  'rodillos.perfil',
  'rodillos.perfil.t',
  'rodillos.entrenamientosPropios',
  'rodillos.propiosBorrados',
  'rodillos.strava',
  'rodillos.strava.estado',
  'rodillos.strava.subidos',
  'rodillos.strava.t',
  'rodillos.stravaAqui',
  'rodillos.tricoach',
  'rodillos.tricoachSemana',
  'rodillos.records',
  'rodillos.logrosVistos',
  'rodillos.logrosVersion',
  'rodillos.mejoresCache',
  'rodillos.nivel',
  'rodillos.nombreCiclista',
  'rodillos.asistenteVisto',
  'rodillos.sesionEnCurso',
  'rodillos.fichaTricoach',
  'rodillos.altaAvisada',
  'rodillos.adminVisto',
];
const PREFIJOS_PERSONALES = ['rodillos.fantasma.'];

export function cuentaDuena(): string | null {
  try {
    return localStorage.getItem(CLAVE_DUENA);
  } catch {
    return null;
  }
}

export function apuntarCuentaDuena(uid: string | null) {
  try {
    if (uid) localStorage.setItem(CLAVE_DUENA, uid);
    else localStorage.removeItem(CLAVE_DUENA);
  } catch {
    // sin almacenamiento
  }
}

/** Borra de este navegador lo personal (la nube no se toca). */
export async function vaciarDatosPersonales() {
  try {
    for (const c of PERSONALES) localStorage.removeItem(c);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const c = localStorage.key(i);
      if (c && PREFIJOS_PERSONALES.some((p) => c.startsWith(p))) localStorage.removeItem(c);
    }
  } catch {
    // sin almacenamiento
  }
  await vaciarHistorialLocal().catch(() => {});
}
