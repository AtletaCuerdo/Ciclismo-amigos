/**
 * Logros (medallas) y racha de semanas seguidas. Casi todo sale del historial y de los récords de
 * los segmentos; cada sesión guarda además lo que no se puede sacar del resumen (entrenamientos
 * completados, vueltas por circuito, récords mejorados, tamaño del grupo y cadencia). Aparte solo
 * se guarda qué logros ya se han celebrado, para avisar de los nuevos al terminar una sesión.
 */
import { CIRCUITOS } from '../recorrido/circuitos';
import { miRecord } from '../recorrido/records';
import { segmentosDe } from '../recorrido/segmentos';
import { CATALOGO } from '../entrenamientos/catalogo';
import { cargarPropios } from '../entrenamientos/propios';
import type { EntrenoGuardado } from './tipos';

export type CategoriaLogro = 'constancia' | 'acumulado' | 'sesion' | 'circuitos' | 'amigos' | 'fechas' | 'entrenamientos';

/** Orden y título de las categorías en la pantalla de logros. */
export const CATEGORIAS: [CategoriaLogro, string][] = [
  ['constancia', 'Constancia'],
  ['acumulado', 'Acumulado'],
  ['sesion', 'En una sesión'],
  ['circuitos', 'Circuitos y puertos'],
  ['amigos', 'Con amigos'],
  ['fechas', 'Horarios y fechas'],
  ['entrenamientos', 'Entrenamientos'],
];

export interface Logro {
  id: string;
  icono: string;
  nombre: string;
  descripcion: string;
  categoria: CategoriaLogro;
}

interface Datos {
  lista: EntrenoGuardado[];
  sesiones: number;
  km: number;
  horas: number;
  desnivel: number;
  horasRueda: number;
  racha: number;
  /** Sesiones en las que se coincidió con alguien en la salida en grupo. */
  enGrupo: EntrenoGuardado[];
  /** Amigos distintos con los que se ha coincidido. */
  amigos: number;
  /** Entrenamientos distintos completados (todos) y cuántos de ellos son de la biblioteca. */
  completados: Set<string>;
  biblioteca: number;
  /** Vueltas completas por circuito. */
  vueltas: Record<string, number>;
}

type Def = Logro & {
  conseguido: (d: Datos) => boolean;
  /** Para los que van por niveles: [llevas, objetivo, unidad]. */
  progreso?: (d: Datos) => [number, number, string];
};

const alguna = (d: Datos, f: (g: EntrenoGuardado) => boolean) => d.lista.some(f);
const hora = (g: EntrenoGuardado) => new Date(g.inicio).getHours();
const circuitosDe = (g: EntrenoGuardado) => new Set((g.resumen.circuitos ?? []).map(([, c]) => c)).size;

/** Logro de una cifra acumulada, con su barra de progreso. */
function nivel(
  categoria: CategoriaLogro,
  id: string,
  icono: string,
  nombre: string,
  descripcion: string,
  objetivo: number,
  valor: (d: Datos) => number,
  unidad: string,
): Def {
  return {
    id,
    icono,
    nombre,
    descripcion,
    categoria,
    conseguido: (d) => valor(d) >= objetivo,
    progreso: (d) => [Math.floor(valor(d)), objetivo, unidad],
  };
}

const sesiones = (d: Datos) => d.sesiones;
const km = (d: Datos) => d.km;
const horas = (d: Datos) => d.horas;
const desnivel = (d: Datos) => d.desnivel;
const racha = (d: Datos) => d.racha;
const rueda = (d: Datos) => d.horasRueda;

/** Hay un sábado con sesión y también el domingo siguiente. */
function finDeSemanaCompleto(lista: EntrenoGuardado[]) {
  const dias = new Set(lista.map((g) => new Date(g.inicio).toDateString()));
  return lista.some((g) => {
    const d = new Date(g.inicio);
    if (d.getDay() !== 6) return false;
    d.setDate(d.getDate() + 1);
    return dias.has(d.toDateString());
  });
}

/** La mejor serie de lunes seguidos (semana tras semana) con sesión. */
function lunesSeguidos(lista: EntrenoGuardado[]) {
  const dias = [
    ...new Set(
      lista
        .filter((g) => new Date(g.inicio).getDay() === 1)
        .map((g) => {
          const d = new Date(g.inicio);
          d.setHours(12, 0, 0, 0); // a mediodía: así el cambio de hora no descuadra los días
          return Math.round(d.getTime() / 86400000);
        }),
    ),
  ].sort((a, b) => a - b);
  let mejor = 0;
  let serie = 0;
  dias.forEach((dia, i) => {
    serie = i > 0 && dia - dias[i - 1] === 7 ? serie + 1 : 1;
    mejor = Math.max(mejor, serie);
  });
  return mejor;
}

