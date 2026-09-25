/**
 * Pantalla del recorrido virtual: escena 3D a pantalla completa con el
 * marcador (HUD) y el perfil de la vuelta. Se carga de forma diferida.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Avatar, Calidad } from '../recorrido/avatar';
import { EscenaRecorrido, type DatosYo, type OtroCiclista } from '../recorrido/escena';
import {
  ALTITUD_MAX,
  ALTITUD_MIN,
  DESNIVEL_VUELTA_M,
  LONGITUD_VUELTA_M,
  SUBIDAS,
  altitud,
  enVuelta,
  infoSubidas,
  pendiente,
} from '../recorrido/perfil';
import { formatearTiempo } from './Metrica';

export interface DatosHud extends DatosYo {
  potencia?: number;
  potenciaEstimada: boolean;
  pulso?: number;
  hayCadencia: boolean;
}

interface Props {
  avatar: Avatar;
  calidad: Calidad;
  leerYo: () => DatosHud;
  otros: OtroCiclista[];
  grabacion: {
    corriendo: boolean;
    hayDatos: boolean;
    segundos: number;
    distanciaM: number;
    desnivelM: number;
    potenciaMedia?: number;
    velocidadMedia?: number;
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
  ALTO_PERFIL - 8 - ((h - ALTITUD_MIN) / (ALTITUD_MAX - ALTITUD_MIN)) * (ALTO_PERFIL - 30);

const km = (m: number, dec = 1) => (m / 1000).toFixed(dec).replace('.', ',');

export default function VistaRecorrido({
  avatar,
  calidad,
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
        escena.current = new EscenaRecorrido(contenedor.current!, avatar, () => leerRef.current(), calidad);
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
    for (let i = 0; i <= 250; i++) {
      const s = (i / 250) * LONGITUD_VUELTA_M;
      puntos.push(`${((i / 250) * ANCHO_PERFIL).toFixed(1)},${yPerfil(altitud(s)).toFixed(1)}`);
    }
    return `M0,${ALTO_PERFIL} L${puntos.join(' L')} L${ANCHO_PERFIL},${ALTO_PERFIL} Z`;
  }, []);

  const yo = leerYo();
  const pend = pendiente(yo.distancia);
  const vuelta = Math.floor(yo.distancia / LONGITUD_VUELTA_M) + 1;
  const xYo = xPerfil(yo.distancia);
  const subidas = infoSubidas(yo.distancia);
  const colorPendiente = pend > 4 ? '#ff4d4f' : pend > 1.5 ? '#ffc233' : pend < -1.5 ? '#6ec1ff' : '#f2f4f8';

  return (
    <div className="recorrido">
      <div className="recorrido-lienzo" ref={contenedor} />

      {cargando && <div className="recorrido-cargando">Generando el recorrido…</div>}
      {error && (
        <div className="recorrido-cargando">No se pudo iniciar el 3D en este dispositivo: {error}</div>
      )}

      {/* Barra superior: tiempo, distancia, pendiente */}
      <div className="hud hud-arriba">
        <div className="hud-dato">
          <span className="hud-valor">{formatearTiempo(grabacion.segundos)}</span>
          <span className="hud-etiqueta">tiempo</span>
        </div>
        <div className="hud-dato">
          <span className="hud-valor">
            {km(grabacion.distanciaM, 2)}
            <small> km</small>
          </span>
          <span className="hud-etiqueta">
            distancia · vuelta {vuelta} ({km(enVuelta(yo.distancia))}/{LONGITUD_VUELTA_M / 1000})
          </span>
        </div>
        <div className="hud-dato">
          <span className="hud-valor" style={{ color: colorPendiente }}>
            {pend.toFixed(1).replace('.', ',')}
            <small> %</small>
          </span>
          <span className="hud-etiqueta">pendiente</span>
        </div>
        <div className="hud-dato hud-secundario">
          <span className="hud-valor">
            {Math.round(grabacion.desnivelM)}
            <small> m</small>
          </span>
          <span className="hud-etiqueta">desnivel +</span>
        </div>
        <div className="hud-botones">
          <button className="boton-principal" onClick={grabacion.corriendo ? grabacion.pausar : grabacion.iniciar}>
            {grabacion.corriendo ? 'Pausa' : grabacion.hayDatos ? 'Seguir' : 'Empezar'}
          </button>
          <button className="boton-secundario" onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>

      {/* Panel lateral: potencia, velocidad, cadencia, pulso */}
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
        <div className="hud-par">
          <span className="hud-etiqueta">medios</span>
          <span className="hud-valor-peq">
            {grabacion.potenciaMedia !== undefined ? Math.round(grabacion.potenciaMedia) : '--'} W
          </span>
        </div>
        <div className="hud-separador" />
        <div className="hud-dato">
          <span className="hud-valor">
            {yo.velocidad.toFixed(1).replace('.', ',')}
            <small> km/h</small>
          </span>
          <span className="hud-etiqueta">velocidad</span>
        </div>
        <div className="hud-par">
          <span className="hud-etiqueta">media</span>
          <span className="hud-valor-peq">
            {grabacion.velocidadMedia !== undefined ? grabacion.velocidadMedia.toFixed(1).replace('.', ',') : '--'} km/h
          </span>
        </div>
        <div className="hud-separador" />
        {yo.hayCadencia && (
          <div className="hud-dato">
            <span className="hud-valor">
              {Math.round(yo.cadencia)}
              <small> rpm</small>
            </span>
            <span className="hud-etiqueta">cadencia</span>
          </div>
        )}
        <div className="hud-dato">
          <span className="hud-valor pulso">
            {yo.pulso ?? '--'}
            <small> ppm</small>
          </span>
          <span className="hud-etiqueta">frecuencia cardiaca</span>
        </div>
      </div>

      {!grabacion.corriendo && !cargando && (
        <div className="recorrido-aviso">
          {grabacion.hayDatos ? 'En pausa' : 'Pulsa «Empezar» y pedalea para avanzar'}
        </div>
      )}

      {/* Perfil de la vuelta: recorrido hecho sombreado, tu posición y la de los demás */}
      <div className="hud hud-perfil">
        <div className="perfil-cabecera">
          <span>
            {subidas.actual ? (
              <>
                <strong className="subiendo">Subiendo:</strong> quedan {Math.round(subidas.actual.quedanM)} m de subida en{' '}
                {km(subidas.actual.quedanDistancia)} km
              </>
            ) : (
              <>
                <strong>Próxima subida</strong> en {km(subidas.proxima.distancia)} km: +{subidas.proxima.desnivel} m en{' '}
                {km(subidas.proxima.longitud)} km ({subidas.proxima.pendienteMedia.toFixed(1).replace('.', ',')} % media)
              </>
            )}
          </span>
          <span>
            Quedan <strong>{Math.round(subidas.quedanVuelta)} m</strong> de subida en esta vuelta
          </span>
        </div>
        <div className="perfil-grafica">
          <svg viewBox={`0 0 ${ANCHO_PERFIL} ${ALTO_PERFIL}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <clipPath id="perfil-hecho">
                <rect x={0} y={0} width={xYo} height={ALTO_PERFIL} />
              </clipPath>
            </defs>
            <path d={trazoPerfil} className="perfil-relleno" />
            <path d={trazoPerfil} className="perfil-hecho" clipPath="url(#perfil-hecho)" />
            <line x1={xYo} x2={xYo} y1={0} y2={ALTO_PERFIL} className="perfil-linea" />
          </svg>
          {/* Etiquetas y puntos en HTML para que no se deformen al estirar la gráfica */}
          {SUBIDAS.map((t) => (
            <span
              key={t.inicio}
              className="perfil-etiqueta"
              style={{
                left: `${(xPerfil((t.inicio + t.fin) / 2) / ANCHO_PERFIL) * 100}%`,
                top: `${(yPerfil(altitud(t.fin)) / ALTO_PERFIL) * 100}%`,
              }}
            >
              +{t.desnivel} m
            </span>
          ))}
          {otros.map((o) => (
            <span
              key={o.uid}
              className="perfil-punto otro"
              title={o.nombre}
              style={{
                left: `${(xPerfil(o.distancia) / ANCHO_PERFIL) * 100}%`,
                top: `${(yPerfil(altitud(o.distancia)) / ALTO_PERFIL) * 100}%`,
              }}
            />
          ))}
          <span
            className="perfil-punto yo"
            style={{
              left: `${(xYo / ANCHO_PERFIL) * 100}%`,
              top: `${(yPerfil(altitud(yo.distancia)) / ALTO_PERFIL) * 100}%`,
            }}
          />
        </div>
        <div className="perfil-texto">
          Vuelta de {LONGITUD_VUELTA_M / 1000} km · {DESNIVEL_VUELTA_M} m de desnivel
          {rodilloControlado && ' · el rodillo sigue la pendiente'}
          {!enSalida && ' · únete a la «Salida en grupo» para ver a tus amigos'}
        </div>
      </div>
    </div>
  );
}
