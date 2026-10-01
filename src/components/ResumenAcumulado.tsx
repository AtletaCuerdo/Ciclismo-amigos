import { useEffect, useState } from 'react';
import { listarEntrenos } from '../entrenamiento/almacen';
import { calcularLogros, iniciarLogrosVistos, rachaSemanas } from '../entrenamiento/logros';
import type { EntrenoGuardado } from '../entrenamiento/tipos';

interface Props {
  version: number;
  onVerHistorial: () => void;
}

/** Totales acumulados de todas las sesiones (pantalla de inicio). */
export function ResumenAcumulado({ version, onVerHistorial }: Props) {
  const [lista, setLista] = useState<EntrenoGuardado[]>([]);
  const [verLogros, setVerLogros] = useState(false);

  useEffect(() => {
    listarEntrenos()
      .then((l) => {
        setLista(l);
        iniciarLogrosVistos(l);
      })
      .catch(() => setLista([]));
  }, [version]);
  const logros = calcularLogros(lista);
  const conseguidos = logros.filter((l) => l.conseguido).length;
  const racha = rachaSemanas(lista);

  const t = lista.reduce(
    (a, g) => ({
      s: a.s + g.resumen.duracionS,
      m: a.m + g.resumen.distanciaM,
      d: a.d + g.resumen.desnivelM,
    }),
    { s: 0, m: 0, d: 0 },
  );
  const ultima = lista[0];

  return (
    <>
      <div className="tarjeta-acumulado">
        <div className="cabecera-panel">
          <h2>Tus datos acumulados</h2>
          <button className="boton-secundario" onClick={onVerHistorial}>
            Ver historial
          </button>
        </div>
        <div className="rejilla-totales">
          <div className="total">
            <span className="total-valor">{lista.length}</span>
            <span className="total-etiqueta">sesiones</span>
          </div>
          <div className="total">
            <span className="total-valor">{(t.s / 3600).toFixed(1).replace('.', ',')}</span>
            <span className="total-etiqueta">horas</span>
          </div>
          <div className="total">
            <span className="total-valor">{Math.round(t.m / 1000)}</span>
            <span className="total-etiqueta">km</span>
          </div>
          <div className="total">
            <span className="total-valor">{Math.round(t.d)}</span>
            <span className="total-etiqueta">m desnivel +</span>
          </div>
        </div>
        <div className="fila-logros">
          <span
            className={`chip-racha ${racha ? 'viva' : ''}`}
            title="Semanas seguidas (de lunes a domingo) con al menos una sesión"
          >
            {racha ? `🔥 ${racha} ${racha === 1 ? 'semana' : 'semanas seguidas'}` : '🔥 Sin racha: rueda esta semana'}
          </span>
          <button className="boton-enlace" onClick={() => setVerLogros((v) => !v)} aria-expanded={verLogros}>
            🏅 {conseguidos} de {logros.length} logros {verLogros ? '▲' : '▼'}
          </button>
        </div>
        <p className="detalle">
          {ultima
            ? `Última sesión: ${new Date(ultima.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`
            : 'Aún no hay sesiones: empieza con «Rodar libre» o un entrenamiento.'}
        </p>
      </div>
      {verLogros && (
        <ul className="rejilla-logros panel-logros">
          {logros.map((l) => (
            <li key={l.id} className={l.conseguido ? 'conseguido' : ''} title={l.descripcion}>
              <span className="logro-icono" aria-hidden>
                {l.icono}
              </span>
              <strong>{l.nombre}</strong>
              <span className="detalle">{l.descripcion}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
