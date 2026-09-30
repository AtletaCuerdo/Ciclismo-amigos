/**
 * Rankings del grupo: cada ciclista publica sus totales de siempre y todos los ven.
 *
 *   totales/{uid} = { nombre, sesiones, segundos, metros, desnivel, rueda, t }
 *
 * Se calculan del historial del navegador (que con cuenta es el mismo en todos los dispositivos)
 * y se publican al abrir la web y al guardar cada sesión.
 */
import type { EntrenoGuardado } from '../entrenamiento/tipos';

export interface Totales {
  sesiones: number;
  segundos: number;
  metros: number;
  desnivel: number;
  /** Tiempo a rueda de otro ciclista (s). */
  rueda: number;
}

export interface FilaRanking extends Totales {
  uid: string;
  nombre: string;
  t: number;
}

export function calcularTotales(lista: EntrenoGuardado[]): Totales {
  return lista.reduce<Totales>(
    (a, g) => ({
      sesiones: a.sesiones + 1,
      segundos: a.segundos + g.resumen.duracionS,
      metros: a.metros + g.resumen.distanciaM,
      desnivel: a.desnivel + g.resumen.desnivelM,
      rueda: a.rueda + (g.resumen.segundosRueda ?? 0),
    }),
    { sesiones: 0, segundos: 0, metros: 0, desnivel: 0, rueda: 0 },
  );
}

export async function publicarTotales(nombre: string, t: Totales) {
  const fb = await import('./firebase');
  const yo = await fb.entrarAnonimo();
  await fb.set(fb.ref(fb.db, `totales/${yo.uid}`), {
    nombre: nombre.slice(0, 30) || 'Ciclista',
    sesiones: t.sesiones,
    segundos: Math.round(t.segundos),
    metros: Math.round(t.metros),
    desnivel: Math.round(t.desnivel),
    rueda: Math.round(t.rueda),
    t: fb.serverTimestamp(),
  });
}

/**
 * Totales de todo el grupo. Si alguien aparece dos veces con el mismo nombre (p. ej. un
 * dispositivo sin cuenta y otro con cuenta), se queda la fila con más kilómetros.
 */
export async function leerRankings(): Promise<{ filas: FilaRanking[]; miUid: string }> {
  const fb = await import('./firebase');
  const yo = await fb.entrarAnonimo();
  const snap = await fb.get(fb.ref(fb.db, 'totales'));
  const porNombre = new Map<string, FilaRanking>();
  snap.forEach((hijo) => {
    const v = hijo.val();
    if (!v || typeof v.nombre !== 'string') return;
    const fila: FilaRanking = {
      uid: hijo.key as string,
      nombre: v.nombre,
      sesiones: Number(v.sesiones) || 0,
      segundos: Number(v.segundos) || 0,
      metros: Number(v.metros) || 0,
      desnivel: Number(v.desnivel) || 0,
      rueda: Number(v.rueda) || 0,
      t: Number(v.t) || 0,
    };
    const clave = fila.nombre.trim().toLowerCase();
    const previa = porNombre.get(clave);
    // Mi propia fila siempre gana, para que «tú» salga resaltado
    if (!previa || fila.uid === yo.uid || (previa.uid !== yo.uid && fila.metros > previa.metros)) porNombre.set(clave, fila);
  });
  return { filas: [...porNombre.values()], miUid: yo.uid };
}
