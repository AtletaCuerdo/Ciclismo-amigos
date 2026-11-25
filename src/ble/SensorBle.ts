/**
 * Clase base para cualquier dispositivo Bluetooth LE de la app.
 * Se encarga de:
 *  - pedir el dispositivo al usuario (requestDevice),
 *  - conectar y dejar que la subclase configure sus características,
 *  - reintentar la conexión automáticamente si se cae,
 *  - serializar las operaciones GATT (Bluetooth no admite dos a la vez),
 *  - recordar el último aparato usado (su nombre) para volver a conectarlo con un toque
 *    o, donde el navegador lo permite (getDevices), sin preguntar.
 */

export type EstadoConexion = 'desconectado' | 'conectando' | 'conectado' | 'reconectando';
export type TipoLog = 'info' | 'ok' | 'error';

export interface EventosSensor {
  onEstado: (estado: EstadoConexion, nombreDispositivo?: string) => void;
  onError: (mensaje: string | null) => void;
  onLog: (texto: string, tipo: TipoLog) => void;
}

const MAX_INTENTOS = 10;
/** Intentos al conectar por primera vez (el primero a veces falla en Bluefy y Android). */
const INTENTOS_PRIMERA = 3;

/**
 * Las conexiones de todos los sensores van de una en una: si el rodillo y el pulsómetro se
 * conectan a la vez (al abrir la web), Bluefy y algunos Android fallan los dos con «Error (2)».
 */
