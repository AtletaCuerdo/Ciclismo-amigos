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

export function SelectorEntreno({ entrenamientos, titulo, onElegir, onCancelar, ftp, onLibre }: Props) {
  const [categoria, setCategoria] = useState<Categoria>('endurance');
  const lista = useMemo(
    () =>
      entrenamientos
        .filter((e) => e.categoria === categoria)
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
