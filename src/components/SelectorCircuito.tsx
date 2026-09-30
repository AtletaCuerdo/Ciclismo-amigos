/**
 * Elegir circuito en el inicio: una tarjeta por circuito con su mini perfil, la distancia y el
 * desnivel. El elegido es el que se usa al pulsar «Rodar libre» o empezar un entrenamiento.
 */
import { CIRCUITOS, desnivelDe, longitudDe, type DefCircuito } from '../recorrido/circuitos';

const ANCHO = 200;
const ALTO = 44;
/** Misma escala de altura en todos los circuitos, para que se vea cuál es más duro. */
const ALTITUD_ESCALA = 140;

/** Altitud interpolada con coseno entre los puntos clave (igual que en el recorrido). */
function altitudEn(c: DefCircuito, km: number) {
  const p = c.puntos;
  for (let i = 0; i < p.length - 1; i++) {
    if (km <= p[i + 1][0]) {
      const t = (km - p[i][0]) / (p[i + 1][0] - p[i][0]);
      return p[i][1] + ((p[i + 1][1] - p[i][1]) * (1 - Math.cos(Math.PI * t))) / 2;
    }
  }
  return p[p.length - 1][1];
}

function MiniPerfil({ c }: { c: DefCircuito }) {
  const total = longitudDe(c) / 1000;
  const minimo = Math.min(...c.puntos.map((p) => p[1]));
  const y = (h: number) => ALTO - 2 - ((h - minimo) / ALTITUD_ESCALA) * (ALTO - 6);
  const puntos: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const km = (i / 80) * total;
    puntos.push(`${((i / 80) * ANCHO).toFixed(1)},${y(altitudEn(c, km)).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" className="mini-perfil" aria-hidden>
      <path d={`M0,${ALTO} L${puntos.join(' L')} L${ANCHO},${ALTO} Z`} />
    </svg>
  );
}

interface Props {
  elegido: string;
  onElegir: (id: string) => void;
}

export function SelectorCircuito({ elegido, onElegir }: Props) {
  return (
    <section className="panel selector-circuito">
      <div className="cabecera-panel">
        <h2>🗺️ Circuito</h2>
      </div>
      <div className="rejilla-circuitos">
        {CIRCUITOS.map((c) => (
          <button
            key={c.id}
            className={`tarjeta-circuito ${c.id === elegido ? 'elegido' : ''}`}
            onClick={() => onElegir(c.id)}
            aria-pressed={c.id === elegido}
          >
            <div className="tarjeta-circuito-cabecera">
              <strong>{c.nombre}</strong>
              <span>
                {longitudDe(c) / 1000} km · {desnivelDe(c)} m ↑
              </span>
            </div>
            <MiniPerfil c={c} />
            <span className="detalle">{c.descripcion}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
