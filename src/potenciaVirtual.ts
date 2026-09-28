/**
 * Potencia virtual para rodillos "tontos" (sin medición de potencia):
 *   P = a·v + b·v³   con v en km/h y P en vatios,
 * o, si el rodillo tiene curva propia por nivel, un polinomio de grado 4 (`poli`).
 *
 * La potencia depende SOLO de la velocidad de la rueda trasera y de la posición de la
 * palanca: el plato y el piñón no cambian la fórmula (solo la cadencia necesaria).
 *
 * Los valores de los presets son orientativos. Lo ideal es calibrarlos
 * comparando con un potenciómetro real (la app permite conectar ambos a la vez).
 */

export interface PresetRodillo {
  id: string;
  nombre: string;
  a: number;
  b: number;
  /** P = A·v⁴ + B·v³ + C·v² + D·v + E (v en km/h), si el rodillo tiene curva propia. */
  poli?: [number, number, number, number, number];
}

/**
 * Elite Novo Force (magnético, palanca de 8 posiciones en el manillar). Curvas por nivel de
 * github.com/TamanhoErudito/vpower-elite-novo-force («Data provided by Elite Support»). Allí el
 * comentario dice mph, pero el código las usa en km/h, y así cuadran con los datos de Elite
 * (nivel 8: ~300 W a 20 km/h y ~690 W a 40 km/h).
 */
const NOVO_FORCE: [number, number, number, number, number][] = [
  [-2.65152e-6, 6.81818e-5, 0.05655303, 1.937662338, -0.041125541],
  [1.13636e-6, -0.000441919, 0.078977273, 2.759992785, -0.465367965],
  [3.40909e-6, -0.001270202, 0.133598485, 3.176803752, -0.181818182],
  [1.51515e-5, -0.00309596, 0.221363636, 3.735353535, -0.316017316],
  [6.25e-5, -0.008861111, 0.439583333, 3.063492063, -0.095238095],
  [6.36364e-5, -0.009469697, 0.494393939, 3.979437229, 0.534632035],
  [9.81061e-5, -0.013467172, 0.640037879, 4.88546176, -1.025974026],
  [8.48485e-5, -0.012681818, 0.653636364, 6.144805195, -1.017316017],
];

export const PRESETS: PresetRodillo[] = [
  // Curva publicada por Kurt Kinetic en mph (5,244820·v + 0,019168·v³) convertida a km/h.
  { id: 'kurt', nombre: 'Kurt Kinetic Road Machine (fluido)', a: 3.259, b: 0.0046 },
  // Gráfica de Tacx leída en http://castfortwo.blogspot.com/2014/01/adding-virtual-power-to-tcx-for-tacx.html:
  // en posición 5 la relación es lineal, ~407 W a 60 km/h → a = 407/60, b = 0.
  // No hay datos publicados para las demás posiciones de la palanca.
  { id: 'tacx-blue-motion-5', nombre: 'Tacx Blue Motion · posición 5 (aprox.)', a: 6.783, b: 0 },
  ...NOVO_FORCE.map((poli, i) => ({
    id: `elite-novo-force-${i + 1}`,
    nombre: `Elite Novo Force · palanca en ${i + 1}${i === 2 ? ' (recomendada)' : ''}`,
    a: 0,
    b: 0,
    poli,
  })),
  { id: 'fluido', nombre: 'Fluido genérico (orientativo)', a: 4.0, b: 0.0055 },
  { id: 'magnetico', nombre: 'Magnético genérico (orientativo)', a: 6.0, b: 0.002 },
  { id: 'rodillos', nombre: 'Rodillos libres (orientativo)', a: 2.0, b: 0.0015 },
];

export const PRESET_PERSONALIZADO = 'personalizado';

export function potenciaEstimada(velocidadKmh: number, a: number, b: number): number {
  const p = a * velocidadKmh + b * velocidadKmh ** 3;
  return Math.max(0, p);
}

/** Las curvas por nivel están medidas hasta ~70 km/h: más allá se prolongan en línea recta. */
const V_MAX_POLI = 70;
const polinomio = ([A, B, C, D, E]: [number, number, number, number, number], v: number) =>
  A * v ** 4 + B * v ** 3 + C * v ** 2 + D * v + E;

/** Potencia estimada con los ajustes guardados (curva del rodillo elegido o a·v + b·v³). */
export function potenciaDeAjustes(velocidadKmh: number, ajustes: AjustesCsc): number {
  const poli = PRESETS.find((p) => p.id === ajustes.presetId)?.poli;
  if (!poli) return potenciaEstimada(velocidadKmh, ajustes.a, ajustes.b);
  if (velocidadKmh <= 0.5) return 0;
  const v = Math.min(velocidadKmh, V_MAX_POLI);
  let p = polinomio(poli, v);
  if (velocidadKmh > V_MAX_POLI) p += (polinomio(poli, V_MAX_POLI) - polinomio(poli, V_MAX_POLI - 1)) * (velocidadKmh - V_MAX_POLI);
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
