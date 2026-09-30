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
import type { Entrenamiento, Tramo } from '../entrenamientos/tipos';
import { SelectorEntreno } from './SelectorEntreno';
import { ChatGrupo } from './ChatGrupo';
import type { Mensaje } from '../multijugador/useSalida';
import { GraficaEntrenamiento, colorZona } from './GraficaEntrenamiento';
import { formatearTiempo } from './Metrica';
import { mantenerPantallaEncendida } from '../pantallaEncendida';

export interface DatosHud extends DatosYo {
  potencia?: number;
  potenciaEstimada: boolean;
  pulso?: number;
  hayCadencia: boolean;
  /** Ahorro de aire por ir a rueda (0 … 0,3). */
  rebufo: number;
  /** Tiempo acumulado a rueda en esta sesión (s). */
  segundosRueda: number;
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
    cadenciaMedia?: number;
    pulsoMedio?: number;
    kilojulios: number;
    iniciar: () => void;
    pausar: () => void;
  };
  enSalida: boolean;
  /** FTP del ciclista: colorea los vatios según la zona. */
  ftp: number;
  entrandoSalida: boolean;
  errorSalida: string | null;
  /** Unirse a la salida en grupo sin salir del recorrido. */
  onUnirseSalida: () => void;
  /** Ponerse en el punto `s` del circuito (junto a un amigo). */
  onJuntoA: (s: number) => void;
  /** Chat del grupo (solo en la salida). */
  chat: {
    mensajes: Mensaje[];
    miUid: string | null;
    rechazado: boolean;
    onEnviar: (texto: string) => Promise<boolean>;
  } | null;
  rodilloControlado: boolean;
  /** Modo demostración: deslizador de vatios simulados (null si no está activo). */
  demo: { vatios: number; onCambiar: (w: number) => void } | null;
  /** Cambios virtuales: marcha actual (1-24). `activa`: false si el ERG de un entrenamiento manda. */
  marcha: { n: number; total: number; onCambiar: (delta: number) => void; activa: boolean } | null;
  /** Elite Novo Force: posición de la palanca del manillar (1-8), para cambiarla en directo. */
  palanca: { posicion: number; onCambiar: (n: number) => void } | null;
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
  /** Todos los entrenamientos (para elegir otro sin salir del recorrido). */
  entrenamientos: Entrenamiento[];
  /** Empieza otro entrenamiento en la misma sesión (se guarda todo como una sola actividad). */
  onOtroEntreno: (e: Entrenamiento) => void;
  /** Deja el entrenamiento y sigue rodando libre. */
  onSeguirLibre: () => void;
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
        <div className="hud-entreno-fin">¡Entrenamiento completado!</div>
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

const CLAVE_PERFIL = 'rodillos.perfilVuelta';

const km = (m: number, dec = 1) => (m / 1000).toFixed(dec).replace('.', ',');

