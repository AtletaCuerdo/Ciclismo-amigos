/**
 * Salidas programadas en el inicio: las próximas con cuenta atrás y quién va, apuntarse con un
 * toque y, cuando llega la hora, «Entrar a la salida» (al circuito y junto a los que ya ruedan).
 */
import { useEffect, useState } from 'react';
import { ANTES_MS, DURA_MS, type SalidaProgramada } from '../multijugador/programadas';
import { CIRCUITOS, circuitoPorId, desnivelDe, longitudDe } from '../recorrido/circuitos';

interface Props {
  lista: SalidaProgramada[];
  miUid: string | null;
  error: string | null;
  /** Nombre con el que te verán; sin nombre no se puede crear ni apuntarse. */
  nombre: string;
  circuitoPorDefecto: string;
  /** Cuántos ruedan ahora en cada sala. */
  rodandoEnSala: (sala: string) => number;
  onCrear: (datos: { titulo: string; circuito: string; hora: number }) => Promise<void>;
  onApuntarme: (id: string, si: boolean) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
  onEntrar: (circuito: string) => void;
}

const dos = (n: number) => String(n).padStart(2, '0');
const fechaInput = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const horaInput = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

/** Propuesta de hora: la siguiente hora en punto con margen; de noche, mañana a las 9:00. */
function horaPropuesta() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  if (d.getHours() >= 23 || d.getHours() < 7) {
    if (d.getHours() >= 23) d.setDate(d.getDate() + 1);
    d.setHours(9);
  }
  return d;
}

/** «Hoy 19:00», «Mañana 9:30» o «domingo 5 oct · 9:00». */
function cuando(hora: number, ahora: number) {
  const d = new Date(hora);
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((new Date(hora).setHours(0, 0, 0, 0) - hoy.getTime()) / 86400000);
  const h = `${d.getHours()}:${dos(d.getMinutes())}`;
  if (dias === 0) return `Hoy ${h}`;
  if (dias === 1) return `Mañana ${h}`;
  return `${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })} · ${h}`;
}

