/**
 * «🗓️ Tu semana con TriCoach»: las sesiones de rodillo que el entrenador pone en TriCoach Entrenos
 * (otra web, con sus propias cuentas: entrenos.tricoach.es) le salen al deportista aquí, listas para el ERG.
 *
 * Conectar es una sola vez: se abre Entrenos, el deportista pulsa «Permitir» y vuelve aquí con
 * `#tricoach=<token>`. El token se guarda en este navegador y sirve solo para leer sus sesiones de
 * rodillo de la semana (POST /api/ridecrew/semana). Las de la semana pasada desaparecen solas el lunes.
 */
import { useCallback, useEffect, useState } from 'react';
import { categoriaSegunIntensidad } from './importar';
import type { Bloque, Entrenamiento } from './tipos';

const ENTRENOS = 'https://entrenos.tricoach.es';
/**
 * El mismo servidor de Entrenos tiene dos direcciones. En el iPhone, Bluefy no siempre llega a
 * entrenos.tricoach.es (Safari sí: va por otro camino) y la de workers.dev sí, como la de Strava.
 */
const APIS = [`${ENTRENOS}/api/ridecrew`, 'https://tricoach-entrenos.jfer-luna.workers.dev/api/ridecrew'];
const CLAVE_TOKEN = 'rodillos.tricoach';
const CLAVE_CACHE = 'rodillos.tricoachSemana';

export const CARPETA_TRICOACH = {
  nombre: '🗓️ Tu semana con TriCoach',
  descripcion: 'Las sesiones de rodillo que te ha puesto tu entrenador esta semana en TriCoach Entrenos',
  color: '#4ade80',
};

/** Bloque tal como llega de TriCoach Entrenos: segundos y vatios exactos, % del FTP o intensidad (IF). */
interface BloqueTricoach {
  s: number;
  w?: number;
  w2?: number;
  pct?: number;
  pct2?: number;
  IF: number;
}
interface SesionTricoach {
  id: string;
  date: string;
  title: string;
  description: string;
  coachTip: string;
  durationMin: number | null;
  bloques: BloqueTricoach[];
}

/**
 * Llamada a TriCoach Entrenos como texto y sin cabeceras propias: así el navegador no hace la «pregunta
 * previa» (preflight), que en el iPhone fallaba con «Load failed». El token va en el cuerpo.
 */
let apiBuena = 0; // la última dirección que respondió

async function llamar(ruta: string, datos: Record<string, unknown>) {
  const orden = [apiBuena, ...APIS.keys()].filter((i, n, a) => a.indexOf(i) === n);
  for (const i of orden) {
    try {
      const r = await fetch(`${APIS[i]}/${ruta}`, { method: 'POST', body: JSON.stringify(datos) });
      apiBuena = i;
      return r;
    } catch {
      /* esta dirección no llega: se prueba la otra */
    }
  }
  throw new Error('No se puede contactar con TriCoach Entrenos. Mira la conexión a internet y vuelve a intentarlo.');
}

const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const escribir = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
};

