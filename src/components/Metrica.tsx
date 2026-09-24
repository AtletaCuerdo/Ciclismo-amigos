interface Props {
  etiqueta: string;
  valor: number | undefined;
  unidad: string;
  decimales?: number;
  fuente?: string;
  /** Marca el valor como estimado (potencia virtual). */
  estimada?: boolean;
  destacada?: boolean;
}

/** Una casilla del panel en directo. Muestra "--" si no hay dato. */
export function Metrica({ etiqueta, valor, unidad, decimales = 0, fuente, estimada, destacada }: Props) {
  const texto = valor === undefined || !Number.isFinite(valor) ? '--' : valor.toFixed(decimales);
  return (
    <div className={`metrica${destacada ? ' destacada' : ''}${estimada ? ' estimada' : ''}`}>
      <div className="metrica-etiqueta">
        {etiqueta}
        {estimada && <span className="insignia">estimada</span>}
      </div>
      <div className="metrica-valor">
        {texto}
        <span className="metrica-unidad">{unidad}</span>
      </div>
      <div className="metrica-fuente">{fuente ?? ' '}</div>
    </div>
  );
}

/** Formatea segundos como h:mm:ss o mm:ss. */
export function formatearTiempo(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const dd = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`;
}
