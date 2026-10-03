/**
 * Cielos del recorrido (fotos HDR de Poly Haven, CC0) y la luz que va con cada uno. Por
 * defecto se elige según la hora real; en Ajustes se puede fijar uno.
 *
 * Sin dependencias de Three.js: lo usa también la pantalla de Ajustes.
 */

export type Momento = 'manana' | 'mediodia' | 'tarde' | 'atardecer';
export type EleccionCielo = 'auto' | Momento;

export interface DefCielo {
  id: Momento;
  nombre: string;
  /** Nombre del HDR en public/texturas (sin «_2k.hdr»). */
  archivo: string;
  /** Hay versión 4k (solo el de mediodía). */
  con4k: boolean;
  /** Color e intensidad del sol, exposición y color de la niebla del horizonte. */
  sol: number;
  intensidad: number;
  exposicion: number;
  niebla: number;
  /** Altura mínima del sol (para que las sombras no se alarguen sin fin). */
  solMinimo: number;
  /** Luz ambiente del cielo: color e intensidad. */
  ambiente: number;
  intensidadAmbiente: number;
}

export const CIELOS: DefCielo[] = [
  {
    id: 'manana',
    nombre: 'Mañana',
    archivo: 'citrus_orchard_road_puresky',
    con4k: false,
    sol: 0xffe4c4,
    intensidad: 2.7,
    exposicion: 0.64,
    niebla: 0xd8dfe6,
    solMinimo: 0.16,
    ambiente: 0xdce6f5,
    intensidadAmbiente: 0.45,
  },
  {
    id: 'mediodia',
    nombre: 'Mediodía',
    archivo: 'kloofendal_48d_partly_cloudy_puresky',
    con4k: true,
    sol: 0xfff1dc,
    intensidad: 3.2,
    exposicion: 0.62,
    niebla: 0xcfe0ea,
    solMinimo: 0.25,
    ambiente: 0xcfe6ff,
    intensidadAmbiente: 0.5,
  },
  {
    id: 'tarde',
    nombre: 'Tarde',
    archivo: 'evening_road_01_puresky',
    con4k: false,
    sol: 0xffcf96,
    intensidad: 2.9,
    exposicion: 0.66,
    niebla: 0xe2d8c8,
    solMinimo: 0.12,
    ambiente: 0xf3e0c8,
    intensidadAmbiente: 0.38,
  },
  {
    id: 'atardecer',
    nombre: 'Atardecer',
    archivo: 'belfast_sunset_puresky',
    con4k: false,
    sol: 0xffad66,
    intensidad: 2.5,
    exposicion: 0.72,
    niebla: 0xe6c6aa,
    solMinimo: 0.08,
    ambiente: 0xf0c7a8,
    intensidadAmbiente: 0.28,
  },
];

const CLAVE = 'rodillos.cielo';

export function leerEleccionCielo(): EleccionCielo {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'auto' || CIELOS.some((c) => c.id === v) ? (v as EleccionCielo) : 'auto';
  } catch {
    return 'auto';
  }
}

export function guardarEleccionCielo(v: EleccionCielo) {
  try {
    localStorage.setItem(CLAVE, v);
  } catch {
    // sin almacenamiento: se queda en automático
  }
}

/** Cielo según la hora: mañana hasta las 10, mediodía hasta las 16:30, tarde hasta las 19 y luego atardecer. */
export function cieloSegunHora(fecha = new Date()): Momento {
  const h = fecha.getHours() + fecha.getMinutes() / 60;
  if (h >= 6 && h < 10) return 'manana';
  if (h >= 10 && h < 16.5) return 'mediodia';
  if (h >= 16.5 && h < 19) return 'tarde';
  return 'atardecer';
}

/** El cielo que toca ahora (el elegido o el de la hora). */
export function cieloActual(): DefCielo {
  const e = leerEleccionCielo();
  const id = e === 'auto' ? cieloSegunHora() : e;
  return CIELOS.find((c) => c.id === id) ?? CIELOS[1];
}
