import { useMemo, useState } from 'react';
import {
  CATEGORIAS,
  desplegar,
  duracionTotal,
  formatoDuracion,
  tss,
  type Categoria,
  type Entrenamiento,
} from '../entrenamientos/tipos';
import { GraficaEntrenamiento, ListaIntervalos } from './GraficaEntrenamiento';
import { EtiquetaCategoria } from './SelectorEntreno';

interface Props {
  entrenamientos: Entrenamiento[];
  ftp: number;
  onCambiarFtp: (w: number) => void;
  /** true si hay rodillo inteligente con control (ERG) conectado. */
  hayErg: boolean;
  onEmpezar: (e: Entrenamiento) => void;
  onVolver: () => void;
  /** Entrenamientos que han compartido los amigos. */
  deAmigos: Entrenamiento[];
  errorAmigos: string | null;
  /** Guarda una copia en «mis entrenamientos». */
  onGuardarCopia: (e: Entrenamiento) => void;
  /** Soy el administrador: puedo borrar los compartidos de cualquiera. */
  soyAdmin: boolean;
  /** Quita uno de «Compartidos» (por su clave). */
  onBorrarCompartido: (clave: string) => Promise<void>;
  /** Borra uno de mis entrenamientos (y deja de compartirlo si lo estaba). */
  onBorrarPropio: (e: Entrenamiento) => void;
}

const AMIGOS = {
  nombre: '👥 Compartidos',
  descripcion: 'Los entrenamientos que ha compartido el grupo, también los tuyos',
  color: '#22d3ee',
};

