/**
 * Ruido de valor 2D con semilla fija (mismo resultado en todos los dispositivos)
 * y sus variantes fractales, para relieve y manchas de color.
 */

function hash(ix: number, iz: number, semilla: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(semilla, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor suave en [0, 1]. */
export function ruido(x: number, z: number, semilla = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  // Interpolación quíntica (sin escalones en las derivadas)
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash(ix, iz, semilla);
  const b = hash(ix + 1, iz, semilla);
  const c = hash(ix, iz + 1, semilla);
  const d = hash(ix + 1, iz + 1, semilla);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Suma fractal (fBm) en [0, 1] aproximadamente. */
export function fbm(x: number, z: number, octavas = 5, semilla = 1) {
  let suma = 0;
  let amplitud = 0.5;
  let total = 0;
  for (let i = 0; i < octavas; i++) {
    suma += ruido(x, z, semilla + i * 17) * amplitud;
    total += amplitud;
    // Rotación entre octavas para que no se alineen
    const nx = x * 1.6 + z * 1.2;
    z = -x * 1.2 + z * 1.6;
    x = nx;
    amplitud *= 0.5;
  }
  return suma / total;
}

/** Ruido de crestas (montañas con aristas marcadas) en [0, 1]. */
export function crestas(x: number, z: number, octavas = 6, semilla = 7) {
  let suma = 0;
  let amplitud = 0.5;
  let peso = 1;
  let total = 0;
  for (let i = 0; i < octavas; i++) {
    let n = 1 - Math.abs(ruido(x, z, semilla + i * 31) * 2 - 1);
    n *= n;
    n *= peso;
    peso = Math.min(1, n * 2);
    suma += n * amplitud;
    total += amplitud;
    const nx = x * 1.7 + z * 1.1;
    z = -x * 1.1 + z * 1.7;
    x = nx;
    amplitud *= 0.5;
  }
  return suma / total;
}

/** Ruido de valor que se repite cada `periodo` unidades (para texturas sin costuras). */
function ruidoPeriodico(x: number, z: number, periodo: number, semilla: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const m = (v: number) => ((v % periodo) + periodo) % periodo;
  const a = hash(m(ix), m(iz), semilla);
  const b = hash(m(ix + 1), m(iz), semilla);
  const c = hash(m(ix), m(iz + 1), semilla);
  const d = hash(m(ix + 1), m(iz + 1), semilla);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Textura de ruido fractal que se repite sin costuras (RGB = tres ruidos distintos).
 * Se usa en los shaders para manchas grandes de color que rompen la repetición.
 */
export function datosRuidoPeriodico(tam = 256) {
  const datos = new Uint8Array(tam * tam * 4);
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const k = (y * tam + x) * 4;
      for (let canal = 0; canal < 3; canal++) {
        let suma = 0;
        let amplitud = 0.5;
        let total = 0;
        let periodo = 4 << canal;
        for (let o = 0; o < 5; o++) {
          suma += ruidoPeriodico((x / tam) * periodo, (y / tam) * periodo, periodo, 7 + canal * 13 + o) * amplitud;
          total += amplitud;
          amplitud *= 0.5;
          periodo *= 2;
        }
        datos[k + canal] = Math.round((suma / total) * 255);
      }
      datos[k + 3] = 255;
    }
  }
  return datos;
}
