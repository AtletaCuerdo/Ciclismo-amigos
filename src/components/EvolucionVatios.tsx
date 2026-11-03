/**
 * «Tu evolución»: mejores vatios de 5′, 20′ y 60′ de cada mes (últimos 12) y el FTP que tenías.
 *
 * Las sesiones nuevas guardan sus mejores vatios en el resumen; para las de antes se calculan una
 * vez desde sus muestras y se apuntan en el navegador (`rodillos.mejoresCache`).
 */
import { useEffect, useMemo, useState } from 'react';
import { cargarEntreno } from '../entrenamiento/almacen';
import { mejoresVatios } from '../entrenamiento/resumen';
import type { EntrenoGuardado } from '../entrenamiento/tipos';

const SERIES = [
  { s: 300, nombre: 'Mejor 5′', color: '#3987e5' },
  { s: 1200, nombre: 'Mejor 20′', color: '#d95926' },
  { s: 3600, nombre: 'Mejor 60′', color: '#199e70' },
] as const;
const COLOR_FTP = '#94a3b8';
const CLAVE_CACHE = 'rodillos.mejoresCache';
const MESES = 12;

type Mejores = [number, number][];

function leerCache(): Record<string, Mejores> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CACHE) ?? '{}');
  } catch {
    return {};
  }
}

const nombreMes = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const nombreMesLargo = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

interface Mes {
  clave: string;
  fecha: Date;
  /** Mejor W por duración (undefined: no hubo sesión tan larga ese mes). */
  w: Partial<Record<number, number>>;
  ftp?: number;
}

