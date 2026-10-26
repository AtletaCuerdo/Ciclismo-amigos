/**
 * Calorías gastadas en una sesión.
 *
 * - Por pulso (si hay pulsómetro en casi toda la sesión y se conocen la edad y el sexo): fórmula de
 *   Keytel et al. (2005, J Sports Sci), la referencia publicada para estimar el gasto con la
 *   frecuencia cardiaca, el peso y la edad. Es lo que hacen los relojes cuando estiman por pulso:
 *   en esfuerzos fuertes el pulso sube más que los vatios y salen más calorías.
 * - Por vatios: el trabajo mecánico (kJ) dividido por la eficiencia del cuerpo pedaleando (≈ 22 %).
 */
import type { Muestra } from './tipos';

export interface DatosCalorias {
  pesoKg: number;
  edad?: number;
  sexo?: 'hombre' | 'mujer';
}

/** Eficiencia bruta típica pedaleando: de cada 100 kcal que gasta el cuerpo, 22 mueven los pedales. */
const EFICIENCIA = 0.22;
const J_POR_KCAL = 4184;
/** Con pulso en menos de este tanto de la sesión se calcula por vatios. */
const MIN_CON_PULSO = 0.7;

/** kcal por minuto según el pulso (Keytel 2005). */
function kcalMinutoPulso(hr: number, d: Required<DatosCalorias>) {
  const kj =
    d.sexo === 'hombre'
      ? -55.0969 + 0.6309 * hr + 0.1988 * d.pesoKg + 0.2017 * d.edad
      : -20.4022 + 0.4472 * hr - 0.1263 * d.pesoKg + 0.074 * d.edad;
  return Math.max(0, kj / 4.184);
}

/** ¿Se puede calcular por pulso? (edad y sexo conocidos y pulso en casi toda la sesión) */
export function calculaPorPulso(muestras: Muestra[], d: DatosCalorias) {
  if (!d.edad || !d.sexo || muestras.length === 0) return false;
  return muestras.filter((m) => m.hr).length / muestras.length >= MIN_CON_PULSO;
}

/** kcal de una sesión a partir de sus muestras (una por segundo, más o menos). */
export function kcalSesion(muestras: Muestra[], d: DatosCalorias) {
  const porPulso = calculaPorPulso(muestras, d);
  let kcal = 0;
  for (let i = 0; i < muestras.length; i++) {
    const m = muestras[i];
    // Segundos que representa la muestra (las pausas no cuentan: como mucho 5 s)
    const dt = i === 0 ? 1 : Math.min(5, Math.max(0, (m.t - muestras[i - 1].t) / 1000));
    if (porPulso && m.hr) kcal += (kcalMinutoPulso(m.hr, d as Required<DatosCalorias>) * dt) / 60;
    else kcal += (Math.max(0, m.p ?? 0) * dt) / EFICIENCIA / J_POR_KCAL;
  }
  return kcal;
}
