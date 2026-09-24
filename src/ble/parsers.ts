/**
 * Funciones puras para interpretar los bytes que llegan de las
 * características Bluetooth. Todo es little-endian según la especificación GATT.
 */

/** Lector secuencial que no revienta si el paquete viene más corto de lo esperado. */
class Lector {
  private i: number;
  constructor(private dv: DataView, inicio = 0) {
    this.i = inicio;
  }
  private cabe(n: number) {
    return this.i + n <= this.dv.byteLength;
  }
  u8() {
    if (!this.cabe(1)) return undefined;
    const v = this.dv.getUint8(this.i);
    this.i += 1;
    return v;
  }
  u16() {
    if (!this.cabe(2)) return undefined;
    const v = this.dv.getUint16(this.i, true);
    this.i += 2;
    return v;
  }
  s16() {
    if (!this.cabe(2)) return undefined;
    const v = this.dv.getInt16(this.i, true);
    this.i += 2;
    return v;
  }
  u32() {
    if (!this.cabe(4)) return undefined;
    const v = this.dv.getUint32(this.i, true);
    this.i += 4;
    return v;
  }
  saltar(n: number) {
    this.i += n;
  }
}

const bit = (flags: number, n: number) => (flags & (1 << n)) !== 0;

// ---------------------------------------------------------------------------
// FTMS · Indoor Bike Data (0x2AD2)
// ---------------------------------------------------------------------------

export interface DatosRodillo {
  velocidad?: number; // km/h
  cadencia?: number; // rpm
  potencia?: number; // W
  pulso?: number; // ppm
}

export function parsearIndoorBikeData(dv: DataView): DatosRodillo {
  const r = new Lector(dv);
  const flags = r.u16() ?? 0;
  const d: DatosRodillo = {};

  // Ojo: el bit 0 ("More Data") va al revés: si vale 0, la velocidad SÍ está.
  if (!bit(flags, 0)) {
    const v = r.u16();
    if (v !== undefined) d.velocidad = v / 100; // resolución 0,01 km/h
  }
  if (bit(flags, 1)) r.saltar(2); // velocidad media
  if (bit(flags, 2)) {
    const c = r.u16();
    if (c !== undefined) d.cadencia = c / 2; // resolución 0,5 rpm
  }
  if (bit(flags, 3)) r.saltar(2); // cadencia media
  if (bit(flags, 4)) r.saltar(3); // distancia total (uint24)
  if (bit(flags, 5)) r.saltar(2); // nivel de resistencia
  if (bit(flags, 6)) {
    const p = r.s16();
    if (p !== undefined) d.potencia = p;
  }
  if (bit(flags, 7)) r.saltar(2); // potencia media
  if (bit(flags, 8)) r.saltar(5); // energía (total, por hora, por minuto)
  if (bit(flags, 9)) {
    const hr = r.u8();
    if (hr) d.pulso = hr; // 0 significa "sin dato"
  }
  return d;
}

// ---------------------------------------------------------------------------
// FTMS · Supported Power Range (0x2AD8)
// ---------------------------------------------------------------------------

export interface RangoPotencia {
  min: number;
  max: number;
  incremento: number;
}

export function parsearRangoPotencia(dv: DataView): RangoPotencia {
  return {
    min: dv.getInt16(0, true),
    max: dv.getInt16(2, true),
    incremento: dv.getUint16(4, true),
  };
}

// ---------------------------------------------------------------------------
// FTMS · Respuestas del Control Point (0x2AD9)
// ---------------------------------------------------------------------------

const NOMBRES_OPCODE: Record<number, string> = {
  0x00: 'Request Control',
  0x01: 'Reset',
  0x05: 'Set Target Power',
  0x07: 'Start/Resume',
  0x08: 'Stop/Pause',
  0x11: 'Set Indoor Bike Simulation',
};

const RESULTADOS: Record<number, string> = {
  0x01: 'Éxito',
  0x02: 'Operación no soportada',
  0x03: 'Parámetro no válido',
  0x04: 'La operación falló',
  0x05: 'Control no permitido (falta Request Control)',
};

export function nombreOpcode(op: number) {
  return NOMBRES_OPCODE[op] ?? `0x${op.toString(16).padStart(2, '0')}`;
}

export interface RespuestaCP {
  opcodeSolicitud: number;
  codigo: number;
  exito: boolean;
  texto: string;
}

