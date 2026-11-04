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
  /** Con el FTP se rotulan los vatios encima de los tramos largos. */
  ftp?: number;
  /** Lo hecho de verdad, segundo a segundo: vatios (en la escala de la gráfica, con `ftpTraza`) y pulso. */
  traza?: { t: number; w?: number; hr?: number }[];
  ftpTraza?: number;
  /** FC máxima: el pulso va de 40 % (abajo) a 100 % (arriba). */
  fcMax?: number;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`;

/** Vatios de un tramo («200 W» o «150→250 W» en las rampas). */
export function textoVatios(t: Tramo, ftp: number) {
  const a = Math.round((t.desde * ftp) / 100);
  const b = Math.round((t.hasta * ftp) / 100);
  return t.libre ? 'a tope' : a === b ? `${a} W` : `${a}→${b} W`;
}

/**
 * Intervalos del entrenamiento con sus vatios, agrupando los repetidos: «2 × 10:00 a 202 W».
 * Se listan en el orden en que aparecen.
 */
export function ListaIntervalos({ tramos, ftp }: { tramos: Tramo[]; ftp: number }) {
  const grupos = new Map<string, { veces: number; t: Tramo }>();
  for (const t of tramos) {
    const clave = `${t.duracion}|${t.desde}|${t.hasta}|${t.libre ? 1 : 0}`;
    const g = grupos.get(clave);
    if (g) g.veces++;
    else grupos.set(clave, { veces: 1, t });
  }
  return (
    <ul className="lista-intervalos">
      {[...grupos.values()].map(({ veces, t }, i) => (
        <li key={i}>
          <span className="intervalo-color" style={{ background: colorZona((t.desde + t.hasta) / 2) }} />
          {veces > 1 ? `${veces} × ` : ''}
          {mmss(t.duracion)} · <strong>{textoVatios(t, ftp)}</strong>
          <span className="detalle"> ({t.desde === t.hasta ? t.desde : `${t.desde}→${t.hasta}`} % FTP)</span>
        </li>
      ))}
    </ul>
  );
}

/** Gráfica de barras del entrenamiento: ancho = duración, alto = % FTP, color = zona. */
/** Línea de una serie ya escalada (uno de cada `paso` puntos, para no dibujar miles). */
function trazo(puntos: [number, number][], paso: number) {
  let d = '';
  let antes = -Infinity;
  for (let k = 0; k < puntos.length; k += paso) {
    const [x, y] = puntos[k];
    // Un salto en el tiempo (pausa o bloque saltado) corta la línea
    d += `${x - antes > 40 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    antes = x;
  }
  return d;
}

export function GraficaEntrenamiento({ tramos, progreso, alto = 90, className, ftp, traza, ftpTraza, fcMax }: Props) {
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
  const grafica = (
    <svg
      className={`grafica-entreno ${className ?? ''}`}
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      style={{ height: alto }}
      aria-hidden
    >
      {formas}
      <line x1={0} x2={1000} y1={yFtp} y2={yFtp} className="linea-ftp" vectorEffect="non-scaling-stroke" />
      {traza && traza.length > 1 && (() => {
        const paso = Math.max(1, Math.round(traza.length / 600));
        const xs = (s: number) => (Math.min(s, total) / total) * 1000;
        // Vatios suavizados (media de 5 s), como en Zwift
        const suaves = traza.map((_, k) => {
          const ventana = traza.slice(Math.max(0, k - 4), k + 1).filter((q) => q.w !== undefined);
          return ventana.length ? ventana.reduce((a, q) => a + q.w!, 0) / ventana.length : undefined;
        });
        const vatios = ftpTraza
          ? traza.flatMap((p, k): [number, number][] =>
              suaves[k] !== undefined ? [[xs(p.t), Math.max(0, 100 - ((suaves[k]! / ftpTraza) * 100 / maximo) * 100)]] : [],
            )
          : [];
        const pulso = fcMax
          ? traza.flatMap((p): [number, number][] =>
              p.hr ? [[xs(p.t), Math.max(0, Math.min(100, 100 - ((p.hr / fcMax - 0.4) / 0.6) * 100))]] : [],
            )
          : [];
        return (
          <>
            {vatios.length > 1 && <path d={trazo(vatios, paso)} className="traza-vatios" vectorEffect="non-scaling-stroke" />}
            {pulso.length > 1 && <path d={trazo(pulso, paso)} className="traza-pulso" vectorEffect="non-scaling-stroke" />}
          </>
        );
      })()}
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
  if (!ftp) return grafica;
  // Rótulos en HTML (dentro del SVG se deformarían al estirarlo)
  return (
    <div className="grafica-con-vatios">
      {grafica}
      {tramos.map((t, i) =>
        t.duracion / total >= 0.06 ? (
          <span
            key={i}
            className="rotulo-vatios"
            style={{
              left: `${((t.inicio + t.duracion / 2) / total) * 100}%`,
              top: `${(100 - (Math.max(t.desde, t.hasta) / maximo) * 100) * (alto / 100)}px`,
            }}
          >
            {textoVatios(t, ftp)}
          </span>
        ) : null,
      )}
    </div>
  );
}