/** true si en el navegador hay un objeto no vacío guardado con esa clave. */
function hayEnNavegador(clave: string) {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? '{}');
    return !!v && Object.keys(v).length > 0;
  } catch {
    return false;
  }
}

/**
 * Las subidas de cada circuito: se coronan al terminar su segmento. Los tramos extra no cuentan
 * (son contrarrelojes, bajadas o el paseo marítimo, no puertos).
 */
const PUERTOS: Def[] = CIRCUITOS.flatMap((c) =>
  segmentosDe(c)
    .filter((s) => s.tipo === 'subida' && s.id.startsWith('subida-'))
    .map((s) => ({
      // «sierra» era el logro de antes para el Puerto de la Sierra: se mantiene su id
      id: c.id === 'sierra' && s.id === 'subida-1' ? 'sierra' : `puerto-${c.id}-${s.id}`,
      icono: '⛰️',
      nombre: `Coronas ${s.nombre}`,
      descripcion: `Sube entero ${s.nombre} (${c.nombre})`,
      categoria: 'circuitos' as const,
      conseguido: () => miRecord(s.id, c.id) !== undefined,
    })),
);

/** 10 vueltas completas a cada circuito. */
const DIEZ_VUELTAS: Def[] = CIRCUITOS.map((c) =>
  nivel('circuitos', `vueltas10-${c.id}`, '🔁', `Fijo en ${c.nombre}`, `10 vueltas completas a ${c.nombre}`, 10, (d) => d.vueltas[c.id] ?? 0, 'vueltas'),
);

/** Entrenamientos de la biblioteca: de 10 en 10 hasta hacerlos todos. */
const TOTAL_BIBLIOTECA = new Set(CATALOGO.map((e) => e.id)).size;
const BIBLIOTECA: Def[] = [
  ...Array.from({ length: Math.floor((TOTAL_BIBLIOTECA - 1) / 10) }, (_, i) => (i + 1) * 10).map((n) =>
    nivel('entrenamientos', `biblioteca${n}`, '📚', `Biblioteca: ${n}`, `Completa ${n} entrenamientos distintos de la biblioteca`, n, (d) => d.biblioteca, 'entrenos'),
  ),
  nivel('entrenamientos', 'bibliotecaTodos', '🎓', 'Biblioteca completa', `Completa los ${TOTAL_BIBLIOTECA} entrenamientos de la biblioteca`, TOTAL_BIBLIOTECA, (d) => d.biblioteca, 'entrenos'),
];

