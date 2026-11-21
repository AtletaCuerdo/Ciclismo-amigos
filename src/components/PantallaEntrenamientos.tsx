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
import { CARPETA_TRICOACH, diaDe, type useSemanaTricoach } from '../entrenamientos/tricoach';
import { esDispositivoIos } from '../recorrido/avatar';

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
  /** «Tu semana con TriCoach»: sesiones de rodillo del entrenador (TriCoach Entrenos). */
  tricoach: ReturnType<typeof useSemanaTricoach>;
  /** Pasa una sesión de TriCoach a «Compartidos» (para todos). */
  onCompartir: (e: Entrenamiento) => Promise<void>;
  /** Ids de mis entrenamientos que ya están en Compartidos. */
  compartidosMios: Set<string>;
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
  tricoach,
  onCompartir,
  compartidosMios,
}: Props) {
  const [categoria, setCategoria] = useState<Categoria | 'amigos' | 'tricoach' | null>(null);
  const [elegido, setElegido] = useState<Entrenamiento | null>(null);
  // En «Compartidos», filtro por la etiqueta que le puso quien lo compartió
  const [filtro, setFiltro] = useState<Categoria | 'tricoach' | null>(null);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const cat =
    categoria === 'amigos' ? AMIGOS : categoria === 'tricoach' ? CARPETA_TRICOACH : CATEGORIAS.find((c) => c.id === categoria);
  // Los compartidos por otros solo salen en «Compartidos»; en las carpetas, el catálogo y los míos
  const mias = entrenamientos.filter((e) => !e.deAmigo);
  const deCategoria =
    categoria === 'amigos'
      ? deAmigos.filter((e) => !filtro || (filtro === 'tricoach' ? e.origen === 'tricoach' : e.categoria === filtro))
      : categoria === 'tricoach'
        ? tricoach.entrenos
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
        volverA={categoria === 'amigos' ? AMIGOS.nombre : categoria === 'tricoach' ? CARPETA_TRICOACH.nombre : undefined}
        onCompartir={elegido.origen === 'tricoach' && !elegido.deAmigo ? () => onCompartir(elegido) : undefined}
        yaCompartido={compartidosMios.has(elegido.id)}
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
        {categoria === 'amigos' && (
          <div className="escaparate-tricoach">
            <div>
              <strong>Entrenos de TriCoach</strong>
              <p>
                Entrenamiento personalizado de triatlón, ciclismo y carrera. Sesiones de rodillo diseñadas por un
                entrenador para sus deportistas, con los vatios a la medida de tu FTP.
              </p>
            </div>
            <div className="escaparate-tricoach-acciones">
              <button className="boton-principal" onClick={() => setFiltro('tricoach')}>
                Ver los entrenos de TriCoach
              </button>
              <a className="boton-secundario" href="https://tricoach.es" target="_blank" rel="noreferrer">
                Conoce TriCoach ↗
              </a>
            </div>
          </div>
        )}
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
            {deAmigos.some((e) => e.origen === 'tricoach') && (
              <button
                className={filtro === 'tricoach' ? 'activa' : ''}
                style={{ borderColor: '#4ade80', ...(filtro === 'tricoach' ? { background: '#4ade80' } : {}) }}
                onClick={() => setFiltro('tricoach')}
              >
                Entrenos de TriCoach
              </button>
            )}
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
        {categoria === 'tricoach' && (
          <CabeceraTricoach tricoach={tricoach} />
        )}
        {deCategoria.length === 0 && categoria !== 'tricoach' && (
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
                  {e.fecha && !e.deAmigo && <span className="dia-tricoach">📅 {diaDe(e.fecha)}</span>}
                  {(e.deAmigo || e.origen === 'tricoach') && <EtiquetaCategoria e={e} />}
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
          style={{ borderTopColor: CARPETA_TRICOACH.color }}
          onClick={() => setCategoria('tricoach')}
        >
          <strong>{CARPETA_TRICOACH.nombre}</strong>
          <span>{CARPETA_TRICOACH.descripcion}</span>
          <small>
            {!tricoach.conectado
              ? 'Conecta tu cuenta de TriCoach Entrenos'
              : tricoach.entrenos.length === 1
                ? '1 sesión esta semana'
                : `${tricoach.entrenos.length} sesiones esta semana`}
          </small>
        </button>
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
  onCompartir,
  yaCompartido,
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
  onCompartir?: () => Promise<void>;
  yaCompartido?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const [compartir, setCompartir] = useState<{ ok?: boolean; error?: string; enviando?: boolean }>({});
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
      <p style={{ whiteSpace: 'pre-line' }}>{entreno.descripcion}</p>
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
      {onCompartir && (
        <button
          className="boton-secundario boton-grande"
          disabled={yaCompartido || compartir.ok || compartir.enviando}
          onClick={async () => {
            setCompartir({ enviando: true });
            try {
              await onCompartir();
              setCompartir({ ok: true });
            } catch (err) {
              setCompartir({ error: err instanceof Error ? err.message : 'No se ha podido compartir.' });
            }
          }}
        >
          {yaCompartido || compartir.ok ? '✅ Ya está en Compartidos, para todos' : '👥 Pasar a Compartidos'}
        </button>
      )}
      {compartir.error && <p className="aviso">{compartir.error}</p>}
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

/** Cabecera de «Tu semana con TriCoach»: conectar, estado, actualizar y desconectar. */
function CabeceraTricoach({ tricoach }: { tricoach: ReturnType<typeof useSemanaTricoach> }) {
  const [codigo, setCodigo] = useState('');
  if (!tricoach.conectado) {
    const valido = codigo.replace(/[^a-z0-9]/gi, '').length === 6;
    // iPhone/iPad: RideCrew va en Bluefy y Entrenos en Safari (no comparten sesión) → código.
    // Android y ordenador: mismo navegador → botón directo y «Permitir».
    const ios = esDispositivoIos();
    const conCodigo = (
      <form
        className="tricoach-codigo"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (valido) void tricoach.conectarConCodigo(codigo);
        }}
      >
        <input
          value={codigo}
          onChange={(ev) => setCodigo(ev.target.value.toUpperCase())}
          placeholder="Código"
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Código de TriCoach Entrenos"
        />
        <button className={ios ? 'boton-principal' : 'boton-secundario'} disabled={!valido || tricoach.cargando}>
          {tricoach.cargando ? 'Conectando…' : 'Conectar'}
        </button>
      </form>
    );
    return (
      <div className="tricoach-conectar">
        <p>
          Si entrenas con <strong>TriCoach</strong>, aquí te salen solas las sesiones de rodillo que te pone tu entrenador
          cada semana en TriCoach Entrenos, listas para hacer en ERG. Se conecta una sola vez.
        </p>
        {ios ? (
          <>
            <p className="detalle">
              En <strong>TriCoach Entrenos</strong> pulsa <strong>«Conectar RideCrew»</strong> (junto a tu Strava) y escribe
              aquí el código de 6 letras que te da:
            </p>
            {conCodigo}
            {tricoach.error && <p className="aviso">{tricoach.error}</p>}
          </>
        ) : (
          <>
            <p className="detalle">Se abre TriCoach Entrenos, pulsas «Permitir» y vuelves aquí.</p>
            <button className="boton-principal boton-grande" onClick={tricoach.conectar}>
              🔗 Conectar con TriCoach Entrenos
            </button>
            {tricoach.error && <p className="aviso">{tricoach.error}</p>}
            <p className="detalle">
              ¿Usas TriCoach Entrenos en otro navegador o aparato? Pulsa allí «Conectar RideCrew» y escribe aquí el código:
            </p>
            {conCodigo}
          </>
        )}
      </div>
    );
  }
  return (
    <div className="tricoach-estado">
      {tricoach.error && <p className="aviso">{tricoach.error}</p>}
      {!tricoach.cargando && !tricoach.entrenos.length && !tricoach.error && (
        <p className="vacio">Esta semana tu entrenador no te ha puesto sesiones de rodillo (todavía).</p>
      )}
      <p className="detalle">
        Cada lunes salen las de la semana nueva. Si alguna te encanta, pásala a «Compartidos» para no perderla.
      </p>
      <div className="tricoach-acciones">
        <button className="boton-secundario" onClick={() => void tricoach.recargar()} disabled={tricoach.cargando}>
          {tricoach.cargando ? 'Actualizando…' : '↻ Actualizar'}
        </button>
        <button
          className="boton-secundario"
          onClick={() => {
            if (window.confirm('¿Desconectar RideCrew de TriCoach Entrenos? Dejarán de salirte aquí tus sesiones.'))
              void tricoach.desconectar();
          }}
        >
          Desconectar
        </button>
      </div>
    </div>
  );
}

