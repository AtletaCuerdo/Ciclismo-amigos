/**
 * Pestaña «Análisis de frecuencia cardiaca» del resumen: veredicto, la gráfica del pulso de cada
 * serie con su tendencia, la tabla y las recomendaciones (el cálculo está en analisisFc.ts).
 */
import { useState } from 'react';
import type { AnalisisFc, Estado } from '../entrenamiento/analisisFc';

const ESTADOS: Record<Estado, { icono: string; etiqueta: string; clase: string }> = {
  'muy-bien': { icono: '✅', etiqueta: 'Muy bien', clase: 'bueno' },
  bien: { icono: '👍', etiqueta: 'Bien', clase: 'bueno' },
  atencion: { icono: '⚠️', etiqueta: 'Atención', clase: 'aviso' },
  fatiga: { icono: '🛑', etiqueta: 'Fatiga', clase: 'serio' },
};

const COLOR_PULSO = '#e66767';
const COLOR_TENDENCIA = '#e2e8f0';

function GraficaSeries({ a }: { a: AnalisisFc }) {
  const [foco, setFoco] = useState<number | null>(null);
  const s = a.series;
  const ys = s.map((x) => x.pulsoEstable);
  const min = Math.floor((Math.min(...ys) - 4) / 5) * 5;
  const max = Math.ceil((Math.max(...ys) + 4) / 5) * 5;
  const ANCHO = 600;
  const ALTO = 200;
  const izq = 36;
  const der = 12;
  const arriba = 10;
  const abajo = 24;
  const x = (i: number) => izq + (s.length === 1 ? 0.5 : i / (s.length - 1)) * (ANCHO - izq - der);
  const y = (v: number) => arriba + (1 - (v - min) / (max - min || 1)) * (ALTO - arriba - abajo);
  const marcas = [0, 1, 2, 3].map((k) => Math.round(min + ((max - min) * k) / 3));
  const d = a.deriva!;
  const y0 = ys.reduce((p, q) => p + q, 0) / ys.length - d.porSerie * ((s.length - 1) / 2);
  const paso = Math.max(1, Math.ceil(s.length / 10));
  return (
    <div className="evolucion-grafica" onMouseLeave={() => setFoco(null)}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Pulso estable de cada serie">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={izq} x2={ANCHO - der} y1={y(v)} y2={y(v)} className="evolucion-rejilla" />
            <text x={izq - 6} y={y(v) + 4} textAnchor="end" className="evolucion-eje">
              {v}
            </text>
          </g>
        ))}
        {s.map((x0, i) =>
          i % paso === 0 || i === s.length - 1 ? (
            <text key={x0.n} x={x(i)} y={ALTO - 7} textAnchor="middle" className="evolucion-eje">
              {x0.n}
            </text>
          ) : null,
        )}
        {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={arriba} y2={ALTO - abajo} className="evolucion-cursor" />}
        {/* Tendencia (recta de regresión) */}
        <line
          x1={x(0)}
          x2={x(s.length - 1)}
          y1={y(y0)}
          y2={y(y0 + d.porSerie * (s.length - 1))}
          stroke={COLOR_TENDENCIA}
          strokeWidth={2}
          strokeDasharray="6 4"
        />
        <polyline
          points={s.map((v, i) => `${x(i)},${y(v.pulsoEstable)}`).join(' ')}
          fill="none"
          stroke={COLOR_PULSO}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {s.map((v, i) => (
          <circle key={v.n} cx={x(i)} cy={y(v.pulsoEstable)} r={foco === i ? 5.5 : 4} fill={COLOR_PULSO} stroke="#111c30" strokeWidth={2} />
        ))}
        {s.map((v, i) => (
          <rect
            key={`z${v.n}`}
            x={x(i) - (ANCHO - izq - der) / Math.max(1, s.length - 1) / 2}
            y={0}
            width={(ANCHO - izq - der) / Math.max(1, s.length - 1)}
            height={ALTO}
            fill="transparent"
            onMouseEnter={() => setFoco(i)}
            onClick={() => setFoco(i)}
          />
        ))}
      </svg>
      {foco !== null && (
        <div className="evolucion-tooltip" style={{ left: `${(x(foco) / ANCHO) * 100}%` }}>
          <strong>Serie {s[foco].n}</strong>
          <span>Pulso estable: {Math.round(s[foco].pulsoEstable)} ppm</span>
          <span>Final: {Math.round(s[foco].pulsoFinal)} ppm</span>
          <span>Vatios: {Math.round(s[foco].vatios)} W</span>
          {s[foco].recupera !== undefined && <span>Baja en 1′: {Math.round(s[foco].recupera!)} ppm</span>}
        </div>
      )}
    </div>
  );
}

