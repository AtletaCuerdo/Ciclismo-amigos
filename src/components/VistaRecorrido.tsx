/**
 * Pantalla del recorrido virtual: escena 3D a pantalla completa con el
 * marcador (HUD) y el perfil de la vuelta. Se carga de forma diferida.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Avatar } from '../recorrido/avatar';
import { EscenaRecorrido, type DatosYo, type OtroCiclista } from '../recorrido/escena';
import {
  ALTITUD_MAX,
  ALTITUD_MIN,
  DESNIVEL_VUELTA_M,
  LONGITUD_VUELTA_M,
  altitud,
  enVuelta,
  pendiente,
} from '../recorrido/perfil';
import { formatearTiempo } from './Metrica';

export interface DatosHud extends DatosYo {
  potencia?: number;
  potenciaEstimada: boolean;
  pulso?: number;
}

interface Props {
  avatar: Avatar;
  leerYo: () => DatosHud;
  otros: OtroCiclista[];
  grabacion: {
    corriendo: boolean;
    hayDatos: boolean;
    segundos: number;
    desnivelM: number;
    iniciar: () => void;
    pausar: () => void;
  };
  enSalida: boolean;
  rodilloControlado: boolean;
  /** Modo demostración: deslizador de vatios simulados (null si no está activo). */
  demo: { vatios: number; onCambiar: (w: number) => void } | null;
  onSalir: () => void;
}

const ANCHO_PERFIL = 1000;
const ALTO_PERFIL = 110;

const xPerfil = (s: number) => (enVuelta(s) / LONGITUD_VUELTA_M) * ANCHO_PERFIL;
const yPerfil = (h: number) =>
  ALTO_PERFIL - 8 - ((h - ALTITUD_MIN) / (ALTITUD_MAX - ALTITUD_MIN)) * (ALTO_PERFIL - 24);

