import { useMemo, useState } from 'react';
import {
  CATEGORIAS,
  desplegar,
  duracionTotal,
  formatoDuracion,
  tss,
  type Bloque,
  type Categoria,
  type Entrenamiento,
} from '../entrenamientos/tipos';
import { GraficaEntrenamiento } from './GraficaEntrenamiento';
import { ImportarEntrenamientos } from './ImportarEntrenamientos';

interface Props {
  propios: Entrenamiento[];
  /** FTP del ciclista (para pasar a % los archivos .erg, que vienen en vatios). */
  ftp: number;
  onGuardar: (lista: Entrenamiento[]) => void;
  onProbar: (e: Entrenamiento) => void;
  onVolver: () => void;
  /** Ids de mis entrenamientos compartidos con el grupo. */
  compartidos: Set<string>;
  onCompartir: (e: Entrenamiento) => Promise<void>;
  onDejarDeCompartir: (e: Entrenamiento) => Promise<void>;
}

const NUEVO = (): Entrenamiento => ({
  id: `propio-${Date.now()}`,
  nombre: 'Mi entrenamiento',
  categoria: 'endurance',
  descripcion: '',
  propio: true,
  bloques: [
    { tipo: 'rampa', duracionS: 600, desde: 50, hasta: 70 },
    { tipo: 'constante', duracionS: 1200, potencia: 75 },
    { tipo: 'rampa', duracionS: 300, desde: 65, hasta: 45 },
  ],
});

/** Campo numérico que admite escribirlo a medias (vacío, «1,») sin saltar. */
function Numero({ valor, onCambiar, min, max, sufijo }: { valor: number; onCambiar: (v: number) => void; min: number; max: number; sufijo: string }) {
  const [texto, setTexto] = useState(String(valor));
  return (
    <label className="numero">
      <input
        type="text"
        inputMode="decimal"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onCambiar(v);
        }}
        onBlur={() => setTexto(String(valor))}
      />
      <span>{sufijo}</span>
    </label>
  );
}

/** Duración en minutos y segundos (así se pueden poner series de 30″, 45″, 1′30″…). */
function Duracion({ s, onCambiar, minS = 5 }: { s: number; onCambiar: (s: number) => void; minS?: number }) {
  const m = Math.floor(s / 60);
  const seg = Math.round(s % 60);
  const poner = (nm: number, ns: number) => onCambiar(Math.max(minS, Math.round(nm) * 60 + Math.round(ns)));
  return (
    <span className="duracion-bloque">
      <Numero valor={m} min={0} max={300} sufijo="min" onCambiar={(v) => poner(v, seg)} />
      <Numero valor={seg} min={0} max={59} sufijo="s" onCambiar={(v) => poner(m, v)} />
    </span>
  );
}

/** Cómo se escribe la potencia: en % del FTP (lo que se guarda) o en vatios con tu FTP de ahora. */
type Unidad = 'pct' | 'w';

function Potencia({ pct, onCambiar, unidad, ftp, sufijoPct }: { pct: number; onCambiar: (pct: number) => void; unidad: Unidad; ftp: number; sufijoPct: string }) {
  if (unidad === 'w') {
    const w = Math.round((pct * ftp) / 100);
    return (
      <Numero
        key={`w${ftp}`}
        valor={w}
        min={Math.round(ftp * 0.2)}
        max={Math.round(ftp * 2.5)}
        sufijo="W"
        // Se guarda en % del FTP (con un decimal): así sigue valiendo si cambias de FTP o lo compartes
        onCambiar={(v) => onCambiar(Math.round(((v * 100) / ftp) * 10) / 10)}
      />
    );
  }
  return <Numero key="pct" valor={pct} min={20} max={250} sufijo={sufijoPct} onCambiar={onCambiar} />;
}

