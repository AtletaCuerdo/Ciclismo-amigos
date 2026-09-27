/**
 * Piezas de la interfaz para Strava: panel de conexión (Ajustes) y botón/estado de subida
 * (resumen del entrenamiento e historial). Todo se oculta si Strava no está configurado.
 */
import { useEffect, useRef, useState } from 'react';
import type { Entreno, EntrenoGuardado } from '../entrenamiento/tipos';
import {
  cambiarAutoSubida,
  conectarStrava,
  desconectarStrava,
  enlaceActividad,
  leerConexion,
  stravaDisponible,
  subirAStrava,
} from '../strava/strava';

/** Conexión actual, actualizada si cambia en otra parte de la web. */
function useConexionStrava() {
  const [c, setC] = useState(leerConexion);
  useEffect(() => {
    const cambiar = () => setC(leerConexion());
    window.addEventListener('strava-cambio', cambiar);
    return () => window.removeEventListener('strava-cambio', cambiar);
  }, []);
  return c;
}

// Entrenamientos ya subidos (id → actividad de Strava), para no subirlos dos veces
const CLAVE_SUBIDOS = 'rodillos.strava.subidos';
function leerSubidos(): Record<string, number | true> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SUBIDOS) ?? '{}');
  } catch {
    return {};
  }
}
function apuntarSubido(id: string, actividad: number | null) {
  try {
    localStorage.setItem(CLAVE_SUBIDOS, JSON.stringify({ ...leerSubidos(), [id]: actividad ?? true }));
  } catch {
    // no es grave: como mucho, Strava avisará de que está duplicado
  }
}
/** Subidas en curso en esta pestaña (para no lanzar dos a la vez del mismo entrenamiento). */
const enCurso = new Set<string>();

export function PanelStrava() {
  const c = useConexionStrava();
  if (!stravaDisponible()) return null;
  return (
    <section className="panel panel-strava">
      <h2>Strava</h2>
      {c ? (
        <>
          <p>
            Conectado como <strong>{c.atleta}</strong>.
          </p>
          <label className="casilla">
            <input type="checkbox" checked={c.auto} onChange={(e) => cambiarAutoSubida(e.target.checked)} />
            Subir cada entrenamiento a Strava al terminar
          </label>
          <button className="boton-secundario" onClick={() => void desconectarStrava()}>
            Desconectar Strava
          </button>
        </>
      ) : (
        <>
          <p className="detalle">
            Conecta tu cuenta una vez y cada entrenamiento se subirá solo a Strava al pulsar «Terminar», como
            «Virtual Ride». El permiso se guarda solo en este dispositivo.
          </p>
          <button className="boton-strava" onClick={conectarStrava}>
            Conectar con Strava
          </button>
        </>
      )}
    </section>
  );
}

type Estado =
  | { tipo: 'nada' }
  | { tipo: 'subiendo' }
  | { tipo: 'hecho'; actividad: number | null; duplicada?: boolean }
  | { tipo: 'error'; texto: string };

/**
 * Botón «Subir a Strava» con su estado. Con `auto`, si el ciclista tiene activada la subida
 * automática, se sube solo al aparecer (una única vez por entrenamiento).
 */
export function BotonStrava({ id, obtener, nombre, descripcion, auto = false }: {
  /** Identificador del entrenamiento (para no subirlo dos veces). */
  id: string;
  /** Devuelve el entrenamiento completo (en el historial hay que leerlo de la base de datos). */
  obtener: () => Promise<Entreno>;
  nombre: string;
  descripcion: string;
  auto?: boolean;
}) {
  const c = useConexionStrava();
  const previo = leerSubidos()[id];
  const [estado, setEstado] = useState<Estado>(
    previo ? { tipo: 'hecho', actividad: previo === true ? null : previo } : { tipo: 'nada' },
  );
  const lanzado = useRef(false);

  const subir = async () => {
    if (enCurso.has(id)) return;
    enCurso.add(id);
    setEstado({ tipo: 'subiendo' });
    try {
      const r = await subirAStrava(await obtener(), nombre, descripcion);
      if (r.actividad || r.duplicada || r.pendiente) apuntarSubido(id, r.actividad);
      setEstado({ tipo: 'hecho', actividad: r.actividad, duplicada: r.duplicada });
    } catch (e) {
      setEstado({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      enCurso.delete(id);
    }
  };

  useEffect(() => {
    if (auto && c?.auto && !previo && !lanzado.current) {
      lanzado.current = true;
      void subir();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, c?.auto, id]);

  if (!stravaDisponible() || !c) return null;
  return (
    <div className="estado-strava">
      {estado.tipo === 'nada' && (
        <button className="boton-strava" onClick={() => void subir()}>
          Subir a Strava
        </button>
      )}
      {estado.tipo === 'subiendo' && <span>Subiendo a Strava…</span>}
      {estado.tipo === 'hecho' && (
        <span>
          {estado.duplicada ? 'Ya estaba en Strava.' : 'Subido a Strava ✓'}{' '}
          {estado.actividad && (
            <a href={enlaceActividad(estado.actividad)} target="_blank" rel="noreferrer">
              Ver en Strava
            </a>
          )}
        </span>
      )}
      {estado.tipo === 'error' && (
        <span className="error-strava">
          No se pudo subir: {estado.texto}{' '}
          <button className="boton-secundario" onClick={() => void subir()}>
            Reintentar
          </button>
        </span>
      )}
    </div>
  );
}

/** Nombre y descripción de la actividad en Strava. */
export function textosStrava(e: EntrenoGuardado, nombreEntreno?: string) {
  const r = e.resumen;
  const km = (r.distanciaM / 1000).toFixed(1).replace('.', ',');
  const nombre = nombreEntreno ? `${nombreEntreno} · rodillo` : `Rodaje virtual · ${km} km`;
  const partes = [`${km} km`];
  if (r.desnivelM > 0) partes.push(`${Math.round(r.desnivelM)} m de desnivel`);
  if (r.potenciaMedia !== undefined) partes.push(`${Math.round(r.potenciaMedia)} W de media${r.potenciaEstimada ? ' (estimada)' : ''}`);
  const descripcion = `${nombreEntreno ? `Entrenamiento «${nombreEntreno}». ` : ''}${partes.join(' · ')}. Rodado en rodillo con RideCrew.`;
  return { nombre, descripcion };
}
