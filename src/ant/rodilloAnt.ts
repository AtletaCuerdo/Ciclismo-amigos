/**
 * Rodillo por ANT+ FE-C con un adaptador USB (Garmin/Dynastream ANTUSB2 o ANTUSB-m y sus clones),
 * a través de WebUSB (Chrome en Mac, Linux, Android y Windows con el driver WinUSB).
 *
 * Sirve para los rodillos que solo dejan controlar la resistencia por ANT+ (p. ej. los Elite «B+»
 * antiguos, que por Bluetooth no tienen FTMS). Da vatios, cadencia y velocidad, y acepta ERG
 * (página 49) y pendiente (página 51, con la página 50 para el rebufo).
 *
 * Protocolo ANT (mensajes serie del adaptador): [0xA4, longitud, id, …datos, suma XOR].
 */

// Tipos mínimos de WebUSB (no vienen con TypeScript)
interface UsbEndpoint {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: string;
}
interface UsbDispositivo {
  productName?: string;
  opened: boolean;
  configuration: { interfaces: { interfaceNumber: number; alternate: { endpoints: UsbEndpoint[] } }[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  transferIn(ep: number, largo: number): Promise<{ data?: DataView; status: string }>;
  transferOut(ep: number, datos: Uint8Array): Promise<{ status: string }>;
}
interface Usb {
  requestDevice(o: { filters: { vendorId: number }[] }): Promise<UsbDispositivo>;
  getDevices(): Promise<UsbDispositivo[]>;
  addEventListener(tipo: 'disconnect', f: (e: { device: UsbDispositivo }) => void): void;
}
const usb = () => (navigator as Navigator & { usb?: Usb }).usb;

export const usbDisponible = () => !!usb();

/** Dynastream (Garmin): fabricante de los adaptadores ANT USB. */
const VENDEDOR_DYNASTREAM = 0x0fcf;
/** Clave pública de la red ANT+. */
const CLAVE_ANT_PLUS = [0xb9, 0xa5, 0x21, 0xfb, 0xbd, 0x72, 0xc3, 0x45];
const CANAL = 0;
const TIPO_FEC = 17; // equipo de fitness (FE-C)
const PERIODO_FEC = 8192; // 4 Hz
const FRECUENCIA_ANT_PLUS = 57; // 2457 MHz

const MSG = {
  reset: 0x4a,
  clave: 0x46,
  asignar: 0x42,
  id: 0x51,
  periodo: 0x43,
  frecuencia: 0x45,
  esperaBusqueda: 0x44,
  abrir: 0x4b,
  cerrar: 0x4c,
  difusion: 0x4e,
  confirmado: 0x4f,
  evento: 0x40,
} as const;

function mensaje(id: number, datos: number[]) {
  const m = [0xa4, datos.length, id, ...datos];
  m.push(m.reduce((a, b) => a ^ b, 0));
  return new Uint8Array(m);
}

export type EstadoAnt = 'desconectado' | 'conectando' | 'buscando' | 'conectado';

export interface DatosAnt {
  potencia?: number;
  cadencia?: number;
  velocidad?: number; // km/h
  pulso?: number;
}

export class RodilloAnt {
  private disp: UsbDispositivo | null = null;
  private interfaz = 0;
  private salida = 1;
  private entrada = 1;
  private leyendo = false;
  private resto: number[] = [];
  private ultimoDato = 0;
  private vigilante: ReturnType<typeof setInterval> | null = null;
  /**
   * Órdenes al rodillo (mensajes confirmados). ANT+ solo admite uno a la vez y a veces se pierden:
   * se mandan de una en una, esperando a que el adaptador diga si llegó, y la orden en vigor
   * (ERG o pendiente) se repite cada pocos segundos aunque no cambie, como hace Zwift.
   */
  private cola: number[][] = [];
  private enVuelo: { pagina: number[]; desde: number; intentos: number } | null = null;
  private vigente: number[][] = [];
  private ultimaRepeticion = 0;
  estado: EstadoAnt = 'desconectado';
  /** Peso del ciclista (kg) para que el rodillo simule bien las pendientes. */
  pesoKg = 75;

  constructor(
    private readonly cb: {
      onEstado: (e: EstadoAnt, nombre?: string) => void;
      onError: (e: string | null) => void;
      onDatos: (d: DatosAnt) => void;
      onLog: (texto: string, tipo: 'info' | 'ok' | 'error') => void;
    },
  ) {
    usb()?.addEventListener('disconnect', (e) => {
      if (e.device === this.disp) this.soltar('Se ha desenchufado el adaptador ANT+.');
    });
  }

  get tieneControl() {
    return this.estado === 'conectado';
  }

  private cambiar(e: EstadoAnt) {
    this.estado = e;
    this.cb.onEstado(e, this.disp?.productName ?? 'Adaptador ANT+');
  }

  /** Pide el adaptador (debe llamarse en el clic) y abre el canal FE-C. */
  async conectar() {
    const u = usb();
    if (!u) {
      this.cb.onError('Este navegador no puede usar USB. Usa Chrome en el ordenador (Mac, Linux o Windows) o en Android.');
      return;
    }
    let d: UsbDispositivo;
    try {
      d = await u.requestDevice({ filters: [{ vendorId: VENDEDOR_DYNASTREAM }] });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return; // canceló
      this.cb.onError(`No se pudo elegir el adaptador: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    await this.abrir(d);
  }

  private async abrir(d: UsbDispositivo) {
    this.cb.onError(null);
    this.disp = d;
    this.cambiar('conectando');
    try {
      if (!d.opened) await d.open();
      if (!d.configuration) await d.selectConfiguration(1);
      const inter = d.configuration!.interfaces[0];
      this.interfaz = inter.interfaceNumber;
      await d.claimInterface(this.interfaz);
      for (const ep of inter.alternate.endpoints) {
        if (ep.type !== 'bulk') continue;
        if (ep.direction === 'in') this.entrada = ep.endpointNumber;
        else this.salida = ep.endpointNumber;
      }
      this.leer();
      await this.enviar(MSG.reset, [0]);
      await new Promise((r) => setTimeout(r, 600));
      await this.enviar(MSG.clave, [0, ...CLAVE_ANT_PLUS]);
      await this.enviar(MSG.asignar, [CANAL, 0x00, 0]); // canal receptor (bidireccional)
      await this.enviar(MSG.id, [CANAL, 0, 0, TIPO_FEC, 0]); // cualquier rodillo FE-C
      await this.enviar(MSG.periodo, [CANAL, PERIODO_FEC & 0xff, PERIODO_FEC >> 8]);
      await this.enviar(MSG.frecuencia, [CANAL, FRECUENCIA_ANT_PLUS]);
      await this.enviar(MSG.esperaBusqueda, [CANAL, 0xff]); // buscar sin límite
      await this.enviar(MSG.abrir, [CANAL]);
      this.cambiar('buscando');
      this.cb.onLog('ANT+: buscando el rodillo (pedalea un poco para despertarlo)', 'info');
      // Si deja de llegar nada, vuelve a «buscando»; y las órdenes salen de una en una
      this.vigilante = setInterval(() => {
        if (this.estado === 'conectado' && Date.now() - this.ultimoDato > 5000) this.cambiar('buscando');
        this.despachar();
      }, 250);
    } catch (e) {
      const texto = e instanceof Error ? e.message : String(e);
      this.soltar(
        /access|denied|claim|busy|in use/i.test(texto)
          ? 'El adaptador ANT+ está ocupado: cierra Zwift (u otra app que lo use) y vuelve a intentarlo.'
          : `No se pudo abrir el adaptador ANT+: ${texto}`,
      );
    }
  }

  private async enviar(id: number, datos: number[]) {
    if (!this.disp) return false;
    const r = await this.disp.transferOut(this.salida, mensaje(id, datos));
    return r.status === 'ok';
  }

  private async leer() {
    if (this.leyendo) return;
    this.leyendo = true;
    while (this.disp?.opened && this.leyendo) {
      try {
        const r = await this.disp.transferIn(this.entrada, 64);
        if (r.data) for (let i = 0; i < r.data.byteLength; i++) this.resto.push(r.data.getUint8(i));
        this.procesar();
      } catch {
        break;
      }
    }
    this.leyendo = false;
  }

  /** Saca los mensajes completos del flujo de bytes. */
  private procesar() {
    const b = this.resto;
    for (;;) {
      const i = b.indexOf(0xa4);
      if (i < 0) {
        b.length = 0;
        return;
      }
      if (i > 0) b.splice(0, i);
      if (b.length < 4) return;
      const largo = b[1];
      if (b.length < largo + 4) return;
      const m = b.splice(0, largo + 4);
      const suma = m.slice(0, -1).reduce((a, x) => a ^ x, 0);
      if (suma !== m[m.length - 1]) continue;
      this.alMensaje(m[2], m.slice(3, 3 + largo));
    }
  }

  private alMensaje(id: number, datos: number[]) {
    if (id === MSG.evento) {
      this.alEvento(datos);
      return;
    }
    if (id !== MSG.difusion && id !== MSG.confirmado) return;
    const p = datos.slice(1, 9); // página de 8 bytes
    if (p.length < 8) return;
    this.ultimoDato = Date.now();
    if (this.estado !== 'conectado') {
      this.cambiar('conectado');
      this.cb.onLog('ANT+: rodillo encontrado (FE-C)', 'ok');
      void this.enviarUsuario();
    }
    if (p[0] === 0x10) {
      // Página 16: datos generales (velocidad en mm/s, pulso)
      const v = (p[4] | (p[5] << 8)) / 1000;
      const d: DatosAnt = { velocidad: v * 3.6 };
      if (p[6] !== 0xff && p[6] > 0) d.pulso = p[6];
      this.cb.onDatos(d);
    } else if (p[0] === 0x19) {
      // Página 25: datos de la bici estática (cadencia y potencia instantánea, 12 bits)
      const d: DatosAnt = {};
      if (p[2] !== 0xff) d.cadencia = p[2];
      const w = p[5] | ((p[6] & 0x0f) << 8);
      if (w !== 0xfff) d.potencia = w;
      this.cb.onDatos(d);
    }
  }

  /** Página 55: peso del ciclista y de la bici, para simular bien las subidas. */
  private enviarUsuario() {
    const peso = Math.round(this.pesoKg * 100); // 0,01 kg
    const bici = Math.round(8 / 0.05); // 8 kg en pasos de 0,05 kg (12 bits)
    return this.pagina([0x37, peso & 0xff, peso >> 8, 0xff, ((bici & 0x0f) << 4) | 0x0f, bici >> 4, 70, 0x00]);
  }

  /** Pone una orden en la cola (sale en cuanto el canal está libre). */
  private pagina(p: number[]) {
    this.cola.push(p);
    this.despachar();
    return Promise.resolve(true);
  }

  /** Manda la siguiente orden si no hay otra en camino (o si la anterior lleva 1 s sin respuesta). */
  private despachar() {
    if (!this.disp || this.estado !== 'conectado') return;
    const ahora = Date.now();
    if (this.enVuelo && ahora - this.enVuelo.desde < 1000) return;
    if (this.enVuelo) {
      // Sin respuesta del adaptador: se reintenta (hasta 3 veces)
      if (this.enVuelo.intentos < 3) this.cola.unshift(this.enVuelo.pagina);
      this.enVuelo = null;
    }
    // Sin nada pendiente, la orden en vigor se repite cada 2 s
    if (!this.cola.length && this.vigente.length && ahora - this.ultimaRepeticion > 2000) {
      this.ultimaRepeticion = ahora;
      this.cola.push(...this.vigente);
    }
    const p = this.cola.shift();
    if (!p) return;
    const intentos = (this.reintentos.get(p) ?? 0) + 1;
    this.reintentos.set(p, intentos);
    this.enVuelo = { pagina: p, desde: ahora, intentos };
    void this.enviar(MSG.confirmado, [CANAL, ...p]).catch(() => undefined);
  }
  private reintentos = new WeakMap<number[], number>();

  /** Eventos del canal: si la orden llegó (TX_COMPLETED) o falló (TX_FAILED / canal ocupado). */
  private alEvento(datos: number[]) {
    // [canal, mensaje al que responde (1 = evento de radio), código]
    const codigo = datos[2];
    if (datos[1] === 0x01 && (codigo === 0x05 || codigo === 0x06)) {
      const fallo = codigo === 0x06;
      const p = this.enVuelo?.pagina;
      this.enVuelo = null;
      if (fallo && p) this.cb.onLog('ANT+: el rodillo no confirmó la orden, se repite', 'error');
      if (fallo && p && (this.reintentos.get(p) ?? 0) < 3) this.cola.unshift(p);
      else if (p) this.reintentos.delete(p);
      this.despachar();
    } else if (datos[1] === MSG.confirmado && codigo === 0x1f) {
      // «Transferencia en curso»: el canal aún estaba ocupado; se repite enseguida
      const p = this.enVuelo?.pagina;
      this.enVuelo = null;
      if (p) this.cola.unshift(p);
    }
  }

  /** ERG: potencia fija (página 49, en pasos de 0,25 W). */
  fijarPotencia(vatios: number) {
    if (!this.tieneControl) return Promise.resolve(false);
    const v = Math.max(0, Math.min(16383, Math.round(vatios * 4)));
    this.cb.onLog(`→ ANT+ ERG ${Math.round(vatios)} W`, 'info');
    const p = [0x31, 0xff, 0xff, 0xff, 0xff, 0xff, v & 0xff, v >> 8];
    this.vigente = [p];
    // Lo que quedaba en la cola (un ERG anterior) ya no vale
    this.cola = this.cola.filter((x) => x[0] !== 0x31 && x[0] !== 0x32 && x[0] !== 0x33);
    return this.pagina(p);
  }

  /**
   * Simulación: pendiente (página 51, en 0,01 % con −200 % de desfase) y rebufo con la página 50
   * (factor de rebufo de 0 a 1: menos aire yendo a rueda).
   */
  async fijarPendiente(pendiente: number, rebufo = 0) {
    if (!this.tieneControl) return false;
    const g = Math.round((Math.max(-200, Math.min(200, pendiente)) + 200) * 100);
    const rebufoPct = Math.round(Math.max(0, Math.min(1, 1 - rebufo)) * 100);
    this.cb.onLog(`→ ANT+ pendiente ${pendiente.toFixed(1)} %${rebufo > 0 ? ` · rebufo −${Math.round(rebufo * 100)} %` : ''}`, 'info');
    // 0,51 kg/m de coeficiente de viento (como en Bluetooth), sin viento; rodadura 0,004
    const viento = [0x32, 0xff, 0xff, 0xff, 0xff, 51, 127, rebufoPct];
    const subida = [0x33, 0xff, 0xff, 0xff, 0xff, g & 0xff, g >> 8, 80];
    this.vigente = [subida, viento];
    this.cola = this.cola.filter((x) => x[0] !== 0x31 && x[0] !== 0x32 && x[0] !== 0x33);
    await this.pagina(viento);
    return this.pagina(subida);
  }

  desconectar() {
    this.soltar(null);
  }

  private soltar(error: string | null) {
    this.leyendo = false;
    this.cola = [];
    this.enVuelo = null;
    this.vigente = [];
    if (this.vigilante) clearInterval(this.vigilante);
    this.vigilante = null;
    const d = this.disp;
    this.disp = null;
    if (d?.opened) {
      void (async () => {
        try {
          await d.transferOut(this.salida, mensaje(MSG.cerrar, [CANAL]));
          await d.releaseInterface(this.interfaz);
        } catch {
          // ya estaba desenchufado
        }
        await d.close().catch(() => undefined);
      })();
    }
    this.cb.onError(error);
    this.cambiar('desconectado');
  }
}
