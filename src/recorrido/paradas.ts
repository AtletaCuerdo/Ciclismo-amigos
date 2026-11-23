/**
 * Sitios para parar junto a la carretera: uno de cada por circuito (gasolinera, cafetería, bar y
 * fisio). A 600 m sale el aviso «Parar / Seguir»; si paras, tu ciclista se echa al arcén y entra,
 * eliges del menú (se paga con RideCoins) y vuelve a la carretera donde le toca. Tú sigues
 * pedaleando todo el rato: el entreno, el ERG, el tiempo y los km no se paran.
 */
import type { TipoParada } from '../entrenamiento/ridecoins';

export interface Parada {
  tipo: TipoParada;
  /** Punto de la vuelta (km). Lejos de los cruces y de la salida. */
  km: number;
}

export const INFO_PARADA: Record<TipoParada, { nombre: string; emoji: string; rotulo: string; color: string; frase: string }> = {
  gasolinera: { nombre: 'Gasolinera', emoji: '⛽', rotulo: 'GASOLINERA', color: '#d9361e', frase: 'Algo dulce y algo que despierte' },
  cafeteria: { nombre: 'Cafetería', emoji: '☕', rotulo: 'CAFETERÍA', color: '#7a4a2a', frase: 'El café de media mañana' },
  bar: { nombre: 'Bar', emoji: '🍺', rotulo: 'BAR', color: '#1f6f3a', frase: 'Un pincho y algo fresco' },
  fisio: { nombre: 'Fisioterapia', emoji: '💆', rotulo: 'FISIOTERAPIA', color: '#1d6fb8', frase: 'Unas piernas como nuevas' },
};

export const PARADAS: Record<string, Parada[]> = {
  vuelta17: [
    { tipo: 'gasolinera', km: 4.5 },
    { tipo: 'cafeteria', km: 7.6 },
    { tipo: 'bar', km: 10.75 },
    { tipo: 'fisio', km: 15.5 },
  ],
  ribera: [
    { tipo: 'gasolinera', km: 3.5 },
    { tipo: 'cafeteria', km: 7 },
    { tipo: 'bar', km: 12.5 },
    { tipo: 'fisio', km: 16 },
  ],
  // En la sierra, en los pocos tramos suaves (en las rampas, el corte del monte taparía el edificio)
  sierra: [
    { tipo: 'gasolinera', km: 0.85 },
    { tipo: 'cafeteria', km: 2.1 },
    { tipo: 'bar', km: 8.55 },
    { tipo: 'fisio', km: 11.4 },
  ],
  costa: [
    { tipo: 'gasolinera', km: 1.2 },
    { tipo: 'cafeteria', km: 7 },
    { tipo: 'bar', km: 13 },
    { tipo: 'fisio', km: 15 },
  ],
};

/** Metros antes del sitio en los que sale el aviso. */
export const AVISO_PARADA_M = 600;
/** Distancia de la carretera a la fachada (m, desde el centro de la carretera, a la derecha). */
export const LADO_PARADA_M = 13;
