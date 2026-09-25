/**
 * Graba el entrenamiento: una muestra por segundo mientras está en marcha,
 * con distancia (integrando la velocidad) y altitud virtual (según la pendiente
 * simulada en el rodillo, si la hay).
 *
 * El estado vive en una ref (se modifica cada segundo) y se fuerza el repintado.
 * El tiempo se calcula con la hora real, no contando ticks, para que no se
 * desvíe si el navegador ralentiza los temporizadores.
 */
import { useEffect, useReducer, useRef } from 'react';
import { nuevoId } from './almacen';
import { calcularResumen } from './resumen';
import type { Entreno, Muestra } from './tipos';

export interface ValoresActuales {
  potencia?: number;
  cadencia?: number;
  velocidad?: number; // km/h
  pulso?: number;
  potenciaEsEstimada: boolean;
}

interface Interno {
  corriendo: boolean;
  inicio: number | null;
  acumuladoMs: number; // tiempo en marcha de los tramos ya cerrados
  tramoDesde: number | null; // inicio del tramo en marcha actual
  ultimoTick: number | null;
  muestras: Muestra[];
  distancia: number; // m
  altitud: number; // m
  desnivel: number; // m
  sumaPotencia: number;
  muestrasPotencia: number;
  potenciaEstimada: boolean;
}

const vacio = (): Interno => ({
  corriendo: false,
  inicio: null,
  acumuladoMs: 0,
  tramoDesde: null,
  ultimoTick: null,
  muestras: [],
  distancia: 0,
  altitud: 0,
  desnivel: 0,
  sumaPotencia: 0,
  muestrasPotencia: 0,
  potenciaEstimada: false,
});

/** Si pasa más tiempo entre dos ticks (pestaña en segundo plano…), no se inventa distancia. */
const MAX_DT_S = 5;

export function useGrabacion(leerActual: () => ValoresActuales, leerPendiente: () => number | null) {
  const g = useRef<Interno>(vacio());
  const [, refrescar] = useReducer((x: number) => x + 1, 0);

  // Refs para usar siempre las funciones más recientes dentro del intervalo
  const leerActualRef = useRef(leerActual);
  leerActualRef.current = leerActual;
  const leerPendienteRef = useRef(leerPendiente);
  leerPendienteRef.current = leerPendiente;

  useEffect(() => {
    const id = setInterval(() => {
      const s = g.current;
      if (!s.corriendo) return;
      const t = Date.now();
      const dt = Math.min(MAX_DT_S, Math.max(0, (t - (s.ultimoTick ?? t)) / 1000));
      s.ultimoTick = t;

      const a = leerActualRef.current();
      const avance = ((a.velocidad ?? 0) / 3.6) * dt; // metros en este intervalo
      s.distancia += avance;

      const pendiente = leerPendienteRef.current();
      if (pendiente !== null) {
        const subida = (avance * pendiente) / 100;
        s.altitud += subida;
        if (subida > 0) s.desnivel += subida;
      }

      const m: Muestra = { t, d: s.distancia, alt: s.altitud };
      if (a.potencia !== undefined) m.p = Math.max(0, a.potencia);
      if (a.cadencia !== undefined) m.c = a.cadencia;
      if (a.velocidad !== undefined) m.v = a.velocidad;
      if (a.pulso !== undefined) m.hr = a.pulso;
      s.muestras.push(m);

      if (m.p !== undefined) {
        s.sumaPotencia += m.p;
        s.muestrasPotencia++;
        if (a.potenciaEsEstimada) s.potenciaEstimada = true;
      }
      refrescar();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const s = g.current;
  const segundos = Math.floor((s.acumuladoMs + (s.tramoDesde !== null ? Date.now() - s.tramoDesde : 0)) / 1000);

  const iniciar = () => {
    if (s.corriendo) return;
    const t = Date.now();
    if (s.inicio === null) s.inicio = t;
    s.tramoDesde = t;
    s.ultimoTick = t;
    s.corriendo = true;
    refrescar();
  };

  const pausar = () => {
    if (!s.corriendo || s.tramoDesde === null) return;
    s.acumuladoMs += Date.now() - s.tramoDesde;
    s.tramoDesde = null;
    s.ultimoTick = null;
    s.corriendo = false;
    refrescar();
  };

  /** Cierra el entrenamiento y lo devuelve (o null si no se grabó nada). */
  const finalizar = (): Entreno | null => {
    pausar();
    const actual = g.current;
    g.current = vacio();
    refrescar();
    if (actual.muestras.length === 0 || actual.inicio === null) return null;
    return {
      id: nuevoId(),
      inicio: actual.inicio,
      resumen: calcularResumen(actual.muestras, Math.round(actual.acumuladoMs / 1000), actual.potenciaEstimada),
      muestras: actual.muestras,
    };
  };

  const descartar = () => {
    g.current = vacio();
    refrescar();
  };

  return {
    corriendo: s.corriendo,
    hayDatos: s.muestras.length > 0,
    segundos,
    distanciaM: s.distancia,
    desnivelM: s.desnivel,
    potenciaMedia: s.muestrasPotencia ? s.sumaPotencia / s.muestrasPotencia : undefined,
    velocidadMedia: segundos > 0 && s.distancia > 0 ? (s.distancia / segundos) * 3.6 : undefined,
    iniciar,
    pausar,
    finalizar,
    descartar,
  };
}