/** Al cargar la web: si vuelve de Entrenos con `#tricoach=<token>`, se guarda y se limpia la dirección. */
export function recogerTokenTricoach(): boolean {
  const m = window.location.hash.match(/tricoach=([a-f0-9]{64})/);
  if (!m) return false;
  escribir(CLAVE_TOKEN, m[1]);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

/** true si esta carga viene de dar permiso en TriCoach Entrenos (se recoge al cargar la web) */
export const VINO_DE_TRICOACH = typeof window !== 'undefined' && recogerTokenTricoach();

/** Lunes de esta semana en hora de España («AAAA-MM-DD»): la carpeta cambia la noche del domingo al lunes. */
export function lunesDeEstaSemana(ahora = new Date()): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(ahora);
  const d = new Date(`${hoy}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const diaDe = (iso: string) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

const r1 = (x: number) => Math.round(x * 10) / 10;
const igual = (a: Bloque, b: Bloque) => JSON.stringify(a) === JSON.stringify(b);

/** Bloques de TriCoach → bloques de RideCrew (en % del FTP de este ciclista, así los vatios salen exactos). */
export function aBloques(lista: BloqueTricoach[], ftp: number): Bloque[] {
  const pct = (w: number) => r1((w / ftp) * 100);
  const sueltos: Bloque[] = lista.map((b) => {
    if (b.w && b.w2) return { tipo: 'rampa', duracionS: b.s, desde: pct(b.w), hasta: pct(b.w2) };
    if (b.pct && b.pct2) return { tipo: 'rampa', duracionS: b.s, desde: b.pct, hasta: b.pct2 };
    const p = b.w ? pct(b.w) : b.pct ? b.pct : r1(b.IF * 100);
    return { tipo: 'constante', duracionS: b.s, potencia: p };
  });
  // «A B A B A B …» seguidos → intervalos (así se ven como series y se pueden saltar de bloque en bloque)
  const out: Bloque[] = [];
  for (let i = 0; i < sueltos.length; ) {
    const a = sueltos[i];
    const b = sueltos[i + 1];
    if (a?.tipo === 'constante' && b?.tipo === 'constante') {
      let n = 1;
      while (igual(sueltos[i + 2 * n], a) && igual(sueltos[i + 2 * n + 1], b)) n++;
      // la última subida sin su descanso detrás también cuenta («3 x 8′ con 4′ entre medias»)
      const coja = igual(sueltos[i + 2 * n], a) ? 1 : 0;
      if (n + coja >= 2) {
        out.push({ tipo: 'intervalos', repeticiones: n, onS: a.duracionS, onPotencia: a.potencia, offS: b.duracionS, offPotencia: b.potencia });
        if (coja) out.push(a);
        i += 2 * n + coja;
        continue;
      }
    }
    out.push(a);
    i++;
  }
  return out;
}

function aEntrenamiento(s: SesionTricoach, ftp: number): Entrenamiento | null {
  const bloques = aBloques(s.bloques, ftp);
  if (!bloques.length) return null;
  const nombre = s.title.slice(0, 60) || 'Rodillo';
  const texto = [s.description, s.coachTip && `💡 ${s.coachTip}`].filter(Boolean).join('\n');
  return {
    id: `tricoach-${s.id}`,
    nombre,
    categoria: categoriaSegunIntensidad(bloques, nombre),
    descripcion: texto.slice(0, 480),
    bloques,
    origen: 'tricoach',
    fecha: s.date,
  };
}

type Cache = { lunes: string; sesiones: SesionTricoach[] };

/** Sesiones de rodillo de esta semana (se guardan para verlas sin conexión hasta el lunes). */
export function useSemanaTricoach(activo: boolean, ftp: number) {
  const [conectado, setConectado] = useState(() => !!leer(CLAVE_TOKEN));
  const [sesiones, setSesiones] = useState<SesionTricoach[]>(() => {
    try {
      const c = JSON.parse(leer(CLAVE_CACHE) || 'null') as Cache | null;
      return c && c.lunes === lunesDeEstaSemana() ? c.sesiones : [];
    } catch {
      return [];
    }
  });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const token = leer(CLAVE_TOKEN);
    setConectado(!!token);
    if (!token) return;
    setCargando(true);
    try {
      const r = await llamar('semana', { token });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) {
        escribir(CLAVE_TOKEN, null);
        setConectado(false);
        throw new Error(j.error || 'Vuelve a conectar con TriCoach Entrenos');
      }
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setSesiones(j.sesiones || []);
      escribir(CLAVE_CACHE, JSON.stringify({ lunes: j.lunes, sesiones: j.sesiones || [] }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido traer tus sesiones');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  const conectar = () => {
    const vuelta = window.location.origin + window.location.pathname;
    window.location.href = `${ENTRENOS}/?vincular=ridecrew&vuelta=${encodeURIComponent(vuelta)}`;
  };
  /** Con el código de 6 letras que da TriCoach Entrenos («Conectar RideCrew»): vale en cualquier navegador. */
  const conectarConCodigo = async (codigo: string) => {
    setCargando(true);
    try {
      const r = await llamar('canjear', { codigo: codigo.trim() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) throw new Error(j.error || `Error ${r.status}`);
      escribir(CLAVE_TOKEN, j.token);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido conectar');
      setCargando(false);
      return;
    }
    await recargar();
  };
  const desconectar = async () => {
    const token = leer(CLAVE_TOKEN);
    if (token) await llamar('desvincular', { token }).catch(() => {});
    escribir(CLAVE_TOKEN, null);
    escribir(CLAVE_CACHE, null);
    setConectado(false);
    setSesiones([]);
  };

  const entrenos = sesiones.map((s) => aEntrenamiento(s, ftp)).filter((e): e is Entrenamiento => !!e);
  return { conectado, entrenos, cargando, error, recargar, conectar, conectarConCodigo, desconectar };
}
