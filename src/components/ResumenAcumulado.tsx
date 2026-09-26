import { useEffect, useState } from 'react';
import { listarEntrenos } from '../entrenamiento/almacen';
import type { EntrenoGuardado } from '../entrenamiento/tipos';

interface Props {
  version: number;
  onVerHistorial: () => void;
}

/** Totales acumulados de todas las sesiones (pantalla de inicio). */
export function ResumenAcumulado({ version, onVerHistorial }: Props) {
  const [lista, setLista] = useState<EntrenoGuardado[]>([]);

  useEffect(() => {
    listarEntrenos()
      .then(setLista)
      .catch(() => setLista([]));
  }, [version]);

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
      <p className="detalle">
        {ultima
          ? `Última sesión: ${new Date(ultima.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`
          : 'Aún no hay sesiones: empieza con «Rodar libre» o un entrenamiento.'}
      </p>
    </div>
  );
}
