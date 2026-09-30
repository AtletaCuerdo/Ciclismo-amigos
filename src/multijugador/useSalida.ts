/**
 * Salida en grupo en tiempo real con Firebase Realtime Database.
 *
 * Estructura en la base de datos:
 *   salas/{sala}/ciclistas/{uid} = { nombre, vatios, velocidad, cadencia, distancia, t }
 *   salas/{sala}/avatares/{uid}  = { maillot, franja, culotte, casco, bici, piel }
 *   salas/{sala}/chat/{id}       = { uid, nombre, texto, t }  (mensajes del grupo)
 * El avatar va aparte: si las reglas de Firebase aún no lo permiten, falla solo
 * esa escritura y la salida en grupo sigue funcionando (con avatar por defecto).
 *
 * - Cada ciclista escribe solo su nodo (lo imponen las reglas) una vez por segundo.
 * - onDisconnect() borra el nodo si se cierra la web o se pierde la conexión.
 * - Al reconectar se vuelve a registrar onDisconnect y a escribir el nodo completo.
 */
import { useEffect, useRef, useState } from 'react';
import { normalizarAvatar, type Avatar } from '../recorrido/avatar';

export const SALA_POR_DEFECTO = 'general';
const CLAVE_NOMBRE = 'rodillos.nombreCiclista';
/** Un ciclista sin actualizar en este tiempo se oculta (p. ej. pestaña congelada). */
const CADUCIDAD_MS = 15000;

export interface Ciclista {
  uid: string;
  /** Sala (circuito) en la que rueda: la rellena useConectados. */
  sala?: string;
  nombre: string;
  vatios?: number;
  velocidad?: number; // km/h
  cadencia?: number; // rpm
  distancia?: number; // m
  t: number; // hora del servidor (ms)
}

export interface MisDatos {
  vatios?: number;
  velocidad?: number;
  cadencia?: number;
  distancia: number; // m
}

export interface Mensaje {
  id: string;
  uid: string;
  nombre: string;
  texto: string;
  t: number; // hora del servidor (ms)
}

/** Mensajes que se cargan del chat (los últimos) y antigüedad máxima que se muestra. */
const MENSAJES_MAX = 40;
const MENSAJE_CADUCA_MS = 3 * 60 * 60 * 1000;
/** Los mensajes de más de un día los borra cualquiera al entrar (lo permiten las reglas). */
const MENSAJE_BORRAR_MS = 24 * 60 * 60 * 1000;
export const TEXTO_MAX = 200;

export type EstadoSalida = 'fuera' | 'entrando' | 'dentro' | 'sin-conexion';

type ModuloFirebase = typeof import('./firebase');

export function cargarNombre() {
  try {
    return localStorage.getItem(CLAVE_NOMBRE) ?? '';
  } catch {
    return '';
  }
}

export function guardarNombre(nombre: string) {
  try {
    localStorage.setItem(CLAVE_NOMBRE, nombre);
  } catch {
    // no es grave
  }
}

/** Traduce los errores de Firebase a algo entendible. */
function mensaje(e: unknown) {
  const codigo = (e as { code?: string })?.code ?? '';
  if (codigo.includes('admin-restricted-operation') || codigo.includes('operation-not-allowed'))
    return 'El acceso anónimo no está activado en Firebase (Authentication → Método de acceso → Anónimo).';
  if (codigo.includes('unauthorized-domain'))
    return 'Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).';
  if (codigo.includes('network-request-failed')) return 'Sin conexión a internet.';
  if (codigo.includes('PERMISSION_DENIED') || String(e).includes('permission_denied'))
    return 'Firebase ha rechazado los datos (revisa las reglas de la Realtime Database).';
  return e instanceof Error ? e.message : String(e);
}

