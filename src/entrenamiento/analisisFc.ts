/**
 * Análisis de la frecuencia cardiaca de una sesión: compara lo comparable.
 *
 * - Entrenos guiados: se juntan los bloques principales iguales (mismos vatios objetivo y misma
 *   duración, como las series de un sweet spot) y se mira cómo cambia, serie a serie, el pulso
 *   «estable» (la segunda mitad de cada serie, cuando ya ha subido) y lo que baja en el minuto
 *   siguiente. Con una regresión lineal se ve si la subida (deriva) es estadísticamente
 *   significativa (prueba t de la pendiente, p < 0,05).
 * - Rodando libre (sin series iguales): desacople aeróbico (Pa:Hr): vatios por pulsación de la
 *   primera mitad frente a la segunda.
 *
 * Con todo eso se da un veredicto y recomendaciones para los días siguientes.
 */
import { segundosEnMarcha } from './resumen';
import type { EntrenoGuardado, Muestra } from './tipos';

export interface Serie {
  n: number;
  /** Inicio (s en marcha) y duración. */
  inicioS: number;
  duracionS: number;
  objetivoW: number;
  vatios: number;
  /** Pulso medio de la segunda mitad (ya estabilizado). */
  pulsoEstable: number;
  /** Pulso de los últimos 15 s. */
  pulsoFinal: number;
  /** Lo que baja el pulso en los 60 s siguientes (undefined si no hay datos). */
  recupera?: number;
  /** Vatios por pulsación (eficiencia). */
  ef: number;
}

export interface Tendencia {
  /** Cambio por serie (ppm) y de la primera a la última según la recta. */
  porSerie: number;
  total: number;
  /** % sobre el valor de la primera (según la recta). */
  pct: number;
  significativa: boolean;
}

export type Estado = 'muy-bien' | 'bien' | 'atencion' | 'fatiga';

export interface AnalisisFc {
  tipo: 'series' | 'libre';
  /** Series comparables (tipo «series»). */
  series: Serie[];
  descripcion: string;
  deriva?: Tendencia;
  recuperacion?: Tendencia;
  /** Desacople aeróbico (%) rodando libre o, en series, entre la primera y la segunda mitad. */
  desacople?: number;
  /** Comparación con la última vez que hiciste lo mismo (eficiencia, %). */
  frenteAnterior?: { pct: number; fecha: number };
  estado: Estado;
  titulo: string;
  explicacion: string[];
  recomendaciones: string[];
  /** Lo que se guarda en el resumen para comparar con próximas sesiones. */
  huella?: { clave: string; ef: number };
}

/** t de Student crítico (dos colas, 95 %) para 1…30 grados de libertad; más allá, ~1,96. */
const T95 = [
  12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.1, 2.09, 2.09,
  2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.05, 2.04,
];
const tCritico = (gl: number) => (gl <= 0 ? Infinity : gl <= 30 ? T95[gl - 1] : 1.96 + 2.4 / gl);

