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
