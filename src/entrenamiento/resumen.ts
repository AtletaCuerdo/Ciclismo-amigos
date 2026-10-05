import type { Muestra, Resumen } from './tipos';

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const maximo = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);

/** Calcula las estadísticas finales de un entrenamiento a partir de sus muestras. */
export function calcularResumen(
  muestras: Muestra[],
  duracionS: number,
  potenciaEstimada: boolean,
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
  };
}

/**
 * Pasa los cortes de los intervalos (segundos en marcha de la grabación) a números de muestra.
 * No son lo mismo: el temporizador del navegador tarda algo más de 1 s entre muestras, y en media
 * hora se acumulan decenas de segundos (las vueltas de Strava acababan desplazadas). Se cuenta el
 * tiempo real entre muestras, sin las pausas, y se descartan los cortes a menos de 10 s del anterior.
 */
export function muestrasDeCortes(muestras: Muestra[], cortesS: number[]): number[] {
  const enMarcha: number[] = [];
  let s = 0;
  for (let i = 0; i < muestras.length; i++) {
    const dt = i === 0 ? 1 : (muestras[i].t - muestras[i - 1].t) / 1000;
    s += dt > 0 && dt <= 5 ? dt : 1; // un hueco largo es una pausa: cuenta como un segundo
    enMarcha.push(s);
  }
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
