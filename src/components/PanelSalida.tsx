import { useState } from 'react';
import { cargarNombre, type Ciclista, type EstadoSalida } from '../multijugador/useSalida';

interface Props {
  estado: EstadoSalida;
  error: string | null;
  ciclistas: Ciclista[];
  miUid: string | null;
  grabando: boolean;
  onUnirse: (nombre: string) => void;
  onSalir: () => void;
}

const TEXTO_ESTADO: Record<EstadoSalida, string> = {
  fuera: 'No estás en la salida',
  entrando: 'Conectando…',
  dentro: 'En la salida',
  'sin-conexion': 'Sin conexión, reintentando…',
};

const fmt = (v: number | undefined, dec = 0) => (v === undefined ? '--' : v.toFixed(dec));

/** Salida en grupo: unirse con un nombre y ver a los demás en directo. */
export function PanelSalida({ estado, error, ciclistas, miUid, grabando, onUnirse, onSalir }: Props) {
  const [nombre, setNombre] = useState(cargarNombre);
  const dentro = estado === 'dentro' || estado === 'sin-conexion';

  return (
    <section className="panel">
      <div className="cabecera-panel">
        <h2>Salida en grupo</h2>
        <span className={`chip-salida chip-${estado}`}>{TEXTO_ESTADO[estado]}</span>
      </div>

      {!dentro ? (
        <form
          className="fila-unirse"
          onSubmit={(e) => {
            e.preventDefault();
            onUnirse(nombre);
          }}
        >
          <input
            type="text"
            value={nombre}
            maxLength={30}
            placeholder="Tu nombre"
            autoComplete="nickname"
            onChange={(e) => setNombre(e.target.value)}
            aria-label="Tu nombre"
          />
          <button className="boton-principal" type="submit" disabled={estado === 'entrando'}>
            Unirme a la salida
          </button>
        </form>
      ) : (
        <div className="fila-unirse">
          <span className="detalle">
            Rodando como <strong>{nombre}</strong>
            {!grabando && ' · pulsa «Iniciar» arriba para que cuente tu distancia'}
          </span>
          <button className="boton-secundario" onClick={onSalir}>
            Salir
          </button>
        </div>
      )}

      {error && <p className="aviso">{error}</p>}

      {dentro && (
        <table className="tabla-salida">
          <thead>
            <tr>
              <th>#</th>
              <th>Ciclista</th>
              <th>W</th>
              <th>km/h</th>
              <th>rpm</th>
              <th>km</th>
            </tr>
          </thead>
          <tbody>
            {ciclistas.length === 0 && (
              <tr>
                <td colSpan={6} className="detalle">
                  Esperando datos…
                </td>
              </tr>
            )}
            {ciclistas.map((c, i) => (
              <tr key={c.uid} className={c.uid === miUid ? 'yo' : undefined}>
                <td>{i + 1}</td>
                <td className="nombre-ciclista">
                  {c.nombre}
                  {c.uid === miUid && ' (tú)'}
                </td>
                <td>{fmt(c.vatios)}</td>
                <td>{fmt(c.velocidad, 1)}</td>
                <td>{fmt(c.cadencia)}</td>
                <td>{fmt(c.distancia !== undefined ? c.distancia / 1000 : undefined, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="detalle">
        Los demás verán tu nombre, vatios, velocidad, cadencia y distancia mientras estés en la salida.
      </p>
    </section>
  );
}
