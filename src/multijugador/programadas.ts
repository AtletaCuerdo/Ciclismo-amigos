/**
 * Salidas programadas: «Domingo 9:00 · Puerto de la Sierra · 2 vueltas suaves». Cualquiera
 * del grupo la crea, los demás se apuntan y, a la hora, todos entran al mismo circuito.
 *
 *   programadas/{id} = { autorUid, autor, titulo, circuito, hora, apuntados: { uid: nombre } }
 *
 * Las de hace más de un día las borra el primero que las ve (las reglas lo permiten).
 */
import { useEffect, useState } from 'react';

export interface SalidaProgramada {
  id: string;
  autorUid: string;
  autor: string;
  titulo: string;
  circuito: string;
  /** Hora de salida (ms). */
  hora: number;
  apuntados: { uid: string; nombre: string }[];
}

/** Desde 10 minutos antes hasta 2 horas después de la hora: la salida está «en marcha». */
export const ANTES_MS = 10 * 60 * 1000;
export const DURA_MS = 2 * 60 * 60 * 1000;
const CADUCA_MS = 24 * 60 * 60 * 1000;

export function useProgramadas(activo: boolean) {
  const [lista, setLista] = useState<SalidaProgramada[]>([]);
  const [miUid, setMiUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) return;
    let cancelar: (() => void) | null = null;
    let vivo = true;
    void (async () => {
      try {
        const fb = await import('./firebase');
        const yo = await fb.entrarAnonimo();
        if (!vivo) return;
        setMiUid(yo.uid);
        cancelar = fb.onValue(
          fb.ref(fb.db, 'programadas'),
          (snap) => {
            const ahora = Date.now();
            const nuevas: SalidaProgramada[] = [];
            snap.forEach((hijo) => {
              const v = hijo.val();
              if (!v || typeof v.hora !== 'number' || typeof v.titulo !== 'string') return;
              // Caducada: se borra (y no se enseña)
              if (v.hora < ahora - CADUCA_MS) {
                void fb.remove(hijo.ref).catch(() => undefined);
                return;
              }
              if (v.hora < ahora - DURA_MS) return;
              nuevas.push({
                id: hijo.key as string,
                autorUid: String(v.autorUid ?? ''),
                autor: String(v.autor ?? ''),
                titulo: v.titulo,
                circuito: String(v.circuito ?? ''),
                hora: v.hora,
                apuntados: Object.entries((v.apuntados ?? {}) as Record<string, string>).map(([uid, nombre]) => ({
                  uid,
                  nombre: String(nombre),
                })),
              });
            });
            setLista(nuevas.sort((a, b) => a.hora - b.hora));
            setError(null);
          },
          () => setError('No se pueden leer las salidas programadas (¿faltan las reglas nuevas de Firebase?).'),
        );
      } catch {
        if (vivo) setError('Sin conexión con el grupo.');
      }
    })();
    return () => {
      vivo = false;
      cancelar?.();
    };
  }, [activo]);

  /** Crea una salida (y el creador queda apuntado). */
  const crear = async (datos: { titulo: string; circuito: string; hora: number; nombre: string }) => {
    const fb = await import('./firebase');
    const yo = await fb.entrarAnonimo();
    const nombre = datos.nombre.slice(0, 30);
    await fb.push(fb.ref(fb.db, 'programadas'), {
      autorUid: yo.uid,
      autor: nombre,
      titulo: datos.titulo.trim().slice(0, 60) || 'Salida en grupo',
      circuito: datos.circuito,
      hora: Math.round(datos.hora),
      apuntados: { [yo.uid]: nombre },
    });
  };

  const apuntarme = async (id: string, nombre: string, si: boolean) => {
    const fb = await import('./firebase');
    const yo = await fb.entrarAnonimo();
    const ref = fb.ref(fb.db, `programadas/${id}/apuntados/${yo.uid}`);
    await (si ? fb.set(ref, nombre.slice(0, 30)) : fb.remove(ref));
  };

  const borrar = async (id: string) => {
    const fb = await import('./firebase');
    await fb.remove(fb.ref(fb.db, `programadas/${id}`));
  };

  return { lista, miUid, error, crear, apuntarme, borrar };
}
