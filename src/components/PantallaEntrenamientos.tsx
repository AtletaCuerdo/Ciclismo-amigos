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
}

/** Categorías → lista de entrenamientos → ficha con «Empezar». */
export function PantallaEntrenamientos({ entrenamientos, ftp, onCambiarFtp, hayErg, onEmpezar, onVolver }: Props) {
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [elegido, setElegido] = useState<Entrenamiento | null>(null);
  const cat = CATEGORIAS.find((c) => c.id === categoria);
  const deCategoria = entrenamientos.filter((e) => e.categoria === categoria);

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
        {deCategoria.length === 0 && <p className="vacio">Todavía no hay entrenamientos en esta categoría.</p>}
        <div className="lista-entrenos">
          {deCategoria.map((e) => {
            const tramos = desplegar(e.bloques);
            return (
              <button key={e.id} className="tarjeta-entreno" onClick={() => setElegido(e)}>
                <div className="tarjeta-entreno-cabecera">
                  <strong>{e.nombre}</strong>
                  {e.propio && <span className="insignia-propio">Mío</span>}
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
}: {
  entreno: Entrenamiento;
  ftp: number;
  onCambiarFtp: (w: number) => void;
  hayErg: boolean;
  onEmpezar: () => void;
  onVolver: () => void;
}) {
  const tramos = useMemo(() => desplegar(entreno.bloques), [entreno]);
  const [textoFtp, setTextoFtp] = useState(String(ftp));
  const cat = CATEGORIAS.find((c) => c.id === entreno.categoria);

  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← {cat?.nombre}
        </button>
        <h2>{entreno.nombre}</h2>
      </div>
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
    </section>
  );
}
