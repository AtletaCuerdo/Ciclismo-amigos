import { useEffect, useRef, useState } from 'react';
import { compartirTcx, descargarTcx, puedeCompartir } from '../entrenamiento/tcx';
import type { Entreno } from '../entrenamiento/tipos';
import { Metrica, formatearTiempo } from './Metrica';

interface Props {
  entreno: Entreno;
  /** null si se guardó bien; texto del error si no se pudo guardar en el historial. */
  errorGuardado: string | null;
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
export function ResumenEntreno({ entreno, errorGuardado, onCerrar }: Props) {
  const r = entreno.resumen;
  const ref = useRef<HTMLElement>(null);

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
        {r.desnivelM > 0 && <Metrica etiqueta="Desnivel +" valor={r.desnivelM} unidad="m" />}
      </div>

      {errorGuardado ? (
        <p className="aviso">
          No se pudo guardar en el historial ({errorGuardado}). Descarga el archivo para no perderlo.
        </p>
      ) : (
        <p className="detalle">Guardado en el historial de este navegador.</p>
      )}

      <h3>Subirlo a Strava</h3>
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
      <BotonesTcx entreno={entreno} />
    </section>
  );
}
