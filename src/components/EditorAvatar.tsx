import { Suspense, lazy, useState } from 'react';
import {
  EQUIPACIONES,
  TONOS_PIEL,
  avatarAleatorio,
  type Avatar,
  type Perfil,
} from '../recorrido/avatar';

// La vista previa usa Three.js: se descarga solo al abrir el editor
const VistaPreviaAvatar = lazy(() => import('./VistaPreviaAvatar'));

interface Props {
  perfil: Perfil;
  onCambiar: (p: Perfil) => void;
  /** true si Firebase rechaza el avatar (faltan las reglas nuevas). */
  avatarRechazado: boolean;
}

const PIEZAS: { clave: Exclude<keyof Avatar, 'piel'>; nombre: string }[] = [
  { clave: 'maillot', nombre: 'Maillot' },
  { clave: 'franja', nombre: 'Franja' },
  { clave: 'culotte', nombre: 'Culotte' },
  { clave: 'casco', nombre: 'Casco' },
  { clave: 'bici', nombre: 'Bici' },
];

/** Personalización del ciclista: colores, tono de piel y peso. */
export function EditorAvatar({ perfil, onCambiar, avatarRechazado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const { avatar } = perfil;
  const cambiar = (parcial: Partial<Avatar>) => onCambiar({ ...perfil, avatar: { ...avatar, ...parcial } });

  return (
    <section className="panel">
      <div className="cabecera-panel">
        <h2>Tu ciclista</h2>
        <button className="boton-secundario" onClick={() => setAbierto((a) => !a)}>
          {abierto ? 'Cerrar' : 'Personalizar'}
        </button>
      </div>

      {!abierto ? (
        <div className="muestras-avatar">
          {(['maillot', 'franja', 'culotte', 'casco', 'bici', 'piel'] as const).map((k) => (
            <span key={k} className="muestra-color" style={{ background: avatar[k] }} title={k} />
          ))}
          <span className="detalle">Peso: {perfil.pesoKg} kg</span>
        </div>
      ) : (
        <div className="editor-avatar">
          <Suspense fallback={<div className="vista-previa-avatar cargando">Cargando…</div>}>
            <VistaPreviaAvatar avatar={avatar} />
          </Suspense>

          <div className="controles-avatar">
            <h3>Equipaciones</h3>
            <div className="equipaciones">
              {EQUIPACIONES.map((e) => (
                <button
                  key={e.nombre}
                  className="equipacion"
                  onClick={() => cambiar(e.colores)}
                  title={e.nombre}
                  style={{
                    background: `linear-gradient(180deg, ${e.colores.maillot} 0 45%, ${e.colores.franja} 45% 60%, ${e.colores.culotte} 60%)`,
                  }}
                >
                  <span>{e.nombre}</span>
                </button>
              ))}
              <button className="boton-secundario" onClick={() => cambiar(avatarAleatorio())}>
                🎲 Al azar
              </button>
            </div>

            <h3>Colores</h3>
            <div className="rejilla-colores">
              {PIEZAS.map((p) => (
                <label key={p.clave}>
                  <input type="color" value={avatar[p.clave]} onChange={(e) => cambiar({ [p.clave]: e.target.value })} />
                  {p.nombre}
                </label>
              ))}
            </div>

            <h3>Piel</h3>
            <div className="tonos-piel">
              {TONOS_PIEL.map((t) => (
                <button
                  key={t}
                  className={`tono${avatar.piel === t ? ' elegido' : ''}`}
                  style={{ background: t }}
                  onClick={() => cambiar({ piel: t })}
                  aria-label={`Tono de piel ${t}`}
                />
              ))}
            </div>

            <h3>Peso (para la velocidad en el recorrido)</h3>
            <div className="fila-peso">
              <input
                type="range"
                min={40}
                max={130}
                step={1}
                value={perfil.pesoKg}
                onChange={(e) => onCambiar({ ...perfil, pesoKg: Number(e.target.value) })}
                aria-label="Peso"
              />
              <strong>{perfil.pesoKg} kg</strong>
            </div>
            <p className="detalle">El peso no se comparte con nadie: solo se usa en tu dispositivo.</p>
          </div>
        </div>
      )}

      {avatarRechazado && (
        <p className="aviso">
          Firebase no acepta aún los avatares: hay que actualizar las reglas de la Realtime Database
          (ver README). Los demás te verán con colores por defecto.
        </p>
      )}
    </section>
  );
}
