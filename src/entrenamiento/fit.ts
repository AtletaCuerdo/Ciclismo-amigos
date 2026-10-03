/**
 * Archivo FIT (el formato de Garmin que usan Zwift o MyWhoosh) para subir a Strava.
 *
 * Frente al TCX tiene dos ventajas que Strava sí respeta:
 * - Dentro del archivo va que es una actividad virtual (sport = ciclismo, sub_sport =
 *   virtual_activity): Strava la crea como «Virtual Ride» y usa la altitud del archivo en vez de
 *   recalcularla con su mapa (en el mar sería 0).
 * - Lleva una vuelta (lap) por cada intervalo del entrenamiento: con ellas Strava dibuja el
 *   «Análisis del entrenamiento».
 */
import type { Geo } from './tcx';
import type { Entreno, Muestra } from './tipos';

/** Segundos del FIT: desde el 31-12-1989 (UTC). */
const fitTiempo = (ms: number) => Math.round(ms / 1000) - 631065600;
/** Grados → semicírculos (posición GPS en FIT). */
const semicirculos = (grados: number) => Math.round((grados * 2 ** 31) / 180);

// Tipos base de FIT: [código, bytes]
type TipoBase = 'enum' | 'uint8' | 'uint16' | 'uint32' | 'sint32' | 'uint32z' | 'string16';
const BASE: Record<TipoBase, [number, number]> = {
  enum: [0x00, 1],
  uint8: [0x02, 1],
  uint16: [0x84, 2],
  uint32: [0x86, 4],
  sint32: [0x85, 4],
  uint32z: [0x8c, 4],
  string16: [0x07, 16],
};
/** Valor «no válido» de cada tipo (campo sin dato). */
const INVALIDO: Record<TipoBase, number> = {
  enum: 0xff,
  uint8: 0xff,
  uint16: 0xffff,
  uint32: 0xffffffff,
  sint32: 0x7fffffff,
  uint32z: 0,
  string16: 0,
};

type Campo = [numero: number, tipo: TipoBase];

/** Escribe mensajes FIT en un búfer que crece. */
class EscritorFit {
  private bytes: number[] = [];
  private definidos = new Map<number, string>();

  private u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  private valor(tipo: TipoBase, v: number | string | undefined) {
    const [, n] = BASE[tipo];
    if (tipo === 'string16') {
      const texto = new TextEncoder().encode(String(v ?? '')).slice(0, n - 1);
      for (let i = 0; i < n; i++) this.u8(i < texto.length ? texto[i] : 0);
      return;
    }
    let x = v === undefined || Number.isNaN(v) ? INVALIDO[tipo] : Math.round(v as number);
    if (tipo === 'sint32' && x < 0) x = x >>> 0;
    for (let i = 0; i < n; i++) this.u8(Math.floor(x / 2 ** (8 * i)));
  }

  /**
   * Escribe un mensaje. Cada tipo de mensaje usa su propio número local (0-15) y se define una
   * sola vez (si cambian los campos, se vuelve a definir).
   */
  mensaje(local: number, global: number, campos: Campo[], valores: (number | string | undefined)[]) {
    const firma = `${global}|${campos.map((c) => c.join(':')).join(',')}`;
    if (this.definidos.get(local) !== firma) {
      this.u8(0x40 | local); // cabecera de definición
      this.u8(0); // reservado
      this.u8(0); // little endian
      this.u8(global & 0xff);
      this.u8(global >> 8);
      this.u8(campos.length);
      for (const [num, tipo] of campos) {
        this.u8(num);
        this.u8(BASE[tipo][1]);
        this.u8(BASE[tipo][0]);
      }
      this.definidos.set(local, firma);
    }
    this.u8(local); // cabecera de datos
    campos.forEach(([, tipo], i) => this.valor(tipo, valores[i]));
  }

  /** Archivo completo: cabecera de 14 bytes + datos + CRC. */
  archivo(): Uint8Array {
    const datos = this.bytes;
    const cab = [14, 0x20, 0x54, 0x08, ...[0, 1, 2, 3].map((i) => (datos.length >>> (8 * i)) & 0xff), 0x2e, 0x46, 0x49, 0x54];
    const crcCab = crc(cab);
    const todo = [...cab, crcCab & 0xff, crcCab >> 8, ...datos];
    const crcTodo = crc(todo);
    return Uint8Array.from([...todo, crcTodo & 0xff, crcTodo >> 8]);
  }
}

