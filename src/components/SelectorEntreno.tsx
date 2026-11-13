/**
 * Elegir un entrenamiento sin salir del recorrido (al terminar uno, o rodando libre).
 * Pestañas por categoría y tarjetas con la gráfica, la duración y el TSS.
 */
import { useMemo, useState } from 'react';
import { CATEGORIAS, desplegar, duracionTotal, formatoDuracion, tss, type Categoria, type Entrenamiento } from '../entrenamientos/tipos';
import { GraficaEntrenamiento } from './GraficaEntrenamiento';

interface Props {
  entrenamientos: Entrenamiento[];
  titulo: string;
  onElegir: (e: Entrenamiento) => void;
  onCancelar: () => void;
  /** Para rotular los vatios. */
  ftp: number;
  /** Si hay un entreno en marcha: dejarlo y rodar libre. */
  onLibre?: () => void;
}

/** Etiqueta de color con la categoría que le puso quien lo compartió (y de quién es). */
export function EtiquetaCategoria({ e }: { e: Entrenamiento }) {
  const c = CATEGORIAS.find((x) => x.id === e.categoria);
  if (!c) return null;
  return (
    <span className="etiqueta-categoria" style={{ background: c.color }}>
      {c.nombre}
      {e.deAmigo && <> · {e.deAmigo.mio ? 'tuyo' : e.deAmigo.autor}</>}
    </span>
  );
}

export function SelectorEntreno({ entrenamientos, titulo, onElegir, onCancelar, ftp, onLibre }: Props) {
  const [categoria, setCategoria] = useState<Categoria | 'amigos'>('endurance');
  const lista = useMemo(
    () =>
      entrenamientos
        // Los compartidos por otros solo salen en «Compartidos», con su etiqueta
        .filter((e) => (categoria === 'amigos' ? !!e.deAmigo : e.categoria === categoria && !e.deAmigo))
        .map((e) => {
          const t = desplegar(e.bloques);
          return { e, t, dur: duracionTotal(t), carga: tss(t) };
        })
        .sort((a, b) => a.dur - b.dur),
    [entrenamientos, categoria],
  );

  return (
    <div className="selector-entreno-fondo" onClick={onCancelar}>
      <div className="selector-entreno" onClick={(ev) => ev.stopPropagation()}>
        <div className="selector-entreno-cabecera">
          <strong>{titulo}</strong>
          <button className="boton-secundario" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
        {onLibre && (
          <button className="boton-secundario selector-libre" onClick={onLibre}>
            🚴 Dejar el entreno y rodar libre
          </button>
        )}
        <div className="selector-categorias">
          <button
            className={categoria === 'amigos' ? 'activa' : ''}
            style={{ borderColor: '#22d3ee', ...(categoria === 'amigos' ? { background: '#22d3ee' } : {}) }}
            onClick={() => setCategoria('amigos')}
          >
            👥 Compartidos
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              className={c.id === categoria ? 'activa' : ''}
              style={{ borderColor: c.color, ...(c.id === categoria ? { background: c.color } : {}) }}
              onClick={() => setCategoria(c.id)}
            >
              {c.nombre}
            </button>
          ))}
        </div>
        <div className="selector-lista">
          {lista.map(({ e, t, dur, carga }) => (
            <button key={e.id} className="selector-tarjeta" onClick={() => onElegir(e)}>
              <div className="selector-tarjeta-cabecera">
                <strong>{e.nombre}</strong>
                {e.deAmigo && <EtiquetaCategoria e={e} />}
                <span>
                  {formatoDuracion(dur)} · TSS {carga}
                </span>
              </div>
              <GraficaEntrenamiento tramos={t} alto={44} ftp={ftp} />
            </button>
          ))}
          {!lista.length && <p>No hay entrenamientos en esta categoría.</p>}
        </div>
      </div>
    </div>
  );
}
