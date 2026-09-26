/**
 * Mallas suaves a partir de campos de distancia (SDF) con «surface nets».
 *
 * Sirve para piezas de una sola pieza con uniones redondeadas (cuadro de carbono, horquilla,
 * potencia, casco): cada pieza se describe como primitivas (tubos ovalados, cajas, elipsoides)
 * unidas con una unión suave, y aquí se convierte en una malla con normales del propio campo.
 *
 * Para ir rápido cada primitiva solo se evalúa dentro de su caja (ampliada con el radio de la
 * unión suave): fuera de ella no cambia el resultado.
 */
import * as THREE from 'three';

export type Vec = [number, number, number];

/** Una primitiva: distancia con signo en un punto y caja donde influye. */
export interface Primitiva {
  d: (x: number, y: number, z: number) => number;
  min: Vec;
  max: Vec;
  /** Resta (hueco) en lugar de suma. */
  resta?: boolean;
  /** Radio de la unión suave con lo anterior (m). */
  k?: number;
  /** Identificador para decorar (color por zonas). */
  id?: number;
}

/** Unión suave polinómica. */
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Resta suave (b se quita de a). */
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

/**
 * Tubo entre dos puntos con sección elíptica y radio variable.
 * `ancho` es el semieje lateral (Z) y `fondo` el semieje en el plano de la bici,
 * perpendicular al eje; ambos se interpolan de `a` a `b`.
 */
export function tubo(
  a: Vec,
  b: Vec,
  fondoA: number,
  anchoA: number,
  fondoB = fondoA,
  anchoB = anchoA,
  opciones: { k?: number; id?: number; lateral?: Vec } = {},
): Primitiva {
  const ab: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const largo = Math.hypot(...ab);
  const t: Vec = [ab[0] / largo, ab[1] / largo, ab[2] / largo];
  // Eje lateral: Z de la bici, ortogonalizado respecto al tubo
  const lat0 = opciones.lateral ?? [0, 0, 1];
  const dot = lat0[0] * t[0] + lat0[1] * t[1] + lat0[2] * t[2];
  let w: Vec = [lat0[0] - dot * t[0], lat0[1] - dot * t[1], lat0[2] - dot * t[2]];
  const lw = Math.hypot(...w);
  if (lw < 1e-6) w = [1, 0, 0];
  else w = [w[0] / lw, w[1] / lw, w[2] / lw];
  const u: Vec = [t[1] * w[2] - t[2] * w[1], t[2] * w[0] - t[0] * w[2], t[0] * w[1] - t[1] * w[0]];
  const r = Math.max(fondoA, anchoA, fondoB, anchoB);
  const k = opciones.k ?? 0;
  return {
    d: (x, y, z) => {
      const px = x - a[0];
      const py = y - a[1];
      const pz = z - a[2];
      const s = px * t[0] + py * t[1] + pz * t[2];
      const h = Math.min(Math.max(s / largo, 0), 1);
      const qx = px - t[0] * h * largo;
      const qy = py - t[1] * h * largo;
      const qz = pz - t[2] * h * largo;
      const cu = qx * u[0] + qy * u[1] + qz * u[2];
      const cw = qx * w[0] + qy * w[1] + qz * w[2];
      const cs = qx * t[0] + qy * t[1] + qz * t[2];
      const fu = fondoA + (fondoB - fondoA) * h;
      const fw = anchoA + (anchoB - anchoA) * h;
      // Elipsoide aproximado (sección elíptica y extremos redondeados)
      // Extremos redondeados con el semieje mayor: en las uniones de tramos curvos no quedan muescas
      const e = Math.hypot(cu / fu, cw / fw, cs / Math.max(fu, fw));
      return (e - 1) * Math.min(fu, fw);
    },
    min: [Math.min(a[0], b[0]) - r - k, Math.min(a[1], b[1]) - r - k, Math.min(a[2], b[2]) - r - k],
    max: [Math.max(a[0], b[0]) + r + k, Math.max(a[1], b[1]) + r + k, Math.max(a[2], b[2]) + r + k],
    k,
    id: opciones.id,
  };
}

/** Cadena de tubos que sigue una curva (secciones interpoladas a lo largo). */
export function tuboCurvo(
  puntos: Vec[],
  fondo: (t: number) => number,
  ancho: (t: number) => number,
  opciones: { k?: number; id?: number; lateral?: Vec; divisiones?: number } = {},
): Primitiva[] {
  const curva = new THREE.CatmullRomCurve3(puntos.map((p) => new THREE.Vector3(...p)));
  const n = opciones.divisiones ?? 12;
  const res: Primitiva[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const a = curva.getPoint(t0);
    const b = curva.getPoint(t1);
    res.push(
      tubo(a.toArray() as Vec, b.toArray() as Vec, fondo(t0), ancho(t0), fondo(t1), ancho(t1), {
        // Entre tramos, unión sin suavizar: la unión suave abultaría cada junta
        k: i === 0 ? opciones.k : 0,
        id: opciones.id,
        lateral: opciones.lateral,
      }),
    );
  }
  return res;
}