let colaConexiones: Promise<unknown> = Promise.resolve();
function enTurno<T>(fn: () => Promise<T>): Promise<T> {
  const r = colaConexiones.then(fn, fn);
  colaConexiones = r.catch(() => undefined);
  return r;
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ESPERA_MAXIMA_MS = 15000;

/** Traduce los errores de Web Bluetooth a mensajes comprensibles. */
export function mensajeError(e: unknown): string {
  if (e instanceof DOMException || e instanceof Error) {
    switch (e.name) {
      case 'NotFoundError':
        return /cancel/i.test(e.message)
          ? 'Selección cancelada.'
          : 'No se encontró ningún dispositivo compatible. ¿Está encendido y cerca?';
      case 'SecurityError':
        return 'Bluetooth bloqueado: la página debe abrirse por HTTPS (o localhost).';
      case 'NetworkError':
        return 'Fallo de conexión Bluetooth. Acerca el dispositivo y comprueba que no esté conectado a otra app (Zwift, Garmin…).';
      case 'NotSupportedError':
        return 'El dispositivo no ofrece el servicio o la característica necesaria.';
      case 'NotAllowedError':
        return 'Permiso de Bluetooth denegado por el navegador o el sistema.';
      default:
        return e.message || e.name;
    }
  }
  // Algunos navegadores (Bluefy) rechazan con un número o un texto suelto, p. ej. «2»
  return `Error de Bluetooth (${String(e)}). Vuelve a tocar el botón. Si sigue: cierra del todo Bluefy y las otras apps que lo usen (Zwift, Wahoo, Elite…), apaga y enciende el Bluetooth del iPhone/iPad, pedalea para despertar el rodillo y prueba otra vez.`;
}

/**
 * Error «nativo» de Bluefy (un número o un texto suelto en lugar de un error de Web Bluetooth), p. ej.
 * «2»: suele ser una conexión vieja que iOS da por buena pero ya no sirve. Hay que soltarla del todo
 * antes de volver a intentarlo.
 */
function esErrorNativo(e: unknown) {
  return !(e instanceof DOMException || e instanceof Error);
}

/** iPhone o iPad (Bluefy): ahí la reconexión sin tocar nada deja conexiones viejas colgadas. */
export function esIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Código completo de un servicio o característica: «0x1826» → «00001826-0000-1000-8000-00805f9b34fb».
 * Bluefy (iPhone/iPad) rechaza con «Error (2)» los códigos cortos en número; con el código completo
 * en texto funciona (es la forma estándar y la aceptan todos los navegadores).
 */
export function uuidCompleto(u: BluetoothServiceUUID | BluetoothCharacteristicUUID): string {
  if (typeof u === 'number') return `${u.toString(16).padStart(8, '0')}-0000-1000-8000-00805f9b34fb`;
  return /^[0-9a-f]{4}$/i.test(u) ? `0000${u.toLowerCase()}-0000-1000-8000-00805f9b34fb` : u.toLowerCase();
}

/** Opciones de búsqueda con todos los códigos completos (para Bluefy). */
function opcionesCompletas(o: RequestDeviceOptions): RequestDeviceOptions {
  const x = o as RequestDeviceOptions & { filters?: BluetoothLEScanFilter[]; optionalServices?: BluetoothServiceUUID[] };
  return {
    ...x,
    ...(x.filters ? { filters: x.filters.map((f) => (f.services ? { ...f, services: f.services.map(uuidCompleto) } : f)) } : {}),
    ...(x.optionalServices ? { optionalServices: x.optionalServices.map(uuidCompleto) } : {}),
  } as RequestDeviceOptions;
}

/**
 * En iOS, el servidor GATT envuelto para que los servicios y características se pidan siempre con el
 * código completo (el resto del código sigue usando los números cortos).
 */
function servidorConCodigosCompletos(server: BluetoothRemoteGATTServer): BluetoothRemoteGATTServer {
  const servicio = (sv: BluetoothRemoteGATTService) =>
    new Proxy(sv, {
      get(t, p) {
        if (p === 'getCharacteristic') return (u: BluetoothCharacteristicUUID) => t.getCharacteristic(uuidCompleto(u));
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  return new Proxy(server, {
    get(t, p) {
      if (p === 'getPrimaryService')
        return async (u: BluetoothServiceUUID) => servicio(await t.getPrimaryService(uuidCompleto(u)));
      const v = Reflect.get(t, p, t);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

/**
 * Busca el aparato. En iOS (Bluefy): con los códigos completos y, si rechaza con un número (estado del
 * Bluetooth de iOS, p. ej. 2 = aún no listo), se reintenta un par de veces y, al final, sin los servicios
 * opcionales.
 */
async function buscar(opciones: RequestDeviceOptions): Promise<BluetoothDevice> {
  if (!esIos()) return navigator.bluetooth.requestDevice(opciones);
  const completas = opcionesCompletas(opciones);
  for (let i = 0; ; i++) {
    try {
      const { optionalServices: _sinOpcionales, ...sinOpcionales } = completas as RequestDeviceOptions & { optionalServices?: unknown };
      const o = i < 2 ? completas : sinOpcionales;
      return await navigator.bluetooth.requestDevice(o as RequestDeviceOptions);
    } catch (e) {
      if (!esErrorNativo(e) || i >= 2) throw e;
      await esperar(1200);
    }
  }
}

/** Suelta la conexión GATT (aunque el navegador diga que no está conectada) y espera a que iOS la cierre. */
async function soltar(device: BluetoothDevice, ms = 800) {
  try {
    device.gatt?.disconnect();
  } catch {
    // ya estaba suelta
  }
  await esperar(ms);
}

export function esCancelacion(e: unknown) {
  return e instanceof Error && e.name === 'NotFoundError' && /cancel/i.test(e.message);
}

export function bluetoothDisponible(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export abstract class SensorBle {
  estado: EstadoConexion = 'desconectado';
  protected device: BluetoothDevice | null = null;
  private desconexionManual = false;
  private intentos = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private cola: Promise<unknown> = Promise.resolve();
  private escuchas = new Map<BluetoothRemoteGATTCharacteristic, (e: Event) => void>();

  constructor(
    readonly etiqueta: string,
    protected readonly servicio: number,
    protected readonly eventos: EventosSensor,
  ) {}

  /** La subclase obtiene el servicio y se suscribe a sus características. */
  protected abstract configurar(server: BluetoothRemoteGATTServer): Promise<void>;

  /** Qué dispositivos ofrece el navegador al buscar (por defecto, los que tienen el servicio). */
  protected opcionesBusqueda(): RequestDeviceOptions {
    return { filters: [{ services: [this.servicio] }] };
  }

  /** Nombre del último aparato conectado de este tipo (se guarda en el navegador). */
  get recordado(): string | null {
    try {
      return localStorage.getItem(`rodillos.aparato.${this.servicio}`);
    } catch {
      return null;
    }
  }

  private recordar(nombre: string | undefined) {
    if (!nombre) return;
    try {
      localStorage.setItem(`rodillos.aparato.${this.servicio}`, nombre);
    } catch {
      // sin almacenamiento: no pasa nada
    }
  }

  /**
   * Búsqueda que solo muestra el aparato recordado: los mismos filtros que la normal, cada uno
   * con el nombre añadido. (Solo con el nombre, sin servicio, Bluefy en el iPad no encuentra nada:
   * en iOS hay que buscar por servicio.)
   */
  private busquedaRecordado(nombre: string): RequestDeviceOptions {
    const normal = this.opcionesBusqueda() as RequestDeviceOptions & { filters?: BluetoothLEScanFilter[] };
    const servicios = new Set<BluetoothServiceUUID>([this.servicio, ...(normal.optionalServices ?? [])]);
    for (const f of normal.filters ?? []) for (const sv of f.services ?? []) servicios.add(sv);
    const filtros = normal.filters?.length ? normal.filters : [{ services: [this.servicio] }];
    // (sin «namePrefix»: junto con el nombre exacto sobra y algún navegador lo lleva mal)
    const conNombre = filtros
      .filter((f) => f.services?.length)
      .map((f) => ({ services: f.services, name: nombre }));
    return {
      filters: conNombre.length ? conNombre : [{ services: [this.servicio], name: nombre }],
      optionalServices: [...servicios],
    };
  }

  /**
   * Vuelve a conectar el aparato recordado sin preguntar, si el navegador lo permite
   * (Chrome con getDevices). Devuelve false si no se puede: entonces hace falta un toque.
   */
  async reconectarRecordado(): Promise<boolean> {
    const nombre = this.recordado;
    const bt = bluetoothDisponible()
      ? (navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> })
      : null;
    // En iPhone/iPad no: Bluefy devuelve aparatos de la visita anterior que fallan con «Error (2)» y lo
    // dejan medio cogido (se conecta con el botón del aparato recordado, un toque)
    if (esIos() || !nombre || !bt?.getDevices || this.conectado || this.estado === 'conectando') return false;
    try {
      const device = (await bt.getDevices()).find((d) => d.name === nombre);
      if (!device) return false;
      await this.usar(device, true);
      return this.conectado;
    } catch {
      return false;
    }
  }

  /** Se llama en cada desconexión (manual o no) para limpiar estado interno. */
  protected alDesconectar(): void {}

  get conectado() {
    return this.estado === 'conectado' && !!this.device?.gatt?.connected;
  }

  /**
   * Debe llamarse directamente desde el manejador de un clic:
   * requestDevice exige un gesto del usuario y por eso es lo primero que se hace.
   */
  /**
   * Lista con todos los aparatos Bluetooth cercanos (para los que no anuncian bien su servicio):
   * se pide acceso a todos los servicios que podría usar este sensor.
   */
  private busquedaTodos(): RequestDeviceOptions {
    const normal = this.opcionesBusqueda() as RequestDeviceOptions & { filters?: BluetoothLEScanFilter[] };
    const servicios = new Set<BluetoothServiceUUID>([this.servicio, ...(normal.optionalServices ?? [])]);
    for (const f of normal.filters ?? []) for (const sv of f.services ?? []) servicios.add(sv);
    return { acceptAllDevices: true, optionalServices: [...servicios] };
  }

  async conectar(soloRecordado = false, todos = false): Promise<void> {
    if (!bluetoothDisponible()) {
      this.eventos.onError('Este navegador no soporta Web Bluetooth.');
      return;
    }
    let device: BluetoothDevice;
    const nombre = soloRecordado ? this.recordado : null;
    try {
      try {
        device = await buscar(
          todos ? this.busquedaTodos() : nombre ? this.busquedaRecordado(nombre) : this.opcionesBusqueda(),
        );
      } catch (e) {
        // Si la búsqueda del aparato recordado falla (no por cancelar), se ofrece la lista normal
        if (!nombre || esCancelacion(e)) throw e;
        this.eventos.onLog(
          `${this.etiqueta}: búsqueda rápida fallida (${mensajeError(e)}), abro la lista normal`,
          'info',
        );
        device = await buscar(this.opcionesBusqueda());
      }
    } catch (e) {
      if (esCancelacion(e)) {
        this.eventos.onLog(`${this.etiqueta}: selección cancelada`, 'info');
      } else {
        this.eventos.onError(mensajeError(e));
        this.eventos.onLog(`${this.etiqueta}: ${mensajeError(e)}`, 'error');
      }
      return;
    }
    await this.usar(device, false);
  }

  /** Se queda con este aparato y lo conecta (en silencio si `silencioso`: sin mensajes de error). */
  private async usar(device: BluetoothDevice, silencioso: boolean) {
    // Si ya había un dispositivo (el mismo u otro), lo soltamos sin reintentos.
    this.cancelarReintento();
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.manejarDesconexion);
      if (this.device !== device && this.device.gatt?.connected) this.device.gatt.disconnect();
      this.alDesconectar();
    }

    this.device = device;
    this.desconexionManual = false;
    this.intentos = 0;
    device.addEventListener('gattserverdisconnected', this.manejarDesconexion);

    this.eventos.onError(null);
    this.cambiarEstado('conectando');
    // Si iOS cree que sigue conectado (de antes de recargar la web), se suelta primero: si no, la
    // conexión «vieja» responde con «Error (2)» a todo
    if (device.gatt?.connected) await soltar(device);
    try {
      // Por turnos con los demás sensores y, si falla, se reintenta un par de veces
      for (let i = 1; ; i++) {
        try {
          await enTurno(() => this.establecer());
          break;
        } catch (e) {
          if (i >= INTENTOS_PRIMERA || this.device !== device || esCancelacion(e)) throw e;
          this.eventos.onLog(
            `${this.etiqueta}: no conectó a la primera (${mensajeError(e)}), lo intento otra vez…`,
            'info',
          );
          // Error nativo de Bluefy: soltar la conexión del todo antes de reintentar
          if (esErrorNativo(e)) await soltar(device, 1500 * i);
          else await esperar(1500 * i);
          if (this.device !== device) throw e;
        }
      }
    } catch (e) {
      const msg = mensajeError(e);
      if (!silencioso) this.eventos.onError(`No se pudo conectar con ${device.name ?? this.etiqueta}: ${msg}`);
      this.eventos.onLog(`${this.etiqueta}: error al conectar · ${msg}`, 'error');
      this.desconexionManual = true; // no reintentar un primer intento fallido
      // Siempre se suelta (aunque diga que no está conectado): así el siguiente toque empieza limpio
      try {
        device.gatt?.disconnect();
      } catch {
        // ya estaba suelta
      }
      this.cambiarEstado('desconectado');
    }
  }

  /** Desconexión pedida por el usuario: no se reintenta. */
  desconectar() {
    this.desconexionManual = true;
    this.cancelarReintento();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect(); // disparará gattserverdisconnected
    } else {
      this.alDesconectar();
      this.cambiarEstado('desconectado');
    }
  }

  private async establecer() {
    const device = this.device;
    if (!device?.gatt) throw new Error('El dispositivo no tiene servidor GATT');
    const server = await device.gatt.connect();
    // Limpiamos escuchas de una conexión anterior para no duplicar eventos.
    for (const [c, f] of this.escuchas) c.removeEventListener('characteristicvaluechanged', f);
    this.escuchas.clear();
    this.cola = Promise.resolve();
    await this.configurar(esIos() ? servidorConCodigosCompletos(server) : server);
    this.intentos = 0;
    this.recordar(device.name);
    this.cambiarEstado('conectado');
    this.eventos.onLog(`${this.etiqueta}: conectado a ${device.name ?? 'dispositivo'}`, 'ok');
  }

  private manejarDesconexion = () => {
    this.alDesconectar();
    // Durante la primera conexión los reintentos los lleva `usar`
    if (this.estado === 'conectando') return;
    if (this.desconexionManual) {
      this.cambiarEstado('desconectado');
      this.eventos.onLog(`${this.etiqueta}: desconectado`, 'info');
      return;
    }
    this.eventos.onLog(`${this.etiqueta}: se perdió la conexión, reintentando…`, 'error');
    this.programarReintento();
  };

  private programarReintento() {
    this.cancelarReintento();
    if (this.intentos >= MAX_INTENTOS) {
      this.cambiarEstado('desconectado');
      this.eventos.onError(
        `${this.etiqueta}: no se pudo reconectar tras ${MAX_INTENTOS} intentos. Pulsa el botón para conectar de nuevo.`,
      );
      return;
    }
    // Espera exponencial: 1 s, 2 s, 4 s… hasta 15 s.
    const espera = Math.min(1000 * 2 ** this.intentos, ESPERA_MAXIMA_MS);
    this.intentos++;
    this.cambiarEstado('reconectando');
    this.temporizador = setTimeout(async () => {
      this.temporizador = null;
      if (this.desconexionManual || !this.device) return;
      try {
        await enTurno(() => this.establecer());
      } catch (e) {
        this.eventos.onLog(`${this.etiqueta}: intento ${this.intentos} fallido · ${mensajeError(e)}`, 'error');
        // Si quedó medio conectado, al desconectar saltará manejarDesconexion.
        if (this.device?.gatt?.connected) this.device.gatt.disconnect();
        else this.programarReintento();
        // (con un error nativo de Bluefy, gatt.connected puede mentir: se suelta igualmente)
        if (esErrorNativo(e) && this.device) void soltar(this.device, 0);
      }
    }, espera);
  }

  private cancelarReintento() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }

  private cambiarEstado(estado: EstadoConexion) {
    this.estado = estado;
    this.eventos.onEstado(estado, this.device?.name ?? undefined);
  }

  /** Activa notificaciones/indicaciones y registra un único manejador. */
  protected async suscribir(c: BluetoothRemoteGATTCharacteristic, manejador: (dv: DataView) => void) {
    const escucha = (e: Event) => {
      const valor = (e.target as BluetoothRemoteGATTCharacteristic).value;
      if (valor) manejador(valor);
    };
    const anterior = this.escuchas.get(c);
    if (anterior) c.removeEventListener('characteristicvaluechanged', anterior);
    c.addEventListener('characteristicvaluechanged', escucha);
    this.escuchas.set(c, escucha);
    await c.startNotifications();
  }

  /** Encola una operación GATT para que nunca se solapen dos. */
  protected enCola<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.cola.then(fn, fn);
    this.cola = p.catch(() => undefined);
    return p;
  }
}
