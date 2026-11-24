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
  datos: { nombre: string; sesiones: number; metros: number; strava?: boolean; stravaAtleta?: string; stravaId?: number | string },
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
  // Copia para la pestaña «Usuarios» de TriCoach Entrenos (donde Jesús ve las tres apps juntas)
  const stravaId = strava && datos.strava !== undefined ? datos.stravaId : undefined;
  await enviarATricoach(await u.getIdToken(), {
    nombre: datos.nombre, sesiones: datos.sesiones, metros: Math.round(datos.metros), strava,
    stravaAtleta: strava ? stravaAtleta : undefined, stravaId,
  }).catch(() => undefined);
}

const CLAVE_ENVIO = 'rodillos.fichaTricoach';
/** Como mucho una vez cada 6 h, salvo que cambie algo (nombre, Strava…); sesiones y metros no cuentan */
async function enviarATricoach(idToken: string, ficha: Record<string, unknown>) {
  const huella = JSON.stringify({ ...ficha, sesiones: undefined, metros: undefined });
  try {
    const antes = JSON.parse(localStorage.getItem(CLAVE_ENVIO) || 'null') as { h: string; t: number } | null;
    if (antes && antes.h === huella && Date.now() - antes.t < 6 * 3600_000) return;
  } catch {
    /* sin almacenamiento */
  }
  const r = await fetch('https://entrenos.tricoach.es/api/ridecrew/ficha', {
    method: 'POST',
    body: JSON.stringify({ idToken, ...ficha }),
  });
  if (r.ok) {
    try {
      localStorage.setItem(CLAVE_ENVIO, JSON.stringify({ h: huella, t: Date.now() }));
    } catch {
      /* sin almacenamiento */
    }
  }
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
  // El administrador pasa todas las fichas a TriCoach Entrenos (las lee allí el Worker con este mismo permiso)
  void fb.auth.currentUser
    ?.getIdToken()
    .then((idToken) =>
      fetch('https://entrenos.tricoach.es/api/ridecrew/fichas', { method: 'POST', body: JSON.stringify({ idToken }) }),
    )
    .catch(() => undefined);
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
/**
 * Solo se intenta con cuentas creadas hace menos de esto según el reloj del aparato (holgado por si
 * va mal; el Worker comprueba la hora de verdad con la de Google: 30 min).
 */
const ALTA_RECIENTE_MS = 24 * 3600 * 1000;
/** Esperas entre intentos si el aviso falla (sin conexión, la pestaña se cerró, el Worker no respondió…). */
const REINTENTOS_ALTA_MS = [20_000, 120_000];

/** Cuándo abrió el administrador su panel por última vez (para marcar las cuentas nuevas). */
const CLAVE_VISTO = 'rodillos.adminVisto';
export function adminVistoEn(): number {
  try {
    const v = Number(localStorage.getItem(CLAVE_VISTO));
    if (v > 0) return v;
  } catch {
    // sin almacenamiento
  }
  return Date.now() - 3 * 24 * 3600 * 1000; // la primera vez: las de los últimos 3 días
}
export function marcarAdminVisto() {
  try {
    localStorage.setItem(CLAVE_VISTO, String(Date.now()));
  } catch {
    // no es grave
  }
}
/** Cuentas dadas de alta después de `desde` (ms). */
export const cuentasNuevas = (fichas: Ficha[], desde: number) => fichas.filter((f) => !f.pendiente && f.alta > desde);

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
  // Si falla, se reintenta un par de veces (antes se intentaba una sola vez y el aviso se perdía)
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${urlIntermediario.replace(/\/$/, '')}/alta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await u.getIdToken() }),
      });
      if (r.ok) break;
    } catch {
      // sin conexión: se reintenta
    }
    if (i >= REINTENTOS_ALTA_MS.length || fb.auth.currentUser?.uid !== u.uid) return;
    await new Promise((res) => setTimeout(res, REINTENTOS_ALTA_MS[i]));
  }
  try {
    localStorage.setItem(CLAVE_ALTA, u.uid);
  } catch {
    // no es grave
  }
}

