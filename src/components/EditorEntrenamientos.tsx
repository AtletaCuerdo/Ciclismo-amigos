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

interface Props {
  propios: Entrenamiento[];
  onGuardar: (lista: Entrenamiento[]) => void;
  onProbar: (e: Entrenamiento) => void;
  onVolver: () => void;
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

const min = (s: number) => Math.round((s / 60) * 10) / 10;

function EditorBloque({ b, onCambiar }: { b: Bloque; onCambiar: (b: Bloque) => void }) {
  if (b.tipo === 'constante') {
    return (
      <div className="campos-bloque">
        <Numero valor={min(b.duracionS)} min={0.25} max={300} sufijo="min" onCambiar={(v) => onCambiar({ ...b, duracionS: Math.round(v * 60) })} />
        <span>al</span>
        <Numero valor={b.potencia} min={20} max={250} sufijo="% FTP" onCambiar={(v) => onCambiar({ ...b, potencia: v })} />
      </div>
    );
  }
  if (b.tipo === 'rampa') {
    return (
      <div className="campos-bloque">
        <Numero valor={min(b.duracionS)} min={0.25} max={300} sufijo="min" onCambiar={(v) => onCambiar({ ...b, duracionS: Math.round(v * 60) })} />
        <span>de</span>
        <Numero valor={b.desde} min={20} max={250} sufijo="%" onCambiar={(v) => onCambiar({ ...b, desde: v })} />
        <span>a</span>
        <Numero valor={b.hasta} min={20} max={250} sufijo="% FTP" onCambiar={(v) => onCambiar({ ...b, hasta: v })} />
      </div>
    );
  }
  return (
    <div className="campos-bloque">
      <Numero valor={b.repeticiones} min={1} max={50} sufijo="×" onCambiar={(v) => onCambiar({ ...b, repeticiones: Math.round(v) })} />
      <Numero valor={min(b.onS)} min={0.1} max={120} sufijo="min" onCambiar={(v) => onCambiar({ ...b, onS: Math.round(v * 60) })} />
      <span>al</span>
      <Numero valor={b.onPotencia} min={20} max={250} sufijo="%" onCambiar={(v) => onCambiar({ ...b, onPotencia: v })} />
      <span>+</span>
      <Numero valor={min(b.offS)} min={0.1} max={120} sufijo="min" onCambiar={(v) => onCambiar({ ...b, offS: Math.round(v * 60) })} />
      <span>al</span>
      <Numero valor={b.offPotencia} min={20} max={250} sufijo="%" onCambiar={(v) => onCambiar({ ...b, offPotencia: v })} />
    </div>
  );
}

const NOMBRE_BLOQUE = { constante: 'Constante', rampa: 'Rampa', intervalos: 'Series' } as const;

export function EditorEntrenamientos({ propios, onGuardar, onProbar, onVolver }: Props) {
  const [editando, setEditando] = useState<Entrenamiento | null>(null);
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
          Tus entrenamientos aparecen también en su categoría de «Entrenamientos» (marcados como «Mío»). Se guardan en este
          dispositivo.
        </p>
        <button className="boton-principal" onClick={() => setEditando(NUEVO())}>
          + Nuevo entrenamiento
        </button>
        <div className="lista-entrenos">
          {propios.length === 0 && <p className="vacio">Aún no has creado ninguno.</p>}
          {propios.map((e) => {
            const t = desplegar(e.bloques);
            return (
              <div key={e.id} className="tarjeta-entreno">
                <div className="tarjeta-entreno-cabecera">
                  <strong>{e.nombre}</strong>
                  <span className="insignia-propio">{CATEGORIAS.find((c) => c.id === e.categoria)?.nombre}</span>
                </div>
                <GraficaEntrenamiento tramos={t} alto={46} />
                <div className="tarjeta-entreno-datos">
                  <span>{formatoDuracion(duracionTotal(t))}</span>
                  <span>TSS {tss(t)}</span>
                  <span className="acciones-fila">
                    <button className="boton-secundario" onClick={() => setEditando(e)}>
                      Editar
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

      <ol className="lista-bloques">
        {e.bloques.map((b, i) => (
          <li key={i} className="bloque">
            <strong>{NOMBRE_BLOQUE[b.tipo]}</strong>
            <EditorBloque b={b} onCambiar={(nb) => cambiarBloque(i, nb)} />
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
