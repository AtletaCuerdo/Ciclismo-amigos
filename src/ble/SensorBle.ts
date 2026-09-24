/**
 * Clase base para cualquier dispositivo Bluetooth LE de la app.
 * Se encarga de:
 *  - pedir el dispositivo al usuario (requestDevice),
 *  - conectar y dejar que la subclase configure sus características,
 *  - reintentar la conexión automáticamente si se cae,
 *  - serializar las operaciones GATT (Bluetooth no admite dos a la vez).
 */

export type EstadoConexion = 'desconectado' | 'conectando' | 'conectado' | 'reconectando';
export type TipoLog = 'info' | 'ok' | 'error';

export interface EventosSensor {
  onEstado: (estado: EstadoConexion, nombreDispositivo?: string) => void;
  onError: (mensaje: string | null) => void;
  onLog: (texto: string, tipo: TipoLog) => void;
}

const MAX_INTENTOS = 10;
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
  return String(e);
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

  /** Se llama en cada desconexión (manual o no) para limpiar estado interno. */
  protected alDesconectar(): void {}

  get conectado() {
    return this.estado === 'conectado' && !!this.device?.gatt?.connected;
  }

  /**
   * Debe llamarse directamente desde el manejador de un clic:
   * requestDevice exige un gesto del usuario y por eso es lo primero que se hace.
   */
  async conectar(): Promise<void> {
    if (!bluetoothDisponible()) {
      this.eventos.onError('Este navegador no soporta Web Bluetooth.');
      return;
    }
    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: [this.servicio] }] });
    } catch (e) {
      if (esCancelacion(e)) {
        this.eventos.onLog(`${this.etiqueta}: selección cancelada`, 'info');
      } else {
        this.eventos.onError(mensajeError(e));
        this.eventos.onLog(`${this.etiqueta}: ${mensajeError(e)}`, 'error');
      }
      return;
    }

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
    try {
      await this.establecer();
    } catch (e) {
      const msg = mensajeError(e);
      this.eventos.onError(`No se pudo conectar con ${device.name ?? this.etiqueta}: ${msg}`);
      this.eventos.onLog(`${this.etiqueta}: error al conectar · ${msg}`, 'error');
      this.desconexionManual = true; // no reintentar un primer intento fallido
      if (device.gatt?.connected) device.gatt.disconnect();
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
    await this.configurar(server);
    this.intentos = 0;
    this.cambiarEstado('conectado');
    this.eventos.onLog(`${this.etiqueta}: conectado a ${device.name ?? 'dispositivo'}`, 'ok');
  }

  private manejarDesconexion = () => {
    this.alDesconectar();
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
        await this.establecer();
      } catch (e) {
        this.eventos.onLog(
          `${this.etiqueta}: intento ${this.intentos} fallido · ${mensajeError(e)}`,
          'error',
        );
        // Si quedó medio conectado, al desconectar saltará manejarDesconexion.
        if (this.device?.gatt?.connected) this.device.gatt.disconnect();
        else this.programarReintento();
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
  protected async suscribir(
    c: BluetoothRemoteGATTCharacteristic,
    manejador: (dv: DataView) => void,
  ) {
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
