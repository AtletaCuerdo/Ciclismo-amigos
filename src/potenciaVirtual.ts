/**
 * Potencia virtual para rodillos "tontos" (sin medición de potencia):
 *   P = a·v + b·v³   con v en km/h y P en vatios.
 *
 * Los valores de los presets son orientativos. Lo ideal es calibrarlos
 * comparando con un potenciómetro real (la app permite conectar ambos a la vez).
 */

export interface PresetRodillo {
  id: string;
  nombre: string;
  a: number;
  b: number;
}

export const PRESETS: PresetRodillo[] = [
  // Curva publicada por Kurt Kinetic en mph (5,244820·v + 0,019168·v³) convertida a km/h.
  { id: 'kurt', nombre: 'Kurt Kinetic Road Machine (fluido)', a: 3.259, b: 0.0046 },
  { id: 'fluido', nombre: 'Fluido genérico (orientativo)', a: 4.0, b: 0.0055 },
  { id: 'magnetico', nombre: 'Magnético genérico (orientativo)', a: 6.0, b: 0.002 },
  { id: 'rodillos', nombre: 'Rodillos libres (orientativo)', a: 2.0, b: 0.0015 },
];

export const PRESET_PERSONALIZADO = 'personalizado';

export function potenciaEstimada(velocidadKmh: number, a: number, b: number): number {
  const p = a * velocidadKmh + b * velocidadKmh ** 3;
  return Math.max(0, p);
}

// ---------------------------------------------------------------------------
// Ajustes del sensor CSC (se guardan en el navegador para no repetirlos)
// ---------------------------------------------------------------------------

export interface AjustesCsc {
  circunferencia: number; // mm
  presetId: string;
  a: number;
  b: number;
}

const CLAVE = 'rodillos.ajustesCsc';

export const AJUSTES_POR_DEFECTO: AjustesCsc = {
  circunferencia: 2105, // 700x25c
  presetId: PRESETS[0].id,
  a: PRESETS[0].a,
  b: PRESETS[0].b,
};

export function cargarAjustes(): AjustesCsc {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) return { ...AJUSTES_POR_DEFECTO, ...JSON.parse(guardado) };
  } catch {
    // Sin almacenamiento disponible (modo privado, etc.): usamos los valores por defecto.
  }
  return AJUSTES_POR_DEFECTO;
}

export function guardarAjustes(a: AjustesCsc) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    // No es grave si no se puede guardar.
  }
}
