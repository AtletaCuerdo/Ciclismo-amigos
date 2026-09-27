/**
 * Importar entrenamientos desde archivos estándar:
 * - .zwo (Zwift): XML con bloques en fracción del FTP (SteadyState, Warmup, Cooldown, Ramp,
 *   IntervalsT, FreeRide, MaxEffort). Los mensajes de texto y la cadencia se ignoran.
 * - .mrc: puntos «minutos  %FTP» (tramos rectos entre puntos).
 * - .erg: igual pero en vatios; se pasan a % con el FTP del archivo (o el del ciclista).
 * Se convierten a nuestros bloques (constante, rampa, series) y se les asigna una categoría
 * según la intensidad.
 */
import { desplegar, duracionTotal, type Bloque, type Categoria, type Entrenamiento } from './tipos';

export interface Importado {
  entreno: Entrenamiento;
  archivo: string;
  avisos: string[];
}

const redondear = (x: number) => Math.round(x * 10) / 10;
const pct = (fraccion: number) => redondear(fraccion * 100);

function atributo(el: Element, ...nombres: string[]) {
  for (const n of nombres) {
    // Zwift no es consistente con mayúsculas (Power / power, OnDuration / onDuration)
    const v = el.getAttribute(n) ?? el.getAttribute(n.toLowerCase()) ?? el.getAttribute(n[0].toLowerCase() + n.slice(1));
    if (v !== null && v !== '') {
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
  }
  return undefined;
}

function leerZwo(texto: string, avisos: string[]) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('el archivo .zwo no es un XML válido');
  const raiz = doc.querySelector('workout_file');
  const lista = doc.querySelector('workout');
  if (!raiz || !lista) throw new Error('no parece un entrenamiento de Zwift (.zwo)');
  const nombre = raiz.querySelector(':scope > name')?.textContent?.trim() ?? '';
  const descripcion = raiz.querySelector(':scope > description')?.textContent?.trim() ?? '';
  const bloques: Bloque[] = [];
  const ignorados = new Set<string>();

  for (const el of Array.from(lista.children)) {
    const tipo = el.tagName;
    const dur = Math.round(atributo(el, 'Duration') ?? 0);
    switch (tipo) {
      case 'SteadyState': {
        const p = atributo(el, 'Power') ?? ((atributo(el, 'PowerLow') ?? 0.6) + (atributo(el, 'PowerHigh') ?? 0.6)) / 2;
        if (dur > 0) bloques.push({ tipo: 'constante', duracionS: dur, potencia: pct(p) });
        break;
      }
      case 'Warmup':
      case 'Ramp':
      case 'Cooldown': {
        let desde = atributo(el, 'PowerLow') ?? 0.5;
        let hasta = atributo(el, 'PowerHigh') ?? 0.75;
        // En la vuelta a la calma la potencia siempre baja, se escriba como se escriba
        if (tipo === 'Cooldown' && desde < hasta) [desde, hasta] = [hasta, desde];
        if (dur > 0) bloques.push({ tipo: 'rampa', duracionS: dur, desde: pct(desde), hasta: pct(hasta) });
        break;
      }
      case 'IntervalsT': {
        const rep = Math.max(1, Math.round(atributo(el, 'Repeat') ?? 1));
        const onS = Math.round(atributo(el, 'OnDuration') ?? 0);
        const offS = Math.round(atributo(el, 'OffDuration') ?? 0);
        const on = atributo(el, 'OnPower', 'PowerOnHigh', 'PowerOnLow') ?? 1;
        const off = atributo(el, 'OffPower', 'PowerOffLow', 'PowerOffHigh') ?? 0.5;
        if (onS > 0) bloques.push({ tipo: 'intervalos', repeticiones: rep, onS, onPotencia: pct(on), offS: Math.max(offS, 1), offPotencia: pct(off) });
        break;
      }
      case 'FreeRide':
      case 'freeride':
        if (dur > 0) bloques.push({ tipo: 'constante', duracionS: dur, potencia: 65, libre: true });
        break;
      case 'MaxEffort':
        if (dur > 0) bloques.push({ tipo: 'constante', duracionS: dur, potencia: 150, libre: true });
        break;
      default:
        ignorados.add(tipo);
    }
  }
  if (ignorados.size) avisos.push(`Se han ignorado partes que no usamos: ${[...ignorados].join(', ')}.`);
  if (lista.querySelector('textevent, TextEvent')) avisos.push('Los mensajes de texto de Zwift no se muestran.');
  if (lista.querySelector('[Cadence], [cadence]')) avisos.push('Las indicaciones de cadencia no se usan (solo la potencia).');
  return { nombre, descripcion, bloques };
}