/** «en 2 h 15 min», «en 3 días»… */
function cuentaAtras(ms: number) {
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `en ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.round(h / 24);
  return `en ${d} ${d === 1 ? 'día' : 'días'}`;
}

export function PanelProgramadas(p: Props) {
  const [ahora, setAhora] = useState(Date.now());
  const [creando, setCreando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const propuesta = horaPropuesta();
  const [titulo, setTitulo] = useState('');
  const [circuito, setCircuito] = useState(p.circuitoPorDefecto);
  const [fecha, setFecha] = useState(fechaInput(propuesta));
  const [hora, setHora] = useState(horaInput(propuesta));

  // La cuenta atrás se actualiza cada 20 s
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);

  const abrirFormulario = () => {
    const d = horaPropuesta();
    setTitulo('');
    setCircuito(p.circuitoPorDefecto);
    setFecha(fechaInput(d));
    setHora(horaInput(d));
    setAviso(null);
    setCreando(true);
  };

  const crear = async () => {
    const [a, m, d] = fecha.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    const t = new Date(a, m - 1, d, hh, mm).getTime();
    if (!Number.isFinite(t) || t < Date.now() - 60000) {
      setAviso('Elige una fecha y hora que aún no hayan pasado.');
      return;
    }
    if (t > Date.now() + 60 * 86400000) {
      setAviso('Como mucho, con dos meses de antelación.');
      return;
    }
    setEnviando(true);
    try {
      await p.onCrear({ titulo, circuito, hora: t });
      setCreando(false);
    } catch {
      setAviso('No se pudo crear. Si es la primera vez, hay que pegar las reglas nuevas en Firebase.');
    } finally {
      setEnviando(false);
    }
  };

  const accion = (f: () => Promise<void>) => () => {
    setAviso(null);
    f().catch(() => setAviso('No se pudo guardar. Comprueba la conexión (o las reglas de Firebase).'));
  };

  return (
    <section className="panel panel-programadas">
      <div className="cabecera-panel">
        <h2>📅 Salidas programadas</h2>
        {!creando && (
          <button className="boton-secundario" onClick={abrirFormulario} disabled={!p.nombre}>
            + Programar salida
          </button>
        )}
      </div>

      {!p.nombre && <p className="detalle">Pon tu nombre (en «Amigos rodando ahora») para programar o apuntarte.</p>}

      {creando && (
        <form
          className="form-programada"
          onSubmit={(e) => {
            e.preventDefault();
            void crear();
          }}
        >
          <label>
            Título
            <input
              type="text"
              value={titulo}
              maxLength={60}
              placeholder="Salida en grupo · 2 vueltas suaves"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>
          <label>
            Circuito
            <select value={circuito} onChange={(e) => setCircuito(e.target.value)}>
              {CIRCUITOS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({longitudDe(c) / 1000} km · {desnivelDe(c)} m ↑)
                </option>
              ))}
            </select>
          </label>
          <div className="form-programada-fila">
            <label>
              Día
              <input type="date" value={fecha} min={fechaInput(new Date())} onChange={(e) => setFecha(e.target.value)} required />
            </label>
            <label>
              Hora
              <input type="time" value={hora} step={300} onChange={(e) => setHora(e.target.value)} required />
            </label>
          </div>
          <div className="form-programada-fila">
            <button className="boton-principal" type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Programar'}
            </button>
            <button className="boton-secundario" type="button" onClick={() => setCreando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {aviso && <p className="aviso">{aviso}</p>}
      {p.error && <p className="aviso">{p.error}</p>}

      {p.lista.length === 0 && !creando && !p.error && (
        <p className="detalle">No hay ninguna salida programada. Propón una y tus amigos podrán apuntarse.</p>
      )}

      {p.lista.length > 0 && (
        <ul className="lista-programadas">
          {p.lista.map((s) => {
            const c = circuitoPorId(s.circuito);
            const falta = s.hora - ahora;
            const enMarcha = falta <= ANTES_MS && falta > -DURA_MS;
            const voy = !!p.miUid && s.apuntados.some((a) => a.uid === p.miUid);
            const rodando = p.rodandoEnSala(c.sala);
            return (
              <li key={s.id} className={enMarcha ? 'en-marcha' : ''}>
                <div className="programada-cabecera">
                  <strong>{s.titulo}</strong>
                  <span className={`chip-salida ${enMarcha ? 'chip-dentro' : 'chip-fuera'}`}>
                    {enMarcha ? (falta > 0 ? `¡Sale ${cuentaAtras(falta)}!` : '¡En marcha!') : cuentaAtras(falta)}
                  </span>
                </div>
                <span className="detalle">
                  {cuando(s.hora, ahora)} · {c.nombre} · propuesta por {s.autor}
                </span>
                <span className="detalle">
                  {s.apuntados.length === 0
                    ? 'Aún no se ha apuntado nadie'
                    : `Van (${s.apuntados.length}): ${s.apuntados.map((a) => a.nombre).join(', ')}`}
                  {enMarcha && rodando > 0 && ` · ${rodando} rodando ahora`}
                </span>
                <div className="programada-botones">
                  {enMarcha && (
                    <button className="boton-principal" onClick={() => p.onEntrar(s.circuito)}>
                      🚴 Entrar a la salida
                    </button>
                  )}
                  {p.nombre && (
                    <button className="boton-secundario" onClick={accion(() => p.onApuntarme(s.id, !voy))}>
                      {voy ? 'Ya no voy' : '✋ Me apunto'}
                    </button>
                  )}
                  {s.autorUid === p.miUid && (
                    <button
                      className="boton-enlace"
                      onClick={accion(async () => {
                        if (confirm(`¿Borrar la salida «${s.titulo}»?`)) await p.onBorrar(s.id);
                      })}
                    >
                      Borrar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