/** Recta de regresión de `ys` frente al número de serie, con la prueba t de su pendiente. */
function tendencia(ys: number[]): Tendencia | undefined {
  const n = ys.length;
  if (n < 2) return undefined;
  const xs = ys.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  const a0 = my - b * mx;
  let significativa = false;
  if (n >= 3) {
    const sse = ys.reduce((a, y, i) => a + (y - (a0 + b * i)) ** 2, 0);
    const se = Math.sqrt(sse / (n - 2) / sxx);
    significativa = se === 0 ? b !== 0 : Math.abs(b / se) > tCritico(n - 2);
  }
  const total = b * (n - 1);
  return { porSerie: b, total, pct: a0 ? (total / a0) * 100 : 0, significativa };
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

const fecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const num = (x: number, d = 0) => x.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Muestras de un tramo de tiempo en marcha [desde, hasta). */
function entre(muestras: Muestra[], enMarcha: number[], desde: number, hasta: number) {
  const r: Muestra[] = [];
  for (let i = 0; i < muestras.length; i++) if (enMarcha[i] > desde && enMarcha[i] <= hasta) r.push(muestras[i]);
  return r;
}

export function analizarFc(
  muestras: Muestra[],
  bloques: [number, number, number][] | undefined,
  anteriores: EntrenoGuardado[],
): AnalisisFc | null {
  const conPulso = muestras.filter((m) => m.hr).length;
  if (conPulso < 600 || conPulso < muestras.length * 0.7) return null;
  const enMarcha = segundosEnMarcha(muestras);

  // ---- Series: bloques principales con el mismo objetivo y la misma duración ----
  const series: Serie[] = [];
  for (const [inicioS, duracionS, objetivoW] of bloques ?? []) {
    if (!objetivoW || duracionS < 45) continue;
    const dentro = entre(muestras, enMarcha, inicioS, inicioS + duracionS);
    const segunda = dentro.slice(Math.floor(dentro.length / 2));
    const pulsos = segunda.flatMap((m) => (m.hr ? [m.hr] : []));
    if (pulsos.length < Math.min(20, duracionS / 4) || dentro.length < duracionS * 0.7) continue;
    const finales = dentro.slice(-15).flatMap((m) => (m.hr ? [m.hr] : []));
    const despues = entre(muestras, enMarcha, inicioS + duracionS + 50, inicioS + duracionS + 65).flatMap((m) =>
      m.hr ? [m.hr] : [],
    );
    const vatios = media(segunda.flatMap((m) => (m.p !== undefined ? [m.p] : [])));
    // La recuperación solo cuenta si después viene algo suave (no otra serie)
    const wDespues = media(entre(muestras, enMarcha, inicioS + duracionS, inicioS + duracionS + 60).flatMap((m) => (m.p !== undefined ? [m.p] : [])));
    const descansa = wDespues < vatios * 0.8;
    const pulsoEstable = media(pulsos);
    const pulsoFinal = media(finales);
    series.push({
      n: 0,
      inicioS,
      duracionS,
      objetivoW,
      vatios,
      pulsoEstable,
      pulsoFinal,
      recupera: descansa && despues.length >= 5 ? pulsoFinal - media(despues) : undefined,
      ef: vatios / pulsoEstable,
    });
  }
  // El grupo más numeroso de series iguales (±4 % de vatios y ±15 % de duración)
  const grupos: Serie[][] = [];
  for (const s of series) {
    const g = grupos.find(
      (gr) => Math.abs(gr[0].objetivoW - s.objetivoW) <= gr[0].objetivoW * 0.04 && Math.abs(gr[0].duracionS - s.duracionS) <= gr[0].duracionS * 0.15,
    );
    if (g) g.push(s);
    else grupos.push([s]);
  }
  const grupo = grupos.sort((a, b) => b.length - a.length || b[0].duracionS - a[0].duracionS)[0];

  const explicacion: string[] = [];
  const recomendaciones: string[] = [];
  let estado: Estado = 'bien';
  let titulo = '';

  if (grupo && grupo.length >= 3) {
    grupo.forEach((s, i) => (s.n = i + 1));
    const deriva = tendencia(grupo.map((s) => s.pulsoEstable))!;
    // Recuperación: tras cualquier bloque principal que va seguido de un descanso (en series
    // encadenadas, al acabar cada bloque grande), en orden
    const recs = series
      .filter((s) => s.recupera !== undefined)
      .sort((a, b) => a.inicioS - b.inicioS)
      .map((s) => s.recupera!);
    const recuperacion = recs.length >= 3 ? tendencia(recs) : undefined;
    const mitad = Math.floor(grupo.length / 2);
    const ef1 = media(grupo.slice(0, mitad).map((s) => s.ef));
    const ef2 = media(grupo.slice(grupo.length - mitad).map((s) => s.ef));
    const desacople = ((ef1 - ef2) / ef1) * 100;
    const dur = grupo[0].duracionS;
    const descripcion = `${grupo.length} series de ${dur >= 60 ? `${num(dur / 60, dur % 60 ? 1 : 0)}′` : `${dur}″`} a ${Math.round(grupo[0].objetivoW)} W`;

    // Veredicto
    const sube = deriva.significativa && deriva.pct > 0;
    if (sube && deriva.pct >= 5) estado = 'fatiga';
    else if (sube && deriva.pct >= 2.5) estado = 'atencion';
    else if (deriva.pct < 1.5) estado = 'muy-bien';
    else estado = 'bien';
    const recuperaPeor = !!recuperacion?.significativa && recuperacion.total < 0;
    if (recuperaPeor && estado === 'muy-bien') estado = 'bien';
    if (recuperaPeor && estado === 'bien') estado = 'atencion';

    explicacion.push(
      `Hemos comparado tus ${descripcion}. Con los mismos vatios, tu pulso ${
        Math.abs(deriva.total) < 1
          ? 'se mantuvo prácticamente igual de la primera a la última'
          : `${deriva.total > 0 ? 'subió' : 'bajó'} ${num(Math.abs(deriva.total))} ppm de la primera a la última (${deriva.pct > 0 ? '+' : '−'}${num(Math.abs(deriva.pct), 1)} %)`
      }.`,
      deriva.significativa
        ? `Esa ${deriva.total > 0 ? 'subida' : 'bajada'} es estadísticamente significativa (prueba t, p < 0,05): no es casualidad, es una tendencia clara.`
        : 'La diferencia no es estadísticamente significativa: entra dentro de lo normal de una serie a otra.',
    );
    if (recuperacion) {
      const r0 = media(recs.slice(0, 2));
      explicacion.push(
        `En el minuto de descanso después de cada bloque, el pulso bajaba ${num(r0)} ppm al principio y ${
          recuperacion.significativa
            ? recuperacion.total < 0
              ? `cada vez menos (${num(Math.abs(recuperacion.total))} ppm menos al final): recuperas más despacio a medida que avanza la sesión.`
              : `cada vez más: recuperas mejor según avanzas.`
            : 'algo parecido en las últimas: recuperas igual de bien.'
        }`,
      );
    }
    explicacion.push(
      `Desacople aeróbico (vatios por pulsación, primera mitad frente a la segunda): ${num(desacople, 1)} %${
        desacople < 3 ? ' (muy bueno)' : desacople < 5 ? ' (normal)' : ' (alto)'
      }.`,
    );

    // Frente a la última vez que hiciste lo mismo
    const clave = `${Math.round(grupo[0].objetivoW / 5) * 5}x${Math.round(dur / 30) * 30}`;
    const efSesion = media(grupo.map((s) => s.ef));
    const previa = anteriores
      .filter((g) => g.resumen.fc?.clave === clave)
      .sort((a, b) => b.inicio - a.inicio)[0];
    const frenteAnterior = previa ? { pct: ((efSesion - previa.resumen.fc!.ef) / previa.resumen.fc!.ef) * 100, fecha: previa.inicio } : undefined;
    if (frenteAnterior) {
      const p = frenteAnterior.pct;
      explicacion.push(
        Math.abs(p) < 2
          ? `Frente a la última vez (${fecha.format(frenteAnterior.fecha)}), tu pulso para los mismos vatios está igual.`
          : p > 0
            ? `Frente a la última vez (${fecha.format(frenteAnterior.fecha)}), haces los mismos vatios con ${num(p, 1)} % menos de pulso: estás mejorando. 💪`
            : `Frente a la última vez (${fecha.format(frenteAnterior.fecha)}), necesitas un ${num(Math.abs(p), 1)} % más de pulso para los mismos vatios.`,
      );
    }

    // Recomendaciones
    if (estado === 'fatiga') {
      titulo = 'Se nota fatiga: el pulso se fue disparando';
      recomendaciones.push(
        'Mañana, día suave (zona 1-2, 45-60′) o descanso.',
        'Prioriza dormir bien esta noche y las dos siguientes, y repón líquidos y sales: la deshidratación y el calor también suben el pulso.',
        'Pon el ventilador más fuerte o más cerca: en el rodillo el calor es la causa nº 1 de la deriva.',
        'Si en la próxima sesión parecida vuelve a pasar, baja la intensidad un 3-5 % (botón «−») o elige un entreno algo menos exigente.',
      );
    } else if (estado === 'atencion') {
      titulo = 'Bien, aunque con algo de cansancio al final';
      recomendaciones.push(
        'Hidrátate bien y cena con hidratos para recargar.',
        'Mañana mejor una sesión suave o de resistencia; deja las series para pasado mañana.',
        'Vigila el ventilador y bebe durante las series: con ese calor el pulso sube aunque estés bien.',
      );
      if (recuperaPeor) recomendaciones.push('Los descansos se te quedaron cortos al final: si te pasa a menudo, alárgalos un poco.');
    } else if (estado === 'muy-bien') {
      titulo = '¡Muy estable! Has asimilado muy bien la sesión';
      recomendaciones.push(
        'Tu pulso apenas se movió con los mismos vatios: señal de buena forma y buena recuperación.',
        'La próxima vez puedes subir la intensidad un 2-3 % o añadir una serie más.',
      );
      if (frenteAnterior && frenteAnterior.pct >= 3) recomendaciones.push('Llevas una buena progresión: quizá sea buen momento para repetir el test de FTP.');
    } else {
      titulo = 'Sesión bien llevada';
      recomendaciones.push(
        'La deriva es la normal de una sesión así: buen trabajo.',
        'Mantén esta intensidad unas semanas más antes de subirla.',
      );
    }
    return {
      tipo: 'series',
      series: grupo,
      descripcion,
      deriva,
      recuperacion,
      desacople,
      frenteAnterior,
      estado,
      titulo,
      explicacion,
      recomendaciones,
      huella: { clave, ef: efSesion },
    };
  }

  // ---- Rodando libre: desacople aeróbico entre la primera y la segunda mitad ----
  const conTodo = muestras.filter((m) => m.hr && m.p !== undefined && m.p > 30);
  if (conTodo.length < 1200) return null; // menos de 20 minutos pedaleando con pulso: poco para comparar
  const mitad = Math.floor(conTodo.length / 2);
  const ef = (xs: Muestra[]) => media(xs.map((m) => m.p!)) / media(xs.map((m) => m.hr!));
  const ef1 = ef(conTodo.slice(0, mitad));
  const ef2 = ef(conTodo.slice(mitad));
  const desacople = ((ef1 - ef2) / ef1) * 100;
  estado = desacople < 3 ? 'muy-bien' : desacople < 5 ? 'bien' : desacople < 8 ? 'atencion' : 'fatiga';
  explicacion.push(
    'Sin series iguales que comparar, miramos el desacople aeróbico: cuántos vatios das por cada pulsación en la primera mitad frente a la segunda.',
    `Tu desacople ha sido del ${num(desacople, 1)} % (por debajo del 5 % se considera muy buena base aeróbica).`,
  );
  titulo =
    estado === 'muy-bien'
      ? 'Muy buena base aeróbica: pulso y vatios acoplados'
      : estado === 'bien'
        ? 'Buen rodaje: desacople normal'
        : estado === 'atencion'
          ? 'El pulso subió en la segunda mitad'
          : 'Mucho desacople: cansancio o calor';
  if (estado === 'muy-bien' || estado === 'bien') {
    recomendaciones.push('Sigue así: los rodajes largos y constantes son los que más base construyen.');
  } else {
    recomendaciones.push(
      'Bebe más durante la sesión y pon más ventilador.',
      'Si no era por calor, puede ser cansancio: mañana, sesión suave y a dormir pronto.',
    );
  }
  return { tipo: 'libre', series: [], descripcion: 'Rodaje', desacople, estado, titulo, explicacion, recomendaciones };
}
