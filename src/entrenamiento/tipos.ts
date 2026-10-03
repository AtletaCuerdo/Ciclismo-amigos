/** Una muestra por segundo mientras el entrenamiento está en marcha. */
export interface Muestra {
  t: number; // hora (ms desde 1970)
  p?: number; // potencia, W
  c?: number; // cadencia, rpm
  v?: number; // velocidad, km/h
  hr?: number; // pulso, ppm
  d: number; // distancia acumulada, m
  alt: number; // altitud virtual acumulada, m (solo cambia en modo pendiente)
  /** Punto del circuito (m desde la salida, contando vueltas), para el mapa y el perfil en Strava. */
  s?: number;
}

export interface Resumen {
  duracionS: number;
  distanciaM: number;
  desnivelM: number;
  potenciaMedia?: number;
  potenciaMax?: number;
  potenciaEstimada: boolean; // true si parte de la potencia vino del sensor de velocidad
  velocidadMedia?: number; // km/h
  velocidadMax?: number;
  cadenciaMedia?: number; // sin contar los ratos a 0 rpm
  pulsoMedio?: number;
  pulsoMax?: number;
  kilojulios: number;
  /** Tiempo a rueda de otro ciclista (rebufo) en la salida en grupo, s. */
  segundosRueda?: number;
  /** Circuito en el que se rodó (para los resúmenes); el último si se cambió. */
  circuito?: string;
  /** Si se cambió de circuito en la sesión: [hora (ms), circuito] desde la que se rodó en cada uno. */
  circuitos?: [number, string][];
  /** Con quién se coincidió en la salida en grupo (nombres). */
  companeros?: string[];
}

/** Título según el porcentaje del tiempo que se ha ido a rueda (para las risas del grupo). */
export function tituloRueda(segundosRueda: number, duracionS: number) {
  const pct = duracionS > 0 ? (segundosRueda / duracionS) * 100 : 0;
  if (pct >= 60) return { pct, titulo: 'Chupa ruedas oficial 🧛' };
  if (pct >= 35) return { pct, titulo: 'Especialista en ir a rueda 🦊' };
  if (pct >= 10) return { pct, titulo: 'Buen compañero de grupo 🤝' };
  return { pct, titulo: 'Siempre dando la cara al viento 💪' };
}

/** Lo que se guarda de cada entrenamiento en el historial (sin las muestras). */
export interface EntrenoGuardado {
  id: string;
  inicio: number; // ms
  resumen: Resumen;
}

export interface Entreno extends EntrenoGuardado {
  muestras: Muestra[];
}