/** Categorías → lista de entrenamientos → ficha con «Empezar». */
export function PantallaEntrenamientos({
  entrenamientos,
  ftp,
  onCambiarFtp,
  hayErg,
  onEmpezar,
  onVolver,
  deAmigos,
  errorAmigos,
  onGuardarCopia,
  soyAdmin,
  onBorrarCompartido,
  onBorrarPropio,
}: Props) {
  const [categoria, setCategoria] = useState<Categoria | 'amigos' | null>(null);
  const [elegido, setElegido] = useState<Entrenamiento | null>(null);
  // En «Compartidos», filtro por la etiqueta que le puso quien lo compartió
  const [filtro, setFiltro] = useState<Categoria | null>(null);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const cat = categoria === 'amigos' ? AMIGOS : CATEGORIAS.find((c) => c.id === categoria);
  // Los compartidos por otros solo salen en «Compartidos»; en las carpetas, el catálogo y los míos
  const mias = entrenamientos.filter((e) => !e.deAmigo);
  const deCategoria =
    categoria === 'amigos'
      ? deAmigos.filter((e) => !filtro || e.categoria === filtro)
      : mias.filter((e) => e.categoria === categoria);
  const puedeBorrar = (e: Entrenamiento) => !!e.propio || (!!e.deAmigo && (e.deAmigo.mio || soyAdmin));
  const borrar = async (e: Entrenamiento) => {
    if (e.propio) {
      if (
        !window.confirm(
          `¿Borrar «${e.nombre}» de tus entrenamientos? Si estaba compartido, también se quita de Compartidos.`,
        )
      )
        return;
      onBorrarPropio(e);
      setElegido(null);
      return;
    }
    if (!e.deAmigo) return;
    const mio = e.deAmigo.mio;
    const pregunta = mio
      ? `¿Quitar «${e.nombre}» de Compartidos? Lo seguirás teniendo en tus entrenamientos.`
      : `¿Borrar «${e.nombre}» de ${e.deAmigo.autor}? Desaparecerá de Compartidos para todos.`;
    if (!window.confirm(pregunta)) return;
    try {
      setErrorBorrar(null);
      await onBorrarCompartido(e.deAmigo.clave);
      setElegido(null);
    } catch (err) {
      setErrorBorrar(err instanceof Error ? err.message : 'No se ha podido borrar.');
    }
  };

  // ---- Ficha de un entrenamiento ----
  if (elegido) {
    return (
      <FichaEntrenamiento
        entreno={elegido}
        ftp={ftp}
        onCambiarFtp={onCambiarFtp}
        hayErg={hayErg}
        onEmpezar={() => onEmpezar(elegido)}
        onVolver={() => setElegido(null)}
        volverA={categoria === 'amigos' ? AMIGOS.nombre : undefined}
        onGuardarCopia={elegido.deAmigo && !elegido.deAmigo.mio ? () => onGuardarCopia(elegido) : undefined}
        onBorrar={puedeBorrar(elegido) ? () => void borrar(elegido) : undefined}
        errorBorrar={errorBorrar}
      />
    );
  }

  // ---- Lista de una categoría ----
  if (cat) {
    return (
      <section className="pantalla">
        <div className="cabecera-pantalla">
          <button className="boton-volver" onClick={() => setCategoria(null)}>
            ← Categorías
          </button>
          <h2 style={{ color: cat.color }}>{cat.nombre}</h2>
        </div>
        <p className="detalle">{cat.descripcion}</p>
        {categoria === 'amigos' && errorAmigos && <p className="aviso">{errorAmigos}</p>}
        {categoria === 'amigos' && errorBorrar && <p className="aviso">{errorBorrar}</p>}
        {categoria === 'amigos' && deAmigos.length > 0 && (
          <div className="selector-categorias filtro-compartidos">
            <button
              className={!filtro ? 'activa' : ''}
              style={{
                borderColor: AMIGOS.color,
                ...(!filtro ? { background: AMIGOS.color } : {}),
              }}
              onClick={() => setFiltro(null)}
            >
              Todos
            </button>
            {CATEGORIAS.filter((c) => deAmigos.some((e) => e.categoria === c.id)).map((c) => (
              <button
                key={c.id}
                className={filtro === c.id ? 'activa' : ''}
                style={{
                  borderColor: c.color,
                  ...(filtro === c.id ? { background: c.color } : {}),
                }}
                onClick={() => setFiltro(c.id)}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        )}
        {deCategoria.length === 0 && (
          <p className="vacio">
            {categoria === 'amigos'
              ? 'Aún no hay ninguno compartido. Comparte los tuyos desde «Crea tus entrenamientos».'
              : 'Todavía no hay entrenamientos en esta categoría.'}
          </p>
        )}
        <div className="lista-entrenos">
          {deCategoria.map((e) => {
            const tramos = desplegar(e.bloques);
            return (
              <div key={e.id} className={`tarjeta-entreno-envoltorio${puedeBorrar(e) ? ' con-borrar' : ''}`}>
                <button className="tarjeta-entreno" onClick={() => setElegido(e)}>
                  <div className="tarjeta-entreno-cabecera">
                    <strong>{e.nombre}</strong>
                    {e.propio && <span className="insignia-propio">Mío</span>}
                  </div>
                  {e.deAmigo && <EtiquetaCategoria e={e} />}
                  <GraficaEntrenamiento tramos={tramos} alto={46} />
                  <div className="tarjeta-entreno-datos">
                    <span>{formatoDuracion(duracionTotal(tramos))}</span>
                    <span>TSS {tss(tramos)}</span>
                  </div>
                </button>
                {puedeBorrar(e) && (
                  <button
                    className="boton-borrar-compartido"
                    aria-label={`Borrar ${e.nombre} de Compartidos`}
                    title={e.propio ? 'Borrar' : e.deAmigo?.mio ? 'Quitar de Compartidos' : 'Borrar (administrador)'}
                    onClick={() => void borrar(e)}
                  >
                    🗑️
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // ---- Categorías ----
  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← Inicio
        </button>
        <h2>Entrenamientos</h2>
      </div>
      <p className="detalle">
        Entrenamientos guiados en modo ERG: el rodillo pone la resistencia justa para cada tramo según tu FTP ({ftp} W).
      </p>
      <div className="rejilla-categorias">
        <button
          className="tarjeta-categoria"
          style={{ borderTopColor: AMIGOS.color }}
          onClick={() => setCategoria('amigos')}
        >
          <strong>{AMIGOS.nombre}</strong>
          <span>{AMIGOS.descripcion}</span>
          <small>{deAmigos.length === 1 ? '1 entrenamiento' : `${deAmigos.length} entrenamientos`}</small>
        </button>
        {CATEGORIAS.map((c) => {
          const n = mias.filter((e) => e.categoria === c.id).length;
          return (
            <button
              key={c.id}
              className="tarjeta-categoria"
              style={{ borderTopColor: c.color }}
              onClick={() => setCategoria(c.id)}
            >
              <strong>{c.nombre}</strong>
              <span>{c.descripcion}</span>
              <small>{n === 1 ? '1 entrenamiento' : `${n} entrenamientos`}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FichaEntrenamiento({
  entreno,
  ftp,
  onCambiarFtp,
  hayErg,
  onEmpezar,
  onVolver,
  volverA,
  onGuardarCopia,
  onBorrar,
  errorBorrar,
}: {
  entreno: Entrenamiento;
  ftp: number;
  onCambiarFtp: (w: number) => void;
  hayErg: boolean;
  onEmpezar: () => void;
  onVolver: () => void;
  volverA?: string;
  onGuardarCopia?: () => void;
  onBorrar?: () => void;
  errorBorrar?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const tramos = useMemo(() => desplegar(entreno.bloques), [entreno]);
  const [textoFtp, setTextoFtp] = useState(String(ftp));
  const cat = CATEGORIAS.find((c) => c.id === entreno.categoria);

  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← {volverA ?? cat?.nombre}
        </button>
        <h2>{entreno.nombre}</h2>
      </div>
      {entreno.deAmigo && (
        <p className="detalle">
          Compartido por <strong>{entreno.deAmigo.mio ? 'ti' : entreno.deAmigo.autor}</strong> · {cat?.nombre}
        </p>
      )}
      <p>{entreno.descripcion}</p>
      <GraficaEntrenamiento tramos={tramos} alto={130} ftp={ftp} />
      <ListaIntervalos tramos={tramos} ftp={ftp} />
      <div className="datos-entreno">
        <div>
          <strong>{formatoDuracion(duracionTotal(tramos))}</strong>
          <span>duración</span>
        </div>
        <div>
          <strong>{tss(tramos)}</strong>
          <span>TSS aprox.</span>
        </div>
        <div>
          <strong>{Math.round((Math.max(...tramos.map((t) => Math.max(t.desde, t.hasta))) * ftp) / 100)} W</strong>
          <span>máximo</span>
        </div>
        <label className="campo-ftp">
          <span>Tu FTP</span>
          <input
            type="text"
            inputMode="numeric"
            value={textoFtp}
            onChange={(e) => {
              setTextoFtp(e.target.value);
              const v = Number(e.target.value);
              if (v >= 50 && v <= 600) onCambiarFtp(Math.round(v));
            }}
          />
          <span>W</span>
        </label>
      </div>
      {!hayErg && (
        <p className="aviso">
          No hay rodillo inteligente conectado: la web te mostrará los vatios objetivo y tendrás que seguirlos tú (con
          cambios o, en rodillos manuales, con la palanca).
        </p>
      )}
      <button className="boton-principal boton-grande" onClick={onEmpezar}>
        Empezar entrenamiento
      </button>
      {onGuardarCopia && (
        <button
          className="boton-secundario boton-grande"
          disabled={copiado}
          onClick={() => {
            onGuardarCopia();
            setCopiado(true);
          }}
        >
          {copiado ? '✅ Guardado en «Crea tus entrenamientos»' : '📥 Guardar en los míos'}
        </button>
      )}
      {errorBorrar && <p className="aviso">{errorBorrar}</p>}
      {onBorrar && (
        <button className="boton-secundario boton-grande boton-peligro" onClick={onBorrar}>
          🗑️{' '}
          {entreno.propio
            ? 'Borrar este entrenamiento'
            : entreno.deAmigo?.mio
              ? 'Quitar de Compartidos'
              : 'Borrar de Compartidos'}
        </button>
      )}
    </section>
  );
}
