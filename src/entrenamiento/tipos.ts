/** Una muestra por segundo mientras el entrenamiento está en marcha. */
export interface Muestra {
  t: number; // hora (ms desde 1970)
  p?: number; // potencia, W
  c?: number; // cadencia, rpm
  v?: number; // velocidad, km/h
  hr?: number; // pulso, ppm
  d: number; // distancia acumulada, m
  alt: number; // altitud virtual acumulada, m (solo cambia en modo pendiente)
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
