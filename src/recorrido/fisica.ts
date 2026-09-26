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
