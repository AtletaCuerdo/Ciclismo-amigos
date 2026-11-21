/**
 * 📻 Botón de la radio en el recorrido: al tocarlo se despliegan las emisoras, el DJ automático
 * y los mandos (otra emisora del mismo estilo y apagar).
 */
import { useState } from 'react';
import { EMISORAS, emisoraPorId, type EstadoRadio, type IdEmisora } from '../musica/radio';

export interface PropsRadio {
  estado: EstadoRadio;
  dj: boolean;
  onPoner: (id: IdEmisora) => void;
  onOtra: () => void;
  onApagar: () => void;
  onDj: (si: boolean) => void;
}

export function MenuRadio({ radio }: { radio: PropsRadio }) {
  const [abierto, setAbierto] = useState(false);
  const e = radio.estado;
  const emisora = e.emisora ? emisoraPorId(e.emisora) : null;
  return (
    <div className="menu-bots-ancla">
      <button
        className={`boton-secundario ${emisora ? 'activo' : ''}`}
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        title="Radio: emisoras de internet por estilos"
      >
        📻 {emisora ? `${emisora.emoji} ${emisora.nombre}` : 'Radio'}
      </button>
      {abierto && (
        <div className="hud menu-bots menu-radio">
          <div className="menu-bots-cabecera">
            <strong>📻 Radio</strong>
            <button className="chat-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar la radio">
              ✕
            </button>
          </div>
          {emisora && (
            <div className="radio-sonando" role="status">
              {e.cargando ? (
                <span>Sintonizando {emisora.nombre}…</span>
              ) : (
                <span>
                  Sonando: <strong>{e.sonando}</strong>
                </span>
              )}
              <div className="radio-mandos">
                <button className="boton-secundario" onClick={radio.onOtra} disabled={e.cargando} title="Otra emisora del mismo estilo">
                  🔀 Otra
                </button>
                <button className="boton-secundario" onClick={radio.onApagar}>
                  ⏹ Apagar
                </button>
              </div>
            </div>
          )}
          {e.error && <p className="aviso">{e.error}</p>}
          <div className="radio-emisoras">
            {EMISORAS.map((x) => (
              <button
                key={x.id}
                className={`boton-secundario radio-emisora ${e.emisora === x.id ? 'activo' : ''}`}
                aria-pressed={e.emisora === x.id}
                onClick={() => radio.onPoner(x.id)}
              >
                <span className="radio-emoji" aria-hidden>
                  {x.emoji}
                </span>
                <span>
                  <strong>{x.nombre}</strong>
                  <small>{x.descripcion}</small>
                </span>
              </button>
            ))}
          </div>
          <label className="radio-dj">
            <input type="checkbox" checked={radio.dj} onChange={(ev) => radio.onDj(ev.target.checked)} />
            <span>
              <strong>🎛️ DJ automático</strong>
              <small>En las series pone ⚡ EDM y, al aflojar, vuelve a tu emisora.</small>
            </span>
          </label>
          <small>Emisoras de radio por internet, sin anuncios siempre que se puede. Gasta unos 60 MB por hora.</small>
        </div>
      )}
    </div>
  );
}
