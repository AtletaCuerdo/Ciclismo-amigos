import { useEffect, useRef, useState } from 'react';
import { compartirTcx, descargarTcx, puedeCompartir } from '../entrenamiento/tcx';
import { tituloRueda, type Entreno } from '../entrenamiento/tipos';
import { Metrica, formatearTiempo } from './Metrica';
import { BotonStrava, textosStrava } from './Strava';
import { leerConexion, stravaDisponible } from '../strava/strava';
import { listarEntrenos } from '../entrenamiento/almacen';
import { logrosNuevos, type Logro } from '../entrenamiento/logros';
import { nivelDe, xpTotal } from '../entrenamiento/niveles';
import { guardarMiNivel } from '../entrenamiento/nivelPublico';
import { mediasDeBloques, mejoresVatios } from '../entrenamiento/resumen';

interface Props {
  entreno: Entreno;
  /** null si se guardó bien; texto del error si no se pudo guardar en el historial. */
  errorGuardado: string | null;
  /** FTP estimado tras un test y cómo se ha calculado. */
  ftpSugerido?: { w: number; texto: string };
  ftpActual?: number;
  /** Nombre del entrenamiento guiado (para Strava); vacío al rodar libre. */
  nombreEntreno?: string;
  onAceptarFtp?: (w: number) => void;
  onCerrar: () => void;
}

/** Botones para llevar el entrenamiento a Strava (descargar / compartir el TCX). */
export function BotonesTcx({ entreno }: { entreno: Entreno }) {
  const [error, setError] = useState<string | null>(null);
  const compartir = async () => {
    try {
      await compartirTcx(entreno);
    } catch (e) {
      // Cerrar la hoja de compartir sin elegir nada también llega aquí
      if (!(e instanceof Error && e.name === 'AbortError')) setError('No se pudo compartir el archivo.');
    }
  };
  return (
    <>
      <div className="botones-tcx">
        <button className="boton-principal" onClick={() => void descargarTcx(entreno)}>
          Descargar para Strava (.tcx)
        </button>
        {puedeCompartir() && (
          <button className="boton-secundario" onClick={() => void compartir()}>
            Compartir archivo…
          </button>
        )}
      </div>
      {error && <div className="aviso">{error}</div>}
    </>
  );
}

