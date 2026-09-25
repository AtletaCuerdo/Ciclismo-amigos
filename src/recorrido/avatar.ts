/**
 * Personalización del ciclista (datos puros, sin Three.js).
 * El avatar se comparte con los demás en la salida en grupo; el peso no
 * (solo se usa para calcular la velocidad virtual).
 */

export type ModeloBici = 'ruta' | 'aero' | 'escaladora' | 'cabra';
export type TipoRuedas = 'bajo' | 'medio' | 'alto' | 'lenticular';

export interface Avatar {
  maillot: string; // colores en formato #rrggbb
  franja: string;
  culotte: string;
  casco: string;
  bici: string; // color principal del cuadro
  bici2: string; // color secundario (detalles y llantas)
  piel: string;
  modelo: ModeloBici;
  ruedas: TipoRuedas;
}

export interface Perfil {
  avatar: Avatar;
  pesoKg: number;
}

export const MODELOS: { id: ModeloBici; nombre: string; descripcion: string }[] = [
  { id: 'ruta', nombre: 'Ruta clásica', descripcion: 'Tubos redondos, polivalente' },
  { id: 'aero', nombre: 'Ruta aero', descripcion: 'Tubos anchos y perfilados' },
  { id: 'escaladora', nombre: 'Escaladora', descripcion: 'Tubos finos y ligeros' },
  { id: 'cabra', nombre: 'Cabra de triatlón', descripcion: 'Acople y posición aerodinámica' },
];

export const RUEDAS: { id: TipoRuedas; nombre: string }[] = [
  { id: 'bajo', nombre: 'Perfil bajo' },
  { id: 'medio', nombre: 'Perfil medio' },
  { id: 'alto', nombre: 'Perfil alto' },
  { id: 'lenticular', nombre: 'Lenticular' },
];

type Colores = Pick<Avatar, 'maillot' | 'franja' | 'culotte' | 'casco' | 'bici' | 'bici2'>;

export const EQUIPACIONES: { nombre: string; colores: Colores }[] = [
  { nombre: 'Naranja', colores: { maillot: '#ff6a1a', franja: '#111111', culotte: '#111111', casco: '#ffffff', bici: '#222222', bici2: '#ff6a1a' } },
  { nombre: 'Azul', colores: { maillot: '#1e5bd8', franja: '#ffffff', culotte: '#0b1a33', casco: '#1e5bd8', bici: '#c0c6cf', bici2: '#1e5bd8' } },
  { nombre: 'Verde', colores: { maillot: '#2fa84f', franja: '#f5d90a', culotte: '#111111', casco: '#2fa84f', bici: '#f5d90a', bici2: '#111111' } },
  { nombre: 'Rojo', colores: { maillot: '#d62828', franja: '#ffffff', culotte: '#111111', casco: '#111111', bici: '#d62828', bici2: '#ffffff' } },
  { nombre: 'Rosa', colores: { maillot: '#ff4fa3', franja: '#3a0ca3', culotte: '#3a0ca3', casco: '#ffffff', bici: '#ff4fa3', bici2: '#3a0ca3' } },
  { nombre: 'Amarillo', colores: { maillot: '#f5d90a', franja: '#111111', culotte: '#111111', casco: '#f5d90a', bici: '#111111', bici2: '#f5d90a' } },
  { nombre: 'Blanco', colores: { maillot: '#f2f2f2', franja: '#d62828', culotte: '#111111', casco: '#111111', bici: '#f2f2f2', bici2: '#d62828' } },
  { nombre: 'Turquesa', colores: { maillot: '#12b5b0', franja: '#0b3d3b', culotte: '#0b3d3b', casco: '#ffffff', bici: '#0b3d3b', bici2: '#12b5b0' } },
];

export const TONOS_PIEL = ['#f3d2b3', '#e0ac85', '#c68642', '#8d5524', '#5a3a22'];

const CLAVE = 'rodillos.perfil';
const HEX = /^#[0-9a-fA-F]{6}$/;
const COLORES_OBLIGATORIOS = ['maillot', 'franja', 'culotte', 'casco', 'bici', 'piel'] as const;

/**
 * Convierte datos guardados o recibidos en un avatar completo.
 * Acepta avatares antiguos (sin bici2/modelo/ruedas) rellenando valores por defecto.
 * Devuelve null si no es válido.
 */
export function normalizarAvatar(a: unknown): Avatar | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  if (!COLORES_OBLIGATORIOS.every((k) => typeof o[k] === 'string' && HEX.test(o[k] as string))) return null;
  const modelo = MODELOS.some((m) => m.id === o.modelo) ? (o.modelo as ModeloBici) : 'ruta';
  const ruedas = RUEDAS.some((r) => r.id === o.ruedas) ? (o.ruedas as TipoRuedas) : 'medio';
  const bici2 = typeof o.bici2 === 'string' && HEX.test(o.bici2) ? o.bici2 : '#1a1a1a';
  return {
    maillot: o.maillot as string,
    franja: o.franja as string,
    culotte: o.culotte as string,
    casco: o.casco as string,
    bici: o.bici as string,
    bici2,
    piel: o.piel as string,
    modelo,
    ruedas,
  };
}

function aleatorio<T>(xs: T[]) {
  return xs[Math.floor(Math.random() * xs.length)];
}

/** Avatar al azar: así, aunque nadie lo personalice, no vais todos iguales. */
export function avatarAleatorio(): Avatar {
  return {
    ...aleatorio(EQUIPACIONES).colores,
    piel: aleatorio(TONOS_PIEL),
    modelo: aleatorio<ModeloBici>(['ruta', 'aero', 'escaladora']),
    ruedas: aleatorio<TipoRuedas>(['bajo', 'medio', 'alto']),
  };
}

export function cargarPerfil(): Perfil {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    const avatar = g ? normalizarAvatar(g.avatar) : null;
    if (avatar) {
      const peso = Number(g.pesoKg);
      return { avatar, pesoKg: peso >= 30 && peso <= 200 ? peso : 75 };
    }
  } catch {
    // sin almacenamiento: se genera uno nuevo
  }
  const nuevo: Perfil = { avatar: avatarAleatorio(), pesoKg: 75 };
  guardarPerfil(nuevo);
  return nuevo;
}

export function guardarPerfil(p: Perfil) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    // no es grave
  }
}

/** Peso de la bici que se suma al del ciclista en la física. */
export const PESO_BICI_KG = 9;

// ---------------------------------------------------------------------------
// Calidad gráfica
// ---------------------------------------------------------------------------

export type Calidad = 'alta' | 'media';
const CLAVE_CALIDAD = 'rodillos.calidad';

/** En iPad/iPhone se empieza en calidad media para que vaya fluido. */
export function cargarCalidad(): Calidad {
  try {
    const c = localStorage.getItem(CLAVE_CALIDAD);
    if (c === 'alta' || c === 'media') return c;
  } catch {
    // sin almacenamiento
  }
  const esIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return esIos ? 'media' : 'alta';
}

export function guardarCalidad(c: Calidad) {
  try {
    localStorage.setItem(CLAVE_CALIDAD, c);
  } catch {
    // no es grave
  }
}
