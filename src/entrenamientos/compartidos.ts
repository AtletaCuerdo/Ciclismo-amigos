/**
 * Entrenamientos compartidos con el grupo (Firebase Realtime Database).
 *
 *   compartidos/{clave} = { autorUid, autor, t, entreno }
 *
 * `clave` = `{uid}_{id del entrenamiento}`: volver a compartirlo lo actualiza. `entreno` va como
 * texto JSON (las reglas solo limitan su tamaño); al leerlo se comprueba que tenga sentido.
 * Solo el autor puede cambiarlo o dejar de compartirlo; el administrador puede borrar cualquiera.
 */
import { useEffect, useState } from 'react';
import { CATEGORIAS, type Bloque, type Entrenamiento } from './tipos';

const TAMANO_MAX = 20000;

/** Comprueba un entrenamiento leído de la nube (lo ha escrito otra persona). */
export function validar(x: unknown): Entrenamiento | null {
  const e = x as Partial<Entrenamiento> | null;
  if (!e || typeof e.nombre !== 'string' || !e.nombre.trim() || !Array.isArray(e.bloques) || e.bloques.length === 0)
    return null;
  if (!CATEGORIAS.some((c) => c.id === e.categoria)) return null;
  const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const bloques: Bloque[] = [];
  for (const b of e.bloques as Bloque[]) {
    if (b?.tipo === 'constante' && num(b.duracionS, 1, 36000) && num(b.potencia, 0, 300))
      bloques.push({
        tipo: 'constante',
        duracionS: b.duracionS,
        potencia: b.potencia,
        ...(b.libre ? { libre: true } : {}),
        ...(num(b.horquilla, 1, 50) ? { horquilla: b.horquilla } : {}),
      });
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
      bloques.push({
        tipo: 'intervalos',
        repeticiones: b.repeticiones,
        onS: b.onS,
        onPotencia: b.onPotencia,
        offS: b.offS,
        offPotencia: b.offPotencia,
        ...(num(b.horquilla, 1, 50) ? { horquilla: b.horquilla } : {}),
      });
    else return null;
  }
  return {
    id: '',
    nombre: e.nombre.slice(0, 60),
    categoria: e.categoria!,
    descripcion: typeof e.descripcion === 'string' ? e.descripcion.slice(0, 500) : '',
    bloques,
    ...(e.origen === 'tricoach' ? { origen: 'tricoach' as const } : {}),
    ...(e.estimaFtp && num(e.estimaFtp.ventanaS, 1, 7200) && num(e.estimaFtp.factor, 0.1, 2)
      ? { estimaFtp: { ventanaS: e.estimaFtp.ventanaS, factor: e.estimaFtp.factor, texto: String(e.estimaFtp.texto ?? '') } }
      : {}),
  };
}

/**
 * Lista en directo de todos los entrenamientos compartidos (también los míos, con `deAmigo.mio`)
 * y funciones para compartir los míos. Los ids de los que he compartido yo van en `misCompartidos`.
 *
 * Para no gastar descargas de Firebase (la carpeta crece con cada usuario), la última lista se guarda en
 * el navegador (`rodillos.compartidosCache`): se enseña al momento y solo se escucha en directo con
 * `enDirecto` (pantalla de Entrenamientos). Al rodar se usa la guardada; si no hay, se lee una vez.
 */
const CLAVE_CACHE = 'rodillos.compartidosCache';

type Fila = { autorUid?: unknown; autor?: unknown; t?: unknown; entreno?: unknown };

function leerCache(): Record<string, Fila> | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CACHE) ?? 'null');
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

function guardarCache(filas: Record<string, Fila>) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(filas));
  } catch {
    // sin sitio: la próxima vez se vuelve a leer de la nube
  }
}

/** Pasa las filas de la nube (o de la caché) a entrenamientos. */
function procesar(filas: Record<string, Fila>, miUid: string | null) {
  const lista: Entrenamiento[] = [];
  const mios = new Set<string>();
  for (const [clave, v] of Object.entries(filas)) {
    if (!v || typeof v.entreno !== 'string') continue;
    let datos: unknown;
    try {
      datos = JSON.parse(v.entreno);
    } catch {
      continue;
    }
    const idOriginal = (datos as { id?: unknown })?.id;
    const mio = !!miUid && v.autorUid === miUid;
    if (mio && typeof idOriginal === 'string') mios.add(idOriginal);
    const e = validar(datos);
    if (!e) continue;
    lista.push({
      ...e,
      id: `amigo-${clave}`,
      deAmigo: { autor: String(v.autor), clave, t: Number(v.t) || 0, ...(mio ? { mio: true } : {}) },
    });
  }
  lista.sort((a, b) => (b.deAmigo?.t ?? 0) - (a.deAmigo?.t ?? 0));
  return { lista, mios };
}

export function useCompartidos(activo: boolean, enDirecto = true) {
  const [amigos, setAmigos] = useState<Entrenamiento[]>([]);
  const [misCompartidos, setMisCompartidos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) return;
    let cerrado = false;
    let cancelar: (() => void) | null = null;
    const poner = (filas: Record<string, Fila>, uid: string | null) => {
      const { lista, mios } = procesar(filas, uid);
      setAmigos(lista);
      setMisCompartidos(mios);
    };
    const cache = leerCache();
    if (cache) poner(cache, null);
    (async () => {
      try {
        const fb = await import('../multijugador/firebase');
        const yo = await fb.usuarioActual();
        if (cerrado) return;
        if (cache) poner(cache, yo.uid);
        const recibir = (val: unknown) => {
          const filas = (val ?? {}) as Record<string, Fila>;
          guardarCache(filas);
          poner(filas, yo.uid);
          setError(null);
        };
        if (enDirecto) {
          cancelar = fb.onValue(
            fb.ref(fb.db, 'compartidos'),
            (snap) => recibir(snap.val()),
            () => setError('Firebase no deja ver los entrenamientos compartidos: hay que pegar las reglas nuevas.'),
          );
        } else if (!cache) {
          recibir((await fb.get(fb.ref(fb.db, 'compartidos'))).val());
        }
      } catch {
        if (!cerrado && !cache) setError('Sin conexión: no se pueden ver los entrenamientos de tus amigos.');
      }
    })();
    return () => {
      cerrado = true;
      cancelar?.();
    };
  }, [activo, enDirecto]);

  /** Comparte (o actualiza) uno de mis entrenamientos con el nombre `autor`. */
  const compartir = async (e: Entrenamiento, autor: string) => {
    const fb = await import('../multijugador/firebase');
    const yo = await fb.usuarioActual();
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
    const yo = await fb.usuarioActual();
    await fb.remove(fb.ref(fb.db, `compartidos/${yo.uid}_${e.id}`));
  };

  /**
   * Quita un entrenamiento de «Compartidos» por su clave: el autor los suyos y el administrador
   * cualquiera (lo imponen las reglas). Al autor le sigue quedando en sus entrenamientos.
   */
  const borrar = async (clave: string) => {
    const fb = await import('../multijugador/firebase');
    try {
      await fb.remove(fb.ref(fb.db, `compartidos/${clave}`));
    } catch {
      throw new Error('Firebase no deja borrarlo: hay que pegar las reglas nuevas.');
    }
  };

  return { amigos, misCompartidos, error, compartir, dejarDeCompartir, borrar };
}
