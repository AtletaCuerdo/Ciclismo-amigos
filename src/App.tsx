import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Potenciometro, Pulsometro, RodilloFtms, SensorCsc } from './ble/dispositivos';
import type { RangoPotencia } from './ble/parsers';
import { bluetoothDisponible, type EventosSensor, type TipoLog } from './ble/SensorBle';
import { AjustesSensorCsc } from './components/AjustesSensorCsc';
import { ControlesRodillo } from './components/ControlesRodillo';
import { EditorAvatar } from './components/EditorAvatar';
import { EditorEntrenamientos } from './components/EditorEntrenamientos';
import { Historial } from './components/Historial';
import { Metrica } from './components/Metrica';
import { PanelSalida } from './components/PanelSalida';
import { PantallaEntrenamientos } from './components/PantallaEntrenamientos';
import { RegistroLog, type EntradaLog } from './components/RegistroLog';
import { ResumenAcumulado } from './components/ResumenAcumulado';
import { ResumenEntreno } from './components/ResumenEntreno';
import { TarjetaConexion, type InfoConexion } from './components/TarjetaConexion';
import { guardarEntreno } from './entrenamiento/almacen';
import type { Entreno } from './entrenamiento/tipos';
import { useGrabacion, type ValoresActuales } from './entrenamiento/useGrabacion';
import { CATALOGO } from './entrenamientos/catalogo';
import { cargarPropios, guardarPropios } from './entrenamientos/propios';
import { desplegar, duracionTotal, potenciaEn, type Entrenamiento, type Tramo } from './entrenamientos/tipos';
import { useSalida } from './multijugador/useSalida';
import { cargarAjustes, guardarAjustes, potenciaEstimada } from './potenciaVirtual';
import {
  PESO_BICI_KG,
  avatarAleatorio,
  cargarCalidad,
  cargarPerfil,
  guardarCalidad,
  guardarPerfil,
  type Avatar,
  type Calidad,
  type Perfil,
} from './recorrido/avatar';
import type { OtroCiclista } from './recorrido/escena';
import { FisicaVirtual } from './recorrido/fisica';
import { pendiente as pendienteRuta } from './recorrido/perfil';

// El recorrido 3D y la vista previa del ciclista (Three.js) se descargan solo al usarlos
const VistaRecorrido = lazy(() => import('./components/VistaRecorrido'));
const VistaPreviaAvatar = lazy(() => import('./components/VistaPreviaAvatar'));

// ---------------------------------------------------------------------------
// Tipos del estado
// ---------------------------------------------------------------------------

type Fuente = 'ftms' | 'pm' | 'csc' | 'hr';
type NombreMetrica = 'potencia' | 'cadencia' | 'velocidad' | 'pulso';
type Pantalla = 'inicio' | 'avatar' | 'entrenamientos' | 'crear' | 'historial' | 'ajustes';

/** Un valor con la hora a la que llegó, para descartar datos viejos. */
interface Lectura {
  v: number;
  t: number;
}
type Datos = Record<Fuente, Partial<Record<NombreMetrica, Lectura>>>;

/** Entrenamiento guiado en curso. */
export interface EntrenoActivo {
  entreno: Entrenamiento;
  tramos: Tramo[];
  total: number;
}

const DATOS_VACIOS: Datos = { ftms: {}, pm: {}, csc: {}, hr: {} };
const CONEXION_INICIAL: InfoConexion = { estado: 'desconectado', error: null };
/** Un dato con más de 3 s de antigüedad se considera perdido. */
const FRESCURA_MS = 3000;

let contadorLog = 0;

/** Avatar fijo para quien no comparte el suyo (mismo uid → mismos colores). */
const avataresPorDefecto = new Map<string, Avatar>();
function avatarPorDefecto(uid: string) {
  let a = avataresPorDefecto.get(uid);
  if (!a) {
    a = avatarAleatorio();
    avataresPorDefecto.set(uid, a);
  }
  return a;
}

/** Devuelve el primer valor disponible junto al nombre de su fuente. */
function primero(candidatos: [string, number | undefined][]) {
  for (const [fuente, valor] of candidatos) if (valor !== undefined) return { valor, fuente };
  return { valor: undefined, fuente: undefined };
}

