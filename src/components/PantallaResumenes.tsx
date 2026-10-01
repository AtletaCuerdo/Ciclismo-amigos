/**
 * 📊 Resúmenes del mes y del año (tipo «Wrapped»): totales, comparación con el periodo anterior,
 * gráfica de km, lo más destacado y un botón para compartirlo por WhatsApp.
 * Todo sale del historial (con cuenta, el mismo en todos los dispositivos).
 */
import { useEffect, useState } from 'react';
import { listarEntrenos } from '../entrenamiento/almacen';
import type { EntrenoGuardado } from '../entrenamiento/tipos';
import { circuitoPorId } from '../recorrido/circuitos';
import { textoTiempo } from '../recorrido/segmentos';

type Modo = 'mes' | 'anio';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

const num = (n: number, dec = 0) => n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Inicio y fin (ms) del periodo: el mes o el año actual desplazado `desfase` periodos. */
function periodo(modo: Modo, desfase: number) {
  const hoy = new Date();
  if (modo === 'mes') {
    const ini = new Date(hoy.getFullYear(), hoy.getMonth() + desfase, 1);
    const fin = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
    return { ini, fin, nombre: `${MESES[ini.getMonth()]} de ${ini.getFullYear()}`, corto: MESES[ini.getMonth()] };
  }
  const ini = new Date(hoy.getFullYear() + desfase, 0, 1);
  const fin = new Date(ini.getFullYear() + 1, 0, 1);
  return { ini, fin, nombre: `${ini.getFullYear()}`, corto: `${ini.getFullYear()}` };
}

/** El que más se repite de una lista (null si está vacía). */
function masRepetido(lista: string[]) {
  const cuenta = new Map<string, number>();
  for (const x of lista) cuenta.set(x, (cuenta.get(x) ?? 0) + 1);
  let mejor: [string, number] | null = null;
  for (const e of cuenta) if (!mejor || e[1] > mejor[1]) mejor = e;
  return mejor;
}

function resumir(lista: EntrenoGuardado[]) {
  const suma = (f: (g: EntrenoGuardado) => number) => lista.reduce((a, g) => a + f(g), 0);
  const segundos = suma((g) => g.resumen.duracionS);
  const conVatios = lista.filter((g) => g.resumen.potenciaMedia !== undefined);
  const sVatios = conVatios.reduce((a, g) => a + g.resumen.duracionS, 0);
  const max = (f: (g: EntrenoGuardado) => number) =>
    lista.reduce<EntrenoGuardado | null>((m, g) => (!m || f(g) > f(m) ? g : m), null);
  return {
    sesiones: lista.length,
    km: suma((g) => g.resumen.distanciaM) / 1000,
    horas: segundos / 3600,
    desnivel: suma((g) => g.resumen.desnivelM),
    kcal: suma((g) => g.resumen.kilojulios),
    rueda: suma((g) => g.resumen.segundosRueda ?? 0),
    vatiosMedios: sVatios > 0 ? conVatios.reduce((a, g) => a + (g.resumen.potenciaMedia ?? 0) * g.resumen.duracionS, 0) / sVatios : null,
    dias: new Set(lista.map((g) => new Date(g.inicio).toDateString())).size,
    masLarga: max((g) => g.resumen.duracionS),
    masKm: max((g) => g.resumen.distanciaM),
    pico: max((g) => g.resumen.potenciaMax ?? 0),
    dia: masRepetido(lista.map((g) => DIAS[new Date(g.inicio).getDay()])),
    circuito: masRepetido(lista.flatMap((g) => (g.resumen.circuito ? [g.resumen.circuito] : []))),
    companero: masRepetido(lista.flatMap((g) => g.resumen.companeros ?? [])),
  };
}

/** Km por día del mes o por mes del año (para la gráfica de barras). */
function barras(lista: EntrenoGuardado[], modo: Modo, ini: Date) {
  const n = modo === 'mes' ? new Date(ini.getFullYear(), ini.getMonth() + 1, 0).getDate() : 12;
  const km = new Array<number>(n).fill(0);
  for (const g of lista) {
    const d = new Date(g.inicio);
    km[modo === 'mes' ? d.getDate() - 1 : d.getMonth()] += g.resumen.distanciaM / 1000;
  }
  return km;
}

