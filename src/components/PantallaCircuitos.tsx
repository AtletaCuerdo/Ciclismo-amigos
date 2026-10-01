/**
 * 🗺️ Circuitos: elegir el recorrido (con su perfil) y las grupetas, en su propia pantalla para
 * no llenar el inicio. En el inicio queda solo una línea con el circuito elegido.
 */
import { circuitoPorId, desnivelDe, longitudDe } from '../recorrido/circuitos';
import { SelectorCircuito } from './SelectorCircuito';

interface Props {
  elegido: string;
  onElegir: (id: string) => void;
  grupetas: boolean;
  onGrupetas: (si: boolean) => void;
  ftp: number;
  onRodar: () => void;
  onVolver: () => void;
}

export function PantallaCircuitos({ elegido, onElegir, grupetas, onGrupetas, ftp, onRodar, onVolver }: Props) {
  const c = circuitoPorId(elegido);
  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← Inicio
        </button>
        <h2>🗺️ Circuitos</h2>
      </div>
      <SelectorCircuito elegido={elegido} onElegir={onElegir} grupetas={grupetas} onGrupetas={onGrupetas} ftp={ftp} />
      <div className="botones-tcx">
        <button className="boton-principal" onClick={onRodar}>
          🚴 Rodar libre en {c.nombre}
        </button>
        <button className="boton-secundario" onClick={onVolver}>
          Listo
        </button>
      </div>
    </section>
  );
}

/** Línea del inicio: el circuito elegido y un botón para cambiarlo. */
export function CircuitoElegido({ elegido, grupetas, onCambiar }: { elegido: string; grupetas: boolean; onCambiar: () => void }) {
  const c = circuitoPorId(elegido);
  return (
    <section className="panel circuito-elegido">
      <span>
        🗺️ <strong>{c.nombre}</strong>{' '}
        <span className="detalle">
          · {longitudDe(c) / 1000} km · {desnivelDe(c)} m ↑{grupetas ? ' · con grupetas' : ''}
        </span>
      </span>
      <button className="boton-secundario" onClick={onCambiar}>
        Cambiar circuito
      </button>
    </section>
  );
}
