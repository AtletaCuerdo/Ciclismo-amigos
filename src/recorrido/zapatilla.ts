/**
 * Zapatillas de ciclismo: una malla que envuelve el pie del modelo (así los dedos no se ven),
 * con suela rígida de carbono, empeine del color de las zapatillas, franjas del color de acento
 * y la rueda de cierre.
 *
 * Se construye en coordenadas del modelo en reposo a partir de los vértices del propio pie
 * (unión suave de esferas), y quien la usa la cuelga del hueso del pie.
 */
import * as THREE from 'three';
import { mallaGuardada } from './cacheMallas';
import { cilindroZ, libre, mallaSdf, tuboCurvo, type Primitiva } from './sdf';

const media = (ps: THREE.Vector3[]) => ps.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, ps.length));

/** Vértices (en reposo) cuyo hueso principal es el pie o los dedos del lado indicado. */
function verticesPie(cuerpo: THREE.SkinnedMesh, lado: 'l' | 'r') {
  const g = cuerpo.geometry;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ind = g.attributes.skinIndex as THREE.BufferAttribute;
  const pes = g.attributes.skinWeight as THREE.BufferAttribute;
  const huesos = cuerpo.skeleton.bones;
  const res: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    let mejor = 0;
    let h = 0;
    for (let k = 0; k < 4; k++) {
      const w = pes.getComponent(i, k);
      if (w > mejor) {
        mejor = w;
        h = ind.getComponent(i, k);
      }
    }
    const n = huesos[h]?.name;
    if (n === `foot_${lado}` || n === `ball_${lado}`) res.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  }
  return res;
}

// Zonas (mismo material que el cuadro): pintura = empeine, secundario = franjas, carbono = suela
const EMPEINE: [number, number, number, number] = [0, 0, 0, 0];
const FRANJA: [number, number, number, number] = [1, 0, 0, 0];
const SUELA: [number, number, number, number] = [0, 1, 0, 0];
const CIERRE: [number, number, number, number] = [0, 0, 1, 0];

