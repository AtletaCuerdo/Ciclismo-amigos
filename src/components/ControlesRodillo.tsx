import { useEffect, useRef, useState } from 'react';
import type { RodilloFtms } from '../ble/dispositivos';
import type { RangoPotencia } from '../ble/parsers';

interface Props {
  rodillo: RodilloFtms;
  rango: RangoPotencia | null;
  /** Se llama cuando el rodillo acepta un modo: pendiente en % o null si pasa a ERG. */
  onModo: (pendiente: number | null) => void;
}

const PENDIENTE_MIN = -5;
const PENDIENTE_MAX = 16;
const RETARDO_ENVIO_MS = 400; // esperamos a que el usuario suelte el deslizador

/** Modo ERG y simulación de pendiente. Solo se muestra con un rodillo FTMS conectado. */
export function ControlesRodillo({ rodillo, rango, onModo }: Props) {
  const [vatios, setVatios] = useState('150');
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const fijarErg = () => {
    const w = Number(vatios.replace(',', '.'));
    if (!Number.isFinite(w) || w < 0) {
      setAviso('Introduce un número de vatios válido.');
      return;
    }
    if (rango && (w < rango.min || w > rango.max)) {
      setAviso(`Fuera del rango del rodillo (${rango.min}–${rango.max} W). Se envía igualmente.`);
    } else {
      setAviso(null);
    }
    void rodillo.fijarPotencia(w).then((ok) => ok && onModo(null));
  };

  // Cambia la pendiente en pantalla al momento y la envía tras una pequeña pausa
  const cambiarPendiente = (valor: number) => {
    const v = Math.min(PENDIENTE_MAX, Math.max(PENDIENTE_MIN, Math.round(valor * 2) / 2));
    setPendiente(v);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(
      () => void rodillo.fijarPendiente(v).then((ok) => ok && onModo(v)),
      RETARDO_ENVIO_MS,
    );
  };

  if (!rodillo.tieneControl) {
    return (
      <section className="panel">
        <h2>Controles del rodillo</h2>
        <p className="aviso">Este rodillo no ofrece Control Point (0x2AD9): no se puede controlar.</p>
      </section>
    );
  }

  return (
    <section className="panel controles">
      <h2>Controles del rodillo</h2>

      <div className="control">
        <h3>ERG (potencia fija)</h3>
        <div className="fila-erg">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={rango?.incremento || 1}
            value={vatios}
            onChange={(e) => setVatios(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fijarErg()}
            aria-label="Vatios objetivo"
          />
          <span className="unidad-grande">W</span>
          <button className="boton-principal" onClick={fijarErg}>
            Fijar
          </button>
        </div>
        {rango && (
          <div className="detalle">
            Rango admitido: {rango.min}–{rango.max} W · incremento {rango.incremento} W
          </div>
        )}
        {aviso && <div className="aviso">{aviso}</div>}
      </div>

      <div className="control">
        <h3>
          Pendiente <span className="valor-pendiente">{pendiente.toFixed(1)} %</span>
        </h3>
        <div className="fila-pendiente">
          <button className="boton-paso" onClick={() => cambiarPendiente(pendiente - 1)}>
            −1
          </button>
          <input
            type="range"
            min={PENDIENTE_MIN}
            max={PENDIENTE_MAX}
            step={0.5}
            value={pendiente}
            onChange={(e) => cambiarPendiente(Number(e.target.value))}
            aria-label="Pendiente"
          />
          <button className="boton-paso" onClick={() => cambiarPendiente(pendiente + 1)}>
            +1
          </button>
        </div>
        <div className="detalle">Simulación: viento 0 m/s · Crr 0,004 · Cw 0,51 kg/m</div>
      </div>
    </section>
  );
}