export function AnalisisFrecuencia({ a }: { a: AnalisisFc }) {
  const [tabla, setTabla] = useState(false);
  const e = ESTADOS[a.estado];
  return (
    <div className="analisis-fc">
      <div className={`analisis-veredicto ${e.clase}`} role="status">
        <span className="analisis-estado">
          {e.icono} {e.etiqueta}
        </span>
        <strong>{a.titulo}</strong>
      </div>

      {a.tipo === 'series' && a.deriva && (
        <div className="analisis-cifras">
          <div>
            <strong>
              {a.deriva.total >= 0 ? '+' : '−'}
              {Math.abs(Math.round(a.deriva.total))} ppm
            </strong>
            <span>deriva de la 1.ª a la última</span>
          </div>
          <div>
            <strong>{a.deriva.significativa ? 'Sí' : 'No'}</strong>
            <span>significativa (p &lt; 0,05)</span>
          </div>
          {a.desacople !== undefined && (
            <div>
              <strong>{a.desacople.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</strong>
              <span>desacople aeróbico</span>
            </div>
          )}
          {a.frenteAnterior && (
            <div>
              <strong>
                {a.frenteAnterior.pct >= 0 ? '+' : '−'}
                {Math.abs(a.frenteAnterior.pct).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %
              </strong>
              <span>eficiencia frente a la última vez</span>
            </div>
          )}
        </div>
      )}
      {a.tipo === 'libre' && a.desacople !== undefined && (
        <div className="analisis-cifras">
          <div>
            <strong>{a.desacople.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</strong>
            <span>desacople aeróbico</span>
          </div>
        </div>
      )}

      {a.tipo === 'series' && a.series.length > 1 && (
        <>
          <div className="cabecera-panel">
            <h3>Pulso de cada serie: {a.descripcion}</h3>
            <button className="boton-secundario" onClick={() => setTabla((t) => !t)}>
              {tabla ? 'Ver gráfica' : 'Ver como tabla'}
            </button>
          </div>
          {tabla ? (
            <div className="evolucion-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Serie</th>
                    <th>Vatios</th>
                    <th>Pulso estable</th>
                    <th>Pulso final</th>
                    <th>Baja en 1′</th>
                  </tr>
                </thead>
                <tbody>
                  {a.series.map((s) => (
                    <tr key={s.n}>
                      <td>{s.n}</td>
                      <td>{Math.round(s.vatios)} W</td>
                      <td>{Math.round(s.pulsoEstable)} ppm</td>
                      <td>{Math.round(s.pulsoFinal)} ppm</td>
                      <td>{s.recupera !== undefined ? `${Math.round(s.recupera)} ppm` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <GraficaSeries a={a} />
              <p className="detalle">
                Puntos: pulso medio de la segunda mitad de cada serie (cuando ya se ha estabilizado). Línea discontinua: la
                tendencia.
              </p>
            </>
          )}
        </>
      )}

      <h3>Qué significa</h3>
      <ul className="analisis-lista">
        {a.explicacion.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h3>Recomendaciones</h3>
      <ul className="analisis-lista">
        {a.recomendaciones.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="detalle">
        Es una orientación a partir de tu pulso: el calor, la hidratación, el café o el estrés también lo mueven. Si tienes
        dudas sobre tu salud, consulta con un médico.
      </p>
    </div>
  );
}