const fecha = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function PantallaResumenes({ onVolver }: { onVolver: () => void }) {
  const [modo, setModo] = useState<Modo>('mes');
  const [desfase, setDesfase] = useState(0);
  const [todas, setTodas] = useState<EntrenoGuardado[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    listarEntrenos()
      .then(setTodas)
      .catch(() => setTodas([]));
  }, []);

  const p = periodo(modo, desfase);
  const anterior = periodo(modo, desfase - 1);
  const de = (a: Date, b: Date) => (todas ?? []).filter((g) => g.inicio >= a.getTime() && g.inicio < b.getTime());
  const lista = de(p.ini, p.fin);
  const r = resumir(lista);
  const r0 = resumir(de(anterior.ini, anterior.fin));
  const km = barras(lista, modo, p.ini);
  const maxKm = Math.max(1, ...km);
  const hayAntes = (todas ?? []).some((g) => g.inicio < p.ini.getTime());

  const cambio = (ahora: number, antes: number, unidad: string, dec = 0) => {
    if (antes <= 0 || desfase > 0) return null;
    const d = ahora - antes;
    if (Math.abs(d) < 0.05) return <span className="resumen-cambio">igual que {anterior.corto}</span>;
    return (
      <span className={`resumen-cambio ${d > 0 ? 'sube' : 'baja'}`}>
        {d > 0 ? '▲' : '▼'} {num(Math.abs(d), dec)} {unidad} vs {anterior.corto}
      </span>
    );
  };

  const texto = () =>
    [
      `🚴 Mi ${modo === 'mes' ? MESES[p.ini.getMonth()] : 'año ' + p.ini.getFullYear()} en RideCrew`,
      `${r.sesiones} sesiones · ${num(r.km)} km · ${num(r.horas, 1)} h · ${num(r.desnivel)} m ↑`,
      r.pico?.resumen.potenciaMax ? `⚡ Pico de ${r.pico.resumen.potenciaMax} W` : '',
      r.rueda > 0 ? `🧛 ${textoTiempo(r.rueda * 1000)} a rueda` : '',
      r.circuito ? `🗺️ Circuito favorito: ${circuitoPorId(r.circuito[0]).nombre}` : '',
      r.companero ? `👥 Más rodado con: ${r.companero[0]}` : '',
      location.origin,
    ]
      .filter(Boolean)
      .join('\n');

  const compartir = async () => {
    setAviso(null);
    const t = texto();
    try {
      if (navigator.share) {
        await navigator.share({ text: t });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
    }
    // Sin hoja de compartir (PC): WhatsApp Web con el texto ya escrito
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto());
      setAviso('Copiado: pégalo donde quieras.');
    } catch {
      setAviso('No se pudo copiar.');
    }
  };

  return (
    <section className="pantalla pantalla-resumenes">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← Inicio
        </button>
        <h2>📊 Resúmenes</h2>
      </div>

      <div className="pestanas-ranking" role="tablist">
        {(
          [
            ['mes', 'Mes'],
            ['anio', 'Año'],
          ] as [Modo, string][]
        ).map(([m, nombre]) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            className={modo === m ? 'activa' : undefined}
            onClick={() => {
              setModo(m);
              setDesfase(0);
            }}
          >
            {nombre}
          </button>
        ))}
      </div>

      <div className="resumen-periodo">
        <button className="boton-secundario" onClick={() => setDesfase((d) => d - 1)} disabled={!hayAntes} aria-label="Anterior">
          ‹
        </button>
        <h3>{p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)}</h3>
        <button className="boton-secundario" onClick={() => setDesfase((d) => d + 1)} disabled={desfase >= 0} aria-label="Siguiente">
          ›
        </button>
      </div>

      {todas === null ? (
        <p className="detalle">Cargando…</p>
      ) : r.sesiones === 0 ? (
        <p className="vacio">Sin sesiones en {p.nombre}. ¡A rodar!</p>
      ) : (
        <>
          <div className="resumen-grandes">
            <div>
              <span className="resumen-valor">{num(r.km)}</span>
              <span className="resumen-etiqueta">km</span>
              {cambio(r.km, r0.km, 'km')}
            </div>
            <div>
              <span className="resumen-valor">{num(r.horas, 1)}</span>
              <span className="resumen-etiqueta">horas</span>
              {cambio(r.horas, r0.horas, 'h', 1)}
            </div>
            <div>
              <span className="resumen-valor">{r.sesiones}</span>
              <span className="resumen-etiqueta">sesiones · {r.dias} {r.dias === 1 ? 'día' : 'días'}</span>
              {cambio(r.sesiones, r0.sesiones, 'sesiones')}
            </div>
            <div>
              <span className="resumen-valor">{num(r.desnivel)}</span>
              <span className="resumen-etiqueta">m de desnivel</span>
              {cambio(r.desnivel, r0.desnivel, 'm')}
            </div>
            <div>
              <span className="resumen-valor">{num(r.kcal)}</span>
              <span className="resumen-etiqueta">kcal</span>
            </div>
            {r.vatiosMedios !== null && (
              <div>
                <span className="resumen-valor">{Math.round(r.vatiosMedios)}</span>
                <span className="resumen-etiqueta">W de media</span>
              </div>
            )}
          </div>

          <div className="resumen-barras" aria-label={`Kilómetros por ${modo === 'mes' ? 'día' : 'mes'}`}>
            {km.map((k, i) => (
              <div key={i} className="resumen-barra" title={`${modo === 'mes' ? `Día ${i + 1}` : MESES[i]}: ${num(k, 1)} km`}>
                <span style={{ height: `${(k / maxKm) * 100}%` }} className={k > 0 ? 'con' : ''} />
                <small>{modo === 'mes' ? ((i + 1) % 5 === 0 || i === 0 ? i + 1 : '') : MESES[i].charAt(0).toUpperCase()}</small>
              </div>
            ))}
          </div>

          <ul className="resumen-destacados">
            {r.masLarga && (
              <li>
                ⏱️ Sesión más larga: <strong>{textoTiempo(r.masLarga.resumen.duracionS * 1000)}</strong> ({fecha(r.masLarga.inicio)})
              </li>
            )}
            {r.masKm && (
              <li>
                🛣️ Más kilómetros: <strong>{num(r.masKm.resumen.distanciaM / 1000, 1)} km</strong> ({fecha(r.masKm.inicio)})
              </li>
            )}
            {r.pico?.resumen.potenciaMax ? (
              <li>
                ⚡ Pico de potencia: <strong>{r.pico.resumen.potenciaMax} W</strong> ({fecha(r.pico.inicio)})
              </li>
            ) : null}
            {r.rueda > 0 && (
              <li>
                🧛 A rueda: <strong>{textoTiempo(r.rueda * 1000)}</strong>
              </li>
            )}
            {r.dia && (
              <li>
                📅 Tu día: <strong>los {r.dia[0]}</strong> ({r.dia[1]} {r.dia[1] === 1 ? 'sesión' : 'sesiones'})
              </li>
            )}
            {r.circuito && (
              <li>
                🗺️ Circuito favorito: <strong>{circuitoPorId(r.circuito[0]).nombre}</strong> ({r.circuito[1]}{' '}
                {r.circuito[1] === 1 ? 'vez' : 'veces'})
              </li>
            )}
            {r.companero && (
              <li>
                👥 Con quien más has rodado: <strong>{r.companero[0]}</strong> ({r.companero[1]}{' '}
                {r.companero[1] === 1 ? 'sesión' : 'sesiones'})
              </li>
            )}
          </ul>

          <div className="botones-tcx">
            <button className="boton-principal" onClick={() => void compartir()}>
              Compartir por WhatsApp
            </button>
            <button className="boton-secundario" onClick={() => void copiar()}>
              Copiar texto
            </button>
          </div>
          {aviso && <p className="detalle">{aviso}</p>}
        </>
      )}
    </section>
  );
}
