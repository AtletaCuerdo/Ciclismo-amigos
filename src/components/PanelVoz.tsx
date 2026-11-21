/**
 * 🎙️ Voz con los amigos (abajo, junto a los emojis): un toque para entrar y hablar sin tocar más la
 * pantalla; el micro se puede silenciar y se ve quién está hablando.
 */
import type { EstadoVoz } from '../multijugador/voz';

export function PanelVoz({
  voz,
}: {
  voz: {
    estado: EstadoVoz;
    disponible: boolean;
    onEncender: () => void;
    onApagar: () => void;
    onSilenciar: (mudo: boolean) => void;
  };
}) {
  const e = voz.estado;
  if (!e.activa) {
    return (
      <div className="panel-voz">
        <button
          className="hud boton-voz"
          disabled={!voz.disponible || e.conectando}
          onClick={voz.onEncender}
          title="Habla con tus amigos sin tocar la pantalla (mejor con auriculares)"
        >
          🎙️ {e.conectando ? 'Conectando…' : 'Hablar'}
        </button>
        {e.error && <span className="hud voz-aviso">{e.error}</span>}
      </div>
    );
  }
  return (
    <div className="panel-voz">
      <div className="hud voz-activa" role="group" aria-label="Voz con tus amigos">
        <button
          className={`boton-voz-micro ${e.mudo ? 'mudo' : ''} ${e.yoHablando ? 'hablando' : ''}`}
          onClick={() => voz.onSilenciar(!e.mudo)}
          aria-pressed={e.mudo}
          title={e.mudo ? 'Activar mi micro' : 'Silenciar mi micro'}
        >
          {e.mudo ? '🔇' : '🎙️'}
        </button>
        <ul className="voz-gente">
          {e.otros.length === 0 && <li className="voz-solo">Nadie más con la voz</li>}
          {e.otros.map((o) => (
            <li key={o.uid} className={`${o.hablando ? 'hablando' : ''} ${o.conectado ? '' : 'conectando'}`}>
              {o.mudo ? '🔇' : o.hablando ? '🔊' : '🎧'} {o.nombre}
            </li>
          ))}
        </ul>
        <button className="chat-cerrar" onClick={voz.onApagar} aria-label="Salir de la voz" title="Salir de la voz">
          ✕
        </button>
      </div>
    </div>
  );
}
