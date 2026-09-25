import { useEffect, useState } from 'react';
import { borrarEntreno, cargarEntreno, listarEntrenos } from '../entrenamiento/almacen';
import { descargarTcx } from '../entrenamiento/tcx';
import type { EntrenoGuardado } from '../entrenamiento/tipos';
import { formatearTiempo } from './Metrica';

interface Props {
  /** Cambia cada vez que se guarda un entrenamiento, para recargar la lista. */
  version: number;
}

const formatoFecha = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Totales acumulados y lista de entrenamientos guardados en este navegador. */
export function Historial({ version }: Props) {
  const [entrenos, setEntrenos] = useState<EntrenoGuardado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = () =>
    listarEntrenos()
      .then((l) => {
        setEntrenos(l);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void recargar();
  }, [version]);

  const descargar = async (g: EntrenoGuardado) => {
    try {
      await descargarTcx(await cargarEntreno(g));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const borrar = async (g: EntrenoGuardado) => {
    if (!window.confirm(`¿Borrar el entrenamiento del ${formatoFecha.format(g.inicio)}? No se puede deshacer.`)) return;
    await borrarEntreno(g.id);
    await recargar();
  };

  const lista = entrenos ?? [];
  const totales = lista.reduce(
    (t, g) => ({
      segundos: t.segundos + g.resumen.duracionS,
      metros: t.metros + g.resumen.distanciaM,
      desnivel: t.desnivel + g.resumen.desnivelM,
      kj: t.kj + g.resumen.kilojulios,
    }),
    { segundos: 0, metros: 0, desnivel: 0, kj: 0 },
  );

  return (
    <section className="panel">
      <h2>Historial</h2>
      <p className="detalle">Se guarda solo en este navegador y en este dispositivo.</p>

      {error && <p className="aviso">No se pudo leer el historial: {error}</p>}

      <div className="rejilla-totales">
        <div className="total">
          <span className="total-valor">{lista.length}</span>
          <span className="total-etiqueta">sesiones</span>
        </div>
        <div className="total">
          <span className="total-valor">{(totales.segundos / 3600).toFixed(1)}</span>
          <span className="total-etiqueta">horas</span>
        </div>
        <div className="total">
          <span className="total-valor">{(totales.metros / 1000).toFixed(1)}</span>
          <span className="total-etiqueta">km</span>
        </div>
        <div className="total">
          <span className="total-valor">{Math.round(totales.desnivel)}</span>
          <span className="total-etiqueta">m desnivel +</span>
        </div>
        <div className="total">
          <span className="total-valor">{Math.round(totales.kj)}</span>
          <span className="total-etiqueta">kJ</span>
        </div>
      </div>

      {entrenos !== null && lista.length === 0 && (
        <p className="detalle">Todavía no hay entrenamientos. Pulsa «Iniciar» y luego «Finalizar» para guardar uno.</p>
      )}

      <ul className="lista-historial">
        {lista.map((g) => {
          const r = g.resumen;
          return (
            <li key={g.id}>
              <div className="historial-fecha">{formatoFecha.format(g.inicio)}</div>
              <div className="historial-datos">
                <span>{formatearTiempo(r.duracionS)}</span>
                <span>{(r.distanciaM / 1000).toFixed(2)} km</span>
                {r.potenciaMedia !== undefined && (
                  <span>
                    {Math.round(r.potenciaMedia)} W{r.potenciaEstimada ? ' (est.)' : ''}
                  </span>
                )}
                {r.pulsoMedio !== undefined && <span>{Math.round(r.pulsoMedio)} ppm</span>}
                {r.desnivelM > 0 && <span>{Math.round(r.desnivelM)} m+</span>}
              </div>
              <div className="historial-acciones">
                <button className="boton-secundario" onClick={() => void descargar(g)}>
                  .tcx
                </button>
                <button className="boton-secundario boton-peligro" onClick={() => void borrar(g)}>
                  Borrar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
