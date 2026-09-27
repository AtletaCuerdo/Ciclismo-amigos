/**
 * «Tu cuenta»: entrar con Google o con cualquier correo, crear cuenta, recuperar la contraseña
 * y, con la sesión iniciada, ver el estado de la sincronización y cerrar sesión.
 */
import { useState } from 'react';
import { cerrarSesion, crearCuenta, entrarConCorreo, entrarConGoogle, mensajeCuenta, recordarClave, type Usuario } from '../cuenta/cuenta';

export type EstadoSync =
  | { tipo: 'nada' }
  | { tipo: 'sincronizando' }
  | { tipo: 'ok'; subidos: number; bajados: number; hora: number }
  | { tipo: 'error'; texto: string };

interface Props {
  usuario: Usuario | null;
  cargando: boolean;
  sync: EstadoSync;
  onRefrescar: () => void;
  onVolver: () => void;
}

export function PantallaCuenta({ usuario, cargando, sync, onRefrescar, onVolver }: Props) {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const hacer = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setError(mensajeCuenta(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="pantalla">
      <div className="cabecera-pantalla">
        <button className="boton-volver" onClick={onVolver}>
          ← Inicio
        </button>
        <h2>Tu cuenta</h2>
      </div>

      {cargando ? (
        <p className="detalle">Comprobando la sesión…</p>
      ) : usuario ? (
        <section className="panel panel-cuenta">
          <div className="cuenta-usuario">
            {usuario.foto ? <img src={usuario.foto} alt="" referrerPolicy="no-referrer" /> : <span className="cuenta-inicial">{usuario.nombre[0]?.toUpperCase()}</span>}
            <div>
              <strong>{usuario.nombre}</strong>
              <span className="detalle">{usuario.email}</span>
            </div>
          </div>
          <p>
            Tu ciclista, tu FTP y peso, tus entrenamientos propios y tu historial se guardan en la nube: entra con esta
            misma cuenta en el PC, el iPad o el móvil y tendrás lo mismo en todos.
          </p>
          <p className="estado-sync">
            {sync.tipo === 'sincronizando' && '🔄 Sincronizando…'}
            {sync.tipo === 'ok' &&
              `✅ Todo sincronizado${sync.subidos ? ` · ${sync.subidos} sesiones subidas` : ''}${sync.bajados ? ` · ${sync.bajados} sesiones descargadas` : ''}`}
            {sync.tipo === 'error' && <span className="error-strava">⚠️ No se pudo sincronizar: {sync.texto}</span>}
          </p>
          <div className="acciones-fila">
            <button className="boton-secundario" onClick={onRefrescar} disabled={sync.tipo === 'sincronizando'}>
              Sincronizar ahora
            </button>
            <button className="boton-secundario" onClick={() => void hacer(cerrarSesion)}>
              Cerrar sesión
            </button>
          </div>
          <p className="detalle">
            Al cerrar sesión, lo guardado sigue en este dispositivo y en la nube; lo que hagas sin sesión se subirá la
            próxima vez que entres.
          </p>
        </section>
      ) : (
        <section className="panel panel-cuenta">
          <p>
            Crea tu cuenta (gratis) para guardar tu historial y tu ciclista en la nube y usarlos desde cualquier
            dispositivo. Lo que ya tengas en este aparato se sube al entrar.
          </p>
          <button className="boton-google" disabled={ocupado} onClick={() => void hacer(entrarConGoogle)}>
            <span aria-hidden>G</span> Entrar con Google
          </button>
          <div className="separador-cuenta">
            <span>o con cualquier correo</span>
          </div>
          <div className="pestanas-cuenta">
            <button className={modo === 'entrar' ? 'activa' : ''} onClick={() => setModo('entrar')}>
              Ya tengo cuenta
            </button>
            <button className={modo === 'crear' ? 'activa' : ''} onClick={() => setModo('crear')}>
              Crear cuenta
            </button>
          </div>
          <form
            className="formulario-cuenta"
            onSubmit={(ev) => {
              ev.preventDefault();
              void hacer(async () => {
                if (modo === 'crear') {
                  await crearCuenta(nombre, email, clave);
                  onRefrescar();
                } else await entrarConCorreo(email, clave);
              });
            }}
          >
            {modo === 'crear' && (
              <label>
                Tu nombre
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={30} autoComplete="name" placeholder="Como te verán tus amigos" />
              </label>
            )}
            <label>
              Correo electrónico
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required
                minLength={6}
                autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
              />
            </label>
            <button className="boton-principal" type="submit" disabled={ocupado}>
              {modo === 'crear' ? 'Crear cuenta' : 'Entrar'}
            </button>
            {modo === 'entrar' && (
              <button
                type="button"
                className="enlace-boton"
                disabled={ocupado}
                onClick={() => {
                  if (!email) {
                    setError('Escribe primero tu correo.');
                    return;
                  }
                  void hacer(async () => {
                    await recordarClave(email);
                    setAviso(`Te hemos enviado un correo a ${email} para cambiar la contraseña (mira también en spam).`);
                  });
                }}
              >
                He olvidado mi contraseña
              </button>
            )}
          </form>
          {error && <p className="aviso">{error}</p>}
          {aviso && <p className="aviso-ok">{aviso}</p>}
        </section>
      )}
    </section>
  );
}
