/**
 * Personalización del ciclista (datos puros, sin Three.js).
 * El avatar se comparte con los demás en la salida en grupo; el peso no
 * (solo se usa para calcular la velocidad virtual).
 */

export interface Avatar {
  maillot: string; // colores en formato #rrggbb
  franja: string;
  culotte: string;
  casco: string;
  bici: string;
  piel: string;
}

export interface Perfil {
  avatar: Avatar;
  pesoKg: number;
}

export const EQUIPACIONES: { nombre: string; colores: Omit<Avatar, 'piel'> }[] = [
  { nombre: 'Naranja', colores: { maillot: '#ff6a1a', franja: '#111111', culotte: '#111111', casco: '#ffffff', bici: '#222222' } },
  { nombre: 'Azul', colores: { maillot: '#1e5bd8', franja: '#ffffff', culotte: '#0b1a33', casco: '#1e5bd8', bici: '#c0c6cf' } },
  { nombre: 'Verde', colores: { maillot: '#2fa84f', franja: '#f5d90a', culotte: '#111111', casco: '#2fa84f', bici: '#f5d90a' } },
  { nombre: 'Rojo', colores: { maillot: '#d62828', franja: '#ffffff', culotte: '#111111', casco: '#111111', bici: '#d62828' } },
  { nombre: 'Rosa', colores: { maillot: '#ff4fa3', franja: '#3a0ca3', culotte: '#3a0ca3', casco: '#ffffff', bici: '#ff4fa3' } },
  { nombre: 'Amarillo', colores: { maillot: '#f5d90a', franja: '#111111', culotte: '#111111', casco: '#f5d90a', bici: '#111111' } },
  { nombre: 'Blanco', colores: { maillot: '#f2f2f2', franja: '#d62828', culotte: '#111111', casco: '#111111', bici: '#f2f2f2' } },
  { nombre: 'Turquesa', colores: { maillot: '#12b5b0', franja: '#0b3d3b', culotte: '#0b3d3b', casco: '#ffffff', bici: '#0b3d3b' } },
];

export const TONOS_PIEL = ['#f3d2b3', '#e0ac85', '#c68642', '#8d5524', '#5a3a22'];

const CLAVE = 'rodillos.perfil';
const HEX = /^#[0-9a-fA-F]{6}$/;

export function avatarValido(a: unknown): a is Avatar {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (['maillot', 'franja', 'culotte', 'casco', 'bici', 'piel'] as const).every(
    (k) => typeof o[k] === 'string' && HEX.test(o[k] as string),
  );
}

function aleatorio<T>(xs: T[]) {
  return xs[Math.floor(Math.random() * xs.length)];
}

/** Avatar al azar: así, aunque nadie lo personalice, no vais todos iguales. */
export function avatarAleatorio(): Avatar {
  return { ...aleatorio(EQUIPACIONES).colores, piel: aleatorio(TONOS_PIEL) };
}

export function cargarPerfil(): Perfil {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    if (g && avatarValido(g.avatar)) {
      const peso = Number(g.pesoKg);
      return { avatar: g.avatar, pesoKg: peso >= 30 && peso <= 200 ? peso : 75 };
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
