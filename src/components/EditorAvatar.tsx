import { Suspense, lazy, useState } from 'react';
import {
  CASCOS,
  COLORES_PELO,
  EQUIPACIONES,
  MARCAS,
  MODELOS,
  PEINADOS,
  RUEDAS,
  TONOS_PIEL,
  avatarAleatorio,
  type Avatar,
  type Perfil,
} from '../recorrido/avatar';
import { materialPorId, tieneMaterial, type TipoMaterial } from '../entrenamiento/ridecoins';

// La vista previa usa Three.js: se descarga solo al abrir el editor
const VistaPreviaAvatar = lazy(() => import('./VistaPreviaAvatar'));

interface Props {
  perfil: Perfil;
  onCambiar: (p: Perfil) => void;
  /** true si Firebase rechaza el avatar (faltan las reglas nuevas). */
  avatarRechazado: boolean;
  onVolver: () => void;
  /** RideCoins disponibles y compra de material (bici, ruedas, casco). */
  saldo: number;
  /** Compra el material y lo pone a la vez (`avatar`: lo que cambia en el ciclista). */
  onComprarMaterial: (id: string, avatar: Partial<Avatar>) => void;
}

type ClaveColor = 'maillot' | 'franja' | 'culotte' | 'casco' | 'bici' | 'bici2';

const PIEZAS: { clave: ClaveColor; nombre: string }[] = [
  { clave: 'maillot', nombre: 'Maillot' },
  { clave: 'franja', nombre: 'Franja' },
  { clave: 'culotte', nombre: 'Culotte' },
  { clave: 'casco', nombre: 'Casco' },
  { clave: 'bici', nombre: 'Cuadro' },
  { clave: 'bici2', nombre: 'Detalles bici' },
];