function EditorBloque({ b, onCambiar, unidad, ftp }: { b: Bloque; onCambiar: (b: Bloque) => void; unidad: Unidad; ftp: number }) {
  const P = (pct: number, cambiar: (v: number) => void, sufijoPct = '%') => (
    <Potencia pct={pct} onCambiar={cambiar} unidad={unidad} ftp={ftp} sufijoPct={sufijoPct} />
  );
  if (b.tipo === 'constante') {
    return (
      <div className="campos-bloque">
        <Duracion s={b.duracionS} onCambiar={(v) => onCambiar({ ...b, duracionS: v })} />
        <span>a</span>
        {P(b.potencia, (v) => onCambiar({ ...b, potencia: v }), '% FTP')}
      </div>
    );
  }
  if (b.tipo === 'rampa') {
    return (
      <div className="campos-bloque">
        <Duracion s={b.duracionS} onCambiar={(v) => onCambiar({ ...b, duracionS: v })} />
        <span>de</span>
        {P(b.desde, (v) => onCambiar({ ...b, desde: v }))}
        <span>a</span>
        {P(b.hasta, (v) => onCambiar({ ...b, hasta: v }), '% FTP')}
      </div>
    );
  }
  return (
    <div className="campos-bloque">
      <Numero valor={b.repeticiones} min={1} max={50} sufijo="×" onCambiar={(v) => onCambiar({ ...b, repeticiones: Math.round(v) })} />
      <Duracion s={b.onS} onCambiar={(v) => onCambiar({ ...b, onS: v })} />
      <span>a</span>
      {P(b.onPotencia, (v) => onCambiar({ ...b, onPotencia: v }))}
      <span>+</span>
      <Duracion s={b.offS} onCambiar={(v) => onCambiar({ ...b, offS: v })} />
      <span>a</span>
      {P(b.offPotencia, (v) => onCambiar({ ...b, offPotencia: v }))}
    </div>
  );
}

const CLAVE_UNIDAD = 'rodillos.editorUnidad';
function leerUnidad(): Unidad {
  try {
    return localStorage.getItem(CLAVE_UNIDAD) === 'w' ? 'w' : 'pct';
  } catch {
    return 'pct';
  }
}

const NOMBRE_BLOQUE = { constante: 'Constante', rampa: 'Rampa', intervalos: 'Series' } as const;

