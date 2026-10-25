/**
 * Panel del administrador: quién tiene cuenta en RideCrew y cuánto rueda.
 *
 *   fichas/{uid} = { nombre, correo, sesiones, metros, strava, alta, t }
 *   admins/{uid} = true   (solo se pone a mano en la consola de Firebase)
 *
 * Cada ciclista con cuenta publica su ficha al abrir la web (y al guardar sesiones o conectar
 * Strava). Las reglas solo dejan leer todas las fichas a quien está en `admins`.
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
  /** Fecha de alta de la cuenta (ms). */
  alta: number;
  /** Última vez que abrió la web con la cuenta (ms del servidor). */
  t: number;
}

export async function publicarFicha(uid: string, datos: { nombre: string; sesiones: number; metros: number; strava: boolean }) {
  const { fb } = await cargarFirebase();
  const u = fb.auth.currentUser;
  if (!u || u.uid !== uid) return;
  const alta = Date.parse(u.metadata.creationTime ?? '') || Date.now();
  await fb.set(fb.ref(fb.db, `fichas/${uid}`), {
    nombre: (datos.nombre || 'Ciclista').slice(0, 30),
    correo: (u.email ?? '').slice(0, 100),
    sesiones: datos.sesiones,
    metros: Math.round(datos.metros),
    strava: datos.strava,
    alta,
    t: fb.serverTimestamp(),
  });
}

/** ¿Es esta cuenta la del administrador? (sin las reglas nuevas, simplemente no). */
export async function esAdmin(uid: string) {
  try {
    const { fb } = await cargarFirebase();
    return (await fb.get(fb.ref(fb.db, `admins/${uid}`))).val() === true;
  } catch {
    return false;
  }
}

/** Todas las fichas, de más a menos kilómetros. */
export async function leerFichas(): Promise<Ficha[]> {
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
      alta: Number(v.alta) || 0,
      t: Number(v.t) || 0,
    });
  });
  return lista.sort((a, b) => b.metros - a.metros);
}
