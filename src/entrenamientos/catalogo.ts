/**
 * Entrenamientos incluidos en la web (para todos los usuarios).
 * Para añadir uno nuevo basta con añadirlo a esta lista.
 * Potencias en % del FTP; duraciones en segundos (m(10) = 10 minutos).
 */
import type { Entrenamiento } from './tipos';

const m = (minutos: number) => Math.round(minutos * 60);

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
  // ---- Test ----
  {
    id: 'test-rampa',
    nombre: 'Test de rampa (FTP)',
    categoria: 'test',
    descripcion:
      'La potencia sube cada minuto hasta que no puedas más: entonces pulsa «Terminar». Tu FTP estimado es el 75 % de tu mejor minuto.',
    bloques: [
      { tipo: 'rampa', duracionS: m(5), desde: 40, hasta: 55 },
      ...Array.from({ length: 20 }, (_, i) => ({ tipo: 'constante' as const, duracionS: 60, potencia: 50 + i * 6 })),
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
];
