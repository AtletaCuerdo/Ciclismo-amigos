/**
 * Mandos Zwift Click (v1 y v2) para los cambios virtuales, sin pasar por Zwift.
 *
 * Protocolo (el mismo que usan MyWhoosh, Rouvy o BikeControl; ver
 * github.com/OpenBikeControl/bikecontrol, lib/bluetooth/devices/zwift):
 *   - Servicio 0xFC82 (Click v2, Ride) o 00000001-19ca-… (Click v1, Play).
 *   - 00000002-… notifica los botones; 00000004-… responde por indicaciones;
 *     en 00000003-… se escribe el saludo «RideOn» para que empiece a mandar.
 *   - Click v2 / Ride: mensaje 0x23 + protobuf con un mapa de bits (campo 1);
 *     un botón está pulsado cuando su bit vale 0.
 *   - Click v1: mensaje 0x37 + protobuf con «+» (campo 1) y «−» (campo 2); 0 = pulsado.
 *
 * Click v2: cada mando es un dispositivo Bluetooth aparte. El derecho (+ y B) funciona sin
 * desbloqueo; el izquierdo (−) deja de mandar al minuto si ese día no se ha abierto Zwift.
 */
import { SensorBle, type EventosSensor } from './SensorBle';

export type AccionMando = 'subir' | 'bajar';

const SERVICIO_V2 = 0xfc82;
const SERVICIO_V1 = '00000001-19ca-4651-86e5-fa29dcdd09d1';
const CAR_BOTONES = '00000002-19ca-4651-86e5-fa29dcdd09d1';
const CAR_ESCRIBIR = '00000003-19ca-4651-86e5-fa29dcdd09d1';
const CAR_RESPUESTAS = '00000004-19ca-4651-86e5-fa29dcdd09d1';
/** Zwift, Inc. en los datos de fabricante del anuncio Bluetooth. */
const FABRICANTE_ZWIFT = 0x094a;

const RIDE_ON = [0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e]; // «RideOn»
const INICIO_V2 = [0x02, 0x03];

const MENSAJE_CLICK_V1 = 0x37;
const MENSAJE_RIDE = 0x23; // Click v2 y Zwift Ride

/** Bits del mapa de botones (Click v2 / Ride). */
const BOTONES: { mascara: number; accion: AccionMando; nombre: string }[] = [
  { mascara: 0x01000, accion: 'subir', nombre: '+' }, // mando derecho
  { mascara: 0x00020, accion: 'bajar', nombre: 'B' }, // mando derecho
  { mascara: 0x00100, accion: 'bajar', nombre: '−' }, // mando izquierdo
  { mascara: 0x00200, accion: 'bajar', nombre: '− (2)' }, // Zwift Ride
  { mascara: 0x02000, accion: 'subir', nombre: '+ (2)' }, // Zwift Ride
];

/** Lee un entero «varint» de protobuf; devuelve el valor y la posición siguiente. */
function leerVarint(b: Uint8Array, i: number): [number, number] {
  let valor = 0;
  let factor = 1;
  while (i < b.length) {
    const byte = b[i++];
    valor += (byte & 0x7f) * factor;
    if (!(byte & 0x80)) break;
    factor *= 128;
  }
  return [valor, i];
}

/** Campos numéricos de un mensaje protobuf plano: número de campo → valor. */
function camposProtobuf(b: Uint8Array, desde: number) {
  const campos = new Map<number, number>();
  let i = desde;
  while (i < b.length) {
    const [clave, j] = leerVarint(b, i);
    const campo = Math.floor(clave / 8);
    const tipo = clave & 7;
    if (tipo === 0) {
      const [valor, k] = leerVarint(b, j);
      if (!campos.has(campo)) campos.set(campo, valor);
      i = k;
    } else if (tipo === 2) {
      const [largo, k] = leerVarint(b, j);
      i = k + largo; // submensajes (palancas analógicas): no se usan
    } else break;
  }
  return campos;
}

export class MandoZwift extends SensorBle {
  /** Botones pulsados en el último mensaje (para actuar solo al pulsar, no al mantener). */
  private pulsados = new Set<string>();

  constructor(
    eventos: EventosSensor,
    private readonly onAccion: (accion: AccionMando, boton: string) => void,
    etiqueta = 'Mando Zwift',
  ) {
    super(etiqueta, SERVICIO_V2, eventos);
  }

  protected opcionesBusqueda(): RequestDeviceOptions {
    return {
      filters: [
        { namePrefix: 'Zwift' },
        { services: [SERVICIO_V2] },
        { manufacturerData: [{ companyIdentifier: FABRICANTE_ZWIFT }] },
      ],
      optionalServices: [SERVICIO_V2, SERVICIO_V1],
    };
  }

  protected async configurar(server: BluetoothRemoteGATTServer) {
    this.pulsados.clear();
    let v2 = true;
    let servicio: BluetoothRemoteGATTService;
    try {
      servicio = await server.getPrimaryService(SERVICIO_V2);
    } catch {
      v2 = false;
      try {
        servicio = await server.getPrimaryService(SERVICIO_V1);
      } catch {
        throw new Error(
          'el mando no muestra su servicio de botones. Si es un Click v2, abre Zwift un momento para desbloquearlo y vuelve a conectar.',
        );
      }
    }
    const botones = await servicio.getCharacteristic(CAR_BOTONES);
    const respuestas = await servicio.getCharacteristic(CAR_RESPUESTAS);
    const escribir = await servicio.getCharacteristic(CAR_ESCRIBIR);
    await this.suscribir(botones, (dv) => this.procesar(dv));
    await this.suscribir(respuestas, () => undefined);
    // Saludo: sin él el mando no manda los botones
    const saludo = new Uint8Array(v2 ? [...RIDE_ON, ...INICIO_V2] : RIDE_ON);
    await this.enCola(() => escribir.writeValueWithoutResponse(saludo));
    this.eventos.onLog(`${this.etiqueta}: saludo enviado (${v2 ? 'Click v2' : 'Click v1'})`, 'info');
  }

  protected alDesconectar() {
    this.pulsados.clear();
  }

  private procesar(dv: DataView) {
    const b = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    if (b.length < 2) return;
    const ahora = new Set<string>();
    const acciones = new Map<string, AccionMando>();
    if (b[0] === MENSAJE_RIDE) {
      const mapa = camposProtobuf(b, 1).get(1);
      if (mapa === undefined) return;
      for (const { mascara, accion, nombre } of BOTONES) {
        if ((mapa & mascara) === 0) {
          ahora.add(nombre);
          acciones.set(nombre, accion);
        }
      }
    } else if (b[0] === MENSAJE_CLICK_V1) {
      const campos = camposProtobuf(b, 1);
      if (campos.get(1) === 0) {
        ahora.add('+');
        acciones.set('+', 'subir');
      }
      if (campos.get(2) === 0) {
        ahora.add('−');
        acciones.set('−', 'bajar');
      }
    } else return;
    // Solo cuenta el momento de pulsar
    for (const nombre of ahora) if (!this.pulsados.has(nombre)) this.onAccion(acciones.get(nombre)!, nombre);
    this.pulsados = ahora;
  }
}
