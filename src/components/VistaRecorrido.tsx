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
import type { Tramo } from '../entrenamientos/tipos';
import { GraficaEntrenamiento } from './GraficaEntrenamiento';
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
  /** Entrenamiento guiado en curso (null al rodar libre). */
  entreno: {
    entreno: { nombre: string };
    tramos: Tramo[];
    total: number;
    segundos: number;
    objetivoW?: number;
    ftp: number;
    erg: boolean;
  } | null;
  onTerminar: () => void;
  onSalir: () => void;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

/** Panel del entrenamiento guiado: objetivo, tiempo del tramo, siguiente tramo y gráfica. */
function PanelEntreno({ e, potencia }: { e: NonNullable<Props['entreno']>; potencia?: number }) {
  const t = e.segundos;
  const i = e.tramos.findIndex((x) => t >= x.inicio && t < x.inicio + x.duracion);
  const actual = e.tramos[i];
  const siguiente = i >= 0 ? e.tramos[i + 1] : undefined;
  const w = (pct: number) => Math.round((pct * e.ftp) / 100);
  const acabado = t >= e.total;
  // Cumplimiento: verde si vas a ±5 % del objetivo, amarillo ±12 %, rojo fuera
  let clase = '';
  if (e.objetivoW && potencia !== undefined && !actual?.libre) {
    const d = Math.abs(potencia - e.objetivoW) / e.objetivoW;
    clase = d <= 0.05 ? 'bien' : d <= 0.12 ? 'regular' : 'mal';
  }
  return (
    <div className="hud hud-entreno">
      <div className="hud-entreno-cabecera">
        <strong>{e.entreno.nombre}</strong>
        <span>
          {mmss(Math.min(t, e.total))} / {mmss(e.total)}
          {actual?.libre ? ' · ¡a tope! (sin ERG)' : e.erg ? ' · ERG' : ' · sigue el objetivo'}
        </span>
      </div>
      {acabado ? (
        <div className="hud-entreno-fin">¡Entrenamiento completado! Pulsa «Terminar» para guardarlo.</div>
      ) : (
        actual && (
          <div className="hud-entreno-datos">
            <div className={`hud-objetivo ${clase}`}>
              <span className="hud-valor">
                {e.objetivoW ?? '--'}
                <small> W</small>
              </span>
              <span className="hud-etiqueta">
                {actual.libre ? 'orientativo: da todo' : `objetivo${actual.desde !== actual.hasta ? ' (rampa)' : ''}`}
              </span>
            </div>
            <div>
              <span className="hud-valor">{mmss(actual.inicio + actual.duracion - t)}</span>
              <span className="hud-etiqueta">queda del tramo</span>
            </div>
            <div className="hud-siguiente">
              {siguiente ? (
                <>
                  <span className="hud-etiqueta">siguiente</span>
                  <span>
                    {mmss(siguiente.duracion)} a {w(siguiente.desde)}
                    {siguiente.desde !== siguiente.hasta ? `→${w(siguiente.hasta)}` : ''} W
                  </span>
                </>
              ) : (
                <span className="hud-etiqueta">último tramo</span>
              )}
            </div>
          </div>
        )
      )}
      <GraficaEntrenamiento tramos={e.tramos} progreso={t} alto={42} className="en-hud" />
    </div>
  );
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
  entreno,
  onTerminar,
  onSalir,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const escena = useRef<EscenaRecorrido | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const leerRef = useRef(leerYo);
  leerRef.current = leerYo;
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  // Si el sistema corta el 3D por falta de memoria, se vuelve a crear la escena en calidad media
  const [reinicios, setReinicios] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const calidadActual: Calidad = reinicios > 0 ? 'media' : calidad;

  // Crear la escena (generar el mundo tarda un momento); se recrea tras perder el 3D
  useEffect(() => {
    setCargando(true);
    const id = setTimeout(() => {
      try {
        const e = new EscenaRecorrido(contenedor.current!, avatarRef.current, () => leerRef.current(), calidadActual);
        e.onContextoPerdido = () => {
          if (reinicios >= 3) {
            setError('el dispositivo se ha quedado sin memoria gráfica varias veces. Cierra otras pestañas o apps y vuelve a entrar.');
            return;
          }
          setAviso('El dispositivo se quedó sin memoria gráfica: se ha reiniciado el recorrido en calidad media.');
          setReinicios((n) => n + 1);
        };
        escena.current = e;
      } catch (e) {
        // Suele pasar si el sistema aún no ha liberado el 3D anterior: se reintenta un poco después
        console.warn('No se pudo crear la escena', e);
        if (reinicios < 3) {
          setReinicios((n) => n + 1);
          return;
        }
        setError('el navegador no deja usar el 3D ahora mismo. Cierra otras pestañas o apps y vuelve a entrar.');
      }
      setCargando(false);
    }, reinicios > 0 ? 1500 : 50); // tras un corte, dar tiempo a que se libere la memoria
    return () => {
      clearTimeout(id);
      escena.current?.destruir();
      escena.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reinicios]);

  // El aviso de reinicio desaparece solo
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(id);
  }, [aviso]);

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
      {aviso && !cargando && <div className="recorrido-aviso recorrido-aviso-abajo">{aviso}</div>}
      {error && (
        <div className="recorrido-cargando">No se pudo iniciar el 3D en este dispositivo: {error}</div>
      )}

      {/* Capa del marcador: todos los datos van arriba; el centro queda libre para ver el recorrido */}
      <div className="hud-capa">
      <div className="hud hud-arriba">
        <div className="hud-filas">
          {/* Fila principal: lo que se mira pedaleando */}
          <div className="hud-fila">
            <div className="hud-dato potencia">
              <span className="hud-valor">
                {yo.potencia !== undefined ? Math.round(yo.potencia) : '--'}
                <small> W</small>
              </span>
              <span className="hud-etiqueta">
                {demo ? 'vatios (simulación)' : yo.potenciaEstimada ? 'vatios (estimada)' : 'vatios'}
              </span>
            </div>
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
            <div className="hud-dato">
              <span className="hud-valor">
                {yo.velocidad.toFixed(1).replace('.', ',')}
                <small> km/h</small>
              </span>
              <span className="hud-etiqueta">velocidad</span>
            </div>
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
              <span className="hud-etiqueta">pulso</span>
            </div>
            <div className="hud-dato">
              <span className="hud-valor" style={{ color: colorPendiente }}>
                {pend.toFixed(1).replace('.', ',')}
                <small> %</small>
              </span>
              <span className="hud-etiqueta">pendiente</span>
            </div>
          </div>
          {/* Segunda fila: acumulados y medias */}
          <div className="hud-fila hud-fila-2">
            <span>
              <b>{formatearTiempo(grabacion.segundos)}</b> tiempo
            </span>
            <span>
              <b>{km(grabacion.distanciaM, 2)} km</b> · vuelta {vuelta} ({km(enVuelta(yo.distancia))}/
              {LONGITUD_VUELTA_M / 1000})
            </span>
            <span>
              <b>{Math.round(grabacion.desnivelM)} m</b> desnivel +
            </span>
            <span>
              <b>{grabacion.potenciaMedia !== undefined ? Math.round(grabacion.potenciaMedia) : '--'} W</b> media
            </span>
            <span>
              <b>
                {grabacion.velocidadMedia !== undefined ? grabacion.velocidadMedia.toFixed(1).replace('.', ',') : '--'}{' '}
                km/h
              </b>{' '}
              media
            </span>
          </div>
        </div>
        <div className="hud-botones">
          <button className="boton-principal" onClick={grabacion.corriendo ? grabacion.pausar : grabacion.iniciar}>
            {grabacion.corriendo ? 'Pausa' : grabacion.hayDatos ? 'Seguir' : 'Empezar'}
          </button>
          {grabacion.hayDatos && (
            <button className="boton-principal boton-finalizar" onClick={onTerminar}>
              Terminar
            </button>
          )}
          <button className="boton-secundario" onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>

      {/* Zona central libre; el entrenamiento guiado va arriba a la izquierda, pegado a la barra */}
      <div className="hud-medio">{entreno && <PanelEntreno e={entreno} potencia={yo.potencia} />}</div>

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
          {rodilloControlado && (entreno ? ' · rodillo en modo ERG' : ' · el rodillo sigue la pendiente')}
          {!enSalida && ' · únete a la «Salida en grupo» para ver a tus amigos'}
        </div>
      </div>
      </div>
    </div>
  );
}
