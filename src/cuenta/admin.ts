/**
 * Panel del administrador: quién tiene cuenta en RideCrew y cuánto rueda.
 *
 *   fichas/{uid} = { nombre, correo, sesiones, metros, strava, stravaAtleta?, alta, t }
 *
 * Cada ciclista con cuenta publica su ficha al abrir la web (y al guardar sesiones o conectar
 * Strava). Las reglas solo dejan leer todas las fichas al administrador (su uid está escrito en
 * las reglas de `fichas`; también vale `admins/{uid}: true` puesto a mano en la consola).
 */
import { cargarFirebase } from './cuenta';

export interface Ficha {
  uid: string;
  nombre: string;
  correo: string;
  sesiones: number;
  metros: number;
  /** Tiene la subida a Strava conectada (en el último aparato desde el que entró). */
  strava: boolean;
  /** Nombre con el que se conectó a Strava (para saber quién ocupa cada plaza de la aplicación). */
  stravaAtleta?: string;
  /** Fecha de alta de la cuenta (ms). */
  alta: number;
  /** Última vez que abrió la web con la cuenta (ms del servidor). */
  t: number;
  /**
   * Cuenta de antes del panel que aún no ha publicado su ficha: se sabe que tiene cuenta (su perfil
   * está en la nube) y sus totales salen de los rankings, pero sin correo ni fecha de alta.
   */
  pendiente?: boolean;
}

/** `strava` undefined: en este aparato no se sabe (se deja lo que dijo el último que lo sabía). */
export async function publicarFicha(
  uid: string,
  datos: { nombre: string; sesiones: number; metros: number; strava?: boolean; stravaAtleta?: string },
) {
  const { fb } = await cargarFirebase();
  const u = fb.auth.currentUser;
  if (!u || u.uid !== uid) return;
  // Lo que no se sabe en este aparato se deja como lo dejó el último que lo sabía
  const antes = datos.strava === undefined ? ((await fb.get(fb.ref(fb.db, `fichas/${uid}`)).catch(() => null))?.val() ?? {}) : {};
  const strava = datos.strava ?? antes.strava === true;
  const stravaAtleta = datos.strava === undefined ? antes.stravaAtleta : datos.stravaAtleta;
  const alta = Date.parse(u.metadata.creationTime ?? '') || Date.now();
  await fb.set(fb.ref(fb.db, `fichas/${uid}`), {
    nombre: (datos.nombre || 'Ciclista').slice(0, 30),
    correo: (u.email ?? '').slice(0, 100),
    sesiones: datos.sesiones,
    metros: Math.round(datos.metros),
    strava,
    ...(strava && typeof stravaAtleta === 'string' && stravaAtleta ? { stravaAtleta: stravaAtleta.slice(0, 60) } : {}),
    alta,
    t: fb.serverTimestamp(),
  });
}

/**
 * ¿Es esta cuenta la del administrador? Lo deciden las reglas: si deja leer todas las fichas,
 * sí (el administrador está escrito en las reglas o en `admins/{uid}`). Sin permiso, no.
 */
export async function esAdmin(uid: string) {
  try {
    const { fb } = await cargarFirebase();
    if (fb.auth.currentUser?.uid !== uid) return false;
    await fb.get(fb.ref(fb.db, 'fichas'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Todas las cuentas, de más a menos kilómetros: las que ya tienen ficha y, para las de antes que aún
 * no han vuelto a entrar, las que aparecen en los rankings y tienen su perfil en la nube.
 * `sinCuenta`: los que ruedan y salen en los rankings pero sin cuenta.
 */
export async function leerFichas(): Promise<{ fichas: Ficha[]; sinCuenta: number }> {
  const { fb } = await cargarFirebase();
  const snap = await fb.get(fb.ref(fb.db, 'fichas'));
  const lista: Ficha[] = [];
  snap.forEach((hijo) => {
    const v = hijo.val();
    if (!v) return;
    lista.push({
      uid: hijo.key as string,
      nombre: String(v.nombre ?? ''),
      correo: String(v.correo ?? ''),
      sesiones: Number(v.sesiones) || 0,
      metros: Number(v.metros) || 0,
      strava: v.strava === true,
      stravaAtleta: typeof v.stravaAtleta === 'string' ? v.stravaAtleta : undefined,
      alta: Number(v.alta) || 0,
      t: Number(v.t) || 0,
    });
  });
  const conFicha = new Set(lista.map((f) => f.uid));
  let sinCuenta = 0;
  const totales = await fb.get(fb.ref(fb.db, 'totales')).catch(() => null);
  const candidatos: { uid: string; v: Record<string, unknown> }[] = [];
  totales?.forEach((hijo) => {
    if (!conFicha.has(hijo.key as string) && hijo.val()) candidatos.push({ uid: hijo.key as string, v: hijo.val() });
  });
  await Promise.all(
    candidatos.map(async ({ uid, v }) => {
      const perfil = await fb.get(fb.ref(fb.db, `usuarios/${uid}/perfil/ftp`)).catch(() => null);
      if (!perfil?.exists()) {
        sinCuenta++;
        return;
      }
      lista.push({
        uid,
        nombre: String(v.nombre ?? ''),
        correo: '',
        sesiones: Number(v.sesiones) || 0,
        metros: Number(v.metros) || 0,
        strava: false,
        alta: 0,
        t: Number(v.t) || 0,
        pendiente: true,
      });
    }),
  );
  return { fichas: lista.sort((a, b) => b.metros - a.metros), sinCuenta };
}

const CLAVE_ALTA = 'rodillos.altaAvisada';
/** Solo las cuentas creadas hace menos de esto se avisan (las de antes ya existían). */
const ALTA_RECIENTE_MS = 30 * 60 * 1000;

/**
 * Si la cuenta con la que se acaba de entrar es nueva, pide al intermediario (el Worker de Strava)
 * que avise por correo al administrador. Una vez por cuenta y aparato; sin intermediario, nada.
 */
export async function avisarAltaSiNueva(urlIntermediario: string) {
  if (!urlIntermediario) return;
  const { fb } = await cargarFirebase();
  const u = fb.auth.currentUser;
  if (!u || u.isAnonymous) return;
  if (!(Date.now() - (Date.parse(u.metadata.creationTime ?? '') || 0) < ALTA_RECIENTE_MS)) return;
  try {
    if (localStorage.getItem(CLAVE_ALTA) === u.uid) return;
  } catch {
    // sin almacenamiento: se avisa igual (el Worker solo avisa de cuentas recién creadas)
  }
  const r = await fetch(`${urlIntermediario.replace(/\/$/, '')}/alta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: await u.getIdToken() }),
  });
  if (!r.ok) return;
  try {
    localStorage.setItem(CLAVE_ALTA, u.uid);
  } catch {
    // no es grave
  }
}
