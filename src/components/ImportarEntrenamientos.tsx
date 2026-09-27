/**
 * Importar entrenamientos desde archivos .zwo, .mrc y .erg (varios a la vez): se leen, se
 * enseña un resumen con su gráfica y categoría (que se puede cambiar) y se guardan como «Míos».
 */
import { useRef, useState } from 'react';
import { importarArchivo, type Importado } from '../entrenamientos/importar';
import { CATEGORIAS, desplegar, duracionTotal, formatoDuracion, tss, type Categoria, type Entrenamiento } from '../entrenamientos/tipos';
import { GraficaEntrenamiento } from './GraficaEntrenamiento';

interface Props {
  ftp: number;
  onGuardar: (nuevos: Entrenamiento[]) => void;
}

export function ImportarEntrenamientos({ ftp, onGuardar }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [leidos, setLeidos] = useState<Importado[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [hecho, setHecho] = useState<string | null>(null);

  const leer = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setHecho(null);
    const ok: Importado[] = [];
    const mal: string[] = [];
    for (const a of Array.from(archivos)) {
      try {
        ok.push(await importarArchivo(a, ftp));
      } catch (e) {
        mal.push(`${a.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setLeidos(ok);
    setErrores(mal);
    if (entrada.current) entrada.current.value = '';
  };

  const cambiarCategoria = (i: number, c: Categoria) =>
    setLeidos((l) => l.map((x, k) => (k === i ? { ...x, entreno: { ...x.entreno, categoria: c } } : x)));

  const guardar = () => {
    onGuardar(leidos.map((x) => x.entreno));
    setHecho(
      leidos.length === 1
        ? `Guardado «${leidos[0].entreno.nombre}». Lo tienes en su categoría de Entrenamientos.`
        : `Guardados ${leidos.length} entrenamientos. Los tienes en sus categorías de Entrenamientos.`,
    );
    setLeidos([]);
  };

  return (
    <section className="panel importar-entrenos">
      <h3>Importar desde un archivo</h3>
      <p className="detalle">
        Archivos <strong>.zwo</strong> (Zwift), <strong>.mrc</strong> o <strong>.erg</strong>. Puedes elegir varios a la vez. Los
        .erg vienen en vatios: se pasan a % de tu FTP.
      </p>
      <input
        ref={entrada}
        type="file"
        accept=".zwo,.mrc,.erg,application/xml,text/xml,text/plain"
        multiple
        hidden
        onChange={(e) => void leer(e.target.files)}
      />
      <button className="boton-secundario" onClick={() => entrada.current?.click()}>
        📂 Elegir archivos…
      </button>

      {errores.length > 0 && (
        <div className="aviso">
          No se pudieron leer:
          <ul>
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {hecho && <p className="aviso-ok">{hecho}</p>}

      {leidos.length > 0 && (
        <>
          <div className="lista-entrenos">
            {leidos.map((x, i) => {
              const t = desplegar(x.entreno.bloques);
              return (
                <div key={x.entreno.id} className="tarjeta-entreno">
                  <div className="tarjeta-entreno-cabecera">
                    <strong>{x.entreno.nombre}</strong>
                    <select value={x.entreno.categoria} onChange={(e) => cambiarCategoria(i, e.target.value as Categoria)}>
                      {CATEGORIAS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <GraficaEntrenamiento tramos={t} alto={46} />
                  <div className="tarjeta-entreno-datos">
                    <span>{formatoDuracion(duracionTotal(t))}</span>
                    <span>TSS {tss(t)}</span>
                    <span className="detalle">{x.archivo}</span>
                  </div>
                  {x.entreno.descripcion && <p className="detalle">{x.entreno.descripcion}</p>}
                  {x.avisos.map((a) => (
                    <p key={a} className="detalle aviso-importar">
                      ⚠️ {a}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="acciones-fila">
            <button className="boton-principal" onClick={guardar}>
              Guardar {leidos.length === 1 ? 'entrenamiento' : `${leidos.length} entrenamientos`}
            </button>
            <button className="boton-secundario" onClick={() => setLeidos([])}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