/** Pantalla que aparece al pulsar "Finalizar": resumen y descarga del archivo. */
export function ResumenEntreno({ entreno, errorGuardado, ftpSugerido, ftpActual, nombreEntreno, onAceptarFtp, onCerrar }: Props) {
  const strava = stravaDisponible() && leerConexion() !== null;
  const textos = textosStrava(entreno, nombreEntreno);
  const r = entreno.resumen;
  const ref = useRef<HTMLElement>(null);
  const [ftpAceptado, setFtpAceptado] = useState(false);
  const [nuevos, setNuevos] = useState<Logro[]>([]);
  const [xp, setXp] = useState<{ ganados: number; nivel: number; sube: boolean } | null>(null);

  // Logros conseguidos con esta sesión
  useEffect(() => {
    let vivo = true;
    listarEntrenos()
      .catch(() => [])
      .then((lista) => {
        const conEsta = lista.some((g) => g.id === entreno.id) ? lista : [entreno, ...lista];
        // Solo si sigue montado: logrosNuevos los marca como vistos
        if (!vivo) return;
        setNuevos(logrosNuevos(conEsta));
        // XP de esta sesión (con sus logros) y si se sube de nivel
        const sinEsta = conEsta.filter((g) => g.id !== entreno.id);
        const antes = nivelDe(sinEsta).nivel;
        const ahora = nivelDe(conEsta).nivel;
        guardarMiNivel(ahora);
        setXp({ ganados: xpTotal(conEsta) - xpTotal(sinEsta), nivel: ahora, sube: ahora > antes });
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entreno.id]);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [entreno.id]);

  return (
    <section className="panel resumen" ref={ref}>
      <div className="cabecera-panel">
        <h2>Entrenamiento terminado</h2>
        <button className="boton-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {xp && (
        <div className={`aviso-xp ${xp.sube ? 'sube' : ''}`} role="status">
          {xp.sube ? (
            <strong>⬆️ ¡Subes al nivel {xp.nivel}!</strong>
          ) : (
            <strong>Nivel {xp.nivel}</strong>
          )}{' '}
          · +{xp.ganados.toLocaleString('es-ES')} XP en esta sesión
        </div>
      )}

      {nuevos.length > 0 && (
        <div className="logros-nuevos" role="status">
          {nuevos.map((l) => (
            <div key={l.id} className="logro-nuevo">
              <span className="logro-icono" aria-hidden>
                {l.icono}
              </span>
              <span>
                <strong>¡Logro nuevo! {l.nombre}</strong>
                <br />
                <span className="detalle">{l.descripcion}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {ftpSugerido !== undefined && ftpSugerido.w > 0 && (
        <div className="aviso-ftp">
          <p>
            <strong>FTP estimado: {ftpSugerido.w} W</strong> ({ftpSugerido.texto}). Tu FTP actual es {ftpActual} W.
          </p>
          {onAceptarFtp && !ftpAceptado ? (
            <button
              className="boton-principal"
              onClick={() => {
                onAceptarFtp(ftpSugerido.w);
                setFtpAceptado(true);
              }}
            >
              Usar {ftpSugerido.w} W como mi FTP
            </button>
          ) : (
            ftpAceptado && <p className="detalle">¡Guardado! Los entrenamientos usarán tu nuevo FTP.</p>
          )}
        </div>
      )}

      <div className="rejilla-metricas">
        <div className="metrica">
          <div className="metrica-etiqueta">Tiempo</div>
          <div className="metrica-valor">{formatearTiempo(r.duracionS)}</div>
          <div className="metrica-fuente">&nbsp;</div>
        </div>
        <Metrica etiqueta="Distancia" valor={r.distanciaM / 1000} unidad="km" decimales={2} />
        <Metrica etiqueta="Vatios medios" valor={r.potenciaMedia} unidad="W" estimada={r.potenciaEstimada} />
        <Metrica etiqueta="Vatios máx." valor={r.potenciaMax} unidad="W" estimada={r.potenciaEstimada} />
        <Metrica etiqueta="Velocidad media" valor={r.velocidadMedia} unidad="km/h" decimales={1} />
        <Metrica etiqueta="Cadencia media" valor={r.cadenciaMedia} unidad="rpm" />
        <Metrica etiqueta="Pulso medio" valor={r.pulsoMedio} unidad="ppm" />
        <Metrica etiqueta="Pulso máx." valor={r.pulsoMax} unidad="ppm" />
        <Metrica etiqueta="Trabajo" valor={r.kilojulios} unidad="kJ" />
        <Metrica
          etiqueta={r.kcalPorPulso ? 'Calorías (por pulso)' : 'Calorías'}
          valor={r.kcal ?? r.kilojulios}
          unidad="kcal"
        />
        {r.desnivelM > 0 && <Metrica etiqueta="Desnivel +" valor={r.desnivelM} unidad="m" />}
        {r.segundosRueda !== undefined && r.segundosRueda > 0 && (
          <div className="metrica metrica-rueda">
            <div className="metrica-etiqueta">🌬️ A rueda</div>
            <div className="metrica-valor">{formatearTiempo(r.segundosRueda)}</div>
            <div className="metrica-fuente">
              {Math.round(tituloRueda(r.segundosRueda, r.duracionS).pct)} % · {tituloRueda(r.segundosRueda, r.duracionS).titulo}
            </div>
          </div>
        )}
      </div>

      <MejoresYBloques entreno={entreno} />

      {errorGuardado ? (
        <p className="aviso">
          No se pudo guardar en el historial ({errorGuardado}). Descarga el archivo para no perderlo.
        </p>
      ) : (
        <p className="detalle">Guardado en el historial de este navegador.</p>
      )}

      <h3>Subirlo a Strava</h3>
      {strava && (
        <BotonStrava id={entreno.id} obtener={async () => entreno} nombre={textos.nombre} descripcion={textos.descripcion} auto />
      )}
      {strava ? (
        <p className="detalle">También puedes descargar el archivo:</p>
      ) : (
      <ol className="pasos">
        <li>Descarga el archivo con el botón de abajo.</li>
        <li>
          Entra en{' '}
          <a href="https://www.strava.com/upload/select" target="_blank" rel="noreferrer">
            strava.com/upload/select
          </a>{' '}
          y elige el archivo.
        </li>
        <li>En la actividad, marca el tipo «Bicicleta virtual» o «Rodillo» si Strava no lo detecta.</li>
      </ol>
      )}
      <BotonesTcx entreno={entreno} />
    </section>
  );
}

const minutos = (s: number) => (s >= 60 ? `${Math.round(s / 60)}′` : `${s}″`);

/** Mejores vatios de la sesión (3′ a 60′) y medias de los bloques principales del entreno. */
function MejoresYBloques({ entreno }: { entreno: Entreno }) {
  const mejores = mejoresVatios(entreno.muestras);
  const bloques = entreno.resumen.bloques ? mediasDeBloques(entreno.muestras, entreno.resumen.bloques) : [];
  if (!mejores.length && !bloques.length) return null;
  return (
    <>
      {mejores.length > 0 && (
        <>
          <h3>Mejores vatios</h3>
          <div className="mejores-vatios">
            {mejores.map((m) => (
              <div key={m.s} className="mejor-vatios">
                <span className="mejor-duracion">{minutos(m.s)}</span>
                <strong>{m.w} W</strong>
              </div>
            ))}
          </div>
        </>
      )}
      {bloques.length > 0 && (
        <>
          <h3>Bloques del entrenamiento</h3>
          <div className="tabla-bloques-scroll">
            <table className="tabla-bloques">
              <thead>
                <tr>
                  <th>Bloque</th>
                  <th>Objetivo</th>
                  <th>Vatios</th>
                  <th>Pulso</th>
                  <th>Cadencia</th>
                </tr>
              </thead>
              <tbody>
                {bloques.map((b, i) => (
                  <tr key={b.inicioS}>
                    <td>
                      {i + 1}. {formatearTiempo(b.duracionS)}
                    </td>
                    <td>{b.objetivoW ? `${b.objetivoW} W` : 'libre'}</td>
                    <td>{b.potencia !== undefined ? `${b.potencia} W` : '—'}</td>
                    <td>{b.pulso !== undefined ? `${b.pulso} ppm` : '—'}</td>
                    <td>{b.cadencia !== undefined ? `${b.cadencia} rpm` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
