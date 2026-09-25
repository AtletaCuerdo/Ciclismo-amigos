import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Potenciometro, Pulsometro, RodilloFtms, SensorCsc } from './ble/dispositivos';
import type { RangoPotencia } from './ble/parsers';
import { bluetoothDisponible, type EventosSensor, type TipoLog } from './ble/SensorBle';
import { AjustesSensorCsc } from './components/AjustesSensorCsc';
import { ControlesRodillo } from './components/ControlesRodillo';
import { EditorAvatar } from './components/EditorAvatar';
import { Historial } from './components/Historial';
import { Metrica, formatearTiempo } from './components/Metrica';
import { PanelSalida } from './components/PanelSalida';
import { useSalida } from './multijugador/useSalida';
import { RegistroLog, type EntradaLog } from './components/RegistroLog';
import { ResumenEntreno } from './components/ResumenEntreno';
import { TarjetaConexion, type InfoConexion } from './components/TarjetaConexion';
import { guardarEntreno } from './entrenamiento/almacen';
import type { Entreno } from './entrenamiento/tipos';
import { useGrabacion, type ValoresActuales } from './entrenamiento/useGrabacion';
import { cargarAjustes, guardarAjustes, potenciaEstimada } from './potenciaVirtual';
import { PESO_BICI_KG, avatarAleatorio, cargarPerfil, guardarPerfil, type Avatar, type Perfil } from './recorrido/avatar';
import type { OtroCiclista } from './recorrido/escena';
import { FisicaVirtual } from './recorrido/fisica';
import { pendiente as pendienteRuta } from './recorrido/perfil';

// El recorrido 3D (Three.js) se descarga solo al entrar en él
const VistaRecorrido = lazy(() => import('./components/VistaRecorrido'));

// ---------------------------------------------------------------------------
// Tipos del estado
// ---------------------------------------------------------------------------

type Fuente = 'ftms' | 'pm' | 'csc' | 'hr';
type NombreMetrica = 'potencia' | 'cadencia' | 'velocidad' | 'pulso';

/** Un valor con la hora a la que llegó, para descartar datos viejos. */
interface Lectura {
  v: number;
  t: number;
}
type Datos = Record<Fuente, Partial<Record<NombreMetrica, Lectura>>>;

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