export function EditorEntrenamientos({
  propios,
  ftp,
  onGuardar,
  onProbar,
  onVolver,
  compartidos,
  onCompartir,
  onDejarDeCompartir,
}: Props) {
  const [editando, setEditando] = useState<Entrenamiento | null>(null);
  const [unidad, setUnidadEstado] = useState<Unidad>(leerUnidad);
  const setUnidad = (u: Unidad) => {
    setUnidadEstado(u);
    try {
      localStorage.setItem(CLAVE_UNIDAD, u);
    } catch {
      // no es grave
    }
  };
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const alternarCompartir = async (e: Entrenamiento) => {
    setOcupado(e.id);
    setAviso(null);
    try {
      if (compartidos.has(e.id)) await onDejarDeCompartir(e);
      else {
        await onCompartir(e);
        setAviso(`«${e.nombre}» ya está en «Compartidos» para todo el grupo.`);
      }
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    }
    setOcupado(null);
  };
  const tramos = useMemo(() => (editando ? desplegar(editando.bloques) : []), [editando]);

  if (!editando) {
    return (
      <section className="pantalla">
        <div className="cabecera-pantalla">
          <button className="boton-volver" onClick={onVolver}>
            ← Inicio
          </button>
          <h2>Crea tus entrenamientos</h2>
        </div>
        <p className="detalle">
          Tus entrenamientos aparecen también en su categoría de «Entrenamientos» (marcados como «Mío»). Con «Compartir» los
          verá todo el grupo en «Entrenamientos → Compartidos».
        </p>
        {aviso && <p className="aviso-compartir">{aviso}</p>}
        <button className="boton-principal" onClick={() => setEditando(NUEVO())}>
          + Nuevo entrenamiento
        </button>
        <ImportarEntrenamientos ftp={ftp} onGuardar={(nuevos) => onGuardar([...propios, ...nuevos])} />
        <div className="lista-entrenos">
          {propios.length === 0 && <p className="vacio">Aún no has creado ninguno.</p>}
          {propios.map((e) => {
            const t = desplegar(e.bloques);
            return (
              <div key={e.id} className="tarjeta-entreno">
                <div className="tarjeta-entreno-cabecera">
                  <strong>{e.nombre}</strong>
                  <span className="insignia-propio">{CATEGORIAS.find((c) => c.id === e.categoria)?.nombre}</span>
                  {compartidos.has(e.id) && <span className="insignia-compartido">👥 Compartido</span>}
                </div>
                <GraficaEntrenamiento tramos={t} alto={46} />
                <div className="tarjeta-entreno-datos">
                  <span>{formatoDuracion(duracionTotal(t))}</span>
                  <span>TSS {tss(t)}</span>
                  <span className="acciones-fila">
                    <button className="boton-secundario" onClick={() => setEditando(e)}>
                      Editar
                    </button>
                    <button className="boton-secundario" onClick={() => void alternarCompartir(e)} disabled={ocupado === e.id}>
                      {compartidos.has(e.id) ? 'Dejar de compartir' : '👥 Compartir'}
                    </button>
                    <button
                      className="boton-secundario boton-peligro"
                      onClick={() => {
                        if (window.confirm(`¿Borrar «${e.nombre}»?`)) onGuardar(propios.filter((x) => x.id !== e.id));
                      }}
                    >
                      Borrar
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const e = editando;
  const cambiarBloque = (i: number, b: Bloque) => setEditando({ ...e, bloques: e.bloques.map((x, k) => (k === i ? b : x)) });
  const mover = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= e.bloques.length) return;
    const b = [...e.bloques];
    [b[i], b[j]] = [b[j], b[i]];
    setEditando({ ...e, bloques: b });
  };
  const guardar = () => {
    const lista = propios.some((x) => x.id === e.id) ? propios.map((x) => (x.id === e.id ? e : x)) : [...propios, e];
    onGuardar(lista);
    setEditando(null);
  };

  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={() => setEditando(null)}>
          ← Mis entrenamientos
        </button>
        <h2>{propios.some((x) => x.id === e.id) ? 'Editar entrenamiento' : 'Nuevo entrenamiento'}</h2>
      </div>

      <div className="rejilla-formulario">
        <label>
          Nombre
          <input type="text" value={e.nombre} maxLength={50} onChange={(ev) => setEditando({ ...e, nombre: ev.target.value })} />
        </label>
        <label>
          Categoría
          <select value={e.categoria} onChange={(ev) => setEditando({ ...e, categoria: ev.target.value as Categoria })}>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="ancho-completo">
          Descripción
          <input type="text" value={e.descripcion} maxLength={200} onChange={(ev) => setEditando({ ...e, descripcion: ev.target.value })} />
        </label>
      </div>

      <GraficaEntrenamiento tramos={tramos} alto={110} />
      <p className="detalle">
        {formatoDuracion(duracionTotal(tramos))} · TSS {tss(tramos)}
      </p>

      <div className="unidad-potencia" role="group" aria-label="Escribir la potencia en">
        <span>Potencia en:</span>
        <button className={unidad === 'w' ? 'activa' : ''} onClick={() => setUnidad('w')}>
          Vatios
        </button>
        <button className={unidad === 'pct' ? 'activa' : ''} onClick={() => setUnidad('pct')}>
          % del FTP
        </button>
        {unidad === 'w' && <small>Con tu FTP de {ftp} W. Se guarda en % del FTP: si tu FTP cambia, se ajusta solo.</small>}
      </div>

      <ol className="lista-bloques">
        {e.bloques.map((b, i) => (
          <li key={i} className="bloque">
            <strong>{NOMBRE_BLOQUE[b.tipo]}</strong>
            <EditorBloque b={b} onCambiar={(nb) => cambiarBloque(i, nb)} unidad={unidad} ftp={ftp} />
            <span className="acciones-fila">
              <button className="boton-icono" onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
              <button className="boton-icono" onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
              <button
                className="boton-icono boton-peligro"
                onClick={() => setEditando({ ...e, bloques: e.bloques.filter((_, k) => k !== i) })}
                aria-label="Quitar"
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>

      <div className="botones-anadir">
        <span>Añadir:</span>
        <button className="boton-secundario" onClick={() => setEditando({ ...e, bloques: [...e.bloques, { tipo: 'constante', duracionS: 300, potencia: 75 }] })}>
          + Constante
        </button>
        <button className="boton-secundario" onClick={() => setEditando({ ...e, bloques: [...e.bloques, { tipo: 'rampa', duracionS: 300, desde: 50, hasta: 75 }] })}>
          + Rampa
        </button>
        <button
          className="boton-secundario"
          onClick={() =>
            setEditando({ ...e, bloques: [...e.bloques, { tipo: 'intervalos', repeticiones: 4, onS: 120, onPotencia: 105, offS: 120, offPotencia: 55 }] })
          }
        >
          + Series
        </button>
      </div>

      <div className="botones-pie">
        <button className="boton-principal" onClick={guardar} disabled={!e.nombre.trim() || e.bloques.length === 0}>
          Guardar
        </button>
        <button className="boton-secundario" onClick={() => onProbar(e)} disabled={e.bloques.length === 0}>
          Probar ahora
        </button>
      </div>
    </section>
  );
}