const TABLA_CRC = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];
/** CRC-16 de FIT. */
function crc(bytes: number[]) {
  let c = 0;
  for (const b of bytes) {
    let t = TABLA_CRC[c & 0xf];
    c = (c >> 4) & 0x0fff;
    c = c ^ t ^ TABLA_CRC[b & 0xf];
    t = TABLA_CRC[c & 0xf];
    c = (c >> 4) & 0x0fff;
    c = c ^ t ^ TABLA_CRC[(b >> 4) & 0xf];
  }
  return c;
}

// Mensajes globales y enumerados de FIT
const M = { fileId: 0, sesion: 18, vuelta: 19, registro: 20, evento: 21, actividad: 34 };
const CICLISMO = 2;
const VIRTUAL = 58; // sub_sport virtual_activity

/** Resumen de un tramo de muestras (para cada vuelta y para la sesión). */
function resumir(m: Muestra[], altitudes: (number | undefined)[]) {
  const media = (f: (x: Muestra) => number | undefined, sinCeros = false) => {
    const v = m.map(f).filter((x): x is number => x !== undefined && (!sinCeros || x > 0));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const maximo = (f: (x: Muestra) => number | undefined) => {
    const v = m.map(f).filter((x): x is number => x !== undefined);
    return v.length ? Math.max(...v) : undefined;
  };
  let subida = 0;
  for (let i = 1; i < altitudes.length; i++) {
    const a = altitudes[i];
    const b = altitudes[i - 1];
    if (a !== undefined && b !== undefined && a > b) subida += a - b;
  }
  return {
    potencia: media((x) => x.p),
    potenciaMax: maximo((x) => x.p),
    pulso: media((x) => x.hr, true),
    pulsoMax: maximo((x) => x.hr),
    cadencia: media((x) => x.c, true),
    subida,
  };
}

/**
 * Genera el FIT de la sesión. `geo` (opcional) da la posición en el mapa virtual y la altitud
 * del circuito. Las vueltas empiezan en las muestras de `resumen.vueltas` (una por intervalo).
 */
export function generarFit(e: Entreno, geo: Geo | null = null): Uint8Array {
  const w = new EscritorFit();
  const m = e.muestras;
  const r = e.resumen;
  const inicio = fitTiempo(e.inicio);
  const fin = m.length ? fitTiempo(m[m.length - 1].t) : inicio + r.duracionS;
  const posiciones = m.map((x) => (geo && x.s !== undefined ? geo(x.s, x.t) : null));
  const altitudes = m.map((x, i) => posiciones[i]?.alt ?? (x.alt !== 0 ? x.alt : undefined));

  w.mensaje(
    0,
    M.fileId,
    [[0, 'enum'], [1, 'uint16'], [2, 'uint16'], [3, 'uint32z'], [4, 'uint32'], [8, 'string16']],
    [4, 255, 1, 20261003, inicio, 'RideCrew'],
  );
  // Cronómetro en marcha
  const evento: Campo[] = [[253, 'uint32'], [0, 'enum'], [1, 'enum']];
  w.mensaje(1, M.evento, evento, [inicio, 0, 0]);

  // Un registro por segundo
  const registro: Campo[] = [
    [253, 'uint32'],
    [0, 'sint32'],
    [1, 'sint32'],
    [2, 'uint16'],
    [3, 'uint8'],
    [4, 'uint8'],
    [5, 'uint32'],
    [6, 'uint16'],
    [7, 'uint16'],
  ];
  m.forEach((x, i) => {
    const g = posiciones[i];
    const alt = altitudes[i];
    w.mensaje(2, M.registro, registro, [
      fitTiempo(x.t),
      g ? semicirculos(g.lat) : undefined,
      g ? semicirculos(g.lon) : undefined,
      alt !== undefined ? (alt + 500) * 5 : undefined,
      x.hr ? Math.min(254, x.hr) : undefined,
      x.c !== undefined ? Math.min(254, x.c) : undefined,
      x.d * 100,
      x.v !== undefined ? (x.v / 3.6) * 1000 : undefined,
      x.p !== undefined ? Math.max(0, Math.min(65534, x.p)) : undefined,
    ]);
  });
  w.mensaje(1, M.evento, evento, [fin, 0, 4]); // cronómetro parado (stop_all)

  // Vueltas: una por intervalo del entrenamiento (o una sola si se rodó libre)
  const cortes = [0, ...(r.vueltas ?? []).filter((k) => k > 0 && k < m.length), m.length];
  const unicos = [...new Set(cortes)].sort((a, b) => a - b);
  const vuelta: Campo[] = [
    [254, 'uint16'],
    [253, 'uint32'],
    [0, 'enum'],
    [1, 'enum'],
    [2, 'uint32'],
    [7, 'uint32'],
    [8, 'uint32'],
    [9, 'uint32'],
    [15, 'uint8'],
    [16, 'uint8'],
    [17, 'uint8'],
    [19, 'uint16'],
    [20, 'uint16'],
    [21, 'uint16'],
    [24, 'enum'],
    [25, 'enum'],
    [39, 'enum'],
  ];
  let nVueltas = 0;
  for (let k = 0; k < unicos.length - 1; k++) {
    const a = unicos[k];
    const b = unicos[k + 1];
    if (b <= a || !m.length) continue;
    const trozo = m.slice(a, b);
    const s = resumir(trozo, altitudes.slice(a, b));
    const t0 = fitTiempo(trozo[0].t);
    const t1 = fitTiempo(trozo[trozo.length - 1].t) + 1;
    const d0 = a > 0 ? m[a - 1].d : 0;
    w.mensaje(3, M.vuelta, vuelta, [
      nVueltas,
      t1,
      9, // lap
      1, // stop
      t0,
      (t1 - t0) * 1000,
      (b - a) * 1000,
      (trozo[trozo.length - 1].d - d0) * 100,
      s.pulso,
      s.pulsoMax,
      s.cadencia,
      s.potencia,
      s.potenciaMax,
      s.subida,
      k === unicos.length - 2 ? 7 : 0, // session_end en la última, manual en las demás
      CICLISMO,
      VIRTUAL,
    ]);
    nVueltas++;
  }

  // Sesión y actividad
  const s = resumir(m, altitudes);
  w.mensaje(
    4,
    M.sesion,
    [
      [254, 'uint16'],
      [253, 'uint32'],
      [0, 'enum'],
      [1, 'enum'],
      [2, 'uint32'],
      [5, 'enum'],
      [6, 'enum'],
      [7, 'uint32'],
      [8, 'uint32'],
      [9, 'uint32'],
      [11, 'uint16'],
      [16, 'uint8'],
      [17, 'uint8'],
      [18, 'uint8'],
      [20, 'uint16'],
      [21, 'uint16'],
      [22, 'uint16'],
      [25, 'uint16'],
      [26, 'uint16'],
      [28, 'enum'],
    ],
    [
      0,
      fin,
      8, // session
      1, // stop
      inicio,
      CICLISMO,
      VIRTUAL,
      (fin - inicio + 1) * 1000,
      r.duracionS * 1000,
      r.distanciaM * 100,
      r.kilojulios, // en bici, kJ de trabajo ≈ kcal gastadas
      s.pulso,
      s.pulsoMax,
      s.cadencia,
      s.potencia,
      s.potenciaMax,
      s.subida,
      0,
      nVueltas,
      0, // activity_end
    ],
  );
  const desfase = -new Date(e.inicio).getTimezoneOffset() * 60;
  w.mensaje(
    5,
    M.actividad,
    [
      [253, 'uint32'],
      [0, 'uint32'],
      [1, 'uint16'],
      [2, 'enum'],
      [3, 'enum'],
      [4, 'enum'],
      [5, 'uint32'],
    ],
    [fin, r.duracionS * 1000, 1, 0, 26, 1, fin + desfase],
  );
  return w.archivo();
}

/** El FIT en base64 (para mandarlo al intermediario de Strava dentro de un JSON). */
export function fitBase64(bytes: Uint8Array) {
  let texto = '';
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(texto);
}
