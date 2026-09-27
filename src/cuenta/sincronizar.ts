/**
 * Datos de cada ciclista en la nube (Firebase Realtime Database), para tener lo mismo en el
 * PC, el iPad o el móvil:
 *
 *   usuarios/{uid}/perfil          { avatar, pesoKg, ftp, t }
 *   usuarios/{uid}/propios/{id}    entrenamiento creado o importado
 *   usuarios/{uid}/historial/{id}  resumen de la sesión (sin muestras)
 *   usuarios/{uid}/muestras/{id}   muestras compactadas en texto (para el TCX y Strava)
 *   usuarios/{uid}/borrados/{id}   sesiones borradas (para que no vuelvan desde otro aparato)
 *
 * Funciona «primero en local»: la web sigue usando lo del navegador y la nube se mantiene al día.
 * Al iniciar sesión se juntan las dos cosas (no se pierde nada de ninguno de los lados).
 */
import { establecerEspejo, guardarEntrenoLocal, listarEntrenos, cargarEntreno, borrarEntreno as borrarLocal } from '../entrenamiento/almacen';
import type { Entreno, EntrenoGuardado, Muestra } from '../entrenamiento/tipos';
import type { Entrenamiento } from '../entrenamientos/tipos';
import { normalizarAvatar, type Perfil } from '../recorrido/avatar';

type Fb = typeof import('../multijugador/firebase');

/** Firebase no admite `undefined`: se quita todo lo que no tenga valor. */
const limpio = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ---- Muestras en texto: «dt,p,c,v,hr,d,alt;…» (dt en ms desde el inicio) ----
const num = (v: number | undefined, dec = 0) => (v === undefined ? '' : dec ? v.toFixed(dec) : String(Math.round(v)));
export function compactarMuestras(inicio: number, m: Muestra[]) {
  return m.map((x) => [x.t - inicio, num(x.p), num(x.c), num(x.v, 1), num(x.hr), num(x.d, 1), num(x.alt, 1)].join(',')).join(';');
}
export function expandirMuestras(inicio: number, texto: string): Muestra[] {
  if (!texto) return [];
  const opc = (s: string) => (s === '' ? undefined : Number(s));
  return texto.split(';').map((fila) => {
    const [t, p, c, v, hr, d, alt] = fila.split(',');
    return { t: inicio + Number(t), p: opc(p), c: opc(c), v: opc(v), hr: opc(hr), d: Number(d) || 0, alt: Number(alt) || 0 };
  });
}

export interface ResultadoSincronizacion {
  perfil?: Perfil;
  propios?: Entrenamiento[];
  historialCambiado: boolean;
  subidos: number;
  bajados: number;
}

export class Nube {
  private base: string;
  constructor(
    private fb: Fb,
    uid: string,
  ) {
    this.base = `usuarios/${uid}`;
  }
  private ruta(r: string) {
    return this.fb.ref(this.fb.db, `${this.base}/${r}`);
  }

  async subirPerfil(p: Perfil) {
    await this.fb.set(this.ruta('perfil'), limpio({ ...p, t: Date.now() }));
  }

  async subirPropios(lista: Entrenamiento[]) {
    const obj: Record<string, Entrenamiento> = {};
    for (const e of lista) obj[e.id] = limpio({ ...e, propio: true });
    await this.fb.set(this.ruta('propios'), obj);
  }

  async subirEntreno(e: Entreno) {
    const { muestras, ...resumen } = e;
    await this.fb.update(this.fb.ref(this.fb.db, this.base), {
      [`historial/${e.id}`]: limpio(resumen),
      [`muestras/${e.id}`]: compactarMuestras(e.inicio, muestras),
    });
  }

  async borrarEntreno(id: string) {
    await this.fb.update(this.fb.ref(this.fb.db, this.base), {
      [`historial/${id}`]: null,
      [`muestras/${id}`]: null,
      [`borrados/${id}`]: Date.now(),
    });
  }

  private async bajarEntreno(g: EntrenoGuardado): Promise<Entreno> {
    const s = await this.fb.get(this.ruta(`muestras/${g.id}`));
    return { ...g, muestras: expandirMuestras(g.inicio, (s.val() as string) ?? '') };
  }

  /**
   * Junta lo del dispositivo y lo de la nube:
   * - Perfil: gana el más reciente; si la nube no tiene, se sube el de aquí.
   * - Entrenamientos propios: se suman los de los dos lados.
   * - Historial: se sube lo que falta en la nube y se baja lo que falta aquí
   *   (salvo lo borrado en otro aparato, que se borra también aquí).
   */
  async sincronizar(local: { perfil: Perfil; perfilT: number; propios: Entrenamiento[] }): Promise<ResultadoSincronizacion> {
    const r: ResultadoSincronizacion = { historialCambiado: false, subidos: 0, bajados: 0 };
    const todo = (await this.fb.get(this.fb.ref(this.fb.db, this.base))).val() as {
      perfil?: Perfil & { t?: number };
      propios?: Record<string, Entrenamiento>;
      historial?: Record<string, EntrenoGuardado>;
      borrados?: Record<string, number>;
    } | null;

    // Perfil
    const nubePerfil = todo?.perfil;
    const avatarNube = nubePerfil ? normalizarAvatar(nubePerfil.avatar) : null;
    if (nubePerfil && avatarNube && (nubePerfil.t ?? 0) >= local.perfilT) {
      r.perfil = { avatar: avatarNube, pesoKg: Number(nubePerfil.pesoKg) || local.perfil.pesoKg, ftp: Number(nubePerfil.ftp) || local.perfil.ftp };
    } else {
      await this.subirPerfil(local.perfil);
    }

    // Entrenamientos propios (la nube manda si el mismo está en los dos lados)
    const nubePropios = Object.values(todo?.propios ?? {}).filter((e) => e && Array.isArray(e.bloques));
    const juntos = new Map<string, Entrenamiento>();
    for (const e of local.propios) juntos.set(e.id, e);
    for (const e of nubePropios) juntos.set(e.id, { ...e, propio: true });
    const listaPropios = [...juntos.values()];
    r.propios = listaPropios;
    if (listaPropios.length) await this.subirPropios(listaPropios);

    // Historial
    const borrados = todo?.borrados ?? {};
    const nubeHist = todo?.historial ?? {};
    const locales = await listarEntrenos().catch(() => [] as EntrenoGuardado[]);
    const idsLocales = new Set(locales.map((g) => g.id));
    for (const g of locales) {
      if (borrados[g.id]) {
        await borrarLocal(g.id).catch(() => {});
        r.historialCambiado = true;
      } else if (!nubeHist[g.id]) {
        await this.subirEntreno(await cargarEntreno(g));
        r.subidos++;
      }
    }
    for (const g of Object.values(nubeHist)) {
      if (!g || idsLocales.has(g.id) || borrados[g.id]) continue;
      await guardarEntrenoLocal(await this.bajarEntreno(g));
      r.bajados++;
      r.historialCambiado = true;
    }
    return r;
  }

  /** A partir de ahora, lo que se guarde o borre en el historial va también a la nube. */
  activarEspejo() {
    establecerEspejo({ guardar: (e) => this.subirEntreno(e), borrar: (id) => this.borrarEntreno(id) });
  }
}

export function desactivarEspejo() {
  establecerEspejo(null);
}
