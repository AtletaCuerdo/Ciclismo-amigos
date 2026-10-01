/**
 * Logros (medallas) y racha de semanas seguidas. Todo sale del historial y de los récords de
 * los segmentos, así que no hace falta guardar nada más (solo qué logros ya se han celebrado,
 * para avisar de los nuevos al terminar una sesión).
 */
import { CIRCUITOS } from '../recorrido/circuitos';
import { miRecord } from '../recorrido/records';
import type { EntrenoGuardado } from './tipos';

export interface Logro {
  id: string;
  icono: string;
  nombre: string;
  descripcion: string;
}

interface Datos {
  lista: EntrenoGuardado[];
  sesiones: number;
  km: number;
  horas: number;
  desnivel: number;
  horasRueda: number;
  racha: number;
}

const LOGROS: (Logro & { conseguido: (d: Datos) => boolean })[] = [
  { id: 'primera', icono: '🚲', nombre: 'Primera pedalada', descripcion: 'Tu primera sesión en RideCrew', conseguido: (d) => d.sesiones >= 1 },
  { id: 'sesiones10', icono: '🔟', nombre: 'Constante', descripcion: '10 sesiones', conseguido: (d) => d.sesiones >= 10 },
  { id: 'sesiones50', icono: '🏅', nombre: 'Fijo en el rodillo', descripcion: '50 sesiones', conseguido: (d) => d.sesiones >= 50 },
  { id: 'km100', icono: '🛣️', nombre: '100 km', descripcion: '100 km acumulados', conseguido: (d) => d.km >= 100 },
  { id: 'km500', icono: '🗺️', nombre: '500 km', descripcion: '500 km acumulados', conseguido: (d) => d.km >= 500 },
  { id: 'km1000', icono: '🌍', nombre: '1.000 km', descripcion: '1.000 km acumulados', conseguido: (d) => d.km >= 1000 },
  { id: 'horas10', icono: '⏱️', nombre: '10 horas', descripcion: '10 horas pedaleando', conseguido: (d) => d.horas >= 10 },
  { id: 'horas50', icono: '⌛', nombre: '50 horas', descripcion: '50 horas pedaleando', conseguido: (d) => d.horas >= 50 },
  { id: 'everest', icono: '🏔️', nombre: 'Everesting', descripcion: '8.848 m de desnivel acumulado', conseguido: (d) => d.desnivel >= 8848 },
  { id: 'fondo', icono: '🦵', nombre: 'Fondista', descripcion: 'Una sesión de 2 horas', conseguido: (d) => d.lista.some((g) => g.resumen.duracionS >= 7200) },
  { id: 'km50', icono: '🚀', nombre: 'Medio centenar', descripcion: '50 km en una sesión', conseguido: (d) => d.lista.some((g) => g.resumen.distanciaM >= 50000) },
  { id: 'vatios600', icono: '⚡', nombre: 'Sprinter', descripcion: 'Un pico de 600 W', conseguido: (d) => d.lista.some((g) => (g.resumen.potenciaMax ?? 0) >= 600) },
  { id: 'rueda1h', icono: '🧛', nombre: 'Chupa ruedas', descripcion: '1 hora a rueda de otro (acumulado)', conseguido: (d) => d.horasRueda >= 1 },
  {
    id: 'sierra',
    icono: '⛰️',
    nombre: 'Coronas la Sierra',
    descripcion: 'Sube entero el Puerto de la Sierra',
    conseguido: () => miRecord('subida-1', 'sierra') !== undefined,
  },
  {
    id: 'turista',
    icono: '🧭',
    nombre: 'Turista',
    descripcion: 'Una vuelta completa en cada circuito',
    conseguido: () => CIRCUITOS.every((c) => miRecord('vuelta', c.id) !== undefined),
  },
  { id: 'racha4', icono: '🔥', nombre: 'En racha', descripcion: '4 semanas seguidas rodando', conseguido: (d) => d.racha >= 4 },
  { id: 'racha12', icono: '☄️', nombre: 'Imparable', descripcion: '12 semanas seguidas rodando', conseguido: (d) => d.racha >= 12 },
];

/** Lunes (00:00) de la semana de una fecha, en ms. */
function lunes(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/**
 * Semanas seguidas (de lunes a domingo) con al menos una sesión. Si esta semana aún no has
 * rodado, la racha sigue viva con la de la semana pasada.
 */
export function rachaSemanas(lista: EntrenoGuardado[], ahora = Date.now()) {
  const semanas = new Set(lista.map((g) => lunes(g.inicio)));
  const semana = (desde: number, atras: number) => {
    const d = new Date(desde);
    d.setDate(d.getDate() - 7 * atras);
    return lunes(d.getTime());
  };
  const esta = lunes(ahora);
  let k = semanas.has(esta) ? 0 : 1;
  let racha = 0;
  while (semanas.has(semana(esta, k))) {
    racha++;
    k++;
  }
  return racha;
}

function datosDe(lista: EntrenoGuardado[]): Datos {
  const suma = (f: (g: EntrenoGuardado) => number) => lista.reduce((a, g) => a + f(g), 0);
  return {
    lista,
    sesiones: lista.length,
    km: suma((g) => g.resumen.distanciaM) / 1000,
    horas: suma((g) => g.resumen.duracionS) / 3600,
    desnivel: suma((g) => g.resumen.desnivelM),
    horasRueda: suma((g) => g.resumen.segundosRueda ?? 0) / 3600,
    racha: rachaSemanas(lista),
  };
}

/** Todos los logros, marcando los conseguidos. */
export function calcularLogros(lista: EntrenoGuardado[]): (Logro & { conseguido: boolean })[] {
  const d = datosDe(lista);
  return LOGROS.map(({ conseguido, ...l }) => ({ ...l, conseguido: conseguido(d) }));
}

const CLAVE = 'rodillos.logrosVistos';

function leerVistos(): string[] | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v ? (JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
}

function guardarVistos(ids: string[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ids));
  } catch {
    // Sin almacenamiento: se volverán a celebrar, no pasa nada
  }
}

/**
 * La primera vez se dan por vistos los logros que ya tenías (para no celebrarlos todos de golpe
 * al estrenar esta función).
 */
export function iniciarLogrosVistos(lista: EntrenoGuardado[]) {
  if (leerVistos() !== null) return;
  guardarVistos(calcularLogros(lista).filter((l) => l.conseguido).map((l) => l.id));
}

/** Logros conseguidos que aún no se habían celebrado (y los marca como vistos). */
export function logrosNuevos(lista: EntrenoGuardado[]): Logro[] {
  const vistos = leerVistos();
  const conseguidos = calcularLogros(lista).filter((l) => l.conseguido);
  // Sin registro previo: solo se celebran los de esta sesión si es la primera
  const yaVistos = new Set(vistos ?? (lista.length > 1 ? conseguidos.map((l) => l.id) : []));
  const nuevos = conseguidos.filter((l) => !yaVistos.has(l.id));
  guardarVistos([...new Set([...yaVistos, ...conseguidos.map((l) => l.id)])]);
  return nuevos;
}