export function useSalida(leerMisDatos: () => MisDatos, avatar: Avatar) {
  const [estado, setEstado] = useState<EstadoSalida>('fuera');
  const [error, setError] = useState<string | null>(null);
  const [ciclistas, setCiclistas] = useState<Ciclista[]>([]);
  const [miUid, setMiUid] = useState<string | null>(null);
  const [desfaseServidor, setDesfaseServidor] = useState(0);
  const [avatares, setAvatares] = useState<Record<string, Avatar>>({});
  const [avatarRechazado, setAvatarRechazado] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [chatRechazado, setChatRechazado] = useState(false);
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;

  const leerRef = useRef(leerMisDatos);
  leerRef.current = leerMisDatos;

  // Todo lo necesario para salir limpiamente
  const sesion = useRef<{
    fb: ModuloFirebase;
    uid: string;
    sala: string;
    nombre: string;
    cancelar: (() => void)[];
    temporizador: ReturnType<typeof setInterval>;
  } | null>(null);

  const unirse = async (nombreEscrito: string, sala = SALA_POR_DEFECTO) => {
    const nombre = nombreEscrito.trim().slice(0, 30);
    if (!nombre) {
      setError('Escribe tu nombre para que te vean los demás.');
      return;
    }
    if (sesion.current) return;
    guardarNombre(nombre);
    setError(null);
    setEstado('entrando');

    try {
      const fb = await import('./firebase');
      const usuario = await fb.entrarAnonimo();
      const uid = usuario.uid;
      const miRef = fb.ref(fb.db, `salas/${sala}/ciclistas/${uid}`);
      const miAvatarRef = fb.ref(fb.db, `salas/${sala}/avatares/${uid}`);
      const cancelar: (() => void)[] = [];

      // Construye mi nodo completo (RTDB no admite undefined: se omite)
      const miNodo = () => {
        const d = leerRef.current();
        const nodo: Record<string, unknown> = {
          nombre,
          distancia: Math.round(Math.max(0, d.distancia)),
          t: fb.serverTimestamp(),
        };
        if (d.vatios !== undefined) nodo.vatios = Math.round(Math.max(0, Math.min(3000, d.vatios)));
        if (d.velocidad !== undefined) nodo.velocidad = Math.round(Math.max(0, Math.min(150, d.velocidad)) * 10) / 10;
        if (d.cadencia !== undefined) nodo.cadencia = Math.round(Math.max(0, Math.min(250, d.cadencia)));
        return nodo;
      };

      // Cada vez que (re)conecta: registrar el borrado automático y escribir el nodo
      cancelar.push(
        fb.onValue(fb.ref(fb.db, '.info/connected'), async (snap) => {
          if (snap.val() !== true) {
            if (sesion.current) setEstado('sin-conexion');
            return;
          }
          try {
            await fb.onDisconnect(miRef).remove();
            await fb.set(miRef, miNodo());
            setEstado('dentro');
            try {
              await fb.onDisconnect(miAvatarRef).remove();
              await fb.set(miAvatarRef, avatarRef.current);
              setAvatarRechazado(false);
            } catch {
              setAvatarRechazado(true);
            }
          } catch (e) {
            setError(mensaje(e));
          }
        }),
      );

      // Diferencia entre mi reloj y el del servidor, para saber qué datos son viejos
      cancelar.push(
        fb.onValue(fb.ref(fb.db, '.info/serverTimeOffset'), (snap) => setDesfaseServidor(Number(snap.val()) || 0)),
      );

      // Lista de ciclistas de la sala, en directo
      cancelar.push(
        fb.onValue(
          fb.ref(fb.db, `salas/${sala}/ciclistas`),
          (snap) => {
            const lista: Ciclista[] = [];
            snap.forEach((hijo) => {
              const v = hijo.val();
              if (v && typeof v.nombre === 'string') lista.push({ uid: hijo.key as string, ...v });
            });
            setCiclistas(lista);
          },
          (e) => setError(mensaje(e)),
        ),
      );

      // Avatares de la sala (si las reglas no lo permiten, se queda vacío)
      cancelar.push(
        fb.onValue(
          fb.ref(fb.db, `salas/${sala}/avatares`),
          (snap) => {
            const mapa: Record<string, Avatar> = {};
            snap.forEach((hijo) => {
              const a = normalizarAvatar(hijo.val());
              if (a) mapa[hijo.key as string] = a;
            });
            setAvatares(mapa);
          },
          () => setAvatares({}),
        ),
      );

      // Chat del grupo: los últimos mensajes, en directo
      cancelar.push(
        fb.onValue(
          fb.query(fb.ref(fb.db, `salas/${sala}/chat`), fb.limitToLast(MENSAJES_MAX)),
          (snap) => {
            const lista: Mensaje[] = [];
            snap.forEach((hijo) => {
              const v = hijo.val();
              if (v && typeof v.texto === 'string' && typeof v.nombre === 'string')
                lista.push({ id: hijo.key as string, uid: String(v.uid), nombre: v.nombre, texto: v.texto, t: Number(v.t) || 0 });
            });
            setMensajes(lista);
            setChatRechazado(false);
            // Limpieza: borrar los mensajes viejos para que la base de datos no crezca
            const limite = Date.now() - MENSAJE_BORRAR_MS;
            for (const m of lista)
              if (m.t && m.t < limite) fb.remove(fb.ref(fb.db, `salas/${sala}/chat/${m.id}`)).catch(() => undefined);
          },
          () => setChatRechazado(true),
        ),
      );

      // Envío de mis datos una vez por segundo
      const temporizador = setInterval(() => {
        fb.set(miRef, miNodo()).catch((e) => setError(mensaje(e)));
      }, 1000);

      sesion.current = { fb, uid, sala, nombre, cancelar, temporizador };
      setMiUid(uid);
    } catch (e) {
      setError(mensaje(e));
      setEstado('fuera');
    }
  };

  const salir = async () => {
    const s = sesion.current;
    if (!s) return;
    sesion.current = null;
    clearInterval(s.temporizador);
    s.cancelar.forEach((c) => c());
    const miRef = s.fb.ref(s.fb.db, `salas/${s.sala}/ciclistas/${s.uid}`);
    const miAvatarRef = s.fb.ref(s.fb.db, `salas/${s.sala}/avatares/${s.uid}`);
    try {
      await s.fb.onDisconnect(miRef).cancel();
      await s.fb.remove(miRef);
      await s.fb.onDisconnect(miAvatarRef).cancel();
      await s.fb.remove(miAvatarRef).catch(() => undefined);
    } catch {
      // Si no hay conexión, lo borrará el onDisconnect registrado en el servidor
    }
    setCiclistas([]);
    setAvatares({});
    setMensajes([]);
    setEstado('fuera');
  };

  /** Envía un mensaje al chat del grupo. */
  const enviarMensaje = async (texto: string) => {
    const s = sesion.current;
    const limpio = texto.trim().slice(0, TEXTO_MAX);
    if (!s || !limpio) return false;
    try {
      await s.fb.push(s.fb.ref(s.fb.db, `salas/${s.sala}/chat`), {
        uid: s.uid,
        nombre: s.nombre,
        texto: limpio,
        t: s.fb.serverTimestamp(),
      });
      setChatRechazado(false);
      return true;
    } catch {
      setChatRechazado(true);
      return false;
    }
  };

  // Si cambio mi avatar estando en la salida, lo comparto al momento
  useEffect(() => {
    const s = sesion.current;
    if (!s || estado !== 'dentro') return;
    s.fb
      .set(s.fb.ref(s.fb.db, `salas/${s.sala}/avatares/${s.uid}`), avatar)
      .then(() => setAvatarRechazado(false))
      .catch(() => setAvatarRechazado(true));
  }, [avatar, estado]);

  // Al desmontar el componente (cerrar la web), salir
  useEffect(() => {
    return () => {
      void salir();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ocultar ciclistas cuyos datos llevan tiempo sin llegar
  const ahoraServidor = Date.now() + desfaseServidor;
  const visibles = ciclistas
    .filter((c) => ahoraServidor - c.t < CADUCIDAD_MS)
    .sort((a, b) => (b.distancia ?? 0) - (a.distancia ?? 0));

  const mensajesVisibles = mensajes.filter((m) => ahoraServidor - m.t < MENSAJE_CADUCA_MS);

  return {
    estado,
    error,
    ciclistas: visibles,
    miUid,
    avatares,
    avatarRechazado,
    desfaseServidor,
    mensajes: mensajesVisibles,
    chatRechazado,
    enviarMensaje,
    unirse,
    salir,
  };
}

/**
 * Quién está rodando ahora en la sala, sin unirse (solo lectura): para la pantalla
 * de inicio, donde se elige al amigo junto al que aparecer.
 */
export function useConectados(activo: boolean, salas: string[] = [SALA_POR_DEFECTO]) {
  const [porSala, setPorSala] = useState<Record<string, Ciclista[]>>({});
  const clave = salas.join(',');
  const [desfaseServidor, setDesfaseServidor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Se vuelve a pintar cada pocos segundos para ocultar a quien deja de enviar datos
  const [, refrescar] = useState(0);

  useEffect(() => {
    if (!activo) {
      setPorSala({});
      return;
    }
    let cerrado = false;
    const cancelar: (() => void)[] = [];
    (async () => {
      try {
        const fb = await import('./firebase');
        await fb.entrarAnonimo();
        if (cerrado) return;
        cancelar.push(
          fb.onValue(fb.ref(fb.db, '.info/serverTimeOffset'), (snap) => setDesfaseServidor(Number(snap.val()) || 0)),
        );
        // Una escucha por circuito: así se ve a todos, vayan por donde vayan
        for (const sala of clave.split(',')) {
          cancelar.push(
            fb.onValue(
              fb.ref(fb.db, `salas/${sala}/ciclistas`),
              (snap) => {
                const lista: Ciclista[] = [];
                snap.forEach((hijo) => {
                  const v = hijo.val();
                  if (v && typeof v.nombre === 'string') lista.push({ uid: hijo.key as string, ...v, sala });
                });
                setPorSala((p) => ({ ...p, [sala]: lista }));
                setError(null);
              },
              (e) => setError(mensaje(e)),
            ),
          );
        }
      } catch (e) {
        if (!cerrado) setError(mensaje(e));
      }
    })();
    const id = setInterval(() => refrescar((n) => n + 1), 5000);
    return () => {
      cerrado = true;
      clearInterval(id);
      cancelar.forEach((c) => c());
    };
  }, [activo, clave]);

  const ahoraServidor = Date.now() + desfaseServidor;
  const visibles = Object.values(porSala)
    .flat()
    .filter((c) => ahoraServidor - c.t < CADUCIDAD_MS)
    .sort((a, b) => (b.distancia ?? 0) - (a.distancia ?? 0));
  return { ciclistas: visibles, error };
}
