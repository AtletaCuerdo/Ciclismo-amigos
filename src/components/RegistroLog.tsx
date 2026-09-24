import type { TipoLog } from '../ble/SensorBle';

export interface EntradaLog {
  id: number;
  hora: string;
  texto: string;
  tipo: TipoLog;
}

interface Props {
  entradas: EntradaLog[];
  onLimpiar: () => void;
}

/** Registro visible de conexiones y respuestas del Control Point (lo más nuevo arriba). */
export function RegistroLog({ entradas, onLimpiar }: Props) {
  return (
    <section className="panel">
      <div className="cabecera-panel">
        <h2>Registro</h2>
        <button className="boton-secundario" onClick={onLimpiar}>
          Limpiar
        </button>
      </div>
      <ul className="log">
        {entradas.length === 0 && <li className="log-vacio">Sin mensajes todavía.</li>}
        {entradas.map((e) => (
          <li key={e.id} className={`log-${e.tipo}`}>
            <span className="log-hora">{e.hora}</span>
            <span>{e.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