/** Caja redondeada centrada en `c` con semitamaños `h` y radio de esquina `r`. */
export function caja(c: Vec, h: Vec, r: number, opciones: { k?: number; id?: number; resta?: boolean } = {}): Primitiva {
  const k = opciones.k ?? 0;
  return {
    d: (x, y, z) => {
      const qx = Math.abs(x - c[0]) - h[0] + r;
      const qy = Math.abs(y - c[1]) - h[1] + r;
      const qz = Math.abs(z - c[2]) - h[2] + r;
      const fuera = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return fuera + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
    min: [c[0] - h[0] - k, c[1] - h[1] - k, c[2] - h[2] - k],
    max: [c[0] + h[0] + k, c[1] + h[1] + k, c[2] + h[2] + k],
    k,
    id: opciones.id,
    resta: opciones.resta,
  };
}

/** Cilindro de eje Z (caja del pedalier, bujes). */
export function cilindroZ(c: Vec, radio: number, mitad: number, opciones: { k?: number; id?: number; resta?: boolean; bisel?: number } = {}): Primitiva {
  const k = opciones.k ?? 0;
  const b = opciones.bisel ?? 0;
  return {
    d: (x, y, z) => {
      const dr = Math.hypot(x - c[0], y - c[1]) - radio + b;
      const dz = Math.abs(z - c[2]) - mitad + b;
      return Math.min(Math.max(dr, dz), 0) + Math.hypot(Math.max(dr, 0), Math.max(dz, 0)) - b;
    },
    min: [c[0] - radio - k, c[1] - radio - k, c[2] - mitad - k],
    max: [c[0] + radio + k, c[1] + radio + k, c[2] + mitad + k],
    k,
    id: opciones.id,
    resta: opciones.resta,
  };
}

/** Primitiva libre (con su caja). */
export function libre(
  d: (x: number, y: number, z: number) => number,
  min: Vec,
  max: Vec,
  opciones: { k?: number; id?: number; resta?: boolean } = {},
): Primitiva {
  return { d, min, max, ...opciones };
}

// ---------------------------------------------------------------------------
// Poligonización (surface nets)
// ---------------------------------------------------------------------------

export interface OpcionesMalla {
  /** Tamaño del vóxel (m). */
  paso: number;
  /** Atributo «zona» por vértice (4 pesos de material) según la posición y la primitiva más cercana. */
  atributo?: (x: number, y: number, z: number, id: number) => [number, number, number, number];
}

/** Evalúa solo las primitivas de una lista (índices en orden). */
function evaluarLista(prims: Primitiva[], lista: number[], x: number, y: number, z: number) {
  let d = 1;
  for (let n = 0; n < lista.length; n++) {
    const p = prims[lista[n]];
    // Fuera de su caja una primitiva no cambia el resultado (tampoco las restas)
    if (x < p.min[0] || y < p.min[1] || z < p.min[2] || x > p.max[0] || y > p.max[1] || z > p.max[2]) continue;
    const v = p.d(x, y, z);
    d = p.resta ? smax(d, -v, p.k ?? 0) : smin(d, v, p.k ?? 0);
  }
  return d;
}

/** Primitiva (sumada) más cercana a un punto. */
function masCercana(prims: Primitiva[], x: number, y: number, z: number) {
  let mejor = 1e9;
  let id = 0;
  for (const p of prims) {
    if (p.resta || p.id === undefined) continue;
    if (x < p.min[0] - 0.02 || y < p.min[1] - 0.02 || z < p.min[2] - 0.02 || x > p.max[0] + 0.02 || y > p.max[1] + 0.02 || z > p.max[2] + 0.02) continue;
    const v = p.d(x, y, z);
    if (v < mejor) {
      mejor = v;
      id = p.id;
    }
  }
  return id;
}

/**
 * Convierte las primitivas en una malla.
 * Las primitivas se combinan en orden: cada una se une (o se resta) a lo anterior.
 *
 * Para ir rápido: rejilla gruesa (bloques de B³ vóxeles) con la lista de primitivas que tocan
 * cada bloque; solo los bloques cerca de la superficie se calculan en fino, y solo en ellos
 * se buscan vértices y caras. Las normales salen del gradiente del campo.
 */
export function mallaSdf(prims: Primitiva[], o: OpcionesMalla): THREE.BufferGeometry {
  const paso = o.paso;
  const mn: Vec = [Infinity, Infinity, Infinity];
  const mx: Vec = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    if (p.resta) continue;
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], p.min[i]);
      mx[i] = Math.max(mx[i], p.max[i]);
    }
  }
  const B = 3;
  const bloque = B * paso;
  for (let i = 0; i < 3; i++) {
    mn[i] -= bloque;
    mx[i] += bloque;
  }
  // Rejilla fina con un número de vóxeles múltiplo de B (+1)
  const gx = Math.ceil((mx[0] - mn[0]) / bloque) + 1;
  const gy = Math.ceil((mx[1] - mn[1]) / bloque) + 1;
  const gz = Math.ceil((mx[2] - mn[2]) / bloque) + 1;
  const nx = (gx - 1) * B + 1;
  const ny = (gy - 1) * B + 1;
  const nz = (gz - 1) * B + 1;
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const bloqueDe = (i: number, j: number, k: number) => i + (gx - 1) * (j + (gy - 1) * k);
  const nBloques = (gx - 1) * (gy - 1) * (gz - 1);

  // Primitivas que tocan cada bloque
  const listas: number[][] = Array.from({ length: nBloques }, () => []);
  prims.forEach((p, n) => {
    const i0 = Math.max(0, Math.floor((p.min[0] - mn[0]) / bloque));
    const j0 = Math.max(0, Math.floor((p.min[1] - mn[1]) / bloque));
    const k0 = Math.max(0, Math.floor((p.min[2] - mn[2]) / bloque));
    const i1 = Math.min(gx - 2, Math.floor((p.max[0] - mn[0]) / bloque));
    const j1 = Math.min(gy - 2, Math.floor((p.max[1] - mn[1]) / bloque));
    const k1 = Math.min(gz - 2, Math.floor((p.max[2] - mn[2]) / bloque));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) listas[bloqueDe(i, j, k)].push(n);
  });

  // Rejilla gruesa (esquinas de los bloques)
  const gruesa = new Float32Array(gx * gy * gz);
  for (let k = 0; k < gz; k++)
    for (let j = 0; j < gy; j++)
      for (let i = 0; i < gx; i++) {
        const lista = listas[bloqueDe(Math.min(i, gx - 2), Math.min(j, gy - 2), Math.min(k, gz - 2))];
        gruesa[i + gx * (j + gy * k)] = lista.length
          ? evaluarLista(prims, lista, mn[0] + i * bloque, mn[1] + j * bloque, mn[2] + k * bloque)
          : 1;
      }

  const campo = new Float32Array(nx * ny * nz);
  const exacto = new Uint8Array(nx * ny * nz);
  const umbral = bloque * 1.9;
  const cerca: number[] = [];
  for (let ck = 0; ck < gz - 1; ck++) {
    for (let cj = 0; cj < gy - 1; cj++) {
      for (let ci = 0; ci < gx - 1; ci++) {
        let minAbs = Infinity;
        let positivo = 0;
        for (let c = 0; c < 8; c++) {
          const v = gruesa[ci + (c & 1) + gx * (cj + ((c >> 1) & 1) + gy * (ck + ((c >> 2) & 1)))];
          minAbs = Math.min(minAbs, Math.abs(v));
          if (v > 0) positivo++;
        }
        const b = bloqueDe(ci, cj, ck);
        if (listas[b].length && (minAbs < umbral || (positivo !== 0 && positivo !== 8))) {
          cerca.push(b);
          continue;
        }
        // Bloque lejos de la superficie: basta con el signo
        const valor = positivo ? umbral : -umbral;
        for (let k = ck * B; k <= ck * B + B; k++)
          for (let j = cj * B; j <= cj * B + B; j++) {
            let n = idx(ci * B, j, k);
            for (let i = 0; i <= B; i++, n++) if (!exacto[n]) campo[n] = valor;
          }
      }
    }
  }
  // Bloques cerca de la superficie: valor exacto en cada vóxel
  const coords = (b: number): [number, number, number] => {
    const ci = b % (gx - 1);
    const r = (b - ci) / (gx - 1);
    const cj = r % (gy - 1);
    return [ci, cj, (r - cj) / (gy - 1)];
  };
  for (const b of cerca) {
    const [ci, cj, ck] = coords(b);
    const lista = listas[b];
    for (let k = ck * B; k <= ck * B + B; k++) {
      const z = mn[2] + k * paso;
      for (let j = cj * B; j <= cj * B + B; j++) {
        const y = mn[1] + j * paso;
        let n = idx(ci * B, j, k);
        for (let i = ci * B; i <= ci * B + B; i++, n++) {
          if (exacto[n]) continue;
          campo[n] = evaluarLista(prims, lista, mn[0] + i * paso, y, z);
          exacto[n] = 1;
        }
      }
    }
  }

  // Un vértice por celda que corta la superficie (media de los cruces de sus aristas)
  const verticeDe = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const nor: number[] = [];
  const esq = new Float32Array(8);
  const ARISTAS = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const dx = 1;
  const dy = nx;
  const dz = nx * ny;
  const OFF = [0, dx, dy, dx + dy, dz, dx + dz, dy + dz, dx + dy + dz];
  for (const b of cerca) {
    const [ci, cj, ck] = coords(b);
    const lista = listas[b];
    for (let k = ck * B; k < ck * B + B; k++) {
      for (let j = cj * B; j < cj * B + B; j++) {
        for (let i = ci * B; i < ci * B + B; i++) {
          const n0 = idx(i, j, k);
          let signos = 0;
          for (let c = 0; c < 8; c++) {
            const v = campo[n0 + OFF[c]];
            esq[c] = v;
            if (v < 0) signos |= 1 << c;
          }
          if (signos === 0 || signos === 255) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let cnt = 0;
          for (let e = 0; e < 24; e += 2) {
            const a = ARISTAS[e];
            const bb = ARISTAS[e + 1];
            const va = esq[a];
            const vb = esq[bb];
            if (va < 0 === vb < 0) continue;
            const t = va / (va - vb);
            sx += (a & 1) + ((bb & 1) - (a & 1)) * t;
            sy += ((a >> 1) & 1) + (((bb >> 1) & 1) - ((a >> 1) & 1)) * t;
            sz += ((a >> 2) & 1) + (((bb >> 2) & 1) - ((a >> 2) & 1)) * t;
            cnt++;
          }
          const fx = sx / cnt;
          const fy = sy / cnt;
          const fz = sz / cnt;
          verticeDe[n0] = pos.length / 3;
          const x = mn[0] + (i + fx) * paso;
          const y = mn[1] + (j + fy) * paso;
          const z = mn[2] + (k + fz) * paso;
          pos.push(x, y, z);
          // Normal: gradiente del propio campo (más fino que la rejilla en los tubos delgados)
          const e = paso * 0.3;
          const gxs = evaluarLista(prims, lista, x + e, y, z) - evaluarLista(prims, lista, x - e, y, z);
          const gys = evaluarLista(prims, lista, x, y + e, z) - evaluarLista(prims, lista, x, y - e, z);
          const gzs = evaluarLista(prims, lista, x, y, z + e) - evaluarLista(prims, lista, x, y, z - e);
          const l = Math.hypot(gxs, gys, gzs) || 1;
          nor.push(gxs / l, gys / l, gzs / l);
        }
      }
    }
  }

  // Caras: una por cada arista de la rejilla que cruza la superficie
  const indices: number[] = [];
  for (const b of cerca) {
    const [ci, cj, ck] = coords(b);
    for (let k = Math.max(1, ck * B); k < ck * B + B; k++) {
      for (let j = Math.max(1, cj * B); j < cj * B + B; j++) {
        for (let i = Math.max(1, ci * B); i < ci * B + B; i++) {
          const n = idx(i, j, k);
          const v0 = campo[n] < 0;
          if (v0 !== campo[n + dx] < 0) {
            const a = verticeDe[n - dy - dz];
            const bb = verticeDe[n - dz];
            const c = verticeDe[n];
            const d = verticeDe[n - dy];
            if (a >= 0 && bb >= 0 && c >= 0 && d >= 0) cara(indices, a, bb, c, d, v0);
          }
          if (v0 !== campo[n + dy] < 0) {
            const a = verticeDe[n - dx - dz];
            const bb = verticeDe[n - dx];
            const c = verticeDe[n];
            const d = verticeDe[n - dz];
            if (a >= 0 && bb >= 0 && c >= 0 && d >= 0) cara(indices, a, bb, c, d, v0);
          }
          if (v0 !== campo[n + dz] < 0) {
            const a = verticeDe[n - dx - dy];
            const bb = verticeDe[n - dy];
            const c = verticeDe[n];
            const d = verticeDe[n - dx];
            if (a >= 0 && bb >= 0 && c >= 0 && d >= 0) cara(indices, a, bb, c, d, v0);
          }
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (o.atributo) {
    const n = pos.length / 3;
    const at = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      at.set(o.atributo(x, y, z, masCercana(prims, x, y, z)), v * 4);
    }
    g.setAttribute('zona', new THREE.BufferAttribute(at, 4));
  }
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

function cara(ind: number[], a: number, b: number, c: number, d: number, dentro: boolean) {
  if (dentro) ind.push(a, b, c, a, c, d);
  else ind.push(a, c, b, a, d, c);
}