export default function VistaRecorrido({
  avatar,
  calidad,
  leerYo,
  otros,
  grabacion,
  enSalida,
  ftp,
  entrandoSalida,
  errorSalida,
  onUnirseSalida,
  onJuntoA,
  chat,
  rodilloControlado,
  demo,
  marcha,
  palanca,
  entreno,
  entrenamientos,
  onOtroEntreno,
  onSeguirLibre,
  onTerminar,
  onSalir,
}: Props) {
  // Elegir entrenamiento sin salir: al acabar uno o mientras se rueda libre
  const [eligiendo, setEligiendo] = useState(false);
  const acabado = entreno !== null && entreno.segundos >= entreno.total;
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

  // Perfil pequeño en la esquina o ampliado a lo ancho (se recuerda en este navegador)
  const [perfilGrande, setPerfilGrande] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_PERFIL) === 'grande';
    } catch {
      return false;
    }
  });
  const cambiarPerfil = () =>
    setPerfilGrande((g) => {
      try {
        localStorage.setItem(CLAVE_PERFIL, g ? 'pequeno' : 'grande');
      } catch {
        // sin almacenamiento: solo dura esta sesión
      }
      return !g;
    });

  const yo = leerYo();
  const pend = pendiente(yo.distancia);
  const vuelta = Math.floor(yo.distancia / LONGITUD_VUELTA_M) + 1;
  const vueltaAnterior = useRef(vuelta);
  const [cartelVuelta, setCartelVuelta] = useState<number | null>(null);
  useEffect(() => {
    if (vuelta === vueltaAnterior.current) return;
    const nueva = vuelta > vueltaAnterior.current;
    vueltaAnterior.current = vuelta;
    if (!nueva || !grabacion.corriendo) return;
    setCartelVuelta(vuelta);
    const id = setTimeout(() => setCartelVuelta(null), 3500);
    return () => clearTimeout(id);
  }, [vuelta, grabacion.corriendo]);
  const xYo = xPerfil(yo.distancia);
  const subidas = infoSubidas(yo.distancia);
  const colorPendiente = pend > 4 ? '#ff4d4f' : pend > 1.5 ? '#ffc233' : pend < -1.5 ? '#6ec1ff' : '#f2f4f8';

  return (
    <div className="recorrido">
      <div className="recorrido-lienzo" ref={contenedor} />

      {cargando && <div className="recorrido-cargando">Generando el recorrido…</div>}
      {cartelVuelta !== null && (
        <div className="cartel-vuelta" key={cartelVuelta}>
          <span>Vuelta</span>
          <strong>{cartelVuelta}</strong>
        </div>
      )}
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
              <span
                className="hud-valor"
                style={yo.potencia !== undefined && ftp > 0 ? { color: colorZona((yo.potencia / ftp) * 100) } : undefined}
              >
                {yo.potencia !== undefined ? Math.round(yo.potencia) : '--'}
                <small> W</small>
              </span>
              <span className="hud-etiqueta">
                {demo ? 'vatios (simulación)' : yo.potenciaEstimada ? 'vatios (estimada)' : 'vatios'}
              </span>
            </div>
            {yo.rebufo > 0.03 && (
              <div className="hud-rebufo" title="Vas a rueda: el aire te frena menos y el rodillo se suaviza">
                <span className="hud-rebufo-valor">🌬️ −{Math.round(yo.rebufo * 100)} %</span>
                <span className="hud-etiqueta">a rueda</span>
              </div>
            )}
            {marcha && <MarchaHud marcha={marcha} />}
            {palanca && (
              <div className="hud-palanca" title="Pon aquí la misma posición que la palanca del rodillo">
                <div className="hud-palanca-mandos">
                  <button
                    onClick={() => palanca.onCambiar(palanca.posicion - 1)}
                    disabled={palanca.posicion <= 1}
                    aria-label="Palanca más suave"
                  >
                    −
                  </button>
                  <span className="hud-palanca-valor">{palanca.posicion}</span>
                  <button
                    onClick={() => palanca.onCambiar(palanca.posicion + 1)}
                    disabled={palanca.posicion >= 8}
                    aria-label="Palanca más dura"
                  >
                    +
                  </button>
                </div>
                <span className="hud-etiqueta">palanca rodillo</span>
              </div>
            )}
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
              <b>{km(grabacion.distanciaM, 2)} km</b>
              <span className="hud-vuelta">
                {' '}· vuelta {vuelta} ({km(enVuelta(yo.distancia))}/{LONGITUD_VUELTA_M / 1000})
              </span>
            </span>
            <span>
              <b>{Math.round(grabacion.desnivelM)} m</b> desnivel +
            </span>
            {yo.segundosRueda >= 1 && (
              <span className="hud-media">
                <b>🌬️ {formatearTiempo(Math.round(yo.segundosRueda))}</b> a rueda
              </span>
            )}
            <span className="hud-media">
              <b>{grabacion.potenciaMedia !== undefined ? Math.round(grabacion.potenciaMedia) : '--'} W</b> media
            </span>
            {grabacion.cadenciaMedia !== undefined && (
              <span className="hud-media">
                <b>{Math.round(grabacion.cadenciaMedia)} rpm</b> media
              </span>
            )}
            {grabacion.pulsoMedio !== undefined && (
              <span className="hud-media">
                <b>{Math.round(grabacion.pulsoMedio)} ppm</b> media
              </span>
            )}
            {grabacion.kilojulios >= 1 && (
              <span className="hud-media">
                <b>{Math.round(grabacion.kilojulios)} kcal</b>
              </span>
            )}
            <span className="hud-media">
              <b>
                {grabacion.velocidadMedia !== undefined ? grabacion.velocidadMedia.toFixed(1).replace('.', ',') : '--'}{' '}
                km/h
              </b>{' '}
              media
            </span>
          </div>
        </div>
        <div className="hud-botones">
          <button
            className="boton-principal"
            onClick={() => {
              if (grabacion.corriendo) grabacion.pausar();
              else {
                mantenerPantallaEncendida(); // por si el sistema la soltó (p. ej. al cambiar de app)
                grabacion.iniciar();
              }
            }}
          >
            {grabacion.corriendo ? 'Pausa' : grabacion.hayDatos ? 'Seguir' : 'Empezar'}
          </button>
          {!entreno && (
            <button className="boton-secundario" onClick={() => setEligiendo(true)} title="Hacer un entrenamiento guiado sin salir">
              📋 Entreno
            </button>
          )}
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
      <div className="hud-medio">
        {entreno && <PanelEntreno e={entreno} potencia={yo.potencia} />}
        <PanelGrupo
          yo={yo.distancia}
          otros={otros}
          enSalida={enSalida}
          entrando={entrandoSalida}
          error={errorSalida}
          onUnirse={onUnirseSalida}
          onJuntoA={onJuntoA}
        />
      </div>

      {/* Al completar un entrenamiento: terminar, seguir libre o encadenar otro */}
      {acabado && !eligiendo && (
        <div className="fin-entreno">
          <strong>¡{entreno.entreno.nombre} completado!</strong>
          <span>¿Qué quieres hacer ahora?</span>
          <div className="fin-entreno-botones">
            <button className="boton-principal boton-finalizar" onClick={onTerminar}>
              ✅ Terminar y guardar
            </button>
            <button className="boton-secundario" onClick={onSeguirLibre}>
              🚴 Seguir rodando libre
            </button>
            <button className="boton-secundario" onClick={() => setEligiendo(true)}>
              ➕ Hacer otro entrenamiento
            </button>
          </div>
          <small>Si sigues, todo se guardará y subirá como una sola actividad.</small>
        </div>
      )}
      {eligiendo && (
        <SelectorEntreno
          entrenamientos={entrenamientos}
          titulo={entreno ? 'Elige el siguiente entrenamiento' : 'Elige un entrenamiento'}
          onElegir={(e) => {
            setEligiendo(false);
            onOtroEntreno(e);
          }}
          onCancelar={() => setEligiendo(false)}
        />
      )}

      {!grabacion.corriendo && !cargando && (
        <div className="recorrido-aviso">
          {grabacion.hayDatos ? 'En pausa' : 'Pulsa «Empezar» y pedalea para avanzar'}
        </div>
      )}

      {/* Abajo: el chat del grupo a la izquierda y el perfil de la vuelta a la derecha */}
      <div className="hud-abajo">
      {enSalida && chat && (
        <ChatGrupo mensajes={chat.mensajes} miUid={chat.miUid} rechazado={chat.rechazado} onEnviar={chat.onEnviar} />
      )}
      {/* Perfil de la vuelta (pequeño, en la esquina; al tocarlo se amplía a lo ancho):
          recorrido hecho sombreado, tu posición y la de los demás */}
      <div
        className={`hud hud-perfil ${perfilGrande ? 'grande' : ''}`}
        role="button"
        tabIndex={0}
        title={perfilGrande ? 'Toca para reducir el perfil' : 'Toca para ampliar el perfil'}
        onClick={cambiarPerfil}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && cambiarPerfil()}
      >
        <div className="perfil-cabecera">
          <span>
            {subidas.actual ? (
              <>
                <strong className="subiendo">Subiendo:</strong> {Math.round(subidas.actual.quedanM)} m en{' '}
                {km(subidas.actual.quedanDistancia)} km
              </>
            ) : perfilGrande ? (
              <>
                <strong>Próxima subida</strong> en {km(subidas.proxima.distancia)} km: +{subidas.proxima.desnivel} m en{' '}
                {km(subidas.proxima.longitud)} km ({subidas.proxima.pendienteMedia.toFixed(1).replace('.', ',')} % media)
              </>
            ) : (
              <>
                <strong>Subida</strong> en {km(subidas.proxima.distancia)} km: +{subidas.proxima.desnivel} m ·{' '}
                {subidas.proxima.pendienteMedia.toFixed(1).replace('.', ',')} %
              </>
            )}
          </span>
          <span>
            {perfilGrande ? 'Quedan ' : ''}
            <strong>{Math.round(subidas.quedanVuelta)} m</strong>
            {perfilGrande ? ' de subida en esta vuelta' : ' ↑ en la vuelta'}
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
          {perfilGrande ? 'Vuelta de ' : ''}
          {LONGITUD_VUELTA_M / 1000} km · {DESNIVEL_VUELTA_M} m{perfilGrande ? ' de desnivel' : ' ↑'}
          {rodilloControlado && (entreno ? ' · ERG' : ' · el rodillo sigue la pendiente')}
          {perfilGrande && !enSalida && ' · únete a la «Salida en grupo» para ver a tus amigos'}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

