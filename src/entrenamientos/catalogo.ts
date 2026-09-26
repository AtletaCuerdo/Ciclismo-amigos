/**
 * Entrenamientos incluidos en la web (para todos los usuarios).
 * Para añadir uno nuevo basta con añadirlo a esta lista.
 * Potencias en % del FTP; duraciones en segundos (m(10) = 10 minutos).
 */
import type { Bloque, Entrenamiento } from './tipos';

const m = (minutos: number) => Math.round(minutos * 60);
const constante = (minutos: number, potencia: number): Bloque => ({ tipo: 'constante', duracionS: m(minutos), potencia });
/** Repite un grupo de bloques `n` veces. */
const repetir = (n: number, bloques: Bloque[]) => Array.from({ length: n }, () => bloques).flat();

export const CATALOGO: Entrenamiento[] = [
  // ---- Recovery ----
  {
    id: 'recovery-30',
    nombre: 'Rodaje de recuperación 30′',
    categoria: 'recovery',
    descripcion: 'Pedaleo muy suave para soltar piernas al día siguiente de un esfuerzo.',
    bloques: [
      { tipo: 'rampa', duracionS: m(5), desde: 40, hasta: 52 },
      { tipo: 'constante', duracionS: m(20), potencia: 52 },
      { tipo: 'rampa', duracionS: m(5), desde: 52, hasta: 40 },
    ],
  },
  {
    id: 'recovery-20',
    nombre: 'Soltar piernas 20′',
    categoria: 'recovery',
    descripcion: 'Veinte minutos sin exigencia: perfecto después de una carrera o de un día muy cargado.',
    bloques: [
      { tipo: 'rampa', duracionS: m(4), desde: 40, hasta: 50 },
      constante(12, 50),
      { tipo: 'rampa', duracionS: m(4), desde: 50, hasta: 40 },
    ],
  },
  {
    id: 'recovery-45-cadencia',
    nombre: 'Recuperación con cadencia 45′',
    categoria: 'recovery',
    descripcion: 'Muy suave, con bloques de 1 minuto a cadencia alta (100 rpm o más) para soltar y ganar agilidad.',
    bloques: [
      { tipo: 'rampa', duracionS: m(8), desde: 40, hasta: 55 },
      { tipo: 'intervalos', repeticiones: 6, onS: m(1), onPotencia: 58, offS: m(3), offPotencia: 50 },
      constante(8, 52),
      { tipo: 'rampa', duracionS: m(5), desde: 50, hasta: 40 },
    ],
  },
  {
    id: 'recovery-60',
    nombre: 'Recuperación larga 60′',
    categoria: 'recovery',
    descripcion: 'Una hora en zona 1 con alguna ondulación suave para no aburrirse.',
    bloques: [
      { tipo: 'rampa', duracionS: m(8), desde: 40, hasta: 52 },
      { tipo: 'intervalos', repeticiones: 4, onS: m(6), onPotencia: 56, offS: m(5), offPotencia: 48 },
      constante(1, 52),
      { tipo: 'rampa', duracionS: m(7), desde: 52, hasta: 40 },
    ],
  },

  // ---- Entrenamiento rápido ----
  {
    id: 'rapido-20',
    nombre: 'Exprés 20′',
    categoria: 'rapido',
    descripcion: 'Calentamiento corto y 3 series de 2 minutos fuertes. Ideal con poco tiempo.',
    bloques: [
      { tipo: 'rampa', duracionS: m(5), desde: 50, hasta: 75 },
      { tipo: 'intervalos', repeticiones: 3, onS: m(2), onPotencia: 105, offS: m(2), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(3), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'rapido-30-sweetspot',
    nombre: 'Media hora útil 30′',
    categoria: 'rapido',
    descripcion: 'Calentamiento, 2 × 8′ en sweet spot y vuelta a la calma: el máximo beneficio en 30 minutos.',
    bloques: [
      { tipo: 'rampa', duracionS: m(6), desde: 50, hasta: 80 },
      { tipo: 'intervalos', repeticiones: 2, onS: m(8), onPotencia: 90, offS: m(3), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(2), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'rapido-25-piramide',
    nombre: 'Pirámide 25′',
    categoria: 'rapido',
    descripcion: 'Series de 30″, 1′, 2′, 1′ y 30″ por encima del umbral: cambios de ritmo continuos.',
    bloques: [
      { tipo: 'rampa', duracionS: m(6), desde: 50, hasta: 78 },
      constante(0.5, 130),
      constante(1.5, 55),
      constante(1, 120),
      constante(2, 55),
      constante(2, 110),
      constante(2, 55),
      constante(1, 120),
      constante(1.5, 55),
      constante(0.5, 130),
      { tipo: 'rampa', duracionS: m(7), desde: 60, hasta: 40 },
    ],
  },
  {
    id: 'rapido-30-tabata',
    nombre: 'Tabata 30′',
    categoria: 'rapido',
    descripcion: 'Dos bloques de 8 × (20″ a tope / 10″ suave). Muy corto y muy duro.',
    bloques: [
      { tipo: 'rampa', duracionS: m(8), desde: 50, hasta: 80 },
      { tipo: 'intervalos', repeticiones: 8, onS: 20, onPotencia: 150, offS: 10, offPotencia: 45 },
      constante(5, 50),
      { tipo: 'intervalos', repeticiones: 8, onS: 20, onPotencia: 150, offS: 10, offPotencia: 45 },
      { tipo: 'rampa', duracionS: m(9), desde: 60, hasta: 40 },
    ],
  },

  // ---- Test ----
  {
    id: 'test-rampa',
    nombre: 'Test de rampa (FTP)',
    categoria: 'test',
    descripcion:
      'La potencia sube cada minuto hasta que no puedas más: entonces pulsa «Terminar». Tu FTP estimado es el 75 % de tu mejor minuto.',
    estimaFtp: { ventanaS: 60, factor: 0.75, texto: '75 % de tu mejor minuto' },
    bloques: [
      { tipo: 'rampa', duracionS: m(5), desde: 40, hasta: 55 },
      ...Array.from({ length: 20 }, (_, i) => ({ tipo: 'constante' as const, duracionS: 60, potencia: 50 + i * 6 })),
    ],
  },
  {
    id: 'test-rampa-corta',
    nombre: 'Test de rampa rápido (FTP)',
    categoria: 'test',
    descripcion:
      'Como el test de rampa pero con escalones de 30 segundos: más corto y explosivo. Pulsa «Terminar» cuando no puedas más. FTP = 72 % de tu mejor minuto.',
    estimaFtp: { ventanaS: 60, factor: 0.72, texto: '72 % de tu mejor minuto' },
    bloques: [
      { tipo: 'rampa', duracionS: m(6), desde: 40, hasta: 60 },
      ...Array.from({ length: 30 }, (_, i) => ({ tipo: 'constante' as const, duracionS: 30, potencia: 60 + i * 5 })),
    ],
  },
  {
    id: 'test-20',
    nombre: 'Test de 20 minutos (FTP)',
    categoria: 'test',
    descripcion:
      'El clásico: calentamiento con activaciones, 5′ fuertes, recuperación y 20 minutos a tope sin ERG (el rodillo simula la pendiente). FTP = 95 % de tu mejor media de 20 minutos.',
    estimaFtp: { ventanaS: m(20), factor: 0.95, texto: '95 % de tu mejor media de 20 minutos' },
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 45, hasta: 70 },
      { tipo: 'intervalos', repeticiones: 3, onS: m(1), onPotencia: 100, offS: m(1), offPotencia: 55 },
      constante(5, 55),
      constante(5, 105),
      constante(10, 50),
      { tipo: 'constante', duracionS: m(20), potencia: 100, libre: true },
      { tipo: 'rampa', duracionS: m(10), desde: 55, hasta: 40 },
    ],
  },
  {
    id: 'test-2x8',
    nombre: 'Test 2 × 8 minutos (FTP)',
    categoria: 'test',
    descripcion:
      'Dos esfuerzos de 8 minutos a tope sin ERG con 10 minutos de recuperación. Más llevadero que el de 20′. FTP = 90 % de tu mejor media de 8 minutos.',
    estimaFtp: { ventanaS: m(8), factor: 0.9, texto: '90 % de tu mejor media de 8 minutos' },
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 45, hasta: 75 },
      { tipo: 'intervalos', repeticiones: 2, onS: m(1), onPotencia: 105, offS: m(1.5), offPotencia: 55 },
      { tipo: 'constante', duracionS: m(8), potencia: 105, libre: true },
      constante(10, 50),
      { tipo: 'constante', duracionS: m(8), potencia: 105, libre: true },
      { tipo: 'rampa', duracionS: m(10), desde: 55, hasta: 40 },
    ],
  },

  // ---- Endurance ----
  {
    id: 'endurance-60',
    nombre: 'Fondo 60′',
    categoria: 'endurance',
    descripcion: 'Una hora en zona 2: base aeróbica sin acumular fatiga.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 66 },
      { tipo: 'constante', duracionS: m(40), potencia: 68 },
      { tipo: 'rampa', duracionS: m(10), desde: 66, hasta: 50 },
    ],
  },
  {
    id: 'endurance-75-cadencia',
    nombre: 'Fondo con cadencia 75′',
    categoria: 'endurance',
    descripcion:
      'Zona 2 alternando 3′ a cadencia alta (105 rpm) y 2′ a cadencia baja (65 rpm) casi a la misma potencia.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 68 },
      { tipo: 'intervalos', repeticiones: 11, onS: m(3), onPotencia: 70, offS: m(2), offPotencia: 68 },
      { tipo: 'rampa', duracionS: m(10), desde: 65, hasta: 45 },
    ],
  },
  {
    id: 'endurance-90',
    nombre: 'Fondo largo 90′',
    categoria: 'endurance',
    descripcion: 'Hora y media en zona 2 con pequeños cambios de ritmo, como en la carretera.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 65 },
      { tipo: 'intervalos', repeticiones: 5, onS: m(10), onPotencia: 70, offS: m(4), offPotencia: 62 },
      { tipo: 'rampa', duracionS: m(10), desde: 65, hasta: 45 },
    ],
  },
  {
    id: 'endurance-120',
    nombre: 'Salida larga 2 h',
    categoria: 'endurance',
    descripcion: 'Dos horas de base aeróbica con tres bloques algo más vivos (tempo suave) repartidos.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 66 },
      constante(25, 68),
      constante(6, 78),
      constante(25, 67),
      constante(6, 78),
      constante(20, 66),
      constante(6, 78),
      { tipo: 'rampa', duracionS: m(20), desde: 65, hasta: 45 },
    ],
  },

  // ---- Sweet Spot ----
  {
    id: 'sweetspot-3x10',
    nombre: 'Sweet Spot 3×10′',
    categoria: 'sweetspot',
    descripcion: 'Tres bloques de 10 minutos al 90 % con 5 minutos de recuperación.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 75 },
      { tipo: 'intervalos', repeticiones: 3, onS: m(10), onPotencia: 90, offS: m(5), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(5), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'sweetspot-2x20',
    nombre: 'Sweet Spot 2×20′',
    categoria: 'sweetspot',
    descripcion: 'Dos bloques largos de 20 minutos al 89 %: el clásico para subir el FTP.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 78 },
      { tipo: 'intervalos', repeticiones: 2, onS: m(20), onPotencia: 89, offS: m(5), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(5), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'sweetspot-picos',
    nombre: 'Sweet Spot con picos 4×8′',
    categoria: 'sweetspot',
    descripcion: 'Cuatro bloques de 8′ al 90 % con un tirón de 20″ al 130 % cada 2 minutos, como rodando en grupo.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 78 },
      ...repetir(4, [
        { tipo: 'intervalos', repeticiones: 4, onS: 20, onPotencia: 130, offS: 100, offPotencia: 90 },
        constante(4, 55),
      ]),
      { tipo: 'rampa', duracionS: m(4), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'sweetspot-escalera',
    nombre: 'Escalera Sweet Spot 60′',
    categoria: 'sweetspot',
    descripcion: 'Tres escaleras de 4′ al 86 %, 4′ al 90 % y 4′ al 94 %, con 4′ suaves entre ellas.',
    bloques: [
      { tipo: 'rampa', duracionS: m(8), desde: 50, hasta: 78 },
      ...repetir(3, [constante(4, 86), constante(4, 90), constante(4, 94), constante(4, 55)]),
      { tipo: 'rampa', duracionS: m(4), desde: 60, hasta: 45 },
    ],
  },

  // ---- Tapering ----
  {
    id: 'tapering-40',
    nombre: 'Activación pre-carrera 40′',
    categoria: 'tapering',
    descripcion: 'Poco volumen y algún cambio de ritmo para llegar fresco y activado.',
    bloques: [
      { tipo: 'rampa', duracionS: m(15), desde: 50, hasta: 70 },
      { tipo: 'intervalos', repeticiones: 3, onS: m(1), onPotencia: 110, offS: m(2), offPotencia: 55 },
      { tipo: 'constante', duracionS: m(5), potencia: 85 },
      { tipo: 'rampa', duracionS: m(11), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'tapering-30-aperturas',
    nombre: 'Aperturas 30′',
    categoria: 'tapering',
    descripcion: 'La víspera de la carrera: rodaje suave y 4 aceleraciones de 30″ para despertar las piernas.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 68 },
      { tipo: 'intervalos', repeticiones: 4, onS: 30, onPotencia: 125, offS: m(2), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(10), desde: 62, hasta: 45 },
    ],
  },
  {
    id: 'tapering-45-ritmo',
    nombre: 'Ritmo de carrera 45′',
    categoria: 'tapering',
    descripcion: 'Dos bloques de 5′ a ritmo de contrarreloj y tres sprints cortos: sensaciones sin cansarse.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 75 },
      { tipo: 'intervalos', repeticiones: 2, onS: m(5), onPotencia: 95, offS: m(5), offPotencia: 55 },
      { tipo: 'intervalos', repeticiones: 3, onS: 15, onPotencia: 140, offS: m(1), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(9), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'tapering-50-mixto',
    nombre: 'Puesta a punto 50′',
    categoria: 'tapering',
    descripcion: 'Un poco de todo con poco volumen: tempo, umbral breve y un par de sprints cortos.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 72 },
      constante(6, 80),
      constante(3, 55),
      constante(3, 100),
      constante(4, 55),
      { tipo: 'intervalos', repeticiones: 2, onS: 10, onPotencia: 170, offS: m(2), offPotencia: 50 },
      constante(8, 65),
      { tipo: 'rampa', duracionS: m(10), desde: 60, hasta: 45 },
    ],
  },

  // ---- Tempo ----
  {
    id: 'tempo-2x15',
    nombre: 'Tempo 2×15′',
    categoria: 'tempo',
    descripcion: 'Dos bloques de 15 minutos al 80 %: ritmo sostenido que cuesta pero se aguanta.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 72 },
      { tipo: 'intervalos', repeticiones: 2, onS: m(15), onPotencia: 80, offS: m(5), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(5), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'tempo-3x15',
    nombre: 'Tempo 3×15′',
    categoria: 'tempo',
    descripcion: 'Tres bloques de 15 minutos al 80 %: resistencia a ritmo de grupo rápido.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 72 },
      { tipo: 'intervalos', repeticiones: 3, onS: m(15), onPotencia: 80, offS: m(4), offPotencia: 58 },
      { tipo: 'rampa', duracionS: m(6), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'tempo-40-continuo',
    nombre: 'Tempo continuo 40′',
    categoria: 'tempo',
    descripcion: 'Cuarenta minutos seguidos subiendo poco a poco del 76 % al 84 %. Físico y mental.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 72 },
      { tipo: 'rampa', duracionS: m(40), desde: 76, hasta: 84 },
      { tipo: 'rampa', duracionS: m(8), desde: 62, hasta: 45 },
    ],
  },
  {
    id: 'tempo-subida',
    nombre: 'Tempo en subida 4×10′',
    categoria: 'tempo',
    descripcion: 'Cuatro bloques de 10′ al 82 % pensando en un puerto largo: cadencia baja (70 rpm) y tronco quieto.',
    bloques: [
      { tipo: 'rampa', duracionS: m(10), desde: 50, hasta: 72 },
      { tipo: 'intervalos', repeticiones: 4, onS: m(10), onPotencia: 82, offS: m(3), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(6), desde: 60, hasta: 45 },
    ],
  },

  // ---- Threshold ----
  {
    id: 'threshold-4x8',
    nombre: 'Umbral 4×8′',
    categoria: 'threshold',
    descripcion: 'Cuatro series de 8 minutos en tu FTP con 4 minutos suaves entre ellas.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 80 },
      { tipo: 'intervalos', repeticiones: 4, onS: m(8), onPotencia: 100, offS: m(4), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(5), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'threshold-2x20',
    nombre: 'Umbral 2×20′',
    categoria: 'threshold',
    descripcion: 'Dos bloques de 20 minutos al 96 %: la sesión de umbral por excelencia.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 80 },
      { tipo: 'intervalos', repeticiones: 2, onS: m(20), onPotencia: 96, offS: m(6), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(6), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'threshold-over-under',
    nombre: 'Over-unders 3×9′',
    categoria: 'threshold',
    descripcion: 'Tres bloques alternando 2′ al 95 % y 1′ al 108 %: enseña a limpiar lactato sin parar.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 80 },
      ...repetir(3, [
        { tipo: 'intervalos', repeticiones: 3, onS: m(2), onPotencia: 95, offS: m(1), offPotencia: 108 },
        constante(5, 55),
      ]),
      { tipo: 'rampa', duracionS: m(4), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'threshold-5x6',
    nombre: 'Umbral 5×6′ en progresión',
    categoria: 'threshold',
    descripcion: 'Cinco series de 6 minutos que suben del 98 % al 104 % del FTP, con 3 minutos de descanso.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 80 },
      ...[98, 100, 101, 102, 104].flatMap((p) => [constante(6, p), constante(3, 55)]),
      { tipo: 'rampa', duracionS: m(5), desde: 60, hasta: 45 },
    ],
  },

  // ---- VO2Max ----
  {
    id: 'vo2max-5x3',
    nombre: 'VO2Max 5×3′',
    categoria: 'vo2max',
    descripcion: 'Cinco series de 3 minutos al 118 % con la misma recuperación. Duro.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 85 },
      { tipo: 'intervalos', repeticiones: 5, onS: m(3), onPotencia: 118, offS: m(3), offPotencia: 50 },
      { tipo: 'rampa', duracionS: m(5), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'vo2max-4x4',
    nombre: 'VO2Max 4×4′',
    categoria: 'vo2max',
    descripcion: 'El protocolo noruego: cuatro series de 4 minutos al 115 % con 4 minutos de recuperación activa.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 85 },
      { tipo: 'intervalos', repeticiones: 4, onS: m(4), onPotencia: 115, offS: m(4), offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(6), desde: 60, hasta: 45 },
    ],
  },
  {
    id: 'vo2max-30-30',
    nombre: 'VO2Max 30/30 (3×10)',
    categoria: 'vo2max',
    descripcion: 'Tres bloques de 10 × (30″ al 125 % / 30″ al 50 %): mucho tiempo cerca del VO2máx.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 85 },
      ...repetir(3, [
        { tipo: 'intervalos', repeticiones: 10, onS: 30, onPotencia: 125, offS: 30, offPotencia: 50 },
        constante(5, 50),
      ]),
      { tipo: 'rampa', duracionS: m(3), desde: 55, hasta: 45 },
    ],
  },
  {
    id: 'vo2max-40-20',
    nombre: 'VO2Max 40/20 (2×12)',
    categoria: 'vo2max',
    descripcion: 'Dos bloques de 12 × (40″ al 120 % / 20″ al 55 %). Recuperaciones cortas: muy exigente.',
    bloques: [
      { tipo: 'rampa', duracionS: m(12), desde: 50, hasta: 85 },
      { tipo: 'intervalos', repeticiones: 12, onS: 40, onPotencia: 120, offS: 20, offPotencia: 55 },
      constante(8, 50),
      { tipo: 'intervalos', repeticiones: 12, onS: 40, onPotencia: 120, offS: 20, offPotencia: 55 },
      { tipo: 'rampa', duracionS: m(6), desde: 60, hasta: 45 },
    ],
  },
];