// ---------------------------------------------------------------------------
// RideCoins de regalo del administrador a otras cuentas (para que prueben la tienda y las paradas)
//
//   regalos/{uid} = total regalado (número que solo sube). Lo escribe solo el administrador y lo lee
//   el dueño (se suma a su saldo) y el administrador (para verlo en el panel).
// ---------------------------------------------------------------------------

/** Suma `n` RideCoins a lo regalado a esa cuenta. */
export async function regalarMonedas(uid: string, n: number) {
  const { fb } = await cargarFirebase();
  const r = await fb.runTransaction(fb.ref(fb.db, `regalos/${uid}`), (v) => (Number(v) || 0) + n);
  return Number(r.snapshot.val()) || 0;
}

/** Lo regalado a cada cuenta (solo el administrador puede leerlo). */
export async function leerRegalos(): Promise<Record<string, number>> {
  try {
    const { fb } = await cargarFirebase();
    const snap = await fb.get(fb.ref(fb.db, 'regalos'));
    return (snap.val() as Record<string, number> | null) ?? {};
  } catch {
    return {};
  }
}

/** Escucha lo que me ha regalado el administrador (0 si nada o si las reglas aún no lo permiten). */
export function escucharMisRegalos(uid: string, alCambiar: (n: number) => void) {
  let quitar: (() => void) | null = null;
  let vivo = true;
  void cargarFirebase().then(({ fb }) => {
    if (!vivo) return;
    quitar = fb.onValue(
      fb.ref(fb.db, `regalos/${uid}`),
      (s) => alCambiar(Math.max(0, Number(s.val()) || 0)),
      () => alCambiar(0),
    );
  });
  return () => {
    vivo = false;
    quitar?.();
  };
}

// ---------------------------------------------------------------------------
// Borrar una cuenta (cuentas de prueba): el administrador la bloquea (`bloqueados/{uid}`: ya no puede
// volver a subir nada, aunque tenga su historial en algún navegador) y borra todo lo suyo de la nube.
// La cuenta de Firebase Authentication queda (desde la web no se puede borrar la de otro), pero no sirve.
// ---------------------------------------------------------------------------

export async function borrarCuenta(uid: string) {
  const { fb } = await cargarFirebase();
  if (fb.auth.currentUser?.uid === uid) throw new Error('No puedes borrar tu propia cuenta desde aquí.');
  // Primero bloquearla, para que no vuelva a subir nada mientras se borra
  await fb.set(fb.ref(fb.db, `bloqueados/${uid}`), true);
  const borrar: Record<string, null> = {
    [`totales/${uid}`]: null,
    [`usuarios/${uid}`]: null,
    [`fichas/${uid}`]: null,
    [`regalos/${uid}`]: null,
  };
  // Sus récords de los segmentos y los entrenos que compartió
  const [records, compartidos] = await Promise.all([
    fb.get(fb.ref(fb.db, 'records')).catch(() => null),
    fb.get(fb.ref(fb.db, 'compartidos')).catch(() => null),
  ]);
  const r = (records?.val() ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  for (const [circuito, segmentos] of Object.entries(r))
    for (const [segmento, filas] of Object.entries(segmentos ?? {}))
      if (filas && uid in filas) borrar[`records/${circuito}/${segmento}/${uid}`] = null;
  const c = (compartidos?.val() ?? {}) as Record<string, { autorUid?: string }>;
  for (const [clave, x] of Object.entries(c)) if (x?.autorUid === uid) borrar[`compartidos/${clave}`] = null;
  await fb.update(fb.ref(fb.db), borrar);
}

/** ¿Ha borrado el administrador mi cuenta? (false si no, o si las reglas aún no lo permiten). */
export async function cuentaBloqueada(uid: string) {
  try {
    const { fb } = await cargarFirebase();
    return (await fb.get(fb.ref(fb.db, `bloqueados/${uid}`))).val() === true;
  } catch {
    return false;
  }
}