export function geometriaZapatilla(cuerpo: THREE.SkinnedMesh, clave: string, lado: 'l' | 'r') {
  return mallaGuardada(`zapatilla|${clave}|${lado}`, () => {
    const pts = verticesPie(cuerpo, lado);
    const caja3 = new THREE.Box3().setFromPoints(pts);
    const suelo = caja3.min.y;
    const tobillo = caja3.min.y + 0.078; // altura del borde de la zapatilla
    const prims: Primitiva[] = [];
    // Horma: eje del talón a la puntera y, tramo a tramo, el ancho y alto del pie (con holgura)
    const bajos = pts.filter((p) => p.y < tobillo + 0.02);
    const talon = media(bajos.filter((p) => p.z < caja3.min.z + 0.04));
    const punta = media(bajos.filter((p) => p.z > caja3.max.z - 0.04));
    const eje = new THREE.Vector3(punta.x - talon.x, 0, punta.z - talon.z).normalize();
    const lat = new THREE.Vector3(eje.z, 0, -eje.x);
    const N = 9;
    const tramos = Array.from({ length: N }, () => ({ wMin: Infinity, wMax: -Infinity, yMin: Infinity, yMax: -Infinity }));
    let sMin = Infinity;
    let sMax = -Infinity;
    for (const p of bajos) {
      const s = (p.x - talon.x) * eje.x + (p.z - talon.z) * eje.z;
      sMin = Math.min(sMin, s);
      sMax = Math.max(sMax, s);
    }
    for (const p of bajos) {
      const s = (p.x - talon.x) * eje.x + (p.z - talon.z) * eje.z;
      const w = (p.x - talon.x) * lat.x + (p.z - talon.z) * lat.z;
      const t = tramos[Math.min(N - 1, Math.floor(((s - sMin) / (sMax - sMin)) * N))];
      t.wMin = Math.min(t.wMin, w);
      t.wMax = Math.max(t.wMax, w);
      t.yMin = Math.min(t.yMin, p.y);
      t.yMax = Math.max(t.yMax, p.y);
    }
    const H = 0.006; // holgura
    const centros: [number, number, number][] = [];
    const altos: number[] = [];
    const anchos: number[] = [];
    tramos.forEach((t, i) => {
      const s = sMin + ((i + 0.5) / N) * (sMax - sMin);
      const w = (t.wMin + t.wMax) / 2;
      const y = (t.yMin + t.yMax) / 2;
      centros.push([talon.x + eje.x * s + lat.x * w, y, talon.z + eje.z * s + lat.z * w]);
      altos.push((t.yMax - t.yMin) / 2 + H);
      anchos.push((t.wMax - t.wMin) / 2 + H);
    });
    // Medidas suavizadas entre tramos (sin escalones en el empeine)
    const suavizar = (v: number[]) => {
      for (let k = 0; k < 2; k++) {
        const c = v.slice();
        for (let i = 1; i < v.length - 1; i++) v[i] = Math.max(c[i], (c[i - 1] + 2 * c[i] + c[i + 1]) / 4);
      }
    };
    suavizar(altos);
    suavizar(anchos);
    // Los extremos se acercan a talón y puntera (las tapas redondeadas cubren el resto)
    const interp = (v: number[]) => (u: number) => {
      const f = u * (N - 1);
      const i = Math.min(N - 2, Math.floor(f));
      return THREE.MathUtils.lerp(v[i], v[i + 1], f - i);
    };
    prims.push(...tuboCurvo(centros, interp(altos), interp(anchos), { k: 0.01, id: 1, lateral: [lat.x, 0, lat.z], divisiones: 24 }));
    // Suela: plataforma plana bajo la horma
    prims.push(...tuboCurvo(centros.map(([x, , z]) => [x, suelo - 0.004, z] as [number, number, number]), () => 0.009, (u) => interp(anchos)(u) + 0.002, { k: 0.012, id: 2, lateral: [lat.x, 0, lat.z], divisiones: 24 }));
    // Recorte del borde superior (inclinado: más alto en el talón) y de la base plana
    const zTalon = caja3.min.z;
    const largo = caja3.max.z - zTalon;
    prims.push(
      libre(
        (_x, y, z) => {
          const t = THREE.MathUtils.clamp((z - zTalon) / largo, 0, 1);
          const alto = tobillo + 0.006 - 0.05 * Math.max(0, t - 0.45);
          // Lo que se quita: por encima del borde y por debajo de la suela
          return Math.min(alto - y, y - (suelo - 0.013));
        },
        [caja3.min.x - 0.03, suelo - 0.05, zTalon - 0.03],
        [caja3.max.x + 0.03, tobillo + 0.05, caja3.max.z + 0.03],
        { resta: true, k: 0.004 },
      ),
    );
    // Rueda de cierre en el empeine
    const cx = (caja3.min.x + caja3.max.x) / 2;
    const zRueda = zTalon + largo * 0.52;
    const yRueda = tobillo - 0.012;
    const rueda = cilindroZ([0, 0, 0], 0.013, 0.005, { bisel: 0.002 });
    // Girada para mirar hacia arriba y un poco hacia fuera
    prims.push(
      libre((x, y, z) => rueda.d(x - cx, z - zRueda, -(y - yRueda - 0.004)), [cx - 0.02, yRueda - 0.02, zRueda - 0.02], [cx + 0.02, yRueda + 0.02, zRueda + 0.02], {
        id: 3,
      }),
    );
    const g = mallaSdf(prims, {
      paso: 0.0022,
      atributo: (_x, y, z, id) => {
        if (id === 3) return CIERRE;
        if (y < suelo + 0.003) return SUELA;
        // Dos franjas en diagonal por el lateral y la puntera
        const t = (z - zTalon) / largo;
        const d = t * 1.0 + (y - suelo) * 6;
        const franja = Math.abs(d - 0.55) < 0.035 || Math.abs(d - 0.68) < 0.02 || t > 0.93;
        return franja ? FRANJA : EMPEINE;
      },
    });
    return g;
  });
}
