/**
 * Los cuatro tipos de dispositivo que soporta la app.
 * Cada uno sabe qué servicio pedir y cómo interpretar sus datos.
 */
import { EventosSensor, SensorBle, mensajeError } from './SensorBle';
import {
  CalculadoraRevoluciones,
  DatosRodillo,
  RangoPotencia,
  RespuestaCP,
  nombreOpcode,
  parsearCsc,
  parsearCyclingPower,
  parsearIndoorBikeData,
  parsearPulso,
  parsearRangoPotencia,
  parsearRespuestaCP,
} from './parsers';

// UUID de 16 bits de los servicios y características (asignados por Bluetooth SIG)
export const UUID = {
  FTMS: 0x1826,
  INDOOR_BIKE_DATA: 0x2ad2,
  SUPPORTED_POWER_RANGE: 0x2ad8,
  FTMS_CONTROL_POINT: 0x2ad9,
  CYCLING_POWER: 0x1818,
  CYCLING_POWER_MEASUREMENT: 0x2a63,
  CSC: 0x1816,
  CSC_MEASUREMENT: 0x2a5b,
  HEART_RATE: 0x180d,
  HEART_RATE_MEASUREMENT: 0x2a37,
} as const;

/** Convierte un buffer a texto hexadecimal para el log. */
function hex(datos: ArrayBuffer | DataView) {
  const bytes =
    datos instanceof DataView
      ? new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength)
      : new Uint8Array(datos);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

// ---------------------------------------------------------------------------
// Comandos del FTMS Control Point
// ---------------------------------------------------------------------------

export const Comandos = {
  requestControl(): ArrayBuffer {
    return new ArrayBuffer(1); // un único byte 0x00
  },
  start(): ArrayBuffer {
    const buf = new ArrayBuffer(1);
    new DataView(buf).setUint8(0, 0x07);
    return buf;
  },
  /** 0x05 + potencia (sint16, W) */
  targetPower(vatios: number): ArrayBuffer {
    const buf = new ArrayBuffer(3);
    const dv = new DataView(buf);
    dv.setUint8(0, 0x05);
    dv.setInt16(1, Math.round(vatios), true);
    return buf;
  },
  /**
   * 0x11 + viento (sint16, 0,001 m/s) + pendiente (sint16, 0,01 %)
   *      + Crr (uint8, 0,0001) + Cw (uint8, 0,01 kg/m)
   */
  simulacion(pendiente: number, viento = 0, crr = 0.004, cw = 0.51): ArrayBuffer {
    const buf = new ArrayBuffer(7);
    const dv = new DataView(buf);
    dv.setUint8(0, 0x11);
    dv.setInt16(1, Math.round(viento * 1000), true);
    dv.setInt16(3, Math.round(pendiente * 100), true);
    dv.setUint8(5, Math.round(crr * 10000));
    dv.setUint8(6, Math.round(cw * 100));
    return buf;
  },
};

// ---------------------------------------------------------------------------
// 1. Rodillo FTMS
// ---------------------------------------------------------------------------

export interface CallbacksRodillo {
  onDatos: (d: DatosRodillo) => void;
  onRango: (r: RangoPotencia | null) => void;
}

export class RodilloFtms extends SensorBle {
  private cp: BluetoothRemoteGATTCharacteristic | null = null;
  // Comando enviado que espera su respuesta por indicación
  private pendiente: { opcode: number; resolver: (r: RespuestaCP | null) => void } | null = null;

  constructor(
    eventos: EventosSensor,
    private readonly cb: CallbacksRodillo,
  ) {
    super('Rodillo FTMS', UUID.FTMS, eventos);
  }

  get tieneControl() {
    return this.conectado && !!this.cp;
  }

