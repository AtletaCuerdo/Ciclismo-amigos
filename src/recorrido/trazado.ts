/**
 * Trazado horizontal de un circuito: una curva cerrada (la forma del circuito) escalada para
 * medir exactamente una vuelta, muestreada cada `paso` metros. Lo usan la escena 3D y la
 * exportación a Strava (para el mapa de la actividad).
 */
import * as THREE from 'three';
import { longitudDe, type DefCircuito } from './circuitos';

export interface Trazado {
  n: number;
  x: Float32Array;
  z: Float32Array;
  dx: Float32Array; // dirección unitaria
  dz: Float32Array;
  centroX: number;
  centroZ: number;
}

export function trazadoDe(c: DefCircuito, paso: number): Trazado {
  const longitud = longitudDe(c);
  const puntos: THREE.Vector3[] = [];
  const { n, rx, rz, ondas } = c.forma;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // La primera onda con seno y las demás con coseno, como la forma original del lago
    const r = 1 + ondas.reduce((t, [amp, frec, fase], k) => t + amp * (k === 0 ? Math.sin : Math.cos)(frec * a + fase), 0);
    puntos.push(new THREE.Vector3(Math.cos(a) * rx * r, 0, Math.sin(a) * rz * r));
  }
  let curva = new THREE.CatmullRomCurve3(puntos, true, 'centripetal');
  curva.arcLengthDivisions = 6000;
  const escala = longitud / curva.getLength();
  curva = new THREE.CatmullRomCurve3(
    puntos.map((p) => p.multiplyScalar(escala)),
    true,
    'centripetal',
  );
  curva.arcLengthDivisions = 6000;

  // Puntos de la forma general cada metro y, encima, las curvas a izquierda y derecha (meandros)
  const m = c.forma.meandros ?? [];
  const nd = Math.round(longitud);
  const bx = new Float64Array(nd + 1);
  const bz = new Float64Array(nd + 1);
  for (let i = 0; i <= nd; i++) {
    const u = (i % nd) / nd;
    const p = curva.getPointAt(u);
    let desvio = 0;
    for (const [amp, ondaM, fase] of m) {
      // Número entero de ondas por vuelta, para que la carretera cierre sin saltos
      const k = Math.max(1, Math.round(longitud / ondaM));
      desvio += amp * Math.sin(2 * Math.PI * k * u + fase);
    }
    if (desvio !== 0) {
      const d = curva.getTangentAt(u);
      const l = Math.hypot(d.x, d.z) || 1;
      bx[i] = p.x - (d.z / l) * desvio;
      bz[i] = p.z + (d.x / l) * desvio;
    } else {
      bx[i] = p.x;
      bz[i] = p.z;
    }
  }
  // Longitud real con las curvas: se reparte de nuevo para que la vuelta mida exactamente lo mismo
  const acum = new Float64Array(nd + 1);
  for (let i = 1; i <= nd; i++) acum[i] = acum[i - 1] + Math.hypot(bx[i] - bx[i - 1], bz[i] - bz[i - 1]);
  const factor = longitud / acum[nd];

  const total = Math.round(longitud / paso);
  const t: Trazado = {
    n: total,
    x: new Float32Array(total),
    z: new Float32Array(total),
    dx: new Float32Array(total),
    dz: new Float32Array(total),
    centroX: 0,
    centroZ: 0,
  };
  // Punto a la distancia «objetivo» (m) del polígono con curvas
  let j = 0;
  const enDistancia = (objetivo: number): [number, number] => {
    while (j < nd - 1 && acum[j + 1] < objetivo) j++;
    const f = (objetivo - acum[j]) / Math.max(1e-9, acum[j + 1] - acum[j]);
    return [(bx[j] + (bx[j + 1] - bx[j]) * f) * factor, (bz[j] + (bz[j + 1] - bz[j]) * f) * factor];
  };
  const xs = new Float64Array(total);
  const zs = new Float64Array(total);
  for (let i = 0; i < total; i++) [xs[i], zs[i]] = enDistancia((i / total) * acum[nd]);
  for (let i = 0; i < total; i++) {
    const a = (i - 1 + total) % total;
    const b = (i + 1) % total;
    const dx = xs[b] - xs[a];
    const dz = zs[b] - zs[a];
    const largo = Math.hypot(dx, dz) || 1;
    const p = { x: xs[i], z: zs[i] };
    t.x[i] = p.x;
    t.z[i] = p.z;
    t.dx[i] = dx / largo;
    t.dz[i] = dz / largo;
    t.centroX += p.x / total;
    t.centroZ += p.z / total;
  }
  return t;
}