export default function VistaRecorrido({
  avatar,
  leerYo,
  otros,
  grabacion,
  enSalida,
  rodilloControlado,
  demo,
  onSalir,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const escena = useRef<EscenaRecorrido | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const leerRef = useRef(leerYo);
  leerRef.current = leerYo;

  // Crear la escena una sola vez (generar el mundo tarda un momento)
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        escena.current = new EscenaRecorrido(contenedor.current!, avatar, () => leerRef.current());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setCargando(false);
    }, 50);
    return () => {
      clearTimeout(id);
      escena.current?.destruir();
      escena.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => escena.current?.cambiarMiAvatar(avatar), [avatar]);
  useEffect(() => escena.current?.actualizarOtros(otros), [otros, cargando]);

  // Perfil de altitud de la vuelta (se calcula una vez)
  const trazoPerfil = useMemo(() => {
    const puntos: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const s = (i / 200) * LONGITUD_VUELTA_M;
      puntos.push(`${((i / 200) * ANCHO_PERFIL).toFixed(1)},${yPerfil(altitud(s)).toFixed(1)}`);
    }
    return `M0,${ALTO_PERFIL} L${puntos.join(' L')} L${ANCHO_PERFIL},${ALTO_PERFIL} Z`;
  }, []);

  const yo = leerYo();
  const pend = pendiente(yo.distancia);
  const vuelta = Math.floor(yo.distancia / LONGITUD_VUELTA_M) + 1;
  const kmVuelta = enVuelta(yo.distancia) / 1000;
  const colorPendiente = pend > 4 ? '#ff4d4f' : pend > 1.5 ? '#ffc233' : pend < -1.5 ? '#6ec1ff' : '#f2f4f8';

  return (
    <div className="recorrido">
      <div className="recorrido-lienzo" ref={contenedor} />

      {cargando && <div className="recorrido-cargando">Generando el recorrido…</div>}
      {error && (
        <div className="recorrido-cargando">
          No se pudo iniciar el 3D en este dispositivo: {error}
        </div>
      )}

      {/* Marcador superior */}
      <div className="hud hud-arriba">
        <div className="hud-dato">
          <span className="hud-valor">{formatearTiempo(grabacion.segundos)}</span>
          <span className="hud-etiqueta">tiempo</span>
        </div>
        <div className="hud-dato">
          <span className="hud-valor">
            {kmVuelta.toFixed(2)}
            <small> / {LONGITUD_VUELTA_M / 1000} km</small>
          </span>
          <span className="hud-etiqueta">vuelta {vuelta}</span>
        </div>
        <div className="hud-dato">
          <span className="hud-valor" style={{ color: colorPendiente }}>
            {pend.toFixed(1)}
            <small> %</small>
          </span>
          <span className="hud-etiqueta">pendiente</span>
        </div>
        <div className="hud-dato">
          <span className="hud-valor">
            {Math.round(grabacion.desnivelM)}
            <small> m</small>
          </span>
          <span className="hud-etiqueta">desnivel +</span>
        </div>
        <div className="hud-botones">
          <button
            className="boton-principal"
            onClick={grabacion.corriendo ? grabacion.pausar : grabacion.iniciar}
          >
            {grabacion.corriendo ? 'Pausa' : grabacion.hayDatos ? 'Seguir' : 'Empezar'}
          </button>
          <button className="boton-secundario" onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>

      {/* Datos principales */}
      <div className="hud hud-lateral">
        <div className="hud-dato grande">
          <span className="hud-valor">
            {yo.potencia !== undefined ? Math.round(yo.potencia) : '--'}
            <small> W</small>
          </span>
          <span className="hud-etiqueta">
            {demo ? 'vatios (simulación)' : yo.potenciaEstimada ? 'vatios (estimada)' : 'vatios'}
          </span>
          {demo && (
            <input
              className="demo-vatios"
              type="range"
              min={0}
              max={450}
              step={10}
              value={demo.vatios}
              onChange={(e) => demo.onCambiar(Number(e.target.value))}
              aria-label="Vatios simulados"
            />
          )}
        </div>
        <div className="hud-dato">
          <span className="hud-valor">
            {yo.velocidad.toFixed(1)}
            <small> km/h</small>
          </span>
          <span className="hud-etiqueta">velocidad</span>
        </div>
        <div className="hud-dato">
          <span className="hud-valor">
            {yo.cadencia ? Math.round(yo.cadencia) : '--'}
            <small> rpm</small>
          </span>
          <span className="hud-etiqueta">cadencia</span>
        </div>
        <div className="hud-dato">
          <span className="hud-valor">
            {yo.pulso ?? '--'}
            <small> ppm</small>
          </span>
          <span className="hud-etiqueta">pulso</span>
        </div>
      </div>

      {!grabacion.corriendo && !cargando && (
        <div className="recorrido-aviso">
          {grabacion.hayDatos ? 'En pausa' : 'Pulsa «Empezar» y pedalea para avanzar'}
        </div>
      )}

      {/* Perfil de la vuelta con la posición de cada uno */}
      <div className="hud hud-perfil">
        <svg viewBox={`0 0 ${ANCHO_PERFIL} ${ALTO_PERFIL}`} preserveAspectRatio="none" aria-hidden>
          <path d={trazoPerfil} className="perfil-relleno" />
          {otros.map((o) => (
            <circle key={o.uid} cx={xPerfil(o.distancia)} cy={yPerfil(altitud(o.distancia))} r={7} className="perfil-otro" />
          ))}
          <circle cx={xPerfil(yo.distancia)} cy={yPerfil(altitud(yo.distancia))} r={9} className="perfil-yo" />
        </svg>
        <div className="perfil-texto">
          Vuelta de {LONGITUD_VUELTA_M / 1000} km · {DESNIVEL_VUELTA_M} m de desnivel
          {rodilloControlado && ' · el rodillo sigue la pendiente'}
          {!enSalida && ' · únete a la «Salida en grupo» para ver a tus amigos'}
        </div>
      </div>
    </div>
  );
}
