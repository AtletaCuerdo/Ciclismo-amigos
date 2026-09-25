/**
 * Velocidad virtual a partir de la potencia, como hacen Zwift o MyWhoosh:
 * en las subidas vas más lento con los mismos vatios y en las bajadas coges inercia.
 *
 *   masa · dv/dt = P / v − (gravedad + rodadura + aire)
 */

const G = 9.81;
const CRR = 0.004; // rodadura en asfalto
const CDA = 0.32; // área frontal × coef. aerodinámico, posición en manetas
const RHO = 1.2; // densidad del aire (kg/m³)
const PASO_S = 0.05;

export class FisicaVirtual {
  /** Velocidad actual en m/s. */
  v = 0;

  /** @param masaKg ciclista + bici */
  constructor(public masaKg = 84) {}

  actualizar(potenciaW: number, pendientePct: number, dt: number) {
    const angulo = Math.atan(pendientePct / 100);
    const m = this.masaKg;
    for (let t = 0; t < dt; t += PASO_S) {
      const h = Math.min(PASO_S, dt - t);
      // Con v casi 0, la fuerza P/v se dispara: se limita como si fuera a 1 m/s
      const fuerzaPedal = Math.max(0, potenciaW) / Math.max(this.v, 1);
      const resistencia =
        m * G * Math.sin(angulo) + CRR * m * G * Math.cos(angulo) + 0.5 * RHO * CDA * this.v * this.v;
      this.v = Math.max(0, this.v + ((fuerzaPedal - resistencia) / m) * h);
    }
  }

  detener() {
    this.v = 0;
  }
}