/** Mejor media de 60 s (para el test de rampa). */
function mejorMinuto(entreno: Entreno) {
  const p = entreno.muestras.map((m) => m.p ?? 0);
  let mejor = 0;
  let suma = 0;
  for (let i = 0; i < p.length; i++) {
    suma += p[i];
    if (i >= 60) suma -= p[i - 60];
    if (i >= 59) mejor = Math.max(mejor, suma / 60);
  }
  return mejor;
}

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('inicio');
  const [datos, setDatos] = useState<Datos>(DATOS_VACIOS);
  const [conexiones, setConexiones] = useState<Record<Fuente, InfoConexion>>({
    ftms: CONEXION_INICIAL,
    pm: CONEXION_INICIAL,
    csc: CONEXION_INICIAL,
    hr: CONEXION_INICIAL,
  });
  const [log, setLog] = useState<EntradaLog[]>([]);
  const [rango, setRango] = useState<RangoPotencia | null>(null);
  const [ajustes, setAjustes] = useState(cargarAjustes);
  const [ahora, setAhora] = useState(() => Date.now());
  // Vatios simulados para probar sin rodillo (null = desactivado)
  const [demoVatios, setDemoVatios] = useState<number | null>(null);
  // Último entrenamiento finalizado (se muestra su resumen) y si falló al guardarse
  const [terminado, setTerminado] = useState<{ entreno: Entreno; error: string | null; ftpSugerido?: number } | null>(null);
  const [versionHistorial, setVersionHistorial] = useState(0);
  // Pendiente simulada (null = no hay modo pendiente activo)
  const pendienteRef = useRef<number | null>(null);

  // ---- Perfil del ciclista (avatar, peso y FTP) ----
  const [perfil, setPerfilEstado] = useState<Perfil>(cargarPerfil);
  const [calidad, setCalidadEstado] = useState<Calidad>(cargarCalidad);
  const cambiarCalidad = (c: Calidad) => {
    setCalidadEstado(c);
    guardarCalidad(c);
  };
  const cambiarPerfil = (p: Perfil) => {
    setPerfilEstado(p);
    guardarPerfil(p);
  };

  // ---- Entrenamientos ----
  const [propios, setPropios] = useState<Entrenamiento[]>(cargarPropios);
  const todosLosEntrenos = useMemo(() => [...CATALOGO, ...propios], [propios]);
  const [entrenoActivo, setEntrenoActivo] = useState<EntrenoActivo | null>(null);

  // ---- Recorrido virtual ----
  const [enRecorrido, setEnRecorrido] = useState(false);
  const enRecorridoRef = useRef(false);
  enRecorridoRef.current = enRecorrido;
  const fisicaRef = useRef(new FisicaVirtual());
  // Velocidad virtual (km/h) calculada por la física mientras se está en el recorrido
  const velVirtualRef = useRef(0);

  // Los sensores leen la circunferencia en cada paquete: usamos una ref
  // para que siempre vean el valor más reciente sin recrearlos.
  const ajustesRef = useRef(ajustes);
  ajustesRef.current = ajustes;

  // ---- Creación de los sensores (una sola vez) ----
  const [sensores] = useState(() => {
    const anadirLog = (texto: string, tipo: TipoLog) =>
      setLog((l) =>
        [{ id: ++contadorLog, hora: new Date().toLocaleTimeString('es-ES'), texto, tipo }, ...l].slice(0, 300),
      );

    const actualizar = (fuente: Fuente, valores: Partial<Record<NombreMetrica, number | undefined>>) => {
      const t = Date.now();
      setDatos((d) => {
        const nuevo = { ...d[fuente] };
        for (const [k, v] of Object.entries(valores)) {
          if (v !== undefined && Number.isFinite(v)) nuevo[k as NombreMetrica] = { v, t };
        }
        return { ...d, [fuente]: nuevo };
      });
    };

    const eventos = (f: Fuente): EventosSensor => ({
      onEstado: (estado, nombre) => setConexiones((c) => ({ ...c, [f]: { ...c[f], estado, nombre } })),
      onError: (error) => setConexiones((c) => ({ ...c, [f]: { ...c[f], error } })),
      onLog: anadirLog,
    });

    return {
      ftms: new RodilloFtms(eventos('ftms'), {
        onDatos: (d) => actualizar('ftms', { ...d }),
        onRango: setRango,
      }),
      pm: new Potenciometro(eventos('pm'), (d) => actualizar('pm', d)),
      csc: new SensorCsc(eventos('csc'), (d) => actualizar('csc', d), () => ajustesRef.current.circunferencia),
      hr: new Pulsometro(eventos('hr'), (ppm) => actualizar('hr', { pulso: ppm })),
    };
  });

  // Al cerrar la página soltamos los dispositivos
  useEffect(() => {
    return () => Object.values(sensores).forEach((s) => s.desconectar());
  }, [sensores]);

  useEffect(() => guardarAjustes(ajustes), [ajustes]);

  // ---- Valores que se muestran (con prioridad entre fuentes) ----
  const fresco = (l?: Lectura) => (l && ahora - l.t < FRESCURA_MS ? l.v : undefined);

  const velocidadCsc = fresco(datos.csc.velocidad);
  const potEstimada =
    velocidadCsc !== undefined ? potenciaEstimada(velocidadCsc, ajustes.a, ajustes.b) : undefined;
  const potReal = primero([
    ['Potenciómetro', fresco(datos.pm.potencia)],
    ['Rodillo FTMS', fresco(datos.ftms.potencia)],
  ]);
  const potenciaSensores = potReal.valor !== undefined ? potReal : { valor: potEstimada, fuente: 'Sensor velocidad' };
  // Modo demostración: vatios simulados cuando no hay ningún sensor de potencia
  const usarDemo = demoVatios !== null && potenciaSensores.valor === undefined;
  const potencia = usarDemo ? { valor: demoVatios ?? 0, fuente: 'Simulación' } : potenciaSensores;
  const esEstimada = !usarDemo && potReal.valor === undefined && potEstimada !== undefined;

  const cadenciaSensores = primero([
    ['Potenciómetro', fresco(datos.pm.cadencia)],
    ['Sensor cadencia', fresco(datos.csc.cadencia)],
    ['Rodillo FTMS', fresco(datos.ftms.cadencia)],
  ]);
  const cadencia =
    usarDemo && cadenciaSensores.valor === undefined
      ? { valor: demoVatios! > 0 ? 85 : 0, fuente: 'Simulación' }
      : cadenciaSensores;
  const velocidad = primero([
    ['Rodillo FTMS', fresco(datos.ftms.velocidad)],
    ['Sensor velocidad', velocidadCsc],
  ]);
  const pulso = primero([
    ['Pulsómetro', fresco(datos.hr.pulso)],
    ['Rodillo FTMS', fresco(datos.ftms.pulso)],
  ]);

  // Reloj para descartar datos viejos aunque no llegue nada nuevo
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Grabación (1 muestra por segundo) ----
  const actualRef = useRef<ValoresActuales>({ potenciaEsEstimada: false });
  actualRef.current = {
    potencia: potencia.valor,
    cadencia: cadencia.valor,
    velocidad: velocidad.valor,
    pulso: pulso.valor,
    potenciaEsEstimada: esEstimada,
  };
  // En el recorrido, la velocidad es la virtual (sale de los vatios y la pendiente)
  const leerActual = (): ValoresActuales =>
    enRecorridoRef.current ? { ...actualRef.current, velocidad: velVirtualRef.current } : actualRef.current;
  const grabacion = useGrabacion(leerActual, () => pendienteRef.current);

  // ---- Salida en grupo (multijugador con Firebase) ----
  const distanciaRef = useRef(0);
  distanciaRef.current = grabacion.distanciaM;
  const salida = useSalida(
    () => ({
      vatios: actualRef.current.potencia,
      velocidad: leerActual().velocidad,
      cadencia: actualRef.current.cadencia,
      distancia: distanciaRef.current,
    }),
    perfil.avatar,
  );

  // ---- Objetivo del entrenamiento guiado (W) ----
  const objetivoPct = entrenoActivo ? potenciaEn(entrenoActivo.tramos, grabacion.segundos) : undefined;
  const objetivoW = objetivoPct !== undefined ? Math.round((objetivoPct * perfil.ftp) / 100) : undefined;
  const objetivoRef = useRef<number | undefined>(undefined);
  objetivoRef.current = objetivoW;
  const entrenoActivoRef = useRef<EntrenoActivo | null>(null);
  entrenoActivoRef.current = entrenoActivo;

  // ---- Física del recorrido y control del rodillo (10 veces por segundo) ----
  const corriendoRef = useRef(false);
  corriendoRef.current = grabacion.corriendo;
  const pesoRef = useRef(perfil.pesoKg);
  pesoRef.current = perfil.pesoKg;
  useEffect(() => {
    if (!enRecorrido) return;
    let anterior = performance.now();
    let pendienteEnviada: number | null = null;
    let potenciaEnviada: number | null = null;
    let ultimoEnvio = 0;
    const id = setInterval(() => {
      const t = performance.now();
      const dt = Math.min(0.5, (t - anterior) / 1000);
      anterior = t;
      const f = fisicaRef.current;
      f.masaKg = pesoRef.current + PESO_BICI_KG;
      const grado = pendienteRuta(distanciaRef.current);
      // La pendiente del recorrido alimenta el desnivel acumulado de la grabación
      pendienteRef.current = grado;
      if (corriendoRef.current) f.actualizar(actualRef.current.potencia ?? 0, grado, dt);
      else f.detener();
      velVirtualRef.current = f.v * 3.6;

      const rodillo = sensores.ftms;
      if (!rodillo.tieneControl) return;
      if (entrenoActivoRef.current) {
        // Entrenamiento guiado: modo ERG (potencia fija), como mucho un envío por segundo
        const w = objetivoRef.current;
        if (w !== undefined && w !== potenciaEnviada && t - ultimoEnvio > 1000) {
          potenciaEnviada = w;
          ultimoEnvio = t;
          void rodillo.fijarPotencia(w);
        }
      } else {
        // Rodar libre: el rodillo se endurece con la pendiente (cambios de 0,5 %, máx. cada 2 s)
        const redondeada = Math.round(grado * 2) / 2;
        if (redondeada !== pendienteEnviada && t - ultimoEnvio > 2000) {
          pendienteEnviada = redondeada;
          ultimoEnvio = t;
          void rodillo.fijarPendiente(redondeada);
        }
      }
    }, 100);
    return () => {
      clearInterval(id);
      pendienteRef.current = null;
      velVirtualRef.current = 0;
      fisicaRef.current.detener();
    };
  }, [enRecorrido, sensores]);

  // Otros ciclistas de la salida, con su avatar (o uno fijo si no lo comparten)
  const otrosCiclistas: OtroCiclista[] = salida.ciclistas
    .filter((c) => c.uid !== salida.miUid)
    .map((c) => ({
      uid: c.uid,
      nombre: c.nombre,
      avatar: salida.avatares[c.uid] ?? avatarPorDefecto(c.uid),
      distancia: c.distancia ?? 0,
      velocidad: c.velocidad ?? 0,
      cadencia: c.cadencia ?? 0,
    }));

  // Avisar antes de cerrar la página si hay un entrenamiento sin guardar
  const hayDatosRef = useRef(false);
  hayDatosRef.current = grabacion.hayDatos;
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (!hayDatosRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, []);

  // ---- Empezar, terminar y salir ----
  const rodarLibre = () => {
    setEntrenoActivo(null);
    setTerminado(null);
    setEnRecorrido(true);
  };

  const empezarEntreno = (e: Entrenamiento) => {
    const tramos = desplegar(e.bloques);
    setEntrenoActivo({ entreno: e, tramos, total: duracionTotal(tramos) });
    setTerminado(null);
    setEnRecorrido(true);
  };

  /** Guarda la sesión y vuelve al inicio con el resumen. */
  const terminar = async () => {
    const activo = entrenoActivo;
    const entreno = grabacion.finalizar();
    setEnRecorrido(false);
    setEntrenoActivo(null);
    setPantalla('inicio');
    if (!entreno) return;
    const ftpSugerido =
      activo?.entreno.categoria === 'test' ? Math.round(mejorMinuto(entreno) * 0.75) || undefined : undefined;
    setTerminado({ entreno, error: null, ftpSugerido });
    try {
      await guardarEntreno(entreno);
      setVersionHistorial((v) => v + 1);
    } catch (e) {
      setTerminado({ entreno, error: e instanceof Error ? e.message : String(e), ftpSugerido });
    }
  };

  /** Sale del recorrido; si hay algo grabado, pregunta antes de descartarlo. */
  const salirRecorrido = () => {
    if (grabacion.hayDatos && !window.confirm('¿Salir sin guardar? Se perderá lo que llevas grabado.')) return;
    grabacion.descartar();
    setEnRecorrido(false);
    setEntrenoActivo(null);
  };

  // ---- Avisos de compatibilidad ----
  const sinBluetooth = !bluetoothDisponible();
  const sinHttps = typeof window !== 'undefined' && !window.isSecureContext;
  const hayErg = sensores.ftms.tieneControl;

  const tarjetas: { fuente: Fuente; titulo: string; detalle: string }[] = [
    { fuente: 'ftms', titulo: 'Rodillo inteligente', detalle: 'FTMS · servicio 0x1826' },
    { fuente: 'pm', titulo: 'Potenciómetro', detalle: 'Cycling Power · servicio 0x1818' },
    { fuente: 'csc', titulo: 'Sensor velocidad/cadencia', detalle: 'CSC · servicio 0x1816' },
    { fuente: 'hr', titulo: 'Pulsómetro', detalle: 'Heart Rate · servicio 0x180D' },
  ];

  const volver = () => setPantalla('inicio');

  return (
    <div className="app">
      <header className="barra-superior">
        <button className="marca" onClick={volver}>
          <span className="marca-icono" aria-hidden>🚴</span> Ciclismo amigos
        </button>
        <button className="boton-secundario" onClick={() => setPantalla('ajustes')}>
          ⚙️ Ajustes
        </button>
      </header>

      {(sinBluetooth || sinHttps) && (
        <div className="banner-error">
          {sinHttps
            ? 'Web Bluetooth necesita que la página se abra por HTTPS (o desde localhost).'
            : 'Este navegador no soporta Web Bluetooth. Usa Chrome en PC/Mac/Android o Bluefy en iPad/iPhone.'}
        </div>
      )}

      {/* ================= INICIO ================= */}
      {pantalla === 'inicio' && (
        <>
          {terminado && (
            <ResumenEntreno
              entreno={terminado.entreno}
              errorGuardado={terminado.error}
              ftpSugerido={terminado.ftpSugerido}
              ftpActual={perfil.ftp}
              onAceptarFtp={(w) => cambiarPerfil({ ...perfil, ftp: w })}
              onCerrar={() => setTerminado(null)}
            />
          )}

          <section className="inicio-cabecera">
            <div className="tarjeta-ciclista">
              <Suspense fallback={<div className="vista-previa-avatar pequena cargando">Cargando…</div>}>
                <VistaPreviaAvatar avatar={perfil.avatar} className="pequena" />
              </Suspense>
              <div className="tarjeta-ciclista-datos">
                <h2>Tu ciclista</h2>
                <p className="detalle">
                  FTP {perfil.ftp} W · {perfil.pesoKg} kg
                </p>
                <button className="boton-principal" onClick={() => setPantalla('avatar')}>
                  Personalizar
                </button>
              </div>
            </div>
            <ResumenAcumulado version={versionHistorial} onVerHistorial={() => setPantalla('historial')} />
          </section>

          <section className="acciones-principales">
            <button className="accion accion-libre" onClick={rodarLibre}>
              <span className="accion-icono" aria-hidden>🏞️</span>
              <strong>Rodar libre</strong>
              <span>Vuelta de 17 km: el rodillo se endurece con las subidas</span>
            </button>
            <button className="accion accion-entrenos" onClick={() => setPantalla('entrenamientos')}>
              <span className="accion-icono" aria-hidden>📈</span>
              <strong>Entrenamientos</strong>
              <span>Sesiones guiadas en modo ERG por categorías</span>
            </button>
            <button className="accion accion-crear" onClick={() => setPantalla('crear')}>
              <span className="accion-icono" aria-hidden>✏️</span>
              <strong>Crea tus entrenamientos</strong>
              <span>Diseña tus propias series</span>
            </button>
            <button className="accion accion-historial" onClick={() => setPantalla('historial')}>
              <span className="accion-icono" aria-hidden>🗂️</span>
              <strong>Historial</strong>
              <span>Todas tus sesiones y datos acumulados</span>
            </button>
          </section>

          <section className="panel">
            <div className="cabecera-panel">
              <h2>Dispositivos</h2>
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={demoVatios !== null}
                  onChange={(e) => setDemoVatios(e.target.checked ? 180 : null)}
                />
                Modo demostración (sin rodillo)
              </label>
            </div>
            <div className="rejilla-conexion">
              {tarjetas.map(({ fuente, titulo, detalle }) => (
                <TarjetaConexion
                  key={fuente}
                  titulo={titulo}
                  detalle={detalle}
                  info={conexiones[fuente]}
                  deshabilitado={sinBluetooth}
                  // Llamada directa en el clic: requestDevice exige gesto del usuario
                  onConectar={() => void sensores[fuente].conectar()}
                  onDesconectar={() => sensores[fuente].desconectar()}
                />
              ))}
            </div>
            <div className="rejilla-metricas compacta">
              <Metrica
                etiqueta="Vatios"
                valor={potencia.valor}
                unidad="W"
                fuente={potencia.valor !== undefined ? potencia.fuente : undefined}
                estimada={esEstimada}
              />
              <Metrica etiqueta="Cadencia" valor={cadencia.valor} unidad="rpm" fuente={cadencia.fuente} />
              <Metrica etiqueta="Velocidad" valor={velocidad.valor} unidad="km/h" decimales={1} fuente={velocidad.fuente} />
              <Metrica etiqueta="Pulso" valor={pulso.valor} unidad="ppm" fuente={pulso.fuente} />
            </div>
          </section>

          <PanelSalida
            estado={salida.estado}
            error={salida.error}
            ciclistas={salida.ciclistas}
            miUid={salida.miUid}
            grabando={grabacion.corriendo}
            onUnirse={(nombre) => void salida.unirse(nombre)}
            onSalir={() => void salida.salir()}
          />
        </>
      )}

      {/* ================= OTRAS PANTALLAS ================= */}
      {pantalla === 'avatar' && (
        <EditorAvatar perfil={perfil} onCambiar={cambiarPerfil} avatarRechazado={salida.avatarRechazado} onVolver={volver} />
      )}

      {pantalla === 'entrenamientos' && (
        <PantallaEntrenamientos
          entrenamientos={todosLosEntrenos}
          ftp={perfil.ftp}
          onCambiarFtp={(ftp) => cambiarPerfil({ ...perfil, ftp })}
          hayErg={hayErg}
          onEmpezar={empezarEntreno}
          onVolver={volver}
        />
      )}

      {pantalla === 'crear' && (
        <EditorEntrenamientos
          propios={propios}
          onGuardar={(lista) => {
            setPropios(lista);
            guardarPropios(lista);
          }}
          onProbar={empezarEntreno}
          onVolver={volver}
        />
      )}

      {pantalla === 'historial' && (
        <section className="pantalla">
          <div className="cabecera-pantalla">
            <button className="boton-volver" onClick={volver}>
              ← Inicio
            </button>
            <h2>Historial</h2>
          </div>
          <Historial version={versionHistorial} />
        </section>
      )}

      {pantalla === 'ajustes' && (
        <section className="pantalla">
          <div className="cabecera-pantalla">
            <button className="boton-volver" onClick={volver}>
              ← Inicio
            </button>
            <h2>Ajustes</h2>
          </div>
          <section className="panel">
            <h2>Gráficos del recorrido</h2>
            <label className="selector-calidad">
              Calidad
              <select value={calidad} onChange={(e) => cambiarCalidad(e.target.value as Calidad)}>
                <option value="alta">Alta (ordenador)</option>
                <option value="media">Media (tablets y móviles)</option>
              </select>
            </label>
          </section>
          {conexiones.ftms.estado === 'conectado' && (
            <ControlesRodillo rodillo={sensores.ftms} rango={rango} onModo={(p) => (pendienteRef.current = p)} />
          )}
          <AjustesSensorCsc ajustes={ajustes} onCambiar={setAjustes} />
          <RegistroLog entradas={log} onLimpiar={() => setLog([])} />
        </section>
      )}

      {/* ================= RECORRIDO 3D ================= */}
      {enRecorrido && (
        <Suspense
          fallback={
            <div className="recorrido">
              <div className="recorrido-cargando">Cargando el recorrido…</div>
            </div>
          }
        >
          <VistaRecorrido
            avatar={perfil.avatar}
            calidad={calidad}
            leerYo={() => ({
              distancia: distanciaRef.current,
              velocidad: velVirtualRef.current,
              cadencia: actualRef.current.cadencia ?? 0,
              hayCadencia: actualRef.current.cadencia !== undefined,
              potencia: actualRef.current.potencia,
              potenciaEstimada: actualRef.current.potenciaEsEstimada,
              pulso: actualRef.current.pulso,
            })}
            otros={otrosCiclistas}
            grabacion={grabacion}
            enSalida={salida.estado === 'dentro'}
            rodilloControlado={hayErg}
            demo={usarDemo ? { vatios: demoVatios!, onCambiar: setDemoVatios } : null}
            entreno={
              entrenoActivo
                ? { ...entrenoActivo, segundos: grabacion.segundos, objetivoW, ftp: perfil.ftp, erg: hayErg }
                : null
            }
            onTerminar={() => void terminar()}
            onSalir={salirRecorrido}
          />
        </Suspense>
      )}
    </div>
  );
}