export default function App() {
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
  // Vatios simulados para probar el recorrido sin rodillo (null = desactivado)
  const [demoVatios, setDemoVatios] = useState<number | null>(null);
  // Último entrenamiento finalizado (se muestra su resumen) y si falló al guardarse
  const [terminado, setTerminado] = useState<{ entreno: Entreno; error: string | null } | null>(null);
  const [versionHistorial, setVersionHistorial] = useState(0);
  // Pendiente simulada aceptada por el rodillo (null = no hay modo pendiente activo)
  const pendienteRef = useRef<number | null>(null);

  // ---- Perfil del ciclista (avatar y peso) ----
  const [perfil, setPerfilEstado] = useState<Perfil>(cargarPerfil);
  const cambiarPerfil = (p: Perfil) => {
    setPerfilEstado(p);
    guardarPerfil(p);
  };

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

  // ---- Grabación del entrenamiento (1 muestra por segundo) ----
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

  // ---- Física del recorrido (10 veces por segundo) ----
  const corriendoRef = useRef(false);
  corriendoRef.current = grabacion.corriendo;
  const pesoRef = useRef(perfil.pesoKg);
  pesoRef.current = perfil.pesoKg;
  useEffect(() => {
    if (!enRecorrido) return;
    let anterior = performance.now();
    let pendienteEnviada: number | null = null;
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

      // Rodillo inteligente: que se endurezca con la pendiente
      // (solo cambios de 0,5 % y como mucho un envío cada 2 s)
      const rodillo = sensores.ftms;
      const redondeada = Math.round(grado * 2) / 2;
      if (rodillo.tieneControl && redondeada !== pendienteEnviada && t - ultimoEnvio > 2000) {
        pendienteEnviada = redondeada;
        ultimoEnvio = t;
        void rodillo.fijarPendiente(redondeada);
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

  // Sin rodillo conectado no hay pendiente simulada
  useEffect(() => {
    if (conexiones.ftms.estado !== 'conectado') pendienteRef.current = null;
  }, [conexiones.ftms.estado]);

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

  const finalizar = async () => {
    const entreno = grabacion.finalizar();
    if (!entreno) return;
    setTerminado({ entreno, error: null });
    try {
      await guardarEntreno(entreno);
      setVersionHistorial((v) => v + 1);
    } catch (e) {
      setTerminado({ entreno, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const descartar = () => {
    if (window.confirm('¿Descartar el entrenamiento en curso? Se perderán sus datos.')) grabacion.descartar();
  };

  // ---- Avisos de compatibilidad ----
  const sinBluetooth = !bluetoothDisponible();
  const sinHttps = typeof window !== 'undefined' && !window.isSecureContext;

  const tarjetas: { fuente: Fuente; titulo: string; detalle: string }[] = [
    { fuente: 'ftms', titulo: 'Rodillo FTMS', detalle: 'Rodillo inteligente · servicio 0x1826' },
    { fuente: 'pm', titulo: 'Potenciómetro', detalle: 'Cycling Power · servicio 0x1818' },
    { fuente: 'csc', titulo: 'Sensor velocidad/cadencia', detalle: 'CSC · servicio 0x1816' },
    { fuente: 'hr', titulo: 'Pulsómetro', detalle: 'Heart Rate · servicio 0x180D' },
  ];

  return (
    <div className="app">
      <header className="cabecera">
        <h1>Prueba de rodillos</h1>
      </header>

      {(sinBluetooth || sinHttps) && (
        <div className="banner-error">
          {sinHttps
            ? 'Web Bluetooth necesita que la página se abra por HTTPS (o desde localhost).'
            : 'Este navegador no soporta Web Bluetooth. Usa Chrome en PC/Mac/Android o Bluefy en iPad/iPhone.'}
        </div>
      )}

      {/* ---- Conexión ---- */}
      <section className="rejilla-conexion">
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
      </section>

      {/* ---- Panel en directo ---- */}
      <section className="panel">
        <div className="cabecera-panel">
          <h2>En directo</h2>
          <div className="botones-sesion">
            <button
              className="boton-principal"
              onClick={grabacion.corriendo ? grabacion.pausar : grabacion.iniciar}
            >
              {grabacion.corriendo ? 'Pausar' : grabacion.hayDatos ? 'Continuar' : 'Iniciar'}
            </button>
            <button className="boton-principal boton-finalizar" onClick={() => void finalizar()} disabled={!grabacion.hayDatos}>
              Finalizar
            </button>
            <button className="boton-secundario" onClick={descartar} disabled={!grabacion.hayDatos}>
              Descartar
            </button>
          </div>
        </div>
        <div className="rejilla-metricas">
          <Metrica
            etiqueta="Vatios"
            valor={potencia.valor}
            unidad="W"
            fuente={potencia.valor !== undefined ? potencia.fuente : undefined}
            estimada={esEstimada}
            destacada
          />
          <Metrica etiqueta="Cadencia" valor={cadencia.valor} unidad="rpm" fuente={cadencia.fuente} />
          <Metrica etiqueta="Velocidad" valor={velocidad.valor} unidad="km/h" decimales={1} fuente={velocidad.fuente} />
          <Metrica etiqueta="Pulso" valor={pulso.valor} unidad="ppm" fuente={pulso.fuente} />
          <Metrica etiqueta="Vatios medios" valor={grabacion.potenciaMedia} unidad="W" />
          <Metrica etiqueta="Velocidad media" valor={grabacion.velocidadMedia} unidad="km/h" decimales={1} />
          <div className="metrica">
            <div className="metrica-etiqueta">Tiempo</div>
            <div className="metrica-valor">{formatearTiempo(grabacion.segundos)}</div>
            <div className="metrica-fuente">
              {grabacion.corriendo ? '● Grabando' : grabacion.hayDatos ? 'En pausa' : 'Parado'}
            </div>
          </div>
          <Metrica etiqueta="Distancia" valor={grabacion.distanciaM / 1000} unidad="km" decimales={2} />
          {grabacion.desnivelM > 0 && (
            <Metrica etiqueta="Desnivel +" valor={grabacion.desnivelM} unidad="m" fuente="Pendiente simulada" />
          )}
          {/* Si hay potencia real y también sensor de velocidad, mostramos la estimada para comparar */}
          {potReal.valor !== undefined && potEstimada !== undefined && (
            <Metrica etiqueta="Vatios" valor={potEstimada} unidad="W" fuente="Sensor velocidad" estimada />
          )}
        </div>
      </section>

      {/* ---- Recorrido virtual ---- */}
      <section className="panel panel-recorrido">
        <div>
          <h2>Recorrido virtual</h2>
          <p className="detalle">
            Vuelta de 17 km con 150 m de desnivel, en 3D. La velocidad sale de tus vatios, tu peso y la
            pendiente{conexiones.ftms.estado === 'conectado' ? ', y tu rodillo se endurecerá en las subidas' : ''}.
          </p>
        </div>
        <div className="acciones-recorrido">
          <label className="casilla-demo">
            <input
              type="checkbox"
              checked={demoVatios !== null}
              onChange={(e) => setDemoVatios(e.target.checked ? 180 : null)}
            />
            Modo demostración (simular vatios sin rodillo)
          </label>
          <button className="boton-principal" onClick={() => setEnRecorrido(true)}>
            Entrar al recorrido
          </button>
        </div>
      </section>

      <EditorAvatar perfil={perfil} onCambiar={cambiarPerfil} avatarRechazado={salida.avatarRechazado} />

      {/* ---- Salida en grupo ---- */}
      <PanelSalida
        estado={salida.estado}
        error={salida.error}
        ciclistas={salida.ciclistas}
        miUid={salida.miUid}
        grabando={grabacion.corriendo}
        onUnirse={(nombre) => void salida.unirse(nombre)}
        onSalir={() => void salida.salir()}
      />

      {/* ---- Controles de prueba (solo con rodillo FTMS) ---- */}
      {conexiones.ftms.estado === 'conectado' && (
        <ControlesRodillo
          rodillo={sensores.ftms}
          rango={rango}
          onModo={(p) => (pendienteRef.current = p)}
        />
      )}

      {/* ---- Resumen del entrenamiento recién terminado ---- */}
      {terminado && (
        <ResumenEntreno
          entreno={terminado.entreno}
          errorGuardado={terminado.error}
          onCerrar={() => setTerminado(null)}
        />
      )}

      {/* ---- Ajustes CSC ---- */}
      <AjustesSensorCsc ajustes={ajustes} onCambiar={setAjustes} />

      <Historial version={versionHistorial} />

      <RegistroLog entradas={log} onLimpiar={() => setLog([])} />

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
            leerYo={() => ({
              distancia: distanciaRef.current,
              velocidad: velVirtualRef.current,
              cadencia: actualRef.current.cadencia ?? 0,
              potencia: actualRef.current.potencia,
              potenciaEstimada: actualRef.current.potenciaEsEstimada,
              pulso: actualRef.current.pulso,
            })}
            otros={otrosCiclistas}
            grabacion={grabacion}
            enSalida={salida.estado === 'dentro'}
            rodilloControlado={sensores.ftms.tieneControl}
            demo={usarDemo ? { vatios: demoVatios!, onCambiar: setDemoVatios } : null}
            onSalir={() => setEnRecorrido(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
