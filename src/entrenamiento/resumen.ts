import { calculaPorPulso, kcalSesion, type DatosCalorias } from './calorias';
import type { Muestra, Resumen } from './tipos';

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const maximo = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);

/** Calcula las estadísticas finales de un entrenamiento a partir de sus muestras. */
export function calcularResumen(
  muestras: Muestra[],
  duracionS: number,
  potenciaEstimada: boolean,
  datosCalorias?: DatosCalorias,
): Resumen {
  const potencias = muestras.flatMap((m) => (m.p !== undefined ? [Math.max(0, m.p)] : []));
  const velocidades = muestras.flatMap((m) => (m.v !== undefined ? [m.v] : []));
  const cadencias = muestras.flatMap((m) => (m.c ? [m.c] : [])); // sin ceros, como Strava
  const pulsos = muestras.flatMap((m) => (m.hr ? [m.hr] : []));
  const ultima = muestras[muestras.length - 1];
  const distanciaM = ultima?.d ?? 0;

  // Desnivel positivo: suma de todas las subidas de la altitud virtual
  let desnivelM = 0;
  for (let i = 1; i < muestras.length; i++) {
    const subida = muestras[i].alt - muestras[i - 1].alt;
    if (subida > 0) desnivelM += subida;
  }

  return {
    duracionS,
    distanciaM,
    desnivelM,
    potenciaMedia: media(potencias),
    potenciaMax: maximo(potencias),
    potenciaEstimada,
    // Velocidad media como en Strava: distancia / tiempo en marcha
    velocidadMedia: duracionS > 0 && velocidades.length ? (distanciaM / duracionS) * 3.6 : undefined,
    velocidadMax: maximo(velocidades),
    cadenciaMedia: media(cadencias),
    pulsoMedio: media(pulsos),
    pulsoMax: maximo(pulsos),
    // Una muestra ≈ 1 segundo → julios = suma de vatios
    kilojulios: potencias.reduce((a, b) => a + b, 0) / 1000,
    ...(datosCalorias
      ? { kcal: kcalSesion(muestras, datosCalorias), kcalPorPulso: calculaPorPulso(muestras, datosCalorias) }
      : {}),
  };
}

/**
 * Mejor cadencia media en una hora seguida (los ratos a 0 rpm cuentan, como si se parara).
 * undefined si la sesión no llega a la hora o no hay sensor de cadencia.
 */
export function mejorHoraCadencia(muestras: Muestra[]): number | undefined {
  if (!muestras.some((m) => m.c)) return undefined;
  const HORA_MS = 3600 * 1000;
  let mejor: number | undefined;
  let suma = 0;
  let desde = 0;
  for (let i = 0; i < muestras.length; i++) {
    suma += muestras[i].c ?? 0;
    // La ventana es de una hora de reloj (hay algo más de 1 s entre muestras)
    while (muestras[i].t - muestras[desde].t > HORA_MS) suma -= muestras[desde++].c ?? 0;
    if (muestras[i].t - muestras[desde].t >= HORA_MS - 5000) {
      const media = suma / (i - desde + 1);
      if (mejor === undefined || media > mejor) mejor = media;
    }
  }
  return mejor;
}

/**
 * Pasa los cortes de los intervalos (segundos en marcha de la grabación) a números de muestra.
 * No son lo mismo: el temporizador del navegador tarda algo más de 1 s entre muestras, y en media
 * hora se acumulan decenas de segundos (las vueltas de Strava acababan desplazadas). Se cuenta el
 * tiempo real entre muestras, sin las pausas, y se descartan los cortes a menos de 10 s del anterior.
 */
export function muestrasDeCortes(muestras: Muestra[], cortesS: number[]): number[] {
  const enMarcha = segundosEnMarcha(muestras);
  const indices: number[] = [];
  let i = 0;
  for (const c of [...new Set(cortesS)].sort((a, b) => a - b)) {
    while (i < enMarcha.length && enMarcha[i] <= c) i++;
    if (i <= 0 || i >= muestras.length) continue;
    const anterior = indices.length ? indices[indices.length - 1] : 0;
    if (enMarcha[i] - enMarcha[anterior] < 10) continue;
    indices.push(i);
  }
  return indices;
}

/** Segundos en marcha al llegar a cada muestra (tiempo real entre muestras, sin las pausas). */
function segundosEnMarcha(muestras: Muestra[]): number[] {
  const enMarcha: number[] = [];
  let s = 0;
  for (let i = 0; i < muestras.length; i++) {
    const dt = i === 0 ? 1 : (muestras[i].t - muestras[i - 1].t) / 1000;
    s += dt > 0 && dt <= 5 ? dt : 1; // un hueco largo es una pausa: cuenta como un segundo
    enMarcha.push(s);
  }
  return enMarcha;
}

/** Duraciones de los mejores vatios del resumen (s). */
export const DURACIONES_MEJORES = [180, 300, 600, 1200, 3600];

/**
 * Mejor potencia media en cada duración (ventana de tiempo real en marcha; sin potencia cuenta
 * como 0 W). Solo las duraciones que caben en la sesión.
 */
export function mejoresVatios(muestras: Muestra[]): { s: number; w: number }[] {
  if (!muestras.some((m) => m.p !== undefined)) return [];
  const enMarcha = segundosEnMarcha(muestras);
  const total = enMarcha[enMarcha.length - 1] ?? 0;
  const resultado: { s: number; w: number }[] = [];
  for (const dur of DURACIONES_MEJORES) {
    if (total < dur - 2) break;
    let mejor = 0;
    let suma = 0;
    let desde = 0;
    for (let i = 0; i < muestras.length; i++) {
      suma += Math.max(0, muestras[i].p ?? 0);
      while (enMarcha[i] - enMarcha[desde] >= dur) suma -= Math.max(0, muestras[desde++].p ?? 0);
      if (enMarcha[i] - enMarcha[desde] >= dur - 2) mejor = Math.max(mejor, suma / (i - desde + 1));
    }
    if (mejor > 0) resultado.push({ s: dur, w: Math.round(mejor) });
  }
  return resultado;
}

/** Medias de un bloque del entrenamiento (de `inicioS` a `inicioS + duracionS` en marcha). */
export interface MediasBloque {
  inicioS: number;
  duracionS: number;
  objetivoW: number;
  potencia?: number;
  pulso?: number;
  cadencia?: number;
}

export function mediasDeBloques(muestras: Muestra[], bloques: [number, number, number][]): MediasBloque[] {
  const enMarcha = segundosEnMarcha(muestras);
  return bloques.flatMap(([inicioS, duracionS, objetivoW]) => {
    const dentro = muestras.filter((_, i) => enMarcha[i] > inicioS && enMarcha[i] <= inicioS + duracionS);
    // Bloques que casi no se hicieron (se terminó antes): fuera
    if (dentro.length < Math.min(30, duracionS / 2)) return [];
    const potencias = dentro.flatMap((m) => (m.p !== undefined ? [Math.max(0, m.p)] : []));
    const pulsos = dentro.flatMap((m) => (m.hr ? [m.hr] : []));
    const cadencias = dentro.flatMap((m) => (m.c ? [m.c] : []));
    const r = (x?: number) => (x === undefined ? undefined : Math.round(x));
    return [{ inicioS, duracionS, objetivoW, potencia: r(media(potencias)), pulso: r(media(pulsos)), cadencia: r(media(cadencias)) }];
  });
}