  protected async configurar(server: BluetoothRemoteGATTServer) {
    const servicio = await server.getPrimaryService(UUID.FTMS);

    // Datos en directo
    const ibd = await servicio.getCharacteristic(UUID.INDOOR_BIKE_DATA);
    await this.suscribir(ibd, (dv) => this.cb.onDatos(parsearIndoorBikeData(dv)));

    // Rango de potencia admitido (opcional)
    try {
      const c = await servicio.getCharacteristic(UUID.SUPPORTED_POWER_RANGE);
      const rango = parsearRangoPotencia(await c.readValue());
      this.cb.onRango(rango);
      this.eventos.onLog(
        `Rango de potencia: ${rango.min}–${rango.max} W (incremento ${rango.incremento} W)`,
        'info',
      );
    } catch {
      this.cb.onRango(null);
      this.eventos.onLog('El rodillo no publica Supported Power Range (0x2AD8)', 'info');
    }

    // Control Point: hay que activar indicaciones ANTES de escribir.
    try {
      this.cp = await servicio.getCharacteristic(UUID.FTMS_CONTROL_POINT);
      await this.suscribir(this.cp, (dv) => this.alRecibirCP(dv));
    } catch (e) {
      this.cp = null;
      this.eventos.onLog(`Control Point no disponible: ${mensajeError(e)}`, 'error');
      return;
    }

    await this.comando(Comandos.requestControl(), 'Request Control');
    await this.comando(Comandos.start(), 'Start');
  }

  protected alDesconectar() {
    this.pendiente?.resolver(null);
    this.pendiente = null;
    this.cp = null;
  }

  private alRecibirCP(dv: DataView) {
    const r = parsearRespuestaCP(dv);
    if (!r) {
      this.eventos.onLog(`← Control Point (no es respuesta): ${hex(dv)}`, 'info');
      return;
    }
    if (this.pendiente && this.pendiente.opcode === r.opcodeSolicitud) {
      this.pendiente.resolver(r);
    } else {
      this.eventos.onLog(
        `← ${nombreOpcode(r.opcodeSolicitud)}: ${r.texto} (respuesta no esperada)`,
        r.exito ? 'ok' : 'error',
      );
    }
  }

  /**
   * Escribe un comando en el Control Point y espera su respuesta (máx. 3 s).
   * Devuelve true si el rodillo respondió "Éxito".
   */
  comando(datos: ArrayBuffer, descripcion: string): Promise<boolean> {
    return this.enCola(async () => {
      const cp = this.cp;
      if (!cp || !this.device?.gatt?.connected) {
        this.eventos.onLog(`✗ ${descripcion}: el rodillo no está conectado`, 'error');
        return false;
      }
      const opcode = new Uint8Array(datos)[0];

      const respuesta = new Promise<RespuestaCP | null>((resolve) => {
        const t = setTimeout(() => {
          this.pendiente = null;
          resolve(null);
        }, 3000);
        this.pendiente = {
          opcode,
          resolver: (r) => {
            clearTimeout(t);
            this.pendiente = null;
            resolve(r);
          },
        };
      });

      this.eventos.onLog(`→ ${descripcion} [${hex(datos)}]`, 'info');
      try {
        // Bluefy y navegadores antiguos puede que no tengan writeValueWithResponse
        if (typeof cp.writeValueWithResponse === 'function') await cp.writeValueWithResponse(datos);
        else await cp.writeValue(datos);
      } catch (e) {
        this.pendiente?.resolver(null);
        this.eventos.onLog(`✗ ${descripcion}: error al escribir · ${mensajeError(e)}`, 'error');
        return false;
      }

      const r = await respuesta;
      if (!r) {
        this.eventos.onLog(`✗ ${descripcion}: sin respuesta del rodillo (timeout)`, 'error');
        return false;
      }
      this.eventos.onLog(`← ${descripcion}: ${r.texto}`, r.exito ? 'ok' : 'error');
      return r.exito;
    });
  }

  fijarPotencia(vatios: number) {
    return this.comando(Comandos.targetPower(vatios), `Set Target Power ${Math.round(vatios)} W`);
  }

