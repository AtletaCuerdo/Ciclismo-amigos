import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Potenciometro, Pulsometro, RodilloFtms, SensorCsc } from './ble/dispositivos';
import type { RangoPotencia } from './ble/parsers';
import { bluetoothDisponible, type EventosSensor, type TipoLog } from './ble/SensorBle';
import { AjustesSensorCsc } from './components/AjustesSensorCsc';
import { Creditos } from './components/Creditos';
import { PanelStrava } from './components/Strava';
import { PanelFtp } from './components/PanelFtp';
import { procesarVueltaDeStrava } from './strava/strava';
import { useInstalar } from './instalar';
import { cargarFirebase, useUsuario } from './cuenta/cuenta';
import { Nube, desactivarEspejo } from './cuenta/sincronizar';
import { PantallaCuenta, type EstadoSync } from './components/PantallaCuenta';
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
import { desplegar, duracionTotal, potenciaEn, tramoEn, type Entrenamiento, type Tramo } from './entrenamientos/tipos';
import { cargarNombre, guardarNombre, useConectados, useSalida, type Ciclista } from './multijugador/useSalida';
import { cargarAjustes, guardarAjustes, potenciaEstimada } from './potenciaVirtual';
import {
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
import { FisicaVirtual, ahorroRebufo, equipoAvatar } from './recorrido/fisica';
import { mantenerPantallaEncendida, soltarPantalla } from './pantallaEncendida';
import { LONGITUD_VUELTA_M, pendiente as pendienteRuta } from './recorrido/perfil';

// El recorrido 3D y la vista previa del ciclista (Three.js) se descargan solo al usarlos
const VistaRecorrido = lazy(() => import('./components/VistaRecorrido'));
const VistaPreviaAvatar = lazy(() => import('./components/VistaPreviaAvatar'));

// ---------------------------------------------------------------------------
// Tipos del estado
// ---------------------------------------------------------------------------

type Fuente = 'ftms' | 'pm' | 'csc' | 'hr';
type NombreMetrica = 'potencia' | 'cadencia' | 'velocidad' | 'pulso';
type Pantalla = 'inicio' | 'avatar' | 'entrenamientos' | 'crear' | 'historial' | 'ajustes' | 'cuenta';

/** Momento del último cambio del perfil en este dispositivo (para saber cuál es más reciente). */
const CLAVE_PERFIL_T = 'rodillos.perfil.t';
const leerPerfilT = () => {
  try {
    return Number(localStorage.getItem(CLAVE_PERFIL_T)) || 0;
  } catch {
    return 0;
  }
};
const guardarPerfilT = (t: number) => {
  try {
    localStorage.setItem(CLAVE_PERFIL_T, String(t));
  } catch {
    // no es grave
  }
};

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
  /** Segundo de la grabación en el que empezó (se pueden encadenar varios en una sesión). */
  inicioS: number;
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

/** Mejor media de `ventana` segundos (para los tests de FTP). */
function mejorMedia(entreno: Entreno, ventana: number) {
  const p = entreno.muestras.map((m) => m.p ?? 0);
  let mejor = 0;
  let suma = 0;
  for (let i = 0; i < p.length; i++) {
    suma += p[i];
    if (i >= ventana) suma -= p[i - ventana];
    if (i >= ventana - 1) mejor = Math.max(mejor, suma / ventana);
  }
  return mejor;
}

type FtpSugerido = { w: number; texto: string };

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
  const [terminado, setTerminado] = useState<{
    entreno: Entreno;
    error: string | null;
    ftpSugerido?: FtpSugerido;
    nombreEntreno?: string;
  } | null>(null);
  // Mensaje al volver de la página de permisos de Strava
  const [avisoStrava, setAvisoStrava] = useState<string | null>(null);
  useEffect(() => {
    void procesarVueltaDeStrava().then((m) => {
      if (m) {
        setAvisoStrava(m);
        setPantalla('ajustes');
      }
    });
  }, []);
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
  // Con cuenta, los cambios del perfil se suben a la nube (agrupados: el FTP se teclea)
  const nubeRef = useRef<Nube | null>(null);
  const temporizadorPerfil = useRef<ReturnType<typeof setTimeout>>();
  const cambiarPerfil = (p: Perfil) => {
    setPerfilEstado(p);
    guardarPerfil(p);
    guardarPerfilT(Date.now());
    clearTimeout(temporizadorPerfil.current);
    temporizadorPerfil.current = setTimeout(() => void nubeRef.current?.subirPerfil(p).catch(() => {}), 1500);
  };

  // ---- Entrenamientos ----
  const [propios, setPropios] = useState<Entrenamiento[]>(cargarPropios);
  const cambiarPropios = (lista: Entrenamiento[]) => {
    setPropios(lista);
    guardarPropios(lista);
    void nubeRef.current?.subirPropios(lista).catch(() => {});
  };

  // ---- Cuenta de usuario y sincronización con la nube ----
  const { usuario, cargando: cargandoCuenta, refrescar: refrescarUsuario } = useUsuario();
  const [sync, setSync] = useState<EstadoSync>({ tipo: 'nada' });
  const perfilRef = useRef(perfil);
  perfilRef.current = perfil;
  const propiosRef = useRef(propios);
  propiosRef.current = propios;
  const sincronizar = async (uid: string) => {
    setSync({ tipo: 'sincronizando' });
    try {
      const { fb } = await cargarFirebase();
      const nube = new Nube(fb, uid);
      const r = await nube.sincronizar({ perfil: perfilRef.current, perfilT: leerPerfilT(), propios: propiosRef.current });
      if (r.perfil) {
        setPerfilEstado(r.perfil);
        guardarPerfil(r.perfil);
      }
      if (r.propios) {
        setPropios(r.propios);
        guardarPropios(r.propios);
      }
      if (r.historialCambiado || r.subidos) setVersionHistorial((v) => v + 1);
      nube.activarEspejo();
      nubeRef.current = nube;
      setSync({ tipo: 'ok', subidos: r.subidos, bajados: r.bajados, hora: Date.now() });
    } catch (e) {
      const codigo = String((e as { code?: string })?.code ?? e);
      setSync({
        tipo: 'error',
        texto: /permission/i.test(codigo) ? 'faltan las reglas nuevas de Firebase (Realtime Database → Reglas).' : String(e),
      });
    }
  };
  useEffect(() => {
    if (!usuario) {
      nubeRef.current = null;
      desactivarEspejo();
      setSync({ tipo: 'nada' });
      return;
    }
    void sincronizar(usuario.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.uid]);
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

  // ---- Punto del circuito ----
  // La grabación cuenta los metros rodados de verdad (TCX, Strava); el punto del circuito
  // puede ir adelantado para aparecer junto a un amigo que empezó antes.
  const [adelanto, setAdelanto] = useState(0);
  const distanciaRef = useRef(0);
  distanciaRef.current = Math.max(0, adelanto + grabacion.distanciaM);
  /** Coloca mi ciclista en el punto `s` del circuito (sin tocar lo grabado). */
  const ponerEnPunto = (s: number) => {
    const destino = Math.max(0, s);
    distanciaRef.current = destino;
    setAdelanto(destino - grabacion.distanciaM);
  };

  // La distancia se actualiza una vez por segundo; entre medias se estima con la velocidad
  // (hace falta precisión de metros para saber si vas a rueda)
  const marcaDistRef = useRef({ s: 0, t: 0 });
  const posicionAhora = () => {
    const m = marcaDistRef.current;
    if (m.s !== distanciaRef.current) {
      m.s = distanciaRef.current;
      m.t = performance.now();
      return m.s;
    }
    return m.s + (velVirtualRef.current / 3.6) * Math.min(1.5, (performance.now() - m.t) / 1000);
  };

  // ---- Salida en grupo (multijugador con Firebase) ----
  const salida = useSalida(
    () => ({
      vatios: actualRef.current.potencia,
      velocidad: leerActual().velocidad,
      cadencia: actualRef.current.cadencia,
      distancia: enRecorridoRef.current ? posicionAhora() : distanciaRef.current,
    }),
    perfil.avatar,
  );

  // ---- Objetivo del entrenamiento guiado (W) ----
  const objetivoPct = entrenoActivo ? potenciaEn(entrenoActivo.tramos, grabacion.segundos - entrenoActivo.inicioS) : undefined;
  const objetivoW = objetivoPct !== undefined ? Math.round((objetivoPct * perfil.ftp) / 100) : undefined;
  const objetivoRef = useRef<number | undefined>(undefined);
  objetivoRef.current = objetivoW;
  const entrenoActivoRef = useRef<EntrenoActivo | null>(null);
  entrenoActivoRef.current = entrenoActivo;
  const segundosRef = useRef(0);
  segundosRef.current = grabacion.segundos;

  // ---- Física del recorrido y control del rodillo (10 veces por segundo) ----
  const corriendoRef = useRef(false);
  corriendoRef.current = grabacion.corriendo;
  const pesoRef = useRef(perfil.pesoKg);
  pesoRef.current = perfil.pesoKg;
  // Aerodinámica y peso de la bici según el equipo elegido (bici, casco y ruedas)
  const equipoRef = useRef(equipoAvatar(perfil.avatar));
  equipoRef.current = equipoAvatar(perfil.avatar);
  // Rebufo: los demás ciclistas y la hora del servidor, para saber a qué distancia van ahora
  const otrosRef = useRef<Ciclista[]>([]);
  otrosRef.current = salida.ciclistas.filter((c) => c.uid !== salida.miUid);
  const desfaseRef = useRef(0);
  desfaseRef.current = salida.desfaseServidor;
  /** Ahorro de aire actual por ir a rueda (0 … 0,3) y segundos acumulados a rueda. */
  const rebufoRef = useRef(0);
  const segundosRuedaRef = useRef(0);
  useEffect(() => {
    if (!enRecorrido) return;
    rebufoRef.current = 0;
    segundosRuedaRef.current = 0;
    let anterior = performance.now();
    let rebufoEnviado = 0;
    let pendienteEnviada: number | null = null;
    let potenciaEnviada: number | null = null;
    let ultimoEnvio = 0;
    const id = setInterval(() => {
      const t = performance.now();
      const dt = Math.min(0.5, (t - anterior) / 1000);
      anterior = t;
      const f = fisicaRef.current;
      f.masaKg = pesoRef.current + equipoRef.current.pesoBiciKg;
      // ¿Voy a rueda de alguien? Se estima dónde está cada uno ahora mismo
      let objetivoRebufo = 0;
      if (corriendoRef.current && f.v > 2) {
        const yo = posicionAhora();
        const ahoraSrv = Date.now() + desfaseRef.current;
        const huecos = otrosRef.current
          .filter((c) => (c.velocidad ?? 0) > 7)
          .map((c) => {
            const edad = Math.min(2, Math.max(0, (ahoraSrv - c.t) / 1000));
            const pos = (c.distancia ?? 0) + ((c.velocidad ?? 0) / 3.6) * edad;
            // En el mismo punto del circuito aunque vaya una vuelta por delante o por detrás
            let h = (pos - yo) % LONGITUD_VUELTA_M;
            if (h > LONGITUD_VUELTA_M / 2) h -= LONGITUD_VUELTA_M;
            if (h < -LONGITUD_VUELTA_M / 2) h += LONGITUD_VUELTA_M;
            return h;
          });
        objetivoRebufo = ahorroRebufo(huecos);
      }
      // Suavizado: el rebufo entra y sale en ~1 s, sin parpadeos
      rebufoRef.current += (objetivoRebufo - rebufoRef.current) * Math.min(1, dt * 2);
      if (rebufoRef.current < 0.005) rebufoRef.current = 0;
      if (rebufoRef.current > 0.05) segundosRuedaRef.current += dt;
      f.cda = equipoRef.current.cda * (1 - rebufoRef.current);
      const grado = pendienteRuta(distanciaRef.current);
      // La pendiente del recorrido alimenta el desnivel acumulado de la grabación
      pendienteRef.current = grado;
      if (corriendoRef.current) f.actualizar(actualRef.current.potencia ?? 0, grado, dt);
      else f.detener();
      velVirtualRef.current = f.v * 3.6;

      const rodillo = sensores.ftms;
      if (!rodillo.tieneControl) return;
      const activo = entrenoActivoRef.current;
      const libre = activo ? tramoEn(activo.tramos, segundosRef.current - activo.inicioS)?.libre === true : false;
      if (activo && !libre) {
        // Entrenamiento guiado: modo ERG (potencia fija), como mucho un envío por segundo
        pendienteEnviada = null;
        const w = objetivoRef.current;
        if (w !== undefined && w !== potenciaEnviada && t - ultimoEnvio > 1000) {
          potenciaEnviada = w;
          ultimoEnvio = t;
          void rodillo.fijarPotencia(w);
        }
      } else {
        // Rodar libre (o tramo «a tope» de un test): el rodillo se endurece con la pendiente
        // y se ablanda a rueda (cambios de 0,5 % o 5 % de aire, máx. cada 2 s)
        potenciaEnviada = null;
        const redondeada = Math.round(grado * 2) / 2;
        const rebufo = Math.round(rebufoRef.current * 20) / 20;
        if ((redondeada !== pendienteEnviada || rebufo !== rebufoEnviado) && t - ultimoEnvio > 2000) {
          pendienteEnviada = redondeada;
          rebufoEnviado = rebufo;
          ultimoEnvio = t;
          void rodillo.fijarPendiente(redondeada, rebufo);
        }
      }
    }, 100);
    return () => {
      clearInterval(id);
      pendienteRef.current = null;
      velVirtualRef.current = 0;
      rebufoRef.current = 0;
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

  // ---- Rodar con los amigos ----
  // Nombre con el que te ven (el guardado o, si no hay, el de la cuenta)
  const [nombreSalida, setNombreSalida] = useState(cargarNombre);
  const nombreVisible = nombreSalida.trim() || usuario?.nombre || '';
  // En el inicio se ve quién está rodando ahora mismo (sin unirse)
  const conectados = useConectados(pantalla === 'inicio' && !enRecorrido);

  // Estar en el recorrido = estar en la salida: así los amigos te ven siempre.
  // Al salir del recorrido se deja la salida y se vuelve al km 0 del circuito.
  useEffect(() => {
    if (enRecorrido && salida.estado === 'fuera' && nombreVisible) void salida.unirse(nombreVisible);
    if (!enRecorrido) {
      setAdelanto(0);
      if (salida.estado !== 'fuera') void salida.salir();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enRecorrido]);

  // Amigo junto al que aparecer al entrar (se elige en el inicio)
  const juntoARef = useRef<string | null>(null);
  useEffect(() => {
    const uid = juntoARef.current;
    if (!uid || !enRecorrido || salida.estado !== 'dentro' || !salida.miUid) return;
    // Esperar a que llegue la lista de la sala (incluye mi propio nodo)
    if (!salida.ciclistas.some((c) => c.uid === salida.miUid)) return;
    juntoARef.current = null;
    const amigo = salida.ciclistas.find((c) => c.uid === uid);
    if (amigo) ponerEnPunto(amigo.distancia ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enRecorrido, salida.estado, salida.ciclistas, salida.miUid]);

  /** Unirse a la salida desde el recorrido (si al entrar no había nombre o falló la conexión). */
  const unirseDesdeRecorrido = () => {
    let nombre = nombreVisible;
    if (!nombre) nombre = window.prompt('¿Con qué nombre te verán tus amigos?')?.trim().slice(0, 30) ?? '';
    if (!nombre) return;
    setNombreSalida(nombre);
    void salida.unirse(nombre);
  };

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
  // Lo hecho en la sesión actual: nombres de los entrenamientos (para el título en Strava)
  // y el último test (para proponer el FTP aunque después se siga rodando)
  const sesionRef = useRef<{ nombres: string[]; test?: Entrenamiento }>({ nombres: [] });
  const apuntarEnSesion = (e: Entrenamiento) => {
    sesionRef.current.nombres.push(e.nombre);
    if (e.estimaFtp || e.categoria === 'test') sesionRef.current.test = e;
  };

  const rodarLibre = () => {
    mantenerPantallaEncendida(); // dentro del clic: el navegador lo exige
    sesionRef.current = { nombres: [] };
    setEntrenoActivo(null);
    setTerminado(null);
    setEnRecorrido(true);
  };

  /** Rodar libre apareciendo junto a un amigo que ya está en el recorrido. */
  const rodarJuntoA = (uid: string) => {
    juntoARef.current = uid;
    rodarLibre();
  };

  const empezarEntreno = (e: Entrenamiento) => {
    const tramos = desplegar(e.bloques);
    mantenerPantallaEncendida();
    sesionRef.current = { nombres: [] };
    apuntarEnSesion(e);
    setEntrenoActivo({ entreno: e, tramos, total: duracionTotal(tramos), inicioS: 0 });
    setTerminado(null);
    setEnRecorrido(true);
  };

  /** Otro entrenamiento dentro de la misma sesión (todo acaba en una sola actividad). */
  const encadenarEntreno = (e: Entrenamiento) => {
    const tramos = desplegar(e.bloques);
    apuntarEnSesion(e);
    setEntrenoActivo({ entreno: e, tramos, total: duracionTotal(tramos), inicioS: grabacion.segundos });
  };

  /** Al acabar un entrenamiento, seguir rodando libre (el rodillo vuelve a seguir la pendiente). */
  const seguirLibre = () => setEntrenoActivo(null);

  /** Guarda la sesión y vuelve al inicio con el resumen. */
  const terminar = async () => {
    const activo = entrenoActivo;
    const sesion = sesionRef.current;
    sesionRef.current = { nombres: [] };
    const entreno = grabacion.finalizar();
    soltarPantalla();
    setEnRecorrido(false);
    setEntrenoActivo(null);
    setPantalla('inicio');
    if (!entreno) return;
    // Los tests creados por el usuario usan el cálculo del test de rampa
    const test = activo?.entreno.categoria === 'test' || activo?.entreno.estimaFtp ? activo.entreno : sesion.test;
    const est =
      test?.estimaFtp ??
      (test?.categoria === 'test' ? { ventanaS: 60, factor: 0.75, texto: '75 % de tu mejor minuto' } : undefined);
    const w = est ? Math.round(mejorMedia(entreno, est.ventanaS) * est.factor) : 0;
    const ftpSugerido = est && w > 0 ? { w, texto: est.texto } : undefined;
    const nombreEntreno = sesion.nombres.length ? [...new Set(sesion.nombres)].join(' + ') : undefined;
    setTerminado({ entreno, error: null, ftpSugerido, nombreEntreno });
    try {
      await guardarEntreno(entreno);
      setVersionHistorial((v) => v + 1);
    } catch (e) {
      setTerminado({ entreno, error: e instanceof Error ? e.message : String(e), ftpSugerido, nombreEntreno });
    }
  };

  /** Sale del recorrido; si hay algo grabado, pregunta antes de descartarlo. */
  const salirRecorrido = () => {
    if (grabacion.hayDatos && !window.confirm('¿Salir sin guardar? Se perderá lo que llevas grabado.')) return;
    grabacion.descartar();
    soltarPantalla();
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
  const instalacion = useInstalar();

  return (
    <div className="app">
      <header className="barra-superior">
        <button className="marca" onClick={volver}>
          <span className="marca-icono" aria-hidden>🚴</span> RideCrew
        </button>
        <div className="barra-acciones">
          <button
            className={`boton-secundario boton-cuenta ${usuario ? 'con-sesion' : ''}`}
            onClick={() => setPantalla('cuenta')}
            title={usuario ? `Sesión iniciada: ${usuario.email}` : 'Entra o crea tu cuenta'}
          >
            👤 {usuario ? usuario.nombre.split(' ')[0] : 'Entrar'}
          </button>
          {instalacion.disponible && (
            <button
              className="boton-secundario boton-instalar"
              onClick={() => void instalacion.instalar()}
              title="Crea un acceso directo en el escritorio y abre RideCrew en su propia ventana"
            >
              ⬇️ Instalar RideCrew
            </button>
          )}
          <button className="boton-secundario" onClick={() => setPantalla('ajustes')}>
            ⚙️ Ajustes
          </button>
        </div>
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
              nombreEntreno={terminado.nombreEntreno}
              onAceptarFtp={(w) => cambiarPerfil({ ...perfil, ftp: w })}
              onCerrar={() => setTerminado(null)}
            />
          )}

          {!cargandoCuenta && !usuario && (
            <section className="aviso-cuenta">
              <span>
                <strong>Crea tu cuenta gratis</strong> y tendrás tu historial, tu ciclista y tu FTP en todos tus dispositivos.
              </span>
              <button className="boton-principal" onClick={() => setPantalla('cuenta')}>
                Entrar o crear cuenta
              </button>
            </section>
          )}
          <section className="inicio-cabecera">
            <div className="tarjeta-ciclista">
              <Suspense fallback={<div className="vista-previa-avatar pequena cargando">Cargando…</div>}>
                {/* Mientras se rueda no se dibuja: serían dos escenas 3D a la vez (en iPad no hay memoria) */}
                {enRecorrido ? (
                  <div className="vista-previa-avatar pequena" />
                ) : (
                  <VistaPreviaAvatar avatar={perfil.avatar} className="pequena" />
                )}
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

          <PanelSalida
            conectados={conectados.ciclistas}
            error={conectados.error}
            nombre={nombreVisible}
            onCambiarNombre={(n) => {
              guardarNombre(n);
              setNombreSalida(n);
            }}
            onRodarJunto={rodarJuntoA}
          />

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
          ftp={perfil.ftp}
          onGuardar={cambiarPropios}
          onProbar={empezarEntreno}
          onVolver={volver}
        />
      )}

      {pantalla === 'cuenta' && (
        <PantallaCuenta
          usuario={usuario}
          cargando={cargandoCuenta}
          sync={sync}
          onRefrescar={() => {
            void refrescarUsuario();
            if (usuario) void sincronizar(usuario.uid);
          }}
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
          {avisoStrava && (
            <div className="aviso aviso-strava" onClick={() => setAvisoStrava(null)}>
              {avisoStrava}
            </div>
          )}
          <PanelFtp perfil={perfil} onCambiar={cambiarPerfil} />
          <PanelStrava />
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
          <Creditos />
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
              rebufo: rebufoRef.current,
              segundosRueda: segundosRuedaRef.current,
            })}
            otros={otrosCiclistas}
            grabacion={grabacion}
            enSalida={salida.estado === 'dentro'}
            entrandoSalida={salida.estado === 'entrando'}
            errorSalida={salida.error}
            onUnirseSalida={unirseDesdeRecorrido}
            onJuntoA={ponerEnPunto}
            chat={{
              mensajes: salida.mensajes,
              miUid: salida.miUid,
              rechazado: salida.chatRechazado,
              onEnviar: salida.enviarMensaje,
            }}
            rodilloControlado={hayErg}
            demo={usarDemo ? { vatios: demoVatios!, onCambiar: setDemoVatios } : null}
            entreno={
              entrenoActivo
                ? {
                    ...entrenoActivo,
                    segundos: grabacion.segundos - entrenoActivo.inicioS,
                    objetivoW,
                    ftp: perfil.ftp,
                    erg: hayErg,
                  }
                : null
            }
            entrenamientos={todosLosEntrenos}
            onOtroEntreno={encadenarEntreno}
            onSeguirLibre={seguirLibre}
            onTerminar={() => void terminar()}
            onSalir={salirRecorrido}
          />
        </Suspense>
      )}
    </div>
  );
}
