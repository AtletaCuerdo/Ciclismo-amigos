import { useState } from 'react';
import type { Ciclista } from '../multijugador/useSalida';
import { CIRCUITOS, longitudDe } from '../recorrido/circuitos';
import { conNivel, leerMiNivel } from '../entrenamiento/nivelPublico';

interface Props {
  /** Quién está rodando ahora en el recorrido. */
  conectados: Ciclista[];
  error: string | null;
  /** Nombre con el que te verán (el guardado o el de la cuenta). */
  nombre: string;
  onCambiarNombre: (nombre: string) => void;
  /**
   * Entrar en el recorrido junto a ese amigo: «a su lado» (cada uno a su ritmo, con rebufo si
   * te pones detrás) o «siempre juntos» (os movéis a la vez, al ritmo del entreno más exigente).
   */
  onRodarJunto: (uid: string, sala: string | undefined, siempreJuntos: boolean) => void;
}

const km = (m: number) => (m / 1000).toFixed(1).replace('.', ',');

/**
 * Amigos rodando ahora: se actualiza solo. Tocar a un amigo te lleva al recorrido
 * a su lado, en el mismo punto del circuito, llegues cuando llegues.
 */
export function PanelSalida({ conectados, error, nombre, onCambiarNombre, onRodarJunto }: Props) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nombre);

  const guardar = () => {
    const n = borrador.trim().slice(0, 30);
    if (n) onCambiarNombre(n);
    setEditando(false);
  };

  return (
    <section className="panel panel-amigos">
      <div className="cabecera-panel">
        <h2>👥 Amigos rodando ahora</h2>
        <span className={`chip-salida ${conectados.length ? 'chip-dentro' : 'chip-fuera'}`}>
          {conectados.length === 0
            ? 'Nadie'
            : `${conectados.length} rodando`}
        </span>
      </div>

      {conectados.length === 0 ? (
        <p className="detalle">
          Ahora mismo no rueda nadie. Empieza tú («Rodar libre» o un entrenamiento): tus amigos te verán aquí y
          podrán aparecer a tu lado.
        </p>
      ) : (
        <>
        <p className="detalle">
          <strong>A su lado</strong>: cada uno a su ritmo (si te pones detrás, te da rebufo).{' '}
          <strong>Siempre juntos</strong>: vais a la vez, al ritmo del que haga el entreno más exigente. Dentro puedes
          elegir un entreno en «📋 Entreno».
        </p>
        <ul className="lista-amigos">
          {conectados.map((c) => (
            <li key={c.uid}>
              <div className="amigo">
                <span className="amigo-punto" aria-hidden />
                <span className="amigo-datos">
                  <strong>{conNivel(c.nombre, typeof c.nivel === 'number' ? c.nivel : undefined)}</strong>
                  <span className="detalle">
                    {(() => {
                      const circ = CIRCUITOS.find((x) => x.sala === c.sala) ?? CIRCUITOS[0];
                      const largo = longitudDe(circ);
                      const enVuelta = (((c.distancia ?? 0) % largo) + largo) % largo;
                      return `${circ.nombre} · km ${km(enVuelta)} de ${largo / 1000}`;
                    })()}
                    {c.vatios !== undefined && ` · ${c.vatios} W`}
                    {c.velocidad !== undefined && ` · ${c.velocidad.toFixed(1).replace('.', ',')} km/h`}
                  </span>
                </span>
                <span className="amigo-acciones">
                  <button
                    className="amigo-accion"
                    onClick={() => onRodarJunto(c.uid, c.sala, false)}
                    title="Apareces a su lado y cada uno va a su ritmo: si te pones detrás, te da rebufo"
                  >
                    🚴 A su lado
                  </button>
                  <button
                    className="amigo-accion juntos"
                    onClick={() => onRodarJunto(c.uid, c.sala, true)}
                    title="Vais siempre juntos, al ritmo del que haga el entreno más exigente"
                  >
                    🔗 Siempre juntos
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      {error && <p className="aviso">{error}</p>}

      <div className="fila-unirse">
        {editando ? (
          <form
            className="fila-unirse"
            onSubmit={(e) => {
              e.preventDefault();
              guardar();
            }}
          >
            <input
              type="text"
              value={borrador}
              maxLength={30}
              placeholder="Tu nombre"
              autoComplete="nickname"
              autoFocus
              onChange={(e) => setBorrador(e.target.value)}
              aria-label="Tu nombre"
            />
            <button className="boton-principal" type="submit">
              Guardar
            </button>
          </form>
        ) : (
          <span className="detalle">
            {nombre ? (
              <>
                Al rodar, tus amigos te verán como <strong>{conNivel(nombre, leerMiNivel())}</strong>.{' '}
              </>
            ) : (
              'Pon tu nombre para que tus amigos te vean al rodar. '
            )}
            <button
              className="boton-enlace"
              onClick={() => {
                setBorrador(nombre);
                setEditando(true);
              }}
            >
              {nombre ? 'Cambiar' : 'Poner nombre'}
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