/** Devuelve null si el paquete no es una respuesta (0x80). */
export function parsearRespuestaCP(dv: DataView): RespuestaCP | null {
  if (dv.byteLength < 3 || dv.getUint8(0) !== 0x80) return null;
  const opcodeSolicitud = dv.getUint8(1);
  const codigo = dv.getUint8(2);
  return {
    opcodeSolicitud,
    codigo,
    exito: codigo === 0x01,
    texto: RESULTADOS[codigo] ?? `Código desconocido 0x${codigo.toString(16)}`,
  };
}

// ---------------------------------------------------------------------------
// Cycling Power Measurement (0x2A63)
// ---------------------------------------------------------------------------

export interface DatosPotencia {
  potencia: number;
  biela?: { revs: number; tiempo: number }; // tiempo en 1/1024 s
}

export function parsearCyclingPower(dv: DataView): DatosPotencia {
  const r = new Lector(dv);
  const flags = r.u16() ?? 0;
  const d: DatosPotencia = { potencia: r.s16() ?? 0 };

  if (bit(flags, 0)) r.saltar(1); // balance de pedaleo
  if (bit(flags, 2)) r.saltar(2); // par acumulado
  if (bit(flags, 4)) r.saltar(6); // datos de rueda (uint32 + uint16)
  if (bit(flags, 5)) {
    const revs = r.u16();
    const tiempo = r.u16();
    if (revs !== undefined && tiempo !== undefined) d.biela = { revs, tiempo };
  }
  return d;
}

// ---------------------------------------------------------------------------
// CSC Measurement (0x2A5B)
// ---------------------------------------------------------------------------

export interface DatosCsc {
  rueda?: { revs: number; tiempo: number }; // tiempo en 1/1024 s
  biela?: { revs: number; tiempo: number }; // tiempo en 1/1024 s
}

export function parsearCsc(dv: DataView): DatosCsc {
  const r = new Lector(dv);
  const flags = r.u8() ?? 0;
  const d: DatosCsc = {};
  if (bit(flags, 0)) {
    const revs = r.u32();
    const tiempo = r.u16();
    if (revs !== undefined && tiempo !== undefined) d.rueda = { revs, tiempo };
  }
  if (bit(flags, 1)) {
    const revs = r.u16();
    const tiempo = r.u16();
    if (revs !== undefined && tiempo !== undefined) d.biela = { revs, tiempo };
  }
  return d;
}

// ---------------------------------------------------------------------------
// Heart Rate Measurement (0x2A37)
// ---------------------------------------------------------------------------

export function parsearPulso(dv: DataView): number | undefined {
  const r = new Lector(dv);
  const flags = r.u8() ?? 0;
  return bit(flags, 0) ? r.u16() : r.u8();
}

// ---------------------------------------------------------------------------
// Cálculo de revoluciones por segundo a partir de contadores acumulados
// ---------------------------------------------------------------------------

/**
 * Los sensores CSC/potencia envían "vueltas acumuladas" y "hora del último
 * evento". La velocidad angular sale de las diferencias entre dos paquetes,
 * teniendo en cuenta que ambos contadores dan la vuelta (overflow).
 */
export class CalculadoraRevoluciones {
  private prevRevs?: number;
  private prevTiempo?: number;
  private ultimoCambio = 0;
  private ultimoValor = 0;

  constructor(
    private readonly maxRevs: number, // p. ej. 2^16 o 2^32
    private readonly ticksPorSegundo: number, // 1024 en CSC
    private readonly msSinEventosParaCero = 3000,
  ) {}

  /** Devuelve vueltas por segundo, o undefined en el primer paquete. */
  actualizar(revs: number, tiempo: number, ahora = Date.now()): number | undefined {
    if (this.prevRevs === undefined || this.prevTiempo === undefined) {
      this.prevRevs = revs;
      this.prevTiempo = tiempo;
      this.ultimoCambio = ahora;
      return undefined;
    }
    let dRevs = revs - this.prevRevs;
    if (dRevs < 0) dRevs += this.maxRevs;
    let dT = tiempo - this.prevTiempo;
    if (dT < 0) dT += 65536;
    this.prevRevs = revs;
    this.prevTiempo = tiempo;

    if (dRevs === 0 || dT === 0) {
      // No hay vueltas nuevas: si lleva un rato así, consideramos que está parado.
      if (ahora - this.ultimoCambio > this.msSinEventosParaCero) this.ultimoValor = 0;
      return this.ultimoValor;
    }
    // Saltos absurdos (p. ej. tras reconectar) se ignoran.
    if (dRevs > 100) return this.ultimoValor;

    this.ultimoCambio = ahora;
    this.ultimoValor = dRevs / (dT / this.ticksPorSegundo);
    return this.ultimoValor;
  }

  reiniciar() {
    this.prevRevs = undefined;
    this.prevTiempo = undefined;
    this.ultimoValor = 0;
  }
}
