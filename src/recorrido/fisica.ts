/**
 * Velocidad virtual a partir de la potencia, como hacen Zwift o MyWhoosh:
 * en las subidas vas más lento con los mismos vatios y en las bajadas coges inercia.
 *
 *   masa · dv/dt = P / v − (gravedad + rodadura + aire)
 *
 * La resistencia del aire depende de la bici (y la postura), el casco y las ruedas. La base es
 * algo optimista, como en Zwift: se va un 3-4 % más rápido que en la carretera.
 */
import type { Avatar, Casco, ModeloBici, TipoRuedas } from './avatar';

const G = 9.81;
const CRR = 0.004; // rodadura en asfalto
const CDA_BASE = 0.29; // área frontal × coef. aerodinámico: bici de ruta, manos en las manetas
const RHO = 1.2; // densidad del aire (kg/m³)
const PASO_S = 0.05;

/** Multiplicadores de la resistencia del aire (1 = bici de ruta, casco ventilado, perfil bajo). */
const AERO_BICI: Record<ModeloBici, number> = { ruta: 1, escaladora: 1.01, aero: 0.95, cabra: 0.83 };
const AERO_CASCO: Record<Casco, number> = { ruta: 1, clasico: 1.01, gorra: 1.02, aero: 0.97 };
const AERO_RUEDAS: Record<TipoRuedas, number> = { bajo: 1, medio: 0.985, alto: 0.975, lenticular: 0.965 };
/** Peso de cada bici (kg): la escaladora pesa menos y la cabra, más. */
const PESO_BICI: Record<ModeloBici, number> = { ruta: 8, escaladora: 7, aero: 8.3, cabra: 9 };

/** Resistencia del aire (CdA, m²) y peso de la bici para un avatar. */
export function equipoAvatar(a: Pick<Avatar, 'modelo' | 'cascoModelo' | 'ruedas'>) {
  return {
    cda: CDA_BASE * AERO_BICI[a.modelo] * AERO_CASCO[a.cascoModelo] * AERO_RUEDAS[a.ruedas],
    pesoBiciKg: PESO_BICI[a.modelo],
  };
}

export class FisicaVirtual {
  /** Velocidad actual en m/s. */
  v = 0;
  /** Área frontal × coeficiente aerodinámico (m²). */
  cda = CDA_BASE;

  /** @param masaKg ciclista + bici */
  constructor(public masaKg = 83) {}

  actualizar(potenciaW: number, pendientePct: number, dt: number) {
    const angulo = Math.atan(pendientePct / 100);
    const m = this.masaKg;
    for (let t = 0; t < dt; t += PASO_S) {
      const h = Math.min(PASO_S, dt - t);
      // Con v casi 0, la fuerza P/v se dispara: se limita como si fuera a 1 m/s
      const fuerzaPedal = Math.max(0, potenciaW) / Math.max(this.v, 1);
      const resistencia =
        m * G * Math.sin(angulo) + CRR * m * G * Math.cos(angulo) + 0.5 * RHO * this.cda * this.v * this.v;
      this.v = Math.max(0, this.v + ((fuerzaPedal - resistencia) / m) * h);
    }
  }

  detener() {
    this.v = 0;
  }
}

/** Ahorro máximo de resistencia del aire yendo a rueda (como en Zwift, 25-30 %). */
export const REBUFO_MAX = 0.3;
/** Hasta aquí detrás de otro ciclista se nota el rebufo entero (m). */
const REBUFO_PLENO_M = 3;
/** A partir de aquí ya no se nota (m). */
const REBUFO_LIMITE_M = 12;

/**
 * Ahorro de aire (0 … REBUFO_MAX) según los metros que te saca el ciclista de delante
 * más cercano. `huecos`: distancias de los demás respecto a ti (positivo = va delante).
 */
export function ahorroRebufo(huecos: number[]) {
  let mejor = 0;
  for (const h of huecos) {
    if (h < 0.3 || h > REBUFO_LIMITE_M) continue;
    const f = h <= REBUFO_PLENO_M ? 1 : (REBUFO_LIMITE_M - h) / (REBUFO_LIMITE_M - REBUFO_PLENO_M);
    mejor = Math.max(mejor, REBUFO_MAX * f);
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Cambios virtuales (rodillos con un solo piñón, como el Zwift Cog)
// ---------------------------------------------------------------------------

/**
 * Desarrollo de cada marcha virtual (vueltas de rueda por pedalada), de la 1 a la 24,
 * con el mismo reparto que usa Zwift: de un 34×34 (0,75) a más que un 53×11 (5,49).
 */
export const MARCHAS = [
  0.75, 0.87, 0.99, 1.11, 1.23, 1.38, 1.53, 1.68, 1.86, 2.04, 2.22, 2.4, 2.61, 2.82, 3.03, 3.24, 3.49, 3.74, 3.99,
  4.24, 4.54, 4.84, 5.14, 5.49,
];
export const MARCHA_INICIAL = 12;
/** Circunferencia de rueda de carretera (700×25) para las marchas virtuales (m). */
const RUEDA_M = 2.105;

/**
 * Vatios que costaría mover esta marcha a esta cadencia en esta pendiente: la velocidad
 * sale de la cadencia y el desarrollo, y la potencia de vencer gravedad, rodadura y aire.
 * El rodillo se pone en modo ERG con ese valor: pedalear más rápido o subir de marcha
 * cuesta más, como en la carretera.
 */
export function potenciaMarcha(cadenciaRpm: number, marcha: number, pendientePct: number, masaKg: number, cda: number) {
  const desarrollo = MARCHAS[Math.min(MARCHAS.length, Math.max(1, marcha)) - 1];
  const v = (Math.max(0, cadenciaRpm) / 60) * desarrollo * RUEDA_M; // m/s
  const angulo = Math.atan(pendientePct / 100);
  const fuerza = masaKg * G * Math.sin(angulo) + CRR * masaKg * G * Math.cos(angulo) + 0.5 * RHO * cda * v * v;
  return Math.max(0, fuerza * v);
}
