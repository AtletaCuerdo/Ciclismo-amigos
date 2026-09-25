/**
 * Salida en grupo en tiempo real con Firebase Realtime Database.
 *
 * Estructura en la base de datos:
 *   salas/{sala}/ciclistas/{uid} = { nombre, vatios, velocidad, cadencia, distancia, t }
 *
 * - Cada ciclista escribe solo su nodo (lo imponen las reglas) una vez por segundo.
 * - onDisconnect() borra el nodo si se cierra la web o se pierde la conexión.
 * - Al reconectar se vuelve a registrar onDisconnect y a escribir el nodo completo.
 */
import { useEffect, useRef, useState } from 'react';

export const SALA_POR_DEFECTO = 'general';
const CLAVE_NOMBRE = 'rodillos.nombreCiclista';
/** Un ciclista sin actualizar en este tiempo se oculta (p. ej. pestaña congelada). */
const CADUCIDAD_MS = 15000;

export interface Ciclista {
  uid: string;
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

export type EstadoSalida = 'fuera' | 'entrando' | 'dentro' | 'sin-conexion';

type ModuloFirebase = typeof import('./firebase');

export function cargarNombre() {
  try {
    return localStorage.getItem(CLAVE_NOMBRE) ?? '';
  } catch {
    return '';
  }
}

function guardarNombre(nombre: string) {
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

export function useSalida(leerMisDatos: () => MisDatos) {
  const [estado, setEstado] = useState<EstadoSalida>('fuera');
  const [error, setError] = useState<string | null>(null);
  const [ciclistas, setCiclistas] = useState<Ciclista[]>([]);
  const [miUid, setMiUid] = useState<string | null>(null);
  const [desfaseServidor, setDesfaseServidor] = useState(0);

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
    try {
      await s.fb.onDisconnect(miRef).cancel();
      await s.fb.remove(miRef);
    } catch {
      // Si no hay conexión, lo borrará el onDisconnect registrado en el servidor
    }
    setCiclistas([]);
    setEstado('fuera');
  };

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

  return { estado, error, ciclistas: visibles, miUid, unirse, salir };
}