const LOGROS: Def[] = [
  // ---- Constancia ----
  { id: 'primera', icono: '🚲', nombre: 'Primera pedalada', descripcion: 'Tu primera sesión en RideCrew', categoria: 'constancia', conseguido: (d) => d.sesiones >= 1 },
  nivel('constancia', 'sesiones5', '✋', 'Calentando', '5 sesiones', 5, sesiones, 'sesiones'),
  nivel('constancia', 'sesiones10', '🔟', 'Constante', '10 sesiones', 10, sesiones, 'sesiones'),
  nivel('constancia', 'sesiones25', '🎯', 'Cogiendo el hábito', '25 sesiones', 25, sesiones, 'sesiones'),
  nivel('constancia', 'sesiones50', '🏅', 'Fijo en el rodillo', '50 sesiones', 50, sesiones, 'sesiones'),
  nivel('constancia', 'sesiones100', '💯', 'Cien sesiones', '100 sesiones', 100, sesiones, 'sesiones'),
  nivel('constancia', 'sesiones250', '🏛️', 'Leyenda del rodillo', '250 sesiones', 250, sesiones, 'sesiones'),
  nivel('constancia', 'racha2', '🕯️', 'Primera chispa', '2 semanas seguidas rodando', 2, racha, 'semanas'),
  nivel('constancia', 'racha4', '🔥', 'En racha', '4 semanas seguidas rodando', 4, racha, 'semanas'),
  nivel('constancia', 'racha8', '🌋', 'Encendido', '8 semanas seguidas rodando', 8, racha, 'semanas'),
  nivel('constancia', 'racha12', '☄️', 'Imparable', '12 semanas seguidas rodando', 12, racha, 'semanas'),
  nivel('constancia', 'racha26', '🌞', 'Medio año sin fallar', '26 semanas seguidas rodando', 26, racha, 'semanas'),
  nivel('constancia', 'racha52', '👑', 'Un año entero', '52 semanas seguidas rodando', 52, racha, 'semanas'),

  // ---- Acumulado ----
  nivel('acumulado', 'km50total', '🛴', '50 km', '50 km acumulados', 50, km, 'km'),
  nivel('acumulado', 'km100', '🛣️', '100 km', '100 km acumulados', 100, km, 'km'),
  nivel('acumulado', 'km250', '🧳', '250 km', '250 km acumulados', 250, km, 'km'),
  nivel('acumulado', 'km500', '🗺️', '500 km', '500 km acumulados', 500, km, 'km'),
  nivel('acumulado', 'km1000', '🌍', '1.000 km', '1.000 km acumulados', 1000, km, 'km'),
  nivel('acumulado', 'km2500', '🚂', '2.500 km', '2.500 km acumulados', 2500, km, 'km'),
  nivel('acumulado', 'km5000', '✈️', '5.000 km', '5.000 km acumulados', 5000, km, 'km'),
  nivel('acumulado', 'km10000', '🌐', 'Vuelta al mundo', '10.000 km acumulados: la vuelta al mundo por etapas', 10000, km, 'km'),
  nivel('acumulado', 'horas10', '⏱️', '10 horas', '10 horas pedaleando', 10, horas, 'h'),
  nivel('acumulado', 'horas25', '🕰️', '25 horas', '25 horas pedaleando', 25, horas, 'h'),
  nivel('acumulado', 'horas50', '⌛', '50 horas', '50 horas pedaleando', 50, horas, 'h'),
  nivel('acumulado', 'horas100', '⏳', '100 horas', '100 horas pedaleando', 100, horas, 'h'),
  nivel('acumulado', 'horas250', '🗿', '250 horas', '250 horas pedaleando', 250, horas, 'h'),
  nivel('acumulado', 'desnivel1000', '📈', 'Kilómetro vertical', '1.000 m de desnivel acumulado', 1000, desnivel, 'm'),
  nivel('acumulado', 'ventoux', '🌬️', 'Mont Ventoux', '1.910 m de desnivel acumulado, lo que mide el Gigante de Provenza', 1910, desnivel, 'm'),
  nivel('acumulado', 'tourmalet', '🐂', 'Tourmalet', '2.115 m de desnivel acumulado, lo que mide el Tourmalet', 2115, desnivel, 'm'),
  nivel('acumulado', 'everest', '🏔️', 'Everesting', '8.848 m de desnivel acumulado', 8848, desnivel, 'm'),
  nivel('acumulado', 'everest2', '🚀', 'Doble Everest', '17.696 m de desnivel acumulado', 17696, desnivel, 'm'),

  // ---- En una sesión ----
  { id: 'fondo', icono: '🦵', nombre: 'Fondista', descripcion: 'Una sesión de 2 horas', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.duracionS >= 7200) },
  { id: 'fondo3h', icono: '🐢', nombre: 'Gran fondo', descripcion: 'Una sesión de 3 horas', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.duracionS >= 3 * 3600) },
  { id: 'fondo4h', icono: '🦣', nombre: 'Etapa reina', descripcion: 'Una sesión de 4 horas', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.duracionS >= 4 * 3600) },
  // «km50» es el id que ya tenía «Medio centenar» (50 km en una sesión)
  { id: 'km50', icono: '🚀', nombre: 'Medio centenar', descripcion: '50 km en una sesión', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.distanciaM >= 50000) },
  { id: 'km75', icono: '🛤️', nombre: '75 km', descripcion: '75 km en una sesión', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.distanciaM >= 75000) },
  { id: 'km100sesion', icono: '💯', nombre: 'El centenario', descripcion: '100 km en una sesión', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.distanciaM >= 100000) },
  { id: 'desnivelSesion1000', icono: '🧗', nombre: 'Día de montaña', descripcion: '1.000 m de desnivel en una sesión', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.desnivelM >= 1000) },
  { id: 'vatios600', icono: '⚡', nombre: 'Sprinter', descripcion: 'Un pico de 600 W', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => (g.resumen.potenciaMax ?? 0) >= 600) },
  { id: 'vatios800', icono: '🌩️', nombre: 'Velocista', descripcion: 'Un pico de 800 W', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => (g.resumen.potenciaMax ?? 0) >= 800) },
  { id: 'vatios1000', icono: '💥', nombre: 'Mil vatios', descripcion: 'Un pico de 1.000 W', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => (g.resumen.potenciaMax ?? 0) >= 1000) },
  { id: 'velocidad60', icono: '🏎️', nombre: 'Kamikaze', descripcion: 'Pasar de 60 km/h (cuesta abajo vale)', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => (g.resumen.velocidadMax ?? 0) > 60) },
  { id: 'kj1000', icono: '🍔', nombre: 'Quemahamburguesas', descripcion: '1.000 kJ de trabajo en una sesión', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => g.resumen.kilojulios >= 1000) },
  { id: 'molinillo', icono: '🌀', nombre: 'Molinillo', descripcion: 'Una hora seguida a más de 90 rpm de media', categoria: 'sesion', conseguido: (d) => alguna(d, (g) => (g.resumen.mejorHoraCadencia ?? 0) > 90) },

  // ---- Circuitos y puertos ----
  {
    id: 'turista',
    icono: '🧭',
    nombre: 'Turista',
    descripcion: 'Una vuelta completa en cada circuito',
    categoria: 'circuitos',
    conseguido: () => CIRCUITOS.every((c) => miRecord('vuelta', c.id) !== undefined),
  },
  ...PUERTOS,
  ...DIEZ_VUELTAS,
  { id: 'trotamundos', icono: '🔀', nombre: 'Trotamundos', descripcion: 'Cambiar de circuito al cruzar la meta', categoria: 'circuitos', conseguido: (d) => alguna(d, (g) => circuitosDe(g) >= 2) },
  { id: 'todosCircuitos', icono: '🎡', nombre: 'Gira completa', descripcion: `Rodar en los ${CIRCUITOS.length} circuitos en una misma sesión`, categoria: 'circuitos', conseguido: (d) => alguna(d, (g) => circuitosDe(g) >= CIRCUITOS.length) },
  { id: 'mejoraRecord', icono: '📉', nombre: 'Superándote', descripcion: 'Mejorar tu propio récord en un segmento', categoria: 'circuitos', conseguido: (d) => alguna(d, (g) => (g.resumen.recordsMejorados ?? 0) > 0) },

  // ---- Con amigos ----
  { id: 'grupo1', icono: '👋', nombre: 'Primera grupeta', descripcion: 'Tu primera salida en grupo con amigos', categoria: 'amigos', conseguido: (d) => d.enGrupo.length >= 1 },
  nivel('amigos', 'grupo10', '🚴', 'Habitual de la grupeta', '10 salidas en grupo', 10, (d) => d.enGrupo.length, 'salidas'),
  { id: 'peloton', icono: '🐝', nombre: 'Pelotón', descripcion: 'Rodar con 3 o más amigos a la vez', categoria: 'amigos', conseguido: (d) => alguna(d, (g) => (g.resumen.maxGrupo ?? 0) >= 3) },
  nivel('amigos', 'amigos5', '🤝', 'Sociable', 'Coincidir con 5 amigos distintos', 5, (d) => d.amigos, 'amigos'),
  nivel('amigos', 'rueda1h', '🧛', 'Chupa ruedas', '1 hora a rueda de otro (acumulado)', 1, rueda, 'h'),
  nivel('amigos', 'rueda5h', '🦇', 'Chupa ruedas profesional', '5 horas a rueda de otro (acumulado)', 5, rueda, 'h'),
  nivel('amigos', 'rueda10h', '🧟', 'Chupa ruedas legendario', '10 horas a rueda de otro (acumulado)', 10, rueda, 'h'),
  {
    id: 'alViento',
    icono: '💨',
    nombre: 'Siempre al viento',
    descripcion: 'Una salida en grupo de 1 hora casi sin ir a rueda (menos del 5 %)',
    categoria: 'amigos',
    conseguido: (d) => d.enGrupo.some((g) => g.resumen.duracionS >= 3600 && (g.resumen.segundosRueda ?? 0) < g.resumen.duracionS * 0.05),
  },

  // ---- Horarios y fechas ----
  { id: 'madrugador', icono: '🌅', nombre: 'Madrugador', descripcion: 'Empezar a rodar antes de las 7:00', categoria: 'fechas', conseguido: (d) => alguna(d, (g) => hora(g) >= 4 && hora(g) < 7) },
  { id: 'buho', icono: '🦉', nombre: 'Búho', descripcion: 'Empezar a rodar a partir de las 22:00', categoria: 'fechas', conseguido: (d) => alguna(d, (g) => hora(g) >= 22 || hora(g) < 4) },
  { id: 'finde', icono: '⚔️', nombre: 'Fin de semana guerrero', descripcion: 'Rodar el sábado y el domingo del mismo fin de semana', categoria: 'fechas', conseguido: (d) => finDeSemanaCompleto(d.lista) },
  {
    id: 'turron',
    icono: '🎄',
    nombre: 'Turrón quemado',
    descripcion: 'Rodar el 25 de diciembre o el 1 de enero',
    categoria: 'fechas',
    conseguido: (d) =>
      alguna(d, (g) => {
        const f = new Date(g.inicio);
        return (f.getMonth() === 11 && f.getDate() === 25) || (f.getMonth() === 0 && f.getDate() === 1);
      }),
  },
  nivel('fechas', 'lunes4', '📅', 'Lunes sin excusas', 'Rodar 4 lunes seguidos', 4, (d) => lunesSeguidos(d.lista), 'lunes'),

  // ---- Entrenamientos ----
  { id: 'erg1', icono: '🎛️', nombre: 'Primer entrenamiento', descripcion: 'Completar tu primer entrenamiento guiado (ERG)', categoria: 'entrenamientos', conseguido: (d) => d.completados.size >= 1 },
  ...BIBLIOTECA,
  { id: 'propio', icono: '✏️', nombre: 'Entrenador', descripcion: 'Crear o importar un entrenamiento propio', categoria: 'entrenamientos', conseguido: () => cargarPropios().length > 0 },
  // La clave es la de components/Strava.tsx (sesiones ya subidas)
  { id: 'strava', icono: '🧡', nombre: 'Si no está en Strava…', descripcion: 'Subir tu primera sesión a Strava', categoria: 'entrenamientos', conseguido: () => hayEnNavegador('rodillos.strava.subidos') },
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
  const enGrupo = lista.filter((g) => (g.resumen.companeros?.length ?? 0) > 0);
  const completados = new Set(lista.flatMap((g) => g.resumen.entrenosCompletados ?? []));
  const enCatalogo = new Set(CATALOGO.map((e) => e.id));
  const vueltas: Record<string, number> = {};
  for (const g of lista)
    for (const [c, n] of Object.entries(g.resumen.vueltasCircuito ?? {})) vueltas[c] = (vueltas[c] ?? 0) + n;
  return {
    lista,
    sesiones: lista.length,
    km: suma((g) => g.resumen.distanciaM) / 1000,
    horas: suma((g) => g.resumen.duracionS) / 3600,
    desnivel: suma((g) => g.resumen.desnivelM),
    horasRueda: suma((g) => g.resumen.segundosRueda ?? 0) / 3600,
    racha: rachaSemanas(lista),
    enGrupo,
    amigos: new Set(enGrupo.flatMap((g) => g.resumen.companeros ?? [])).size,
    completados,
    biblioteca: [...completados].filter((id) => enCatalogo.has(id)).length,
    vueltas,
  };
}