/** Diferencia con otro ciclista en el circuito, en texto («+120 m», «−1,3 km»). */
function diferencia(m: number) {
  const signo = m >= 0 ? '+' : '−';
  const a = Math.abs(m);
  return a < 1000 ? `${signo}${Math.round(a)} m` : `${signo}${km(a, 1)} km`;
}

/**
 * Tu grupo: a qué distancia va cada amigo y un botón para ponerte a su lado.
 * Si no estás en la salida, un botón para unirte sin salir del recorrido.
 */
function PanelGrupo({
  yo,
  otros,
  enSalida,
  entrando,
  error,
  onUnirse,
  onJuntoA,
}: {
  yo: number;
  otros: OtroCiclista[];
  enSalida: boolean;
  entrando: boolean;
  error: string | null;
  onUnirse: () => void;
  onJuntoA: (s: number) => void;
}) {
  if (!enSalida)
    return (
      <div className="hud hud-grupo">
        <button className="boton-secundario" onClick={onUnirse} disabled={entrando}>
          {entrando ? 'Conectando…' : '👥 Rodar con mis amigos'}
        </button>
        {error && <span className="hud-grupo-error">{error}</span>}
      </div>
    );
  const lista = [...otros].sort((a, b) => b.distancia - a.distancia);
  return (
    <div className="hud hud-grupo">
      <strong className="hud-grupo-titulo">👥 Grupo</strong>
      {lista.length === 0 && <span className="hud-grupo-vacio">Aún no rueda nadie más</span>}
      {lista.map((o) => {
        const d = o.distancia - yo;
        const cerca = Math.abs(d) < 60;
        return (
          <div key={o.uid} className="hud-grupo-fila">
            <span className="hud-grupo-nombre">{o.nombre}</span>
            <span className={`hud-grupo-dif ${cerca ? 'contigo' : d > 0 ? 'delante' : 'detras'}`}>
              {cerca ? 'contigo' : diferencia(d)}
            </span>
            {!cerca && (
              <button
                className="boton-secundario hud-grupo-boton"
                onClick={() => onJuntoA(o.distancia)}
                title={`Ponerte junto a ${o.nombre}`}
              >
                Ir junto a
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Marcha virtual en el marcador: destaca un momento al cambiar (con los mandos o el teclado). */
function MarchaHud({ marcha }: { marcha: { n: number; total: number; onCambiar: (d: number) => void; activa: boolean } }) {
  const [destello, setDestello] = useState(false);
  const anterior = useRef(marcha.n);
  useEffect(() => {
    if (anterior.current === marcha.n) return;
    anterior.current = marcha.n;
    setDestello(true);
    const id = setTimeout(() => setDestello(false), 400);
    return () => clearTimeout(id);
  }, [marcha.n]);
  return (
    <div
      className={`hud-palanca hud-marcha ${destello ? 'destello' : ''} ${marcha.activa ? '' : 'inactiva'}`}
      title="Marcha virtual: sube con «+» y baja con «B» en el mando Zwift, o con las flechas ↑/↓"
    >
      <div className="hud-palanca-mandos">
        <button onClick={() => marcha.onCambiar(-1)} disabled={marcha.n <= 1} aria-label="Bajar marcha">
          −
        </button>
        <span className="hud-palanca-valor">{marcha.n}</span>
        <button onClick={() => marcha.onCambiar(1)} disabled={marcha.n >= marcha.total} aria-label="Subir marcha">
          +
        </button>
      </div>
      <span className="hud-etiqueta">{marcha.activa ? '⚙️ marcha' : '⚙️ marcha (ERG)'}</span>
    </div>
  );
}
