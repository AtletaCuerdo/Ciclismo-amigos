/**
 * Sitios para parar en el recorrido: el aviso («⛽ Gasolinera en 400 m · Parar / Seguir») y, al
 * llegar, la pantalla de dentro con el menú. Tú sigues pedaleando todo el rato: el entreno, el ERG,
 * el tiempo y los km siguen; solo tu ciclista entra y vuelve a salir donde le toca.
 */
import type { Nutricion } from '../entrenamiento/ridecoins';
import { Moneda } from './Moneda';

interface Info {
  nombre: string;
  emoji: string;
  frase: string;
  /** Texto del botón para irse sin nada («Seguir sin masaje» en el fisio). */
  salir: string;
}
export interface PropsParada {
  aviso: (Info & { metros: number; parar: boolean; onParar: (si: boolean) => void }) | null;
  /** Km del sitio donde se para (mi ciclista se echa al arcén) o null. */
  arcenKm: number | null;
  dentro: (Info & { saldo: number; menu: Nutricion[]; onComprar: (n: Nutricion) => void; onSalir: () => void }) | null;
}

const pct = (x: number) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

export function AvisoParada({ parada }: { parada: PropsParada }) {
  const a = parada.aviso;
  if (!a) return null;
  const m = Math.max(0, Math.round(a.metros / 10) * 10);
  if (a.parar) {
    return (
      <div className="aviso-cruce-mini aviso-parada-mini">
        <span>
          {a.emoji} Paras en {a.nombre.toLowerCase()} en {m} m
        </span>
        <button className="chat-cerrar" onClick={() => a.onParar(false)} aria-label="No parar">
          ✕
        </button>
      </div>
    );
  }
  return (
    <div className="aviso-cruce aviso-parada">
      <span className="aviso-cruce-titulo">
        {a.emoji} {a.nombre} en {m} m
      </span>
      <div className="aviso-cruce-botones">
        <button onClick={() => a.onParar(true)}>🛑 Parar</button>
        <button className="activo" onClick={() => a.onParar(false)}>
          ⬆️ Seguir
        </button>
      </div>
    </div>
  );
}

export function DentroParada({ parada }: { parada: PropsParada }) {
  const d = parada.dentro;
  if (!d) return null;
  return (
    <div className="parada-dentro" role="dialog" aria-label={`Dentro de ${d.nombre}`}>
      <div className="parada-tarjeta">
        <div className="parada-cabecera">
          <span className="parada-emoji" aria-hidden>
            {d.emoji}
          </span>
          <div>
            <strong>{d.nombre}</strong>
            <span>{d.frase}</span>
          </div>
        </div>
        <div className="parada-menu">
          {d.menu.map((n) => (
            <button key={n.id} className="parada-producto" disabled={d.saldo < n.precio} onClick={() => d.onComprar(n)}>
              <span className="parada-emoji-producto" aria-hidden>
                {n.emoji}
              </span>
              <span className="parada-producto-texto">
                <strong>{n.nombre}</strong>
                <small>
                  +{pct(n.mejora)} de velocidad durante {n.duracionS / 60} min
                  {n.cafeina ? ' · con cafeína' : ''}
                </small>
              </span>
              <span className="parada-precio"><Moneda /> {n.precio}</span>
            </button>
          ))}
        </div>
        <p className="parada-saldo">Tienes <Moneda /> {d.saldo.toLocaleString('es-ES')} RideCoins</p>
        <button className="boton-secundario" onClick={d.onSalir}>
          {d.salir}
        </button>
        <small className="parada-nota">Tú sigue pedaleando: el entreno, el tiempo y los km no se paran.</small>
      </div>
    </div>
  );
}
