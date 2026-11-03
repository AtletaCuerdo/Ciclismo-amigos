/**
 * Primera vez en RideCrew: tres pasos para no perderse (conectar el rodillo, peso y FTP, y la
 * primera salida). Sale a quien aún no tiene ninguna sesión y se puede saltar en cualquier momento.
 */
import { useState, type ReactNode } from 'react';
import type { Perfil } from '../recorrido/avatar';

const CLAVE = 'rodillos.asistenteVisto';

export function asistenteVisto() {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    return false;
  }
}

function marcarVisto() {
  try {
    localStorage.setItem(CLAVE, 'si');
  } catch {
    // sin almacenamiento: volverá a salir, no es grave
  }
}

export function AsistenteInicio({
  conexiones,
  rodilloListo,
  perfil,
  onCambiarPerfil,
  onRodarLibre,
  onTest,
  onEntrenoCorto,
  onCerrar,
}: {
  /** Tarjetas para conectar el rodillo (las mismas de «Dispositivos»). */
  conexiones: ReactNode;
  /** Ya llegan vatios (rodillo o potenciómetro). */
  rodilloListo: boolean;
  perfil: Perfil;
  onCambiarPerfil: (p: Perfil) => void;
  onRodarLibre: () => void;
  onTest: () => void;
  onEntrenoCorto: () => void;
  onCerrar: () => void;
}) {
  const [paso, setPaso] = useState(0);
  const [peso, setPeso] = useState(String(perfil.pesoKg));
  const [ftp, setFtp] = useState(String(perfil.ftp));
  const [noSe, setNoSe] = useState(false);
  const cerrar = () => {
    marcarVisto();
    onCerrar();
  };
  const salir = (accion: () => void) => {
    marcarVisto();
    accion();
  };
  const guardarDatos = () => {
    const kg = Number(peso.replace(',', '.'));
    const w = Number(ftp);
    const p = { ...perfil };
    if (kg >= 30 && kg <= 200) p.pesoKg = Math.round(kg * 10) / 10;
    // Sin FTP: una estimación prudente para empezar (2,5 W/kg); el test lo afinará
    if (noSe) p.ftp = Math.round((p.pesoKg * 2.5) / 5) * 5;
    else if (w >= 50 && w <= 600) p.ftp = Math.round(w);
    onCambiarPerfil(p);
    setPaso(2);
  };

  return (
    <section className="panel asistente">
      <div className="cabecera-panel">
        <h2>👋 Bienvenido a RideCrew</h2>
        <button className="boton-secundario" onClick={cerrar}>
          Saltar
        </button>
      </div>
      <ol className="asistente-pasos" aria-label="Pasos">
        {['Conecta tu rodillo', 'Tu peso y FTP', 'Primera salida'].map((t, i) => (
          <li key={t} className={i === paso ? 'actual' : i < paso ? 'hecho' : ''}>
            <span>{i < paso ? '✓' : i + 1}</span>
            {t}
          </li>
        ))}
      </ol>

      {paso === 0 && (
        <>
          <p>
            Enciende el rodillo y pulsa <strong>«Rodillo inteligente»</strong>. Si tu rodillo no se deja controlar,
            usa <strong>«Potenciómetro»</strong>: verás tus vatios igual.
          </p>
          {conexiones}
          <p className="detalle">
            {rodilloListo ? '✅ ¡Ya llegan tus vatios!' : 'Cuando conecte, pedalea un poco para ver que llegan los vatios.'}
          </p>
          <div className="asistente-botones">
            <button className="boton-principal" onClick={() => setPaso(1)}>
              {rodilloListo ? 'Siguiente' : 'Lo conecto luego'}
            </button>
          </div>
        </>
      )}

      {paso === 1 && (
        <>
          <p>
            Con tu <strong>peso</strong> se calcula tu velocidad en el recorrido, y con tu <strong>FTP</strong> (los
            vatios que aguantas una hora) se ajustan todos los entrenamientos a ti.
          </p>
          <div className="campos-ftp">
            <label className="campo-ftp">
              <span>Peso</span>
              <input type="text" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
              <span>kg</span>
            </label>
            <label className="campo-ftp">
              <span>FTP</span>
              <input
                type="text"
                inputMode="numeric"
                value={noSe ? '' : ftp}
                disabled={noSe}
                onChange={(e) => setFtp(e.target.value)}
              />
              <span>W</span>
            </label>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={noSe} onChange={(e) => setNoSe(e.target.checked)} />
            No sé mi FTP (pongo uno aproximado y lo calculo con un test)
          </label>
          <div className="asistente-botones">
            <button className="boton-secundario" onClick={() => setPaso(0)}>
              Atrás
            </button>
            <button className="boton-principal" onClick={guardarDatos}>
              Siguiente
            </button>
          </div>
        </>
      )}

      {paso === 2 && (
        <>
          <p>¡Listo! ¿Cómo quieres empezar?</p>
          <div className="asistente-opciones">
            {noSe && (
              <button className="accion accion-entrenos" onClick={() => salir(onTest)}>
                <span className="accion-icono" aria-hidden>
                  📏
                </span>
                <strong>Test de FTP</strong>
                <span>Como mucho 25 minutos subiendo poco a poco hasta no poder más. Al acabar te dice tu FTP.</span>
              </button>
            )}
            <button className="accion accion-libre" onClick={() => salir(onRodarLibre)}>
              <span className="accion-icono" aria-hidden>
                🏞️
              </span>
              <strong>Rodar libre</strong>
              <span>A tu aire por el recorrido: el rodillo se endurece en las subidas.</span>
            </button>
            <button className="accion accion-crear" onClick={() => salir(onEntrenoCorto)}>
              <span className="accion-icono" aria-hidden>
                ⏱️
              </span>
              <strong>Un entreno corto</strong>
              <span>Una sesión guiada rápida: el rodillo pone los vatios por ti.</span>
            </button>
          </div>
          <p className="detalle">
            Cuando quieras, en «Personalizar» cambias tu ciclista y en «Amigos rodando ahora» te unes a otros.
          </p>
        </>
      )}
    </section>
  );
}