/** Botones de opción (uno elegido). */
function Opciones<T extends string>({
  opciones,
  valor,
  onElegir,
  precio,
}: {
  opciones: { id: T; nombre: string; descripcion?: string }[];
  valor: T;
  onElegir: (v: T) => void;
  /** Material que aún no se tiene: su precio en RideCoins (null o undefined: ya es tuyo). */
  precio?: (v: T) => number | null;
}) {
  return (
    <div className="opciones">
      {opciones.map((o) => {
        const p = precio?.(o.id) ?? null;
        return (
          <button
            key={o.id}
            className={`opcion${valor === o.id ? ' elegida' : ''}${p !== null ? ' bloqueada' : ''}`}
            onClick={() => onElegir(o.id)}
          >
            {o.nombre}
            {o.descripcion && <small>{o.descripcion}</small>}
            {p !== null && <small className="precio-material">🔒 🪙 {p}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** Personalización completa del ciclista, con vista previa 3D. */
export function EditorAvatar({ perfil, onCambiar, avatarRechazado, onVolver, saldo, onComprarMaterial }: Props) {
  const { avatar } = perfil;
  const cambiar = (parcial: Partial<Avatar>) => onCambiar({ ...perfil, avatar: { ...avatar, ...parcial } });
  const precio = (tipo: TipoMaterial) => (v: string) =>
    tieneMaterial(perfil.despensa, tipo, v) ? null : (materialPorId(`${tipo}:${v}`)?.precio ?? null);
  /** Al azar, pero sin ponerte material que no tienes (se queda el que llevas). */
  const alAzar = () => {
    const a = avatarAleatorio();
    const d = perfil.despensa;
    return {
      ...a,
      modelo: tieneMaterial(d, 'bici', a.modelo) ? a.modelo : avatar.modelo,
      ruedas: tieneMaterial(d, 'ruedas', a.ruedas) ? a.ruedas : avatar.ruedas,
      cascoModelo: tieneMaterial(d, 'casco', a.cascoModelo) ? a.cascoModelo : avatar.cascoModelo,
    };
  };
  /** Elige el material si ya es tuyo; si no, ofrece comprarlo con RideCoins y lo pone. */
  const elegirMaterial = (tipo: TipoMaterial, v: string, parcial: Partial<Avatar>) => {
    const m = materialPorId(`${tipo}:${v}`);
    if (!m || tieneMaterial(perfil.despensa, tipo, v)) return cambiar(parcial);
    if (saldo < m.precio) {
      window.alert(`${m.nombre}: ${m.precio} RideCoins. Tienes ${saldo}: te faltan ${m.precio - saldo}. ¡A rodar!`);
      return;
    }
    if (!window.confirm(`¿Comprar ${m.nombre} por ${m.precio} RideCoins? (${m.efecto}). Te quedarán ${saldo - m.precio}.`)) return;
    onComprarMaterial(m.id, parcial);
  };
  const [textoFtp, setTextoFtp] = useState(String(perfil.ftp));

  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← Inicio
        </button>
        <h2>Tu ciclista</h2>
        <button className="boton-secundario" onClick={() => cambiar(alAzar())}>
          🎲 Al azar
        </button>
      </div>

      <div className="editor-avatar">
        <div className="columna-previa">
          <Suspense fallback={<div className="vista-previa-avatar cargando">Cargando…</div>}>
            <VistaPreviaAvatar avatar={avatar} />
          </Suspense>
          {avatarRechazado && (
            <p className="aviso">
              Firebase aún no acepta este avatar: falta actualizar las reglas de la Realtime Database. Los demás te
              verán con colores por defecto.
            </p>
          )}
        </div>

        <div className="controles-avatar">
          <h3>Cuerpo</h3>
          <Opciones
            opciones={[
              { id: 'hombre' as const, nombre: 'Hombre' },
              { id: 'mujer' as const, nombre: 'Mujer' },
            ]}
            valor={avatar.sexo}
            onElegir={(sexo) => cambiar({ sexo })}
          />
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

          <h3>Pelo</h3>
          <Opciones opciones={PEINADOS} valor={avatar.pelo} onElegir={(pelo) => cambiar({ pelo })} />
          <div className="tonos-piel">
            {COLORES_PELO.map((c) => (
              <button
                key={c}
                className={`tono${avatar.colorPelo === c ? ' elegido' : ''}`}
                style={{ background: c }}
                onClick={() => cambiar({ colorPelo: c })}
                aria-label={`Color de pelo ${c}`}
              />
            ))}
          </div>
          <label className="casilla">
            <input type="checkbox" checked={avatar.barba} onChange={(e) => cambiar({ barba: e.target.checked })} />
            Barba
          </label>
          {avatar.pelo === 'corto' && avatar.cascoModelo !== 'gorra' && (
            <p className="detalle">Con casco, el pelo corto queda aplastado debajo (como en la realidad).</p>
          )}

          <h3>Casco</h3>
          <Opciones
            opciones={CASCOS}
            valor={avatar.cascoModelo}
            precio={precio('casco')}
            onElegir={(cascoModelo) => elegirMaterial('casco', cascoModelo, { cascoModelo })}
          />

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

          <h3>Bici</h3>
          <Opciones
            opciones={MODELOS}
            valor={avatar.modelo}
            precio={precio('bici')}
            onElegir={(modelo) => elegirMaterial('bici', modelo, { modelo })}
          />

          <h3>Marca del cuadro</h3>
          <Opciones opciones={MARCAS} valor={avatar.marca} onElegir={(marca) => cambiar({ marca })} />

          <h3>Ruedas</h3>
          <Opciones
            opciones={RUEDAS.map((r) => ({
              ...r,
              descripcion: r.id === 'lenticular' ? 'Trasera lenticular, delantera de perfil alto' : undefined,
            }))}
            valor={avatar.ruedas}
            precio={precio('ruedas')}
            onElegir={(ruedas) => elegirMaterial('ruedas', ruedas, { ruedas })}
          />

          <h3>Datos para entrenar</h3>
          <div className="fila-peso">
            <span>Peso</span>
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
          <label className="campo-ftp">
            <span>FTP</span>
            <input
              type="text"
              inputMode="numeric"
              value={textoFtp}
              onChange={(e) => {
                setTextoFtp(e.target.value);
                const v = Number(e.target.value);
                if (v >= 50 && v <= 600) onCambiar({ ...perfil, ftp: Math.round(v) });
              }}
            />
            <span>W</span>
          </label>
          <p className="detalle">
            El peso y el FTP no se comparten con nadie. El FTP marca la intensidad de los entrenamientos; si no lo sabes,
            haz el «Test de rampa» en Entrenamientos → Test.
          </p>
        </div>
      </div>
    </section>
  );
}
