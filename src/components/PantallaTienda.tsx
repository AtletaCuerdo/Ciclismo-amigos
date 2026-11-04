/**
 * 🪙 Tienda: gastar RideCoins en nutrición para tomarla durante la sesión.
 * Más adelante: bici, ruedas, casco, maillot y avatar.
 */
import { MATERIAL, NUTRICION, existencias, tieneMaterial, type Despensa, type IdNutricion, type Material } from '../entrenamiento/ridecoins';
import type { Avatar } from '../recorrido/avatar';
import { FisicaVirtual, equipoAvatar } from '../recorrido/fisica';

/**
 * Lo que gana una pieza frente a lo básico (bici de ruta, perfil bajo y casco de ruta), con la
 * misma física del recorrido: km/h de más a 250 W y 75 kg, en llano y en una subida del 7 %.
 */
function ganancia(m: Material) {
  type Equipo = Parameters<typeof equipoAvatar>[0];
  const vel = (a: Equipo, grado: number) => {
    const e = equipoAvatar(a);
    const f = new FisicaVirtual(75 + e.pesoBiciKg);
    f.cda = e.cda;
    f.subida = e.subida;
    for (let t = 0; t < 600; t++) f.actualizar(250, grado, 1);
    return f.v * 3.6;
  };
  const base: Equipo = { modelo: 'ruta', cascoModelo: 'ruta', ruedas: 'bajo' };
  const con: Equipo = {
    ...base,
    ...(m.tipo === 'bici'
      ? { modelo: m.valor as Equipo['modelo'] }
      : m.tipo === 'ruedas'
        ? { ruedas: m.valor as Equipo['ruedas'] }
        : { cascoModelo: m.valor as Equipo['cascoModelo'] }),
  };
  return { llano: vel(con, 0) - vel(base, 0), subida: vel(con, 7) - vel(base, 7) };
}
const GANANCIAS = new Map(MATERIAL.map((m) => [m.id, ganancia(m)]));
const kmh = (x: number) =>
  Math.abs(x) < 0.05 ? 'igual' : `${x > 0 ? '+' : '−'}${Math.abs(x).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km/h`;

const pct = (x: number) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

export function PantallaTienda({
  saldo,
  despensa,
  onComprar,
  onVolver,
  avatar,
  onMaterial,
}: {
  saldo: number;
  despensa?: Despensa;
  onComprar: (id: IdNutricion) => void;
  onVolver: () => void;
  avatar: Avatar;
  /** Compra (si hace falta) y pone ese material en tu ciclista. */
  onMaterial: (m: Material) => void;
}) {
  const puesto = (m: Material) =>
    (m.tipo === 'bici' && avatar.modelo === m.valor) ||
    (m.tipo === 'ruedas' && avatar.ruedas === m.valor) ||
    (m.tipo === 'casco' && avatar.cascoModelo === m.valor);
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

      <h3>Material</h3>
      <p className="detalle">
        Se compra una vez y es tuyo para siempre. Lo que gana cada pieza está calculado con la física del recorrido para un
        ciclista de 75 kg a 250 W, frente al material básico. La bici de ruta (+0,5 % en las subidas), las ruedas de perfil bajo y
        el casco de ruta son gratis. Lo aerodinámico te hace ir algo más rápido en llano con los mismos vatios, y las
        bicis rígidas suben peor, igual que en la carretera.
      </p>
      <div className="tienda-lista">
        {MATERIAL.map((m) => {
          const tuyo = tieneMaterial(despensa, m.tipo, m.valor);
          const lleva = puesto(m);
          return (
            <div key={m.id} className="tienda-producto">
              <span className="tienda-emoji" aria-hidden>
                {m.tipo === 'bici' ? '🚲' : m.tipo === 'ruedas' ? '🛞' : '⛑️'}
              </span>
              <div className="tienda-info">
                <strong>{m.nombre}</strong>
                <span className="detalle">{m.descripcion}</span>
                <span className="tienda-efecto">{m.efecto}</span>
                <span className="tienda-ganancia">
                  <span className={GANANCIAS.get(m.id)!.llano < -0.04 ? 'pierde' : GANANCIAS.get(m.id)!.llano > 0.04 ? 'gana' : ''}>
                    Llano: {kmh(GANANCIAS.get(m.id)!.llano)}
                  </span>
                  <span className={GANANCIAS.get(m.id)!.subida < -0.04 ? 'pierde' : GANANCIAS.get(m.id)!.subida > 0.04 ? 'gana' : ''}>
                    Subida del 7 %: {kmh(GANANCIAS.get(m.id)!.subida)}
                  </span>
                </span>
                {tuyo && <span className="tienda-tengo">{lleva ? 'Lo llevas puesto' : 'Es tuyo'}</span>}
              </div>
              {tuyo ? (
                !lleva && (
                  <button className="boton-secundario" onClick={() => onMaterial(m)}>
                    Ponérmelo
                  </button>
                )
              ) : (
                <button className="boton-principal" disabled={saldo < m.precio} onClick={() => onMaterial(m)}>
                  🪙 {m.precio}
                </button>
              )}
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
