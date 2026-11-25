/**
 * Los cuatro tipos de dispositivo que soporta la app.
 * Cada uno sabe qué servicio pedir y cómo interpretar sus datos.
 */
import { EventosSensor, SensorBle, esIos, mensajeError } from './SensorBle';
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

/**
 * «FE-C por Bluetooth» de Tacx (Flow Smart, Vortex, Bushido, Neo antiguos…): los rodillos Tacx sin
 * FTMS (o con firmware viejo) mandan y reciben por Bluetooth los mismos mensajes que por ANT+ FE-C.
 * Es lo que usan Zwift y MyWhoosh con ellos. Datos por FEC2 (notificaciones) y órdenes por FEC3.
 */
export const TACX_FEC = {
  SERVICIO: '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e',
  DATOS: '6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',
  ORDENES: '6e40fec3-b5a3-f393-e0a9-e50e24dcca9e',
} as const;

/** Mensaje ANT (página de 8 bytes) para el canal 5, como lo envuelve Tacx: A4 09 4F 05 … XOR. */
function mensajeFec(pagina: number[]) {
  const m = [0xa4, 0x09, 0x4f, 0x05, ...pagina];
  m.push(m.reduce((a, b) => a ^ b, 0));
  return new Uint8Array(m).buffer;
}

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
  /** Rodillo Tacx sin FTMS: órdenes por FE-C sobre Bluetooth. */
  private fec: BluetoothRemoteGATTCharacteristic | null = null;
  // Comando enviado que espera su respuesta por indicación
  private pendiente: { opcode: number; resolver: (r: RespuestaCP | null) => void } | null = null;

  constructor(
    eventos: EventosSensor,
    private readonly cb: CallbacksRodillo,
  ) {
    super('Rodillo FTMS', UUID.FTMS, eventos);
  }

  get tieneControl() {
    return this.conectado && (!!this.cp || !!this.fec);
  }

  /** Rodillos FTMS y, además, los Tacx que solo hablan FE-C por Bluetooth (Flow Smart y otros). */
  protected opcionesBusqueda(): RequestDeviceOptions {
    // En iPhone/iPad (Bluefy), la búsqueda de siempre (solo FTMS): con el servicio propio de Tacx y el
    // filtro por nombre, Bluefy rechaza la búsqueda con «Error (2)» y no salía ningún rodillo (25-11)
    if (esIos()) return { filters: [{ services: [UUID.FTMS] }] };
    return {
      filters: [{ services: [UUID.FTMS] }, { services: [TACX_FEC.SERVICIO] }, { namePrefix: 'Tacx' }],
      optionalServices: [UUID.FTMS, TACX_FEC.SERVICIO, UUID.CYCLING_POWER, UUID.CSC],
    };
  }

  protected async configurar(server: BluetoothRemoteGATTServer) {
    const servicio = await server.getPrimaryService(UUID.FTMS).catch(() => null);
    if (!servicio) {
      await this.configurarTacx(server);
      return;
    }

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
    this.fec = null;
  }

  /** Tacx por FE-C sobre Bluetooth: velocidad (página 16), cadencia y vatios (página 25). */
  private async configurarTacx(server: BluetoothRemoteGATTServer) {
    const servicio = await server.getPrimaryService(TACX_FEC.SERVICIO).catch(() => {
      throw new Error('Este rodillo no tiene control por Bluetooth (ni FTMS ni FE-C de Tacx). Conéctalo como potenciómetro.');
    });
    const datos = await servicio.getCharacteristic(TACX_FEC.DATOS);
    await this.suscribir(datos, (dv) => {
      const b = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      // A4 · largo · 4E/4F · canal · página (8 bytes) · XOR
      if (b.length < 12 || b[0] !== 0xa4 || (b[2] !== 0x4e && b[2] !== 0x4f)) return;
      const p = b.slice(4, 12);
      if (p[0] === 0x10) {
        const v = (p[4] | (p[5] << 8)) / 1000;
        const d: DatosRodillo = { velocidad: v * 3.6 };
        if (p[6] !== 0xff && p[6] > 0) d.pulso = p[6];
        this.cb.onDatos(d);
      } else if (p[0] === 0x19) {
        const d: DatosRodillo = {};
        if (p[2] !== 0xff) d.cadencia = p[2];
        const w = p[5] | ((p[6] & 0x0f) << 8);
        if (w !== 0xfff) d.potencia = w;
        this.cb.onDatos(d);
      }
    });
    this.fec = await servicio.getCharacteristic(TACX_FEC.ORDENES);
    this.cb.onRango(null);
    this.eventos.onLog('Rodillo Tacx: control por FE-C sobre Bluetooth (ERG y pendiente)', 'ok');
  }

  /** Manda una página FE-C al Tacx (una a la vez, por la cola de Bluetooth). */
  private paginaFec(pagina: number[], descripcion: string) {
    return this.enCola(async () => {
      const c = this.fec;
      if (!c || !this.device?.gatt?.connected) return false;
      this.eventos.onLog(`→ ${descripcion}`, 'info');
      try {
        const datos = mensajeFec(pagina);
        if (typeof c.writeValueWithoutResponse === 'function' && c.properties.writeWithoutResponse) await c.writeValueWithoutResponse(datos);
        else if (typeof c.writeValueWithResponse === 'function') await c.writeValueWithResponse(datos);
        else await c.writeValue(datos);
        return true;
      } catch (e) {
        this.eventos.onLog(`✗ ${descripcion}: ${mensajeError(e)}`, 'error');
        return false;
      }
    });
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

  /**
   * Manda una orden y, si el rodillo la rechaza o no contesta, vuelve a pedir el control
   * (puede haberlo perdido tras un corte) y la repite una vez.
   */
  private async ordenar(datos: () => ArrayBuffer, descripcion: string) {
    if (await this.comando(datos(), descripcion)) return true;
    if (!this.conectado) return false;
    await this.comando(Comandos.requestControl(), 'Request Control (otra vez)');
    await this.comando(Comandos.start(), 'Start');
    return this.comando(datos(), descripcion);
  }

  fijarPotencia(vatios: number) {
    if (this.fec) {
      // Página 49: potencia objetivo en pasos de 0,25 W
      const v = Math.max(0, Math.min(16383, Math.round(vatios * 4)));
      return this.paginaFec([0x31, 0xff, 0xff, 0xff, 0xff, 0xff, v & 0xff, v >> 8], `Tacx ERG ${Math.round(vatios)} W`);
    }
    return this.ordenar(() => Comandos.targetPower(vatios), `Set Target Power ${Math.round(vatios)} W`);
  }

  /** @param rebufo ahorro de aire yendo a rueda (0 … 0,3): el rodillo resiste menos. */
  async fijarPendiente(pendiente: number, rebufo = 0) {
    if (this.fec) {
      // Páginas 50 (viento: 0,51 kg/m, menos con rebufo) y 51 (pendiente en 0,01 % desde −200 %, rodadura 0,004)
      const g = Math.round((Math.max(-200, Math.min(200, pendiente)) + 200) * 100);
      const aire = Math.round(Math.max(0, Math.min(1, 1 - rebufo)) * 100);
      await this.paginaFec([0x32, 0xff, 0xff, 0xff, 0xff, 51, 127, aire], `Tacx viento${rebufo > 0 ? ` (rebufo −${Math.round(rebufo * 100)} %)` : ''}`);
      return this.paginaFec([0x33, 0xff, 0xff, 0xff, 0xff, g & 0xff, g >> 8, 80], `Tacx pendiente ${pendiente.toFixed(1)} %`);
    }
    return this.ordenar(
      () => Comandos.simulacion(pendiente, 0, 0.004, 0.51 * (1 - rebufo)),
      `Simulación pendiente ${pendiente.toFixed(1)} %${rebufo > 0 ? ` · rebufo −${Math.round(rebufo * 100)} % de aire` : ''}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Potenciómetro (Cycling Power Service)
// ---------------------------------------------------------------------------

/**
 * Servicio propio de Elite en sus rodillos Bluetooth antiguos (Real Turbo Muin B+, Qubo Digital
 * Smart B+…). Esos rodillos tienen el servicio de potencia estándar, pero al buscar solo anuncian
 * el de velocidad/cadencia y este: si se busca por potencia, el navegador no los enseña.
 */
const ELITE_ANTIGUO = '347b0001-7635-408b-8918-8ff3949ce592';

export class Potenciometro extends SensorBle {
  private biela = new CalculadoraRevoluciones(65536, 1024);
  private bielaCsc = new CalculadoraRevoluciones(65536, 1024);
  /** El servicio de potencia no trae la cadencia: se saca del de velocidad/cadencia del mismo aparato. */
  private cadenciaDePotencia = false;

  constructor(
    eventos: EventosSensor,
    private readonly onDatos: (d: { potencia?: number; cadencia?: number }) => void,
  ) {
    super('Potenciómetro', UUID.CYCLING_POWER, eventos);
  }

  /** Potenciómetros y rodillos con potencia, y los Elite antiguos que no la anuncian. */
  protected opcionesBusqueda(): RequestDeviceOptions {
    // En iPhone/iPad, sin el servicio propio de Elite (Bluefy no lleva bien los servicios de 128 bits al buscar)
    if (esIos()) return { filters: [{ services: [UUID.CYCLING_POWER] }], optionalServices: [UUID.CSC] };
    return {
      filters: [{ services: [UUID.CYCLING_POWER] }, { services: [ELITE_ANTIGUO] }],
      optionalServices: [UUID.CSC],
    };
  }

  protected async configurar(server: BluetoothRemoteGATTServer) {
    this.biela.reiniciar();
    this.bielaCsc.reiniciar();
    this.cadenciaDePotencia = false;
    const servicio = await server.getPrimaryService(UUID.CYCLING_POWER).catch(() => {
      throw new Error('Este aparato no da vatios por Bluetooth. Conéctalo como sensor de velocidad/cadencia.');
    });
    const c = await servicio.getCharacteristic(UUID.CYCLING_POWER_MEASUREMENT);
    await this.suscribir(c, (dv) => {
      const d = parsearCyclingPower(dv);
      let cadencia: number | undefined;
      if (d.biela) {
        this.cadenciaDePotencia = true;
        const rps = this.biela.actualizar(d.biela.revs, d.biela.tiempo);
        if (rps !== undefined) cadencia = rps * 60;
      }
      this.onDatos({ potencia: d.potencia, cadencia });
    });
    // Elite antiguos: la cadencia va por el servicio de velocidad/cadencia
    const csc = await server.getPrimaryService(UUID.CSC).catch(() => null);
    const medida = await csc?.getCharacteristic(UUID.CSC_MEASUREMENT).catch(() => null);
    if (medida) {
      await this.suscribir(medida, (dv) => {
        const d = parsearCsc(dv);
        if (this.cadenciaDePotencia || !d.biela) return;
        const rps = this.bielaCsc.actualizar(d.biela.revs, d.biela.tiempo);
        if (rps !== undefined) this.onDatos({ cadencia: rps * 60 });
      }).catch(() => undefined);
    }
  }

  protected alDesconectar() {
    this.biela.reiniciar();
    this.bielaCsc.reiniciar();
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
