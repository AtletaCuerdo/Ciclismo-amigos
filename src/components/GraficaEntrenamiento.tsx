import { useMemo } from 'react';
import { duracionTotal, type Tramo } from '../entrenamientos/tipos';

/** Color por zona de entrenamiento según el % del FTP. */
export function colorZona(pct: number) {
  if (pct < 56) return '#9aa6b2'; // Z1 recuperación
  if (pct < 76) return '#4a90d9'; // Z2 resistencia
  if (pct < 91) return '#3cb371'; // Z3 tempo
  if (pct < 106) return '#f2c230'; // Z4 umbral
  if (pct < 121) return '#f28c28'; // Z5 VO2max
  return '#e5533d'; // Z6 anaeróbico
}

interface Props {
  tramos: Tramo[];
  /** Segundo actual (dibuja el avance); omitir si no se está haciendo. */
  progreso?: number;
  alto?: number;
  className?: string;
}

/** Gráfica de barras del entrenamiento: ancho = duración, alto = % FTP, color = zona. */
export function GraficaEntrenamiento({ tramos, progreso, alto = 90, className }: Props) {
  const total = duracionTotal(tramos) || 1;
  const maximo = Math.max(130, ...tramos.map((t) => Math.max(t.desde, t.hasta)));
  const formas = useMemo(
    () =>
      tramos.map((t, i) => {
        const x0 = (t.inicio / total) * 1000;
        const x1 = ((t.inicio + t.duracion) / total) * 1000;
        const y0 = 100 - (t.desde / maximo) * 100;
        const y1 = 100 - (t.hasta / maximo) * 100;
        return (
          <polygon
            key={i}
            points={`${x0},100 ${x0},${y0} ${x1},${y1} ${x1},100`}
            fill={colorZona((t.desde + t.hasta) / 2)}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        );
      }),
    [tramos, total, maximo],
  );
  const yFtp = 100 - (100 / maximo) * 100;
  return (
    <svg
      className={`grafica-entreno ${className ?? ''}`}
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      style={{ height: alto }}
      aria-hidden
    >
      {formas}
      <line x1={0} x2={1000} y1={yFtp} y2={yFtp} className="linea-ftp" vectorEffect="non-scaling-stroke" />
      {progreso !== undefined && (
        <>
          <rect x={0} y={0} width={(Math.min(progreso, total) / total) * 1000} height={100} className="grafica-hecho" />
          <line
            x1={(Math.min(progreso, total) / total) * 1000}
            x2={(Math.min(progreso, total) / total) * 1000}
            y1={0}
            y2={100}
            className="grafica-cursor"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}
