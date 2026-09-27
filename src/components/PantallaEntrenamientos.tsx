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
import { GraficaEntrenamiento } from './GraficaEntrenamiento';

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
}

const AMIGOS = { nombre: '👥 Compartidos', descripcion: 'Los entrenamientos que ha compartido el grupo, también los tuyos', color: '#ff6a1a' };

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
}: Props) {
  const [categoria, setCategoria] = useState<Categoria | 'amigos' | null>(null);
  const [elegido, setElegido] = useState<Entrenamiento | null>(null);
  const cat = categoria === 'amigos' ? AMIGOS : CATEGORIAS.find((c) => c.id === categoria);
  const deCategoria = categoria === 'amigos' ? deAmigos : entrenamientos.filter((e) => e.categoria === categoria);

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
              <button key={e.id} className="tarjeta-entreno" onClick={() => setElegido(e)}>
                <div className="tarjeta-entreno-cabecera">
                  <strong>{e.nombre}</strong>
                  {e.propio && <span className="insignia-propio">Mío</span>}
                  {e.deAmigo && (
                    <span className="insignia-compartido">{e.deAmigo.mio ? 'Tuyo' : `de ${e.deAmigo.autor}`}</span>
                  )}
                </div>
                <GraficaEntrenamiento tramos={tramos} alto={46} />
                <div className="tarjeta-entreno-datos">
                  <span>{formatoDuracion(duracionTotal(tramos))}</span>
                  <span>TSS {tss(tramos)}</span>
                </div>
              </button>
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
        <button className="tarjeta-categoria" style={{ borderTopColor: AMIGOS.color }} onClick={() => setCategoria('amigos')}>
          <strong>{AMIGOS.nombre}</strong>
          <span>{AMIGOS.descripcion}</span>
          <small>{deAmigos.length === 1 ? '1 entrenamiento' : `${deAmigos.length} entrenamientos`}</small>
        </button>
        {CATEGORIAS.map((c) => {
          const n = entrenamientos.filter((e) => e.categoria === c.id).length;
          return (
            <button key={c.id} className="tarjeta-categoria" style={{ borderTopColor: c.color }} onClick={() => setCategoria(c.id)}>
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
}: {
  entreno: Entrenamiento;
  ftp: number;
  onCambiarFtp: (w: number) => void;
  hayErg: boolean;
  onEmpezar: () => void;
  onVolver: () => void;
  volverA?: string;
  onGuardarCopia?: () => void;
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
      <GraficaEntrenamiento tramos={tramos} alto={130} />
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
    </section>
  );
}
