/**
 * 🪙 Tienda: gastar RideCoins en nutrición para tomarla durante la sesión.
 * Más adelante: bici, ruedas, casco, maillot y avatar.
 */
import { NUTRICION, existencias, type Despensa, type IdNutricion } from '../entrenamiento/ridecoins';

const pct = (x: number) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

export function PantallaTienda({
  saldo,
  despensa,
  onComprar,
  onVolver,
}: {
  saldo: number;
  despensa?: Despensa;
  onComprar: (id: IdNutricion) => void;
  onVolver: () => void;
}) {
  return (
    <section className="panel tienda">
      <div className="cabecera-panel">
        <h2>🪙 Tienda</h2>
        <button className="boton-secundario" onClick={onVolver}>
          Volver
        </button>
      </div>

      <div className="tienda-saldo">
        <span>Tienes</span>
        <strong>{saldo.toLocaleString('es-ES')}</strong>
        <span>RideCoins</span>
      </div>

      <h3>Nutrición</h3>
      <p className="detalle">
        Durante la sesión, pulsa «🍬 Nutrición» y elige qué tomar: tu ciclista irá más rápido unos minutos con los
        mismos vatios. Solo hace efecto una a la vez.
      </p>
      <div className="tienda-lista">
        {NUTRICION.map((n) => {
          const tengo = existencias(despensa, n.id);
          return (
            <div key={n.id} className="tienda-producto">
              <span className="tienda-emoji" aria-hidden>
                {n.emoji}
              </span>
              <div className="tienda-info">
                <strong>{n.nombre}</strong>
                <span className="detalle">
                  {n.carbos} g de carbohidratos{n.cafeina ? ' + cafeína' : ''} · +{pct(n.mejora)} de velocidad durante{' '}
                  {n.duracionS / 60} min
                </span>
                {tengo > 0 && <span className="tienda-tengo">Tienes {tengo}</span>}
              </div>
              <button className="boton-principal" disabled={saldo < n.precio} onClick={() => onComprar(n.id)}>
                🪙 {n.precio}
              </button>
            </div>
          );
        })}
      </div>

      <h3>Cómo se ganan</h3>
      <ul className="tienda-reglas">
        <li>Cada minuto rodando: 1 (suave), 1,5 (tempo o umbral, 75-105 % del FTP) o 2 (por encima del umbral).</li>
        <li>Rodando con amigos: un 25 % más en esos minutos.</li>
        <li>Terminar entero un entrenamiento: +20.</li>
        <li>Primera sesión del día (de 5 min o más): +10. Si además rodaste los dos días anteriores: +25 de racha.</li>
      </ul>
      <p className="detalle">
        Va por tu propio FTP: se esfuerce igual, gana lo mismo un ciclista de 150 W que uno de 300 W. Las sesiones de antes
        de existir las RideCoins cuentan 1 por minuto.
      </p>
    </section>
  );
}
