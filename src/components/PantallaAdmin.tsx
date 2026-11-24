/**
 * 🛡️ Panel del administrador (solo lo ve la cuenta que está en `admins` en Firebase): quién
 * tiene cuenta, cuánto ha rodado y cuántas plazas de la aplicación de Strava quedan.
 */
import { useEffect, useState } from 'react';
import { adminVistoEn, cuentasNuevas, leerFichas, leerRegalos, marcarAdminVisto, regalarMonedas, type Ficha } from '../cuenta/admin';
import { Moneda } from './Moneda';

/** Atletas que admite ahora la aplicación de Strava (subirlo si Strava da más). */
const PLAZAS_STRAVA = 10;

const fecha = (ms: number) => (ms ? new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const km = (m: number) => `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} km`;

export function PantallaAdmin({ onVolver, onVisto }: { onVolver: () => void; onVisto?: () => void }) {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  const [sinCuenta, setSinCuenta] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Cuentas nuevas desde la última vez que abrí el panel (se apunta la visita al abrirlo)
  const [vistoAntes] = useState(adminVistoEn);
  useEffect(() => {
    marcarAdminVisto();
    onVisto?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nuevas = fichas ? cuentasNuevas(fichas, vistoAntes) : [];

  // RideCoins regalados a cada cuenta (para que prueben la tienda y las paradas)
  const [regalos, setRegalos] = useState<Record<string, number>>({});
  const [regalando, setRegalando] = useState<string | null>(null);
  const [avisoRegalo, setAvisoRegalo] = useState<string | null>(null);
  const regalar = async (f: Ficha) => {
    if (!window.confirm(`¿Regalar 10.000 RideCoins a ${f.nombre}?`)) return;
    setRegalando(f.uid);
    setAvisoRegalo(null);
    try {
      const total = await regalarMonedas(f.uid, 10000);
      setRegalos((r) => ({ ...r, [f.uid]: total }));
      setAvisoRegalo(`🎁 Hecho: ${f.nombre} ya tiene 10.000 RideCoins más (le salen al momento, aunque tenga la web abierta).`);
    } catch {
      setAvisoRegalo('No se pudo regalar. Comprueba que las reglas nuevas de Firebase (las de «regalos») estén pegadas.');
    }
    setRegalando(null);
  };

  const cargar = () => {
    setError(null);
    void leerRegalos().then(setRegalos);
    leerFichas()
      .then((r) => {
        setFichas(r.fichas);
        setSinCuenta(r.sinCuenta);
      })
      .catch(() => setError('No se pudieron leer las cuentas. Comprueba que las reglas nuevas de Firebase estén pegadas.'));
  };
  useEffect(cargar, []);

  const conStrava = fichas?.filter((f) => f.strava).length ?? 0;
  const totalSesiones = fichas?.reduce((a, f) => a + f.sesiones, 0) ?? 0;
  const totalMetros = fichas?.reduce((a, f) => a + f.metros, 0) ?? 0;

  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← Inicio
        </button>
        <h2>🛡️ Administración</h2>
        <button className="boton-secundario" onClick={cargar}>
          Actualizar
        </button>
      </div>
      <p className="detalle">
        Solo lo ves tú. Las cuentas de antes salen con sus totales de los rankings; el correo, la fecha de alta y
        Strava aparecen cuando esa persona vuelva a abrir la web con su cuenta.
      </p>

      {error && <p className="aviso">{error}</p>}
      {!fichas && !error && <p className="detalle">Cargando…</p>}

      {nuevas.length > 0 && (
        <p className="aviso-nuevas" role="status">
          🆕 {nuevas.length === 1 ? '1 cuenta nueva' : `${nuevas.length} cuentas nuevas`} desde tu última visita:{' '}
          <strong>{nuevas.map((f) => f.nombre).join(', ')}</strong>
        </p>
      )}

      {fichas && (
        <>
          <div className="resumen-grandes admin-resumen">
            <div>
              <strong>{fichas.length}</strong>
              <span>cuentas</span>
            </div>
            <div className={conStrava >= PLAZAS_STRAVA ? 'admin-lleno' : ''}>
              <strong>
                {conStrava} / {PLAZAS_STRAVA}
              </strong>
              <span>con Strava ({Math.max(0, PLAZAS_STRAVA - conStrava)} libres)</span>
            </div>
            <div>
              <strong>{totalSesiones}</strong>
              <span>sesiones</span>
            </div>
            <div>
              <strong>{km(totalMetros)}</strong>
              <span>en total</span>
            </div>
          </div>

          {avisoRegalo && <p className="aviso">{avisoRegalo}</p>}
          {fichas.length === 0 ? (
            <p className="vacio">Todavía no hay ninguna ficha.</p>
          ) : (
            <div className="tabla-admin-marco">
              <table className="tabla-admin">
                <thead>
                  <tr>
                    <th>Ciclista</th>
                    <th>Sesiones</th>
                    <th>Km</th>
                    <th>Strava</th>
                    <th>Alta</th>
                    <th>Última vez</th>
                    <th>RideCoins</th>
                  </tr>
                </thead>
                <tbody>
                  {fichas.map((f) => (
                    <tr key={f.uid}>
                      <td>
                        <strong>
                          {nuevas.includes(f) && <span className="insignia-nueva">🆕 Nueva</span>} {f.nombre}
                        </strong>
                        <small>{f.pendiente ? 'aún no ha vuelto a entrar' : f.correo}</small>
                      </td>
                      <td>{f.sesiones}</td>
                      <td>{km(f.metros)}</td>
                      <td>
                        {f.pendiente ? '?' : f.strava ? '✅' : '—'}
                        {f.strava && f.stravaAtleta && <small>{f.stravaAtleta}</small>}
                      </td>
                      <td>{f.pendiente ? '?' : fecha(f.alta)}</td>
                      <td>{fecha(f.t)}</td>
                      <td>
                        <button
                          className="boton-secundario boton-regalo"
                          disabled={regalando === f.uid}
                          onClick={() => void regalar(f)}
                          title="Para que pruebe la tienda y las paradas"
                        >
                          🎁 +10.000
                        </button>
                        {regalos[f.uid] ? (
                          <small>
                            regalados <Moneda /> {regalos[f.uid].toLocaleString('es-ES')}
                          </small>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sinCuenta > 0 && (
            <p className="detalle">
              Además, {sinCuenta} {sinCuenta === 1 ? 'persona rueda' : 'personas ruedan'} sin cuenta (salen en los rankings).
            </p>
          )}
        </>
      )}
    </section>
  );
}