/** .mrc y .erg: cabecera con claves y una tabla de puntos (minutos, valor). */
function leerTabla(texto: string, esErg: boolean, ftpCiclista: number, avisos: string[]) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim());
  let nombre = '';
  let descripcion = '';
  let ftp: number | undefined;
  const puntos: [number, number][] = [];
  let enDatos = false;
  for (const l of lineas) {
    if (!l || l.startsWith(';')) continue;
    if (/^\[COURSE DATA\]/i.test(l)) {
      enDatos = true;
      continue;
    }
    if (/^\[END COURSE DATA\]/i.test(l)) {
      enDatos = false;
      continue;
    }
    if (enDatos) {
      const [a, b] = l.split(/[\s,;]+/).map((x) => Number(x.replace(',', '.')));
      if (Number.isFinite(a) && Number.isFinite(b)) puntos.push([a, b]);
      continue;
    }
    const m = /^([A-Z ]+?)\s*=\s*(.*)$/i.exec(l);
    if (!m) continue;
    const clave = m[1].toUpperCase().trim();
    if (clave === 'DESCRIPTION') descripcion = m[2].trim();
    if (clave === 'FILE NAME') nombre = m[2].trim().replace(/\.(erg|mrc)$/i, '');
    if (clave === 'FTP') ftp = Number(m[2]);
  }
  if (puntos.length < 2) throw new Error('no se encontraron datos del entrenamiento ([COURSE DATA])');
  if (esErg) {
    if (!ftp || !Number.isFinite(ftp)) {
      ftp = ftpCiclista;
      avisos.push(`El archivo .erg no indica FTP: se han pasado los vatios a % con tu FTP (${ftpCiclista} W).`);
    }
  }
  const aPct = (v: number) => (esErg ? redondear((v / ftp!) * 100) : redondear(v));
  const bloques: Bloque[] = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const [t0, v0] = puntos[i];
    const [t1, v1] = puntos[i + 1];
    const dur = Math.round((t1 - t0) * 60);
    if (dur <= 0) continue; // escalón: dos puntos en el mismo minuto
    const desde = aPct(v0);
    const hasta = aPct(v1);
    bloques.push(desde === hasta ? { tipo: 'constante', duracionS: dur, potencia: desde } : { tipo: 'rampa', duracionS: dur, desde, hasta });
  }
  return { nombre, descripcion, bloques };
}

/** Junta bloques constantes seguidos iguales (los .mrc/.erg los parten mucho). */
function simplificar(bloques: Bloque[]) {
  const r: Bloque[] = [];
  for (const b of bloques) {
    const u = r[r.length - 1];
    if (u && u.tipo === 'constante' && b.tipo === 'constante' && u.potencia === b.potencia && !!u.libre === !!b.libre) {
      r[r.length - 1] = { ...u, duracionS: u.duracionS + b.duracionS };
    } else r.push(b);
  }
  return r;
}

/** Categoría según el tiempo en cada zona (en % del FTP). */
export function categoriaSegunIntensidad(bloques: Bloque[], nombre = ''): Categoria {
  if (/\btest\b|\bftp\b/i.test(nombre) || bloques.some((b) => b.tipo === 'constante' && b.libre && b.potencia >= 100)) return 'test';
  const tramos = desplegar(bloques);
  const total = duracionTotal(tramos);
  const zona = { vo2: 0, umbral: 0, ss: 0, tempo: 0, max: 0 };
  for (const t of tramos) {
    const p = (t.desde + t.hasta) / 2;
    zona.max = Math.max(zona.max, t.desde, t.hasta);
    if (p >= 106) zona.vo2 += t.duracion;
    else if (p >= 95) zona.umbral += t.duracion;
    else if (p >= 84) zona.ss += t.duracion;
    else if (p >= 76) zona.tempo += t.duracion;
  }
  if (zona.max < 62) return 'recovery';
  if (total <= 32 * 60) return 'rapido';
  if (zona.vo2 >= 5 * 60) return 'vo2max';
  if (zona.umbral >= 10 * 60) return 'threshold';
  if (zona.ss >= 15 * 60) return 'sweetspot';
  if (zona.tempo >= 15 * 60) return 'tempo';
  return 'endurance';
}

export async function importarArchivo(archivo: File, ftpCiclista: number): Promise<Importado> {
  const texto = await archivo.text();
  const ext = archivo.name.toLowerCase().split('.').pop() ?? '';
  const avisos: string[] = [];
  let datos: { nombre: string; descripcion: string; bloques: Bloque[] };
  if (ext === 'zwo' || texto.includes('<workout_file')) datos = leerZwo(texto, avisos);
  else if (ext === 'mrc' || ext === 'erg') datos = leerTabla(texto, ext === 'erg', ftpCiclista, avisos);
  else throw new Error('formato no reconocido (usa .zwo, .mrc o .erg)');

  const bloques = simplificar(datos.bloques);
  if (!bloques.length) throw new Error('el archivo no tiene bloques de potencia');
  // Límites razonables: potencias entre 20 % y 250 % y duración máxima de 6 h
  const total = duracionTotal(desplegar(bloques));
  if (total > 6 * 3600) throw new Error('dura más de 6 horas');
  const fuera = bloques.some((b) =>
    b.tipo === 'constante' ? b.potencia > 300 : b.tipo === 'rampa' ? Math.max(b.desde, b.hasta) > 300 : b.onPotencia > 300,
  );
  if (fuera) avisos.push('Hay potencias por encima del 300 % del FTP: revisa que el archivo esté bien.');

  const nombre = (datos.nombre || archivo.name.replace(/\.[^.]+$/, '')).slice(0, 80);
  return {
    archivo: archivo.name,
    avisos,
    entreno: {
      id: `importado-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nombre,
      categoria: categoriaSegunIntensidad(bloques, nombre),
      descripcion: (datos.descripcion || `Importado de ${archivo.name}`).slice(0, 600),
      bloques,
      propio: true,
    },
  };
}
