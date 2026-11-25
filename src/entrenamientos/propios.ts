/** Entrenamientos creados por el usuario (guardados en este navegador). */
import type { Entrenamiento } from './tipos';

const CLAVE = 'rodillos.entrenamientosPropios';

export function cargarPropios(): Entrenamiento[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
    return Array.isArray(lista) ? lista.map((e) => ({ ...e, propio: true })) : [];
  } catch {
    return [];
  }
}

export function guardarPropios(lista: Entrenamiento[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    // no es grave
  }
}

/**
 * Entrenos propios borrados en este aparato que aún hay que apuntar en la nube
 * (`usuarios/{uid}/borrados/{clave}`), para que los demás aparatos no los vuelvan a subir.
 */
const CLAVE_BORRADOS = 'rodillos.propiosBorrados';

/** Clave en `borrados` (las de las sesiones son sus ids; estas llevan «p_» delante). */
export const claveBorradoPropio = (id: string) => `p_${id.replace(/[.#$[\]/]/g, '_')}`;

export function leerPropiosBorrados(): Record<string, number> {
  try {
    const m = JSON.parse(localStorage.getItem(CLAVE_BORRADOS) ?? '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

export function apuntarPropiosBorrados(ids: string[]) {
  if (!ids.length) return;
  const m = leerPropiosBorrados();
  for (const id of ids) m[claveBorradoPropio(id)] = Date.now();
  try {
    localStorage.setItem(CLAVE_BORRADOS, JSON.stringify(m));
  } catch {
    // no es grave
  }
}

/** Ya están en la nube: se quitan de los pendientes. */
export function olvidarPropiosBorrados(claves: string[]) {
  const m = leerPropiosBorrados();
  for (const c of claves) delete m[c];
  try {
    localStorage.setItem(CLAVE_BORRADOS, JSON.stringify(m));
  } catch {
    // no es grave
  }
}