export type LogroCalculado = Logro & { conseguido: boolean; progreso?: [number, number, string] };

/** Todos los logros, marcando los conseguidos y cuánto llevas de los que van por niveles. */
export function calcularLogros(lista: EntrenoGuardado[]): LogroCalculado[] {
  const d = datosDe(lista);
  return LOGROS.map(({ conseguido, progreso, ...l }) => ({ ...l, conseguido: conseguido(d), progreso: progreso?.(d) }));
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

/** Sube cuando se añaden logros: los que ya se tenían se dan por vistos sin celebrarlos. */
const VERSION_LOGROS = 2;
const CLAVE_VERSION = 'rodillos.logrosVersion';

/**
 * La primera vez (y cada vez que hay logros nuevos en la web) se dan por vistos los que ya
 * tenías, para no celebrarlos todos de golpe al terminar la próxima sesión.
 */
export function iniciarLogrosVistos(lista: EntrenoGuardado[]) {
  let version = 0;
  try {
    version = Number(localStorage.getItem(CLAVE_VERSION)) || 0;
  } catch {
    // sin almacenamiento
  }
  const vistos = leerVistos();
  if (vistos !== null && version >= VERSION_LOGROS) return;
  const conseguidos = calcularLogros(lista).filter((l) => l.conseguido).map((l) => l.id);
  guardarVistos([...new Set([...(vistos ?? []), ...conseguidos])]);
  try {
    localStorage.setItem(CLAVE_VERSION, String(VERSION_LOGROS));
  } catch {
    // no pasa nada
  }
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