export function EvolucionVatios({ entrenos }: { entrenos: EntrenoGuardado[] }) {
  const [mejores, setMejores] = useState<Record<string, Mejores>>(() => leerCache());
  const [tabla, setTabla] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);

  // Sesiones de los últimos 12 meses
  const desde = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - (MESES - 1), 1).getTime();
  }, []);
  const recientes = useMemo(() => entrenos.filter((g) => g.inicio >= desde), [entrenos, desde]);

  // Las de antes de guardar los mejores vatios: se calculan una vez desde sus muestras
  useEffect(() => {
    const faltan = recientes.filter((g) => !g.resumen.mejores && !mejores[g.id] && g.resumen.duracionS >= 300);
    if (!faltan.length) return;
    let vivo = true;
    void (async () => {
      const nuevos: Record<string, Mejores> = {};
      for (const g of faltan) {
        const e = await cargarEntreno(g).catch(() => null);
        if (!vivo) return;
        nuevos[g.id] = e ? mejoresVatios(e.muestras).map((m): [number, number] => [m.s, m.w]) : [];
      }
      setMejores((m) => {
        const todo = { ...m, ...nuevos };
        try {
          localStorage.setItem(CLAVE_CACHE, JSON.stringify(todo));
        } catch {
          // sin almacenamiento: se recalcula la próxima vez
        }
        return todo;
      });
    })();
    return () => {
      vivo = false;
    };
  }, [recientes, mejores]);

  const meses = useMemo(() => {
    const lista: Mes[] = [];
    const hoy = new Date();
    for (let i = MESES - 1; i >= 0; i--) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      lista.push({ clave: `${f.getFullYear()}-${f.getMonth()}`, fecha: f, w: {} });
    }
    const porClave = new Map(lista.map((m) => [m.clave, m]));
    // De la más antigua a la más reciente: el FTP del mes es el de su última sesión
    for (const g of [...recientes].sort((a, b) => a.inicio - b.inicio)) {
      const f = new Date(g.inicio);
      const m = porClave.get(`${f.getFullYear()}-${f.getMonth()}`);
      if (!m) continue;
      for (const [s, w] of g.resumen.mejores ?? mejores[g.id] ?? []) {
        if (w > (m.w[s] ?? 0)) m.w[s] = w;
      }
      if (g.resumen.ftp) m.ftp = g.resumen.ftp;
    }
    // Se empieza en el primer mes con datos
    const primero = lista.findIndex((m) => Object.keys(m.w).length > 0);
    return primero < 0 ? [] : lista.slice(primero);
  }, [recientes, mejores]);

  if (meses.length === 0) return null;

  // Escala: de un poco menos del mínimo a un poco más del máximo
  const valores = meses.flatMap((m) => [...Object.values(m.w), m.ftp].filter((x): x is number => !!x));
  const min = Math.max(0, Math.floor((Math.min(...valores) * 0.9) / 25) * 25);
  const max = Math.ceil((Math.max(...valores) * 1.05) / 25) * 25;
  const ANCHO = 600;
  const ALTO = 220;
  const izq = 40;
  const der = 56; // sitio para las etiquetas directas
  const arriba = 12;
  const abajo = 26;
  const x = (i: number) => (meses.length === 1 ? (izq + ANCHO - der) / 2 : izq + (i / (meses.length - 1)) * (ANCHO - izq - der));
  const y = (w: number) => arriba + (1 - (w - min) / (max - min || 1)) * (ALTO - arriba - abajo);
  const marcas = [0, 1, 2, 3].map((k) => Math.round(min + ((max - min) * k) / 3));
  const linea = (puntos: [number, number][]) => puntos.map(([i, w], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(w).toFixed(1)}`).join(' ');
  const serieFtp = meses.flatMap((m, i): [number, number][] => (m.ftp ? [[i, m.ftp]] : []));
  const ultimo = (puntos: [number, number][]) => puntos[puntos.length - 1];

  return (
    <section className="panel evolucion">
      <div className="cabecera-panel">
        <h2>Tu evolución</h2>
        <button className="boton-secundario" onClick={() => setTabla((t) => !t)}>
          {tabla ? 'Ver gráfica' : 'Ver como tabla'}
        </button>
      </div>
      <p className="detalle">Tus mejores vatios de cada mes y el FTP que tenías.</p>
      <div className="evolucion-leyenda">
        {SERIES.map((sr) => (
          <span key={sr.s}>
            <i style={{ background: sr.color }} />
            {sr.nombre}
          </span>
        ))}
        {serieFtp.length > 0 && (
          <span>
            <i className="ftp" style={{ borderColor: COLOR_FTP }} />
            FTP
          </span>
        )}
      </div>

      {tabla ? (
        <div className="evolucion-tabla">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                {SERIES.map((sr) => (
                  <th key={sr.s}>{sr.nombre}</th>
                ))}
                <th>FTP</th>
              </tr>
            </thead>
            <tbody>
              {[...meses].reverse().map((m) => (
                <tr key={m.clave}>
                  <td>{nombreMesLargo.format(m.fecha)}</td>
                  {SERIES.map((sr) => (
                    <td key={sr.s}>{m.w[sr.s] ? `${m.w[sr.s]} W` : '—'}</td>
                  ))}
                  <td>{m.ftp ? `${m.ftp} W` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="evolucion-grafica" onMouseLeave={() => setFoco(null)}>
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Mejores vatios por mes">
            {marcas.map((w) => (
              <g key={w}>
                <line x1={izq} x2={ANCHO - der} y1={y(w)} y2={y(w)} className="evolucion-rejilla" />
                <text x={izq - 6} y={y(w) + 4} textAnchor="end" className="evolucion-eje">
                  {w}
                </text>
              </g>
            ))}
            {meses.map((m, i) => (
              <text key={m.clave} x={x(i)} y={ALTO - 8} textAnchor="middle" className="evolucion-eje">
                {nombreMes.format(m.fecha).replace('.', '')}
              </text>
            ))}
            {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={arriba} y2={ALTO - abajo} className="evolucion-cursor" />}
            {serieFtp.length > 0 && (
              <>
                <path d={linea(serieFtp)} stroke={COLOR_FTP} strokeWidth={2} strokeDasharray="5 4" fill="none" />
                <text x={x(ultimo(serieFtp)[0]) + 8} y={y(ultimo(serieFtp)[1]) + 4} className="evolucion-etiqueta">
                  FTP
                </text>
              </>
            )}
            {SERIES.map((sr) => {
              const puntos = meses.flatMap((m, i): [number, number][] => (m.w[sr.s] ? [[i, m.w[sr.s]!]] : []));
              if (!puntos.length) return null;
              const [ui, uw] = ultimo(puntos);
              return (
                <g key={sr.s}>
                  <path d={linea(puntos)} stroke={sr.color} strokeWidth={2} fill="none" strokeLinejoin="round" />
                  {puntos.map(([i, w]) => (
                    <circle key={i} cx={x(i)} cy={y(w)} r={foco === i ? 5 : 4} fill={sr.color} stroke="#111c30" strokeWidth={2} />
                  ))}
                  <text x={x(ui) + 8} y={y(uw) + 4} className="evolucion-etiqueta">
                    {uw} W
                  </text>
                </g>
              );
            })}
            {/* Zonas para el ratón y el dedo: una por mes, más anchas que los puntos */}
            {meses.map((m, i) => (
              <rect
                key={m.clave}
                x={x(i) - (ANCHO - izq - der) / Math.max(1, meses.length - 1) / 2}
                y={0}
                width={(ANCHO - izq - der) / Math.max(1, meses.length - 1)}
                height={ALTO}
                fill="transparent"
                onMouseEnter={() => setFoco(i)}
                onClick={() => setFoco(i)}
              />
            ))}
          </svg>
          {foco !== null && (
            <div className="evolucion-tooltip" style={{ left: `${(x(foco) / ANCHO) * 100}%` }}>
              <strong>{nombreMesLargo.format(meses[foco].fecha)}</strong>
              {SERIES.map((sr) => (
                <span key={sr.s}>
                  <i style={{ background: sr.color }} />
                  {sr.nombre}: {meses[foco].w[sr.s] ? `${meses[foco].w[sr.s]} W` : '—'}
                </span>
              ))}
              {meses[foco].ftp && (
                <span>
                  <i className="ftp" style={{ borderColor: COLOR_FTP }} />
                  FTP: {meses[foco].ftp} W
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