  fijarPendiente(pendiente: number) {
    return this.comando(
      Comandos.simulacion(pendiente, 0, 0.004, 0.51),
      `Simulación pendiente ${pendiente.toFixed(1)} %`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Potenciómetro (Cycling Power Service)
// ---------------------------------------------------------------------------

export class Potenciometro extends SensorBle {
  private biela = new CalculadoraRevoluciones(65536, 1024);

  constructor(
    eventos: EventosSensor,
    private readonly onDatos: (d: { potencia: number; cadencia?: number }) => void,
  ) {
    super('Potenciómetro', UUID.CYCLING_POWER, eventos);
  }

  protected async configurar(server: BluetoothRemoteGATTServer) {
    this.biela.reiniciar();
    const servicio = await server.getPrimaryService(UUID.CYCLING_POWER);
    const c = await servicio.getCharacteristic(UUID.CYCLING_POWER_MEASUREMENT);
    await this.suscribir(c, (dv) => {
      const d = parsearCyclingPower(dv);
      let cadencia: number | undefined;
      if (d.biela) {
        const rps = this.biela.actualizar(d.biela.revs, d.biela.tiempo);
        if (rps !== undefined) cadencia = rps * 60;
      }
      this.onDatos({ potencia: d.potencia, cadencia });
    });
  }

  protected alDesconectar() {
    this.biela.reiniciar();
  }
}

// ---------------------------------------------------------------------------
// 3. Sensor de velocidad / cadencia (CSC)
// ---------------------------------------------------------------------------

export class SensorCsc extends SensorBle {
  private rueda = new CalculadoraRevoluciones(2 ** 32, 1024);
  private biela = new CalculadoraRevoluciones(65536, 1024);

  constructor(
    eventos: EventosSensor,
    private readonly onDatos: (d: { velocidad?: number; cadencia?: number }) => void,
    /** Circunferencia de la rueda en mm (se lee en cada paquete para poder cambiarla en vivo). */
    private readonly circunferenciaMm: () => number,
  ) {
    super('Sensor velocidad/cadencia', UUID.CSC, eventos);
  }

  protected async configurar(server: BluetoothRemoteGATTServer) {
    this.rueda.reiniciar();
    this.biela.reiniciar();
    const servicio = await server.getPrimaryService(UUID.CSC);
    const c = await servicio.getCharacteristic(UUID.CSC_MEASUREMENT);
    await this.suscribir(c, (dv) => {
      const d = parsearCsc(dv);
      const salida: { velocidad?: number; cadencia?: number } = {};
      if (d.rueda) {
        const rps = this.rueda.actualizar(d.rueda.revs, d.rueda.tiempo);
        // vueltas/s × metros por vuelta = m/s → × 3,6 = km/h
        if (rps !== undefined) salida.velocidad = rps * (this.circunferenciaMm() / 1000) * 3.6;
      }
      if (d.biela) {
        const rps = this.biela.actualizar(d.biela.revs, d.biela.tiempo);
        if (rps !== undefined) salida.cadencia = rps * 60;
      }
      if (salida.velocidad !== undefined || salida.cadencia !== undefined) this.onDatos(salida);
    });
  }

  protected alDesconectar() {
    this.rueda.reiniciar();
    this.biela.reiniciar();
  }
}

// ---------------------------------------------------------------------------
// 4. Pulsómetro
// ---------------------------------------------------------------------------

export class Pulsometro extends SensorBle {
  constructor(
    eventos: EventosSensor,
    private readonly onPulso: (ppm: number) => void,
  ) {
    super('Pulsómetro', UUID.HEART_RATE, eventos);
  }

  protected async configurar(server: BluetoothRemoteGATTServer) {
    const servicio = await server.getPrimaryService(UUID.HEART_RATE);
    const c = await servicio.getCharacteristic(UUID.HEART_RATE_MEASUREMENT);
    await this.suscribir(c, (dv) => {
      const ppm = parsearPulso(dv);
      if (ppm) this.onPulso(ppm);
    });
  }
}
