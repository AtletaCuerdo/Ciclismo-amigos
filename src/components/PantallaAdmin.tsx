/**
 * 🛡️ Panel del administrador (solo lo ve la cuenta que está en `admins` en Firebase): quién
 * tiene cuenta, cuánto ha rodado y cuántas plazas de la aplicación de Strava quedan.
 */
import { useEffect, useState } from 'react';
import { leerFichas, type Ficha } from '../cuenta/admin';

/** Atletas que admite ahora la aplicación de Strava (subirlo si Strava da más). */
const PLAZAS_STRAVA = 10;

const fecha = (ms: number) => (ms ? new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const km = (m: number) => `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} km`;

export function PantallaAdmin({ onVolver }: { onVolver: () => void }) {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    setError(null);
    leerFichas()
      .then(setFichas)
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
        Solo lo ves tú. Cada ciclista aparece aquí la primera vez que abre la web con su cuenta (después de esta versión).
      </p>

      {error && <p className="aviso">{error}</p>}
      {!fichas && !error && <p className="detalle">Cargando…</p>}

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
                  </tr>
                </thead>
                <tbody>
                  {fichas.map((f) => (
                    <tr key={f.uid}>
                      <td>
                        <strong>{f.nombre}</strong>
                        <small>{f.correo}</small>
                      </td>
                      <td>{f.sesiones}</td>
                      <td>{km(f.metros)}</td>
                      <td>{f.strava ? '✅' : '—'}</td>
                      <td>{fecha(f.alta)}</td>
                      <td>{fecha(f.t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
