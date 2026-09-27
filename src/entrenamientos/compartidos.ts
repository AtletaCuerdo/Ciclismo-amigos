/**
 * Entrenamientos compartidos con el grupo (Firebase Realtime Database).
 *
 *   compartidos/{clave} = { autorUid, autor, t, entreno }
 *
 * `clave` = `{uid}_{id del entrenamiento}`: volver a compartirlo lo actualiza. `entreno` va como
 * texto JSON (las reglas solo limitan su tamaño); al leerlo se comprueba que tenga sentido.
 * Solo el autor puede cambiarlo o dejar de compartirlo (lo imponen las reglas).
 */
import { useEffect, useState } from 'react';
import { CATEGORIAS, type Bloque, type Entrenamiento } from './tipos';

const TAMANO_MAX = 20000;

/** Comprueba un entrenamiento leído de la nube (lo ha escrito otra persona). */
function validar(x: unknown): Entrenamiento | null {
  const e = x as Partial<Entrenamiento> | null;
  if (!e || typeof e.nombre !== 'string' || !e.nombre.trim() || !Array.isArray(e.bloques) || e.bloques.length === 0)
    return null;
  if (!CATEGORIAS.some((c) => c.id === e.categoria)) return null;
  const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const bloques: Bloque[] = [];
  for (const b of e.bloques as Bloque[]) {
    if (b?.tipo === 'constante' && num(b.duracionS, 1, 36000) && num(b.potencia, 0, 300))
      bloques.push({ tipo: 'constante', duracionS: b.duracionS, potencia: b.potencia, ...(b.libre ? { libre: true } : {}) });
    else if (b?.tipo === 'rampa' && num(b.duracionS, 1, 36000) && num(b.desde, 0, 300) && num(b.hasta, 0, 300))
      bloques.push({ tipo: 'rampa', duracionS: b.duracionS, desde: b.desde, hasta: b.hasta });
    else if (
      b?.tipo === 'intervalos' &&
      num(b.repeticiones, 1, 100) &&
      num(b.onS, 1, 7200) &&
      num(b.offS, 0, 7200) &&
      num(b.onPotencia, 0, 300) &&
      num(b.offPotencia, 0, 300)
    )
      bloques.push({ ...b });
    else return null;
  }
  return {
    id: '',
    nombre: e.nombre.slice(0, 60),
    categoria: e.categoria!,
    descripcion: typeof e.descripcion === 'string' ? e.descripcion.slice(0, 500) : '',
    bloques,
    ...(e.estimaFtp && num(e.estimaFtp.ventanaS, 1, 7200) && num(e.estimaFtp.factor, 0.1, 2)
      ? { estimaFtp: { ventanaS: e.estimaFtp.ventanaS, factor: e.estimaFtp.factor, texto: String(e.estimaFtp.texto ?? '') } }
      : {}),
  };
}

/**
 * Lista en directo de todos los entrenamientos compartidos (también los míos, con `deAmigo.mio`)
 * y funciones para compartir los míos. Los ids de los que he compartido yo van en `misCompartidos`.
 */
export function useCompartidos(activo: boolean) {
  const [amigos, setAmigos] = useState<Entrenamiento[]>([]);
  const [misCompartidos, setMisCompartidos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) return;
    let cerrado = false;
    let cancelar: (() => void) | null = null;
    (async () => {
      try {
        const fb = await import('../multijugador/firebase');
        const yo = await fb.entrarAnonimo();
        if (cerrado) return;
        cancelar = fb.onValue(
          fb.ref(fb.db, 'compartidos'),
          (snap) => {
            const lista: Entrenamiento[] = [];
            const mios = new Set<string>();
            snap.forEach((hijo) => {
              const v = hijo.val();
              if (!v || typeof v.entreno !== 'string') return;
              let datos: unknown;
              try {
                datos = JSON.parse(v.entreno);
              } catch {
                return;
              }
              const idOriginal = (datos as { id?: unknown })?.id;
              const mio = v.autorUid === yo.uid;
              if (mio && typeof idOriginal === 'string') mios.add(idOriginal);
              const e = validar(datos);
              if (!e) return;
              const clave = hijo.key as string;
              lista.push({
                ...e,
                id: `amigo-${clave}`,
                deAmigo: { autor: String(v.autor), clave, t: Number(v.t) || 0, ...(mio ? { mio: true } : {}) },
              });
            });
            lista.sort((a, b) => (b.deAmigo?.t ?? 0) - (a.deAmigo?.t ?? 0));
            setAmigos(lista);
            setMisCompartidos(mios);
            setError(null);
          },
          () => setError('Firebase no deja ver los entrenamientos compartidos: hay que pegar las reglas nuevas.'),
        );
      } catch {
        if (!cerrado) setError('Sin conexión: no se pueden ver los entrenamientos de tus amigos.');
      }
    })();
    return () => {
      cerrado = true;
      cancelar?.();
    };
  }, [activo]);

  /** Comparte (o actualiza) uno de mis entrenamientos con el nombre `autor`. */
  const compartir = async (e: Entrenamiento, autor: string) => {
    const fb = await import('../multijugador/firebase');
    const yo = await fb.entrarAnonimo();
    const { propio: _p, deAmigo: _d, ...limpio } = e;
    const texto = JSON.stringify(limpio);
    if (texto.length > TAMANO_MAX) throw new Error('El entrenamiento es demasiado largo para compartirlo.');
    try {
      await fb.set(fb.ref(fb.db, `compartidos/${yo.uid}_${e.id}`), {
        autorUid: yo.uid,
        autor: autor.slice(0, 30),
        t: fb.serverTimestamp(),
        entreno: texto,
      });
    } catch {
      throw new Error('Firebase no deja compartir: hay que pegar las reglas nuevas.');
    }
  };

  /** Deja de compartir uno de mis entrenamientos. */
  const dejarDeCompartir = async (e: Entrenamiento) => {
    const fb = await import('../multijugador/firebase');
    const yo = await fb.entrarAnonimo();
    await fb.remove(fb.ref(fb.db, `compartidos/${yo.uid}_${e.id}`));
  };

  return { amigos, misCompartidos, error, compartir, dejarDeCompartir };
}
