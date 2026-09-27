/**
 * Biblioteca ampliada de entrenamientos (propios de RideCrew), basados en los protocolos
 * clásicos del entrenamiento por potencia. Se suman al catálogo base (catalogo.ts).
 * Potencias en % del FTP; m(10) = 10 minutos.
 */
import type { Bloque, Entrenamiento } from './tipos';

const m = (minutos: number) => Math.round(minutos * 60);
const c = (minutos: number, potencia: number): Bloque => ({ tipo: 'constante', duracionS: m(minutos), potencia });
const r = (minutos: number, desde: number, hasta: number): Bloque => ({ tipo: 'rampa', duracionS: m(minutos), desde, hasta });
/** Series: n × (on min al p% + off min al q%). */
const s = (n: number, on: number, p: number, off: number, q: number): Bloque => ({
  tipo: 'intervalos',
  repeticiones: n,
  onS: m(on),
  onPotencia: p,
  offS: m(off),
  offPotencia: q,
});
/** Tramo sin ERG (a tope o a sensaciones); la potencia es orientativa. */
const libre = (minutos: number, potencia: number): Bloque => ({ tipo: 'constante', duracionS: m(minutos), potencia, libre: true });
const rep = (n: number, bloques: Bloque[]) => Array.from({ length: n }, () => bloques).flat();

/** Calentamiento progresivo con activaciones cortas. */
const calentar = (min = 10, hasta = 72): Bloque[] => [r(min, 45, hasta)];
const calentarActivo = (): Bloque[] => [r(8, 45, 70), s(3, 0.5, 105, 1, 55), c(2, 60)];
const volverCalma = (min = 5): Bloque[] => [r(min, 60, 42)];

type Def = Omit<Entrenamiento, 'bloques'> & { bloques: Bloque[] };

const RECOVERY: Def[] = [
  { id: 'b-rec-15', nombre: 'Soltura 15′', categoria: 'recovery', descripcion: 'Un cuarto de hora muy suave para mover las piernas sin cansarlas.', bloques: [r(3, 40, 50), c(9, 50), r(3, 50, 40)] },
  { id: 'b-rec-40-onda', nombre: 'Ondas suaves 40′', categoria: 'recovery', descripcion: 'Zona 1 con ondulaciones muy ligeras entre el 45 % y el 58 %.', bloques: [r(5, 40, 50), ...rep(5, [r(3, 48, 58), r(3, 58, 48)]), r(5, 50, 40)] },
  { id: 'b-rec-50-pierna', nombre: 'Recuperación con agilidad 50′', categoria: 'recovery', descripcion: 'Rodaje suave con 8 aceleraciones de cadencia de 30″ (sube a 110 rpm sin subir los vatios).', bloques: [r(8, 40, 55), s(8, 0.5, 58, 3.5, 52), r(10, 55, 40)] },
  { id: 'b-rec-30-plano', nombre: 'Llano tranquilo 30′', categoria: 'recovery', descripcion: 'Media hora constante al 55 %: ideal el día después de una carrera.', bloques: [r(5, 40, 55), c(20, 55), r(5, 55, 40)] },
  { id: 'b-rec-70', nombre: 'Rodaje regenerativo 70′', categoria: 'recovery', descripcion: 'Una hora larga en zona 1 para volumen sin carga.', bloques: [r(8, 40, 54), c(25, 55), c(4, 50), c(25, 56), r(8, 54, 40)] },
  { id: 'b-rec-25-pedales', nombre: 'Pedaleo redondo 25′', categoria: 'recovery', descripcion: 'Suave, con 5 bloques de 1′ pensando en pedalear redondo y sin tirones.', bloques: [r(4, 40, 52), s(5, 1, 56, 2, 50), r(6, 52, 40)] },
  { id: 'b-rec-45-escalera', nombre: 'Escalera suave 45′', categoria: 'recovery', descripcion: 'Sube del 45 % al 60 % en escalones de 5′ y vuelve a bajar.', bloques: [c(5, 45), c(5, 50), c(5, 55), c(5, 60), c(5, 60), c(5, 55), c(5, 50), c(5, 45), c(5, 42)] },
  { id: 'b-rec-35-activa', nombre: 'Recuperación activa 35′', categoria: 'recovery', descripcion: 'Suave con tres acelerones muy cortos de 10″ para despertar el músculo.', bloques: [r(6, 40, 55), c(8, 55), s(3, 10 / 60, 110, 3, 52), r(11, 55, 40)] },
  { id: 'b-rec-60-z1', nombre: 'Hora fácil 60′', categoria: 'recovery', descripcion: 'Una hora entera por debajo del 60 %, sin nada más: charla y pedaleo.', bloques: [r(6, 40, 55), c(48, 57), r(6, 55, 40)] },
  { id: 'b-rec-20-antes', nombre: 'Antes de trabajar 20′', categoria: 'recovery', descripcion: 'Veinte minutos suaves por la mañana para activar el cuerpo.', bloques: [r(5, 40, 58), c(10, 58), r(5, 58, 40)] },
];

const RAPIDO: Def[] = [
  { id: 'b-rap-15-sprint', nombre: 'Sprints exprés 15′', categoria: 'rapido', descripcion: 'Calentar y 6 sprints de 15″ a tope. Corto y explosivo.', bloques: [r(5, 50, 75), s(6, 0.25, 180, 1.25, 50), r(1, 55, 45)] },
  { id: 'b-rap-20-umbral', nombre: 'Umbral en 20′', categoria: 'rapido', descripcion: 'Dos bloques de 4′ en tu FTP con 2′ suaves en medio.', bloques: [r(5, 50, 80), s(2, 4, 100, 2, 55), r(3, 60, 45)] },
  { id: 'b-rap-25-3030', nombre: '30/30 exprés 25′', categoria: 'rapido', descripcion: 'Diez series de 30″ al 125 % con 30″ suaves: VO2 en poco tiempo.', bloques: [r(6, 50, 80), c(2, 60), s(10, 0.5, 125, 0.5, 50), r(7, 60, 42)] },
  { id: 'b-rap-30-progresivo', nombre: 'Progresivo 30′', categoria: 'rapido', descripcion: 'Media hora que sube del 60 % al 100 % sin parar. Termina fuerte.', bloques: [r(5, 45, 60), r(20, 60, 100), r(5, 70, 45)] },
  { id: 'b-rap-25-tempo', nombre: 'Tempo corto 25′', categoria: 'rapido', descripcion: 'Quince minutos seguidos al 82 % entre calentamiento y vuelta a la calma.', bloques: [r(5, 45, 72), c(15, 82), r(5, 65, 45)] },
  { id: 'b-rap-30-mixto', nombre: 'Mixto 30′', categoria: 'rapido', descripcion: 'Un poco de todo: tempo, umbral y dos sprints. Para días justos de tiempo.', bloques: [r(5, 45, 75), c(6, 85), c(2, 60), c(4, 100), c(2, 55), s(2, 0.25, 160, 1.75, 50), r(7, 60, 42)] },
  { id: 'b-rap-20-4020', nombre: '40/20 exprés 20′', categoria: 'rapido', descripcion: 'Ocho series de 40″ al 120 % y 20″ suaves. Se hace largo aunque sea corto.', bloques: [r(5, 50, 80), c(2, 60), s(8, 40 / 60, 120, 20 / 60, 55), r(5, 60, 42)] },
  { id: 'b-rap-30-ss', nombre: 'Sweet spot exprés 30′', categoria: 'rapido', descripcion: 'Veinte minutos al 88 % partidos en dos. Muy rentable.', bloques: [r(5, 45, 75), s(2, 10, 88, 1, 60), r(3, 60, 45)] },
  { id: 'b-rap-25-escalera', nombre: 'Escalera rápida 25′', categoria: 'rapido', descripcion: 'Escalones de 2′ del 80 % al 110 % y bajada. Cada escalón cuesta un poco más.', bloques: [r(5, 45, 75), c(2, 80), c(2, 90), c(2, 100), c(2, 110), c(2, 100), c(2, 90), c(2, 80), r(6, 60, 42)] },
  { id: 'b-rap-15-tabata', nombre: 'Tabata 15′', categoria: 'rapido', descripcion: 'Un solo bloque Tabata de 8 × 20″/10″ con buen calentamiento.', bloques: [r(6, 50, 80), c(1, 60), s(8, 20 / 60, 150, 10 / 60, 45), r(4, 60, 42)] },
  { id: 'b-rap-30-cuestas', nombre: 'Cuestas cortas 30′', categoria: 'rapido', descripcion: 'Cinco «cuestas» de 1′30″ al 110 % pensando en cadencia baja (65-70 rpm).', bloques: [r(6, 45, 78), s(5, 1.5, 110, 2, 55), r(6, 60, 42)] },
];

const TEST: Def[] = [
  { id: 'b-test-5', nombre: 'Test de 5 minutos (PAM)', categoria: 'test', descripcion: 'Cinco minutos a tope sin ERG para medir tu potencia aeróbica máxima. El FTP estimado es el 80 % de la media.', estimaFtp: { ventanaS: m(5), factor: 0.8, texto: '80 % de tu mejor media de 5 minutos' }, bloques: [r(10, 45, 75), s(3, 0.5, 110, 1, 55), c(5, 55), libre(5, 115), r(10, 55, 40)] },
  { id: 'b-test-3-12', nombre: 'Test 3′ + 12′ (potencia crítica)', categoria: 'test', descripcion: 'Un esfuerzo de 3′ y otro de 12′ a tope, sin ERG. El FTP estimado sale del de 12′ (91 %).', estimaFtp: { ventanaS: m(12), factor: 0.91, texto: '91 % de tu mejor media de 12 minutos' }, bloques: [r(12, 45, 75), s(2, 1, 100, 1, 55), c(3, 55), libre(3, 120), c(15, 50), libre(12, 102), r(10, 55, 40)] },
  { id: 'b-test-8', nombre: 'Test de 8 minutos (uno)', categoria: 'test', descripcion: 'Un único esfuerzo de 8′ a tope, sin ERG. FTP = 90 % de la media.', estimaFtp: { ventanaS: m(8), factor: 0.9, texto: '90 % de tu mejor media de 8 minutos' }, bloques: [r(12, 45, 75), s(3, 0.5, 105, 1, 55), c(5, 55), libre(8, 105), r(10, 55, 40)] },
  { id: 'b-test-sprint', nombre: 'Test de sprint (10″ y 30″)', categoria: 'test', descripcion: 'Tres sprints de 10″ y uno de 30″ a tope para conocer tu potencia punta. No calcula FTP.', bloques: [r(12, 45, 78), s(2, 0.5, 110, 1, 55), c(4, 55), libre(10 / 60, 200), c(5, 50), libre(10 / 60, 200), c(5, 50), libre(10 / 60, 200), c(6, 50), libre(0.5, 170), r(10, 55, 40)] },
  { id: 'b-test-30', nombre: 'Test de 30 minutos', categoria: 'test', descripcion: 'Media hora a tope sin ERG: la forma más directa de medir el umbral. FTP = 97 % de la media.', estimaFtp: { ventanaS: m(30), factor: 0.97, texto: '97 % de tu mejor media de 30 minutos' }, bloques: [r(12, 45, 75), s(3, 1, 95, 1, 55), c(4, 55), libre(30, 98), r(10, 55, 40)] },
  { id: 'b-test-rampa-suave', nombre: 'Test de rampa suave (FTP)', categoria: 'test', descripcion: 'Rampa con escalones de 2′ que suben un 6 %: más progresiva que la de 1′. Pulsa «Terminar» al fallar. FTP = 77 % del mejor minuto.', estimaFtp: { ventanaS: 60, factor: 0.77, texto: '77 % de tu mejor minuto' }, bloques: [r(6, 40, 55), ...Array.from({ length: 16 }, (_, i) => c(2, 55 + i * 6))] },
];

const ENDURANCE: Def[] = [
  { id: 'b-end-45', nombre: 'Fondo corto 45′', categoria: 'endurance', descripcion: 'Tres cuartos de hora en zona 2. Base aeróbica en poco tiempo.', bloques: [r(8, 50, 66), c(30, 68), r(7, 66, 48)] },
  { id: 'b-end-60-ondas', nombre: 'Fondo con ondas 55′', categoria: 'endurance', descripcion: 'Zona 2 que sube y baja entre el 62 % y el 75 % cada 5′, como un recorrido ondulado.', bloques: [r(8, 50, 65), ...rep(5, [r(4, 62, 75), r(4, 75, 62)]), r(7, 64, 46)] },
  { id: 'b-end-75-sprints', nombre: 'Fondo con sprints 75′', categoria: 'endurance', descripcion: 'Zona 2 con un sprint de 10″ cada 10′ para no perder chispa.', bloques: [r(10, 50, 66), ...rep(5, [c(9.83, 69), c(10 / 60, 170)]), c(6, 68), r(10, 65, 45)] },
  { id: 'b-end-90-tempo', nombre: 'Fondo con tempo 90′', categoria: 'endurance', descripcion: 'Hora y media en zona 2 con dos bloques de 10′ al 80 % en la segunda mitad.', bloques: [r(10, 50, 66), c(30, 68), c(10, 80), c(10, 68), c(10, 80), c(10, 67), r(10, 65, 45)] },
  { id: 'b-end-60-cadencia', nombre: 'Técnica de pedaleo 55′', categoria: 'endurance', descripcion: 'Zona 2 con 6 bloques de 2′ a pierna rápida (105-110 rpm) y 2′ a pierna lenta (60-65 rpm).', bloques: [r(8, 50, 66), s(6, 2, 70, 2, 70), c(15, 68), r(7, 64, 46)] },
  { id: 'b-end-105', nombre: 'Tirada larga 1 h 45′', categoria: 'endurance', descripcion: 'Una tirada larga de invierno a ritmo cómodo, con pequeños repechos del 80 % cada 15′.', bloques: [r(10, 50, 66), ...rep(5, [c(14, 68), c(2, 80)]), c(5, 66), r(10, 64, 45)] },
  { id: 'b-end-150', nombre: 'Gran fondo 2 h 30′', categoria: 'endurance', descripcion: 'Dos horas y media de base aeróbica: prepárate agua, comida y buena música.', bloques: [r(12, 50, 66), c(40, 68), c(10, 75), c(40, 68), c(10, 75), c(26, 66), r(12, 64, 45)] },
  { id: 'b-end-60-progresivo', nombre: 'Fondo progresivo 60′', categoria: 'endurance', descripcion: 'Empieza muy suave y termina en la parte alta de la zona 2 (75 %).', bloques: [r(6, 50, 60), r(48, 60, 75), r(6, 70, 45)] },
  { id: 'b-end-80-fatmax', nombre: 'Zona 2 estricta 80′', categoria: 'endurance', descripcion: 'Una hora larga clavada al 67 %: aburrida pero muy útil para la base.', bloques: [r(10, 50, 67), c(60, 67), r(10, 65, 45)] },
  { id: 'b-end-70-grupeta', nombre: 'Grupeta 70′', categoria: 'endurance', descripcion: 'Simula rodar en grupo: base al 68 % con relevos de 1′ al 90 % cada 8′.', bloques: [r(8, 50, 66), ...rep(6, [c(7, 68), c(1, 90)]), c(6, 67), r(8, 65, 45)] },
  { id: 'b-end-100-bloques', nombre: 'Fondo en bloques 1 h 45′', categoria: 'endurance', descripcion: 'Tres bloques de 25′ al 70 % con 5′ algo más suaves entre ellos.', bloques: [r(10, 50, 66), ...rep(3, [c(25, 70), c(5, 60)]), r(5, 60, 45)] },
];

const SWEETSPOT: Def[] = [
  { id: 'b-ss-3x12', nombre: 'Sweet Spot 3×12′', categoria: 'sweetspot', descripcion: 'Tres bloques de 12′ al 90 % con 4′ de recuperación.', bloques: [...calentar(10, 75), s(3, 12, 90, 4, 55), ...volverCalma()] },
  { id: 'b-ss-4x10', nombre: 'Sweet Spot 4×10′', categoria: 'sweetspot', descripcion: 'Cuatro bloques de 10′ al 89 %, descansos cortos de 3′.', bloques: [...calentar(10, 75), s(4, 10, 89, 3, 55), ...volverCalma()] },
  { id: 'b-ss-2x25', nombre: 'Sweet Spot 2×25′', categoria: 'sweetspot', descripcion: 'Dos bloques largos de 25′ al 88 %: resistencia en el umbral bajo.', bloques: [...calentar(10, 75), s(2, 25, 88, 6, 55), ...volverCalma()] },
  { id: 'b-ss-45-continuo', nombre: 'Sweet Spot: 45′ seguidos', categoria: 'sweetspot', descripcion: 'Cuarenta y cinco minutos seguidos al 87 %. Solo para cuando ya dominas los 2×20′.', bloques: [...calentar(12, 75), c(45, 87), ...volverCalma(8)] },
  { id: 'b-ss-cadencia', nombre: 'Sweet Spot con cadencias 3×15′', categoria: 'sweetspot', descripcion: 'Tres bloques de 15′ al 88 % alternando cada 5′ cadencia normal, alta (100 rpm) y baja (70 rpm).', bloques: [...calentar(10, 75), s(3, 15, 88, 5, 55), ...volverCalma()] },
  { id: 'b-ss-subeybaja', nombre: 'Sweet Spot sube y baja 3×12′', categoria: 'sweetspot', descripcion: 'Bloques de 12′ que alternan 2′ al 86 % y 1′ al 95 %.', bloques: [...calentar(10, 75), ...rep(3, [s(4, 2, 86, 1, 95), c(4, 55)]), ...volverCalma()] },
  { id: 'b-ss-6x6', nombre: 'Sweet Spot 6×6′', categoria: 'sweetspot', descripcion: 'Seis bloques cortos de 6′ al 92 % con 2′ de descanso: se hace llevadero.', bloques: [...calentar(10, 75), s(6, 6, 92, 2, 55), ...volverCalma()] },
  { id: 'b-ss-piramide', nombre: 'Pirámide Sweet Spot 85′', categoria: 'sweetspot', descripcion: 'Bloques de 8′, 12′, 16′, 12′ y 8′ al 88 % con 3′ suaves.', bloques: [...calentar(10, 75), c(8, 88), c(3, 55), c(12, 88), c(3, 55), c(16, 88), c(3, 55), c(12, 88), c(3, 55), c(8, 88), ...volverCalma()] },
  { id: 'b-ss-rampas', nombre: 'Rampas Sweet Spot 4×9′', categoria: 'sweetspot', descripcion: 'Cada bloque sube del 84 % al 94 % en 9 minutos.', bloques: [...calentar(10, 75), ...rep(4, [r(9, 84, 94), c(3, 55)]), ...volverCalma()] },
  { id: 'b-ss-tempo-ss', nombre: 'Tempo y Sweet Spot 70′', categoria: 'sweetspot', descripcion: '20′ de tempo al 80 % seguidos de 2 × 12′ al 90 %.', bloques: [...calentar(10, 72), c(20, 80), c(5, 55), s(2, 12, 90, 4, 55), ...volverCalma()] },
  { id: 'b-ss-picos-largo', nombre: 'Sweet Spot con tirones 2×20′', categoria: 'sweetspot', descripcion: 'Dos bloques de 20′ al 88 % con un tirón de 15″ al 140 % cada 4′.', bloques: [...calentar(10, 75), ...rep(2, [...rep(5, [c(3.75, 88), c(0.25, 140)]), c(5, 55)]), ...volverCalma()] },
];

const TAPERING: Def[] = [
  { id: 'b-tap-35-openers', nombre: 'Aperturas clásicas 35′', categoria: 'tapering', descripcion: 'El día antes: 3 × 1′ al 100 % y 3 sprints de 10″. Llegar con la chispa encendida.', bloques: [...calentar(10, 70), s(3, 1, 100, 2, 55), s(3, 10 / 60, 170, 110 / 60, 50), r(8, 60, 42)] },
  { id: 'b-tap-45-ritmo', nombre: 'Ritmo de crono 45′', categoria: 'tapering', descripcion: 'Dos bloques de 6′ a ritmo de contrarreloj (98 %) y suave el resto.', bloques: [...calentar(12, 72), s(2, 6, 98, 5, 55), r(11, 60, 42)] },
  { id: 'b-tap-40-vo2', nombre: 'Activación VO2 40′', categoria: 'tapering', descripcion: 'Poco volumen e intensidad alta: 4 × 1′30″ al 115 %.', bloques: [...calentar(12, 72), s(4, 1.5, 115, 3, 55), r(10, 60, 42)] },
  { id: 'b-tap-30-suave', nombre: 'Puesta a punto suave 30′', categoria: 'tapering', descripcion: 'Rodaje suave con 3 aceleraciones progresivas de 20″.', bloques: [r(8, 45, 65), c(8, 62), s(3, 20 / 60, 130, 100 / 60, 55), r(8, 60, 42)] },
  { id: 'b-tap-50-escalones', nombre: 'Escalones de afinado 45′', categoria: 'tapering', descripcion: 'Escalones de 3′ al 80, 90 y 100 % con descanso, una sola vez.', bloques: [...calentar(12, 72), c(3, 80), c(2, 60), c(3, 90), c(2, 60), c(3, 100), c(5, 55), s(2, 15 / 60, 150, 105 / 60, 50), r(11, 62, 42)] },
  { id: 'b-tap-60-carrera', nombre: 'Simulación de salida 60′', categoria: 'tapering', descripcion: 'Simula el arranque de una carrera: 2′ fuertes, luego ritmo al 88 % y un final rápido.', bloques: [...calentar(15, 72), c(2, 115), c(12, 88), c(4, 60), c(3, 105), c(0.5, 150), c(8.5, 55), r(15, 62, 42)] },
  { id: 'b-tap-25-express', nombre: 'Activación exprés 25′', categoria: 'tapering', descripcion: 'Si solo tienes un rato la víspera: calentar, 2 × 2′ al 100 % y a casa.', bloques: [r(8, 45, 72), s(2, 2, 100, 2, 55), r(9, 60, 42)] },
  { id: 'b-tap-45-cadencia', nombre: 'Piernas ligeras 40′', categoria: 'tapering', descripcion: 'Suave con bloques de cadencia alta y dos sprints lanzados.', bloques: [...calentar(10, 68), s(5, 1, 70, 2, 60), s(2, 12 / 60, 160, 108 / 60, 50), r(12, 62, 42)] },
  { id: 'b-tap-55-umbral', nombre: 'Recordatorio de umbral 55′', categoria: 'tapering', descripcion: 'Un único bloque de 8′ al 97 % para recordar el ritmo sin cansarse.', bloques: [...calentar(15, 72), c(8, 97), c(5, 55), s(3, 0.5, 120, 1.5, 55), c(6, 55), r(15, 62, 42)] },
  { id: 'b-tap-35-sprints', nombre: 'Chispa para el sprint 35′', categoria: 'tapering', descripcion: 'Seis sprints cortos de 8″ bien recuperados: fuerza sin fatiga.', bloques: [...calentar(10, 70), s(6, 8 / 60, 180, 112 / 60, 50), r(13, 60, 42)] },
];

const TEMPO: Def[] = [
  { id: 'b-tem-2x20', nombre: 'Tempo 2×20′', categoria: 'tempo', descripcion: 'Dos bloques de 20′ al 80 % con 5′ suaves.', bloques: [...calentar(10, 72), s(2, 20, 80, 5, 58), ...volverCalma()] },
  { id: 'b-tem-60-continuo', nombre: 'Tempo: una hora seguida', categoria: 'tempo', descripcion: 'Una hora seguida al 78 %: ritmo de grupeta rápida. Mucha cabeza.', bloques: [...calentar(10, 72), c(60, 78), ...volverCalma(8)] },
  { id: 'b-tem-4x12', nombre: 'Tempo 4×12′', categoria: 'tempo', descripcion: 'Cuatro bloques de 12′ al 82 % con 3′ de recuperación.', bloques: [...calentar(10, 72), s(4, 12, 82, 3, 58), ...volverCalma()] },
  { id: 'b-tem-ondulado', nombre: 'Tempo ondulado 65′', categoria: 'tempo', descripcion: 'Cincuenta minutos que suben y bajan entre el 74 % y el 86 %.', bloques: [...calentar(10, 72), ...rep(5, [r(5, 74, 86), r(5, 86, 74)]), ...volverCalma()] },
  { id: 'b-tem-con-picos', nombre: 'Tempo con picos 3×15′', categoria: 'tempo', descripcion: 'Tempo al 80 % con 20″ al 120 % cada 3′: como seguir ruedas en el llano.', bloques: [...calentar(10, 72), ...rep(3, [...rep(5, [c(2 + 40 / 60, 80), c(20 / 60, 120)]), c(4, 58)]), ...volverCalma()] },
  { id: 'b-tem-escalera', nombre: 'Escalera de tempo 55′', categoria: 'tempo', descripcion: 'Escalones de 8′ al 76, 80, 84 y 88 % con 2′ suaves.', bloques: [...calentar(10, 72), c(8, 76), c(2, 60), c(8, 80), c(2, 60), c(8, 84), c(2, 60), c(8, 88), ...volverCalma(7)] },
  { id: 'b-tem-baja-cadencia', nombre: 'Fuerza en tempo 5×8′', categoria: 'tempo', descripcion: 'Cinco bloques de 8′ al 80 % a cadencia baja (60-65 rpm), como subiendo un puerto largo.', bloques: [...calentar(10, 72), s(5, 8, 80, 3, 58), ...volverCalma()] },
  { id: 'b-tem-90', nombre: 'Tempo largo 90′', categoria: 'tempo', descripcion: 'Zona 2 con tres bloques de 15′ al 82 %: para preparar marchas largas.', bloques: [...calentar(10, 68), ...rep(3, [c(15, 82), c(8, 66)]), c(6, 66), ...volverCalma(5)] },
  { id: 'b-tem-progresivo', nombre: 'Tempo progresivo 3×10′', categoria: 'tempo', descripcion: 'Cada bloque empieza al 76 % y termina al 88 %.', bloques: [...calentar(10, 72), ...rep(3, [r(10, 76, 88), c(4, 58)]), ...volverCalma()] },
  { id: 'b-tem-mixto', nombre: 'Tempo y umbral 65′', categoria: 'tempo', descripcion: 'Treinta minutos al 80 % y un remate de 6′ al 97 %.', bloques: [...calentar(10, 72), c(30, 80), c(5, 58), c(6, 97), r(14, 62, 42)] },
  { id: 'b-tem-bloques-cortos', nombre: 'Tempo en bloques 6×6′', categoria: 'tempo', descripcion: 'Seis bloques de 6′ al 82 %: el tempo se hace más ameno partido.', bloques: [...calentar(10, 72), s(6, 6, 82, 2, 58), ...volverCalma()] },
];

const THRESHOLD: Def[] = [
  { id: 'b-umb-3x10', nombre: 'Umbral 3×10′', categoria: 'threshold', descripcion: 'Tres bloques de 10′ al 98 % con 5′ de recuperación.', bloques: [...calentarActivo(), s(3, 10, 98, 5, 55), ...volverCalma()] },
  { id: 'b-umb-2x15', nombre: 'Umbral 2×15′', categoria: 'threshold', descripcion: 'Dos bloques de 15′ en tu FTP. Duro pero clásico.', bloques: [...calentarActivo(), s(2, 15, 100, 7, 55), ...volverCalma()] },
  { id: 'b-umb-1x30', nombre: 'Umbral: 30′ seguidos', categoria: 'threshold', descripcion: 'Treinta minutos seguidos al 96 %: la prueba de fuego del umbral.', bloques: [...calentarActivo(), c(30, 96), ...volverCalma(8)] },
  { id: 'b-umb-5x5', nombre: 'Umbral 5×5′ al 103 %', categoria: 'threshold', descripcion: 'Cinco series cortas un poco por encima del FTP.', bloques: [...calentarActivo(), s(5, 5, 103, 3, 55), ...volverCalma()] },
  { id: 'b-umb-ou-2-1', nombre: 'Over-unders 3×12′ (2/1)', categoria: 'threshold', descripcion: 'Bloques de 12′ con 2′ al 95 % y 1′ al 110 %.', bloques: [...calentarActivo(), ...rep(3, [s(4, 2, 95, 1, 110), c(5, 55)]), ...volverCalma()] },
  { id: 'b-umb-ou-30', nombre: 'Over-unders con tirones 4×8′', categoria: 'threshold', descripcion: 'Bloques de 8′ al 95 % con un tirón de 30″ al 120 % cada 2′.', bloques: [...calentarActivo(), ...rep(4, [...rep(4, [c(1.5, 95), c(0.5, 120)]), c(4, 55)]), ...volverCalma()] },
  { id: 'b-umb-escalera', nombre: 'Escalera de umbral 65′', categoria: 'threshold', descripcion: 'Escalones de 4′ al 94, 98, 102 y 106 %, dos veces.', bloques: [...calentarActivo(), ...rep(2, [c(4, 94), c(4, 98), c(4, 102), c(4, 106), c(6, 55)]), ...volverCalma()] },
  { id: 'b-umb-6x4', nombre: 'Umbral 6×4′', categoria: 'threshold', descripcion: 'Seis series de 4′ al 105 % con 2′ de descanso: umbral alto.', bloques: [...calentarActivo(), s(6, 4, 105, 2, 55), ...volverCalma()] },
  { id: 'b-umb-crono', nombre: 'Simulación de crono (20′)', categoria: 'threshold', descripcion: 'Una contrarreloj de 20′: salida al 105 %, ritmo al 97 % y remate final.', bloques: [...calentarActivo(), c(1, 110), c(16, 97), c(3, 105), r(12, 60, 42)] },
  { id: 'b-umb-progresivo', nombre: 'Umbral progresivo 3×9′', categoria: 'threshold', descripcion: 'Cada bloque va del 92 % al 104 % en 9 minutos.', bloques: [...calentarActivo(), ...rep(3, [r(9, 92, 104), c(4, 55)]), ...volverCalma()] },
  { id: 'b-umb-puerto', nombre: 'Puerto de 25′', categoria: 'threshold', descripcion: 'Una subida larga simulada: 25′ entre el 90 % y el 100 %, con los últimos 3′ más fuertes.', bloques: [...calentarActivo(), r(5, 88, 94), c(10, 95), c(7, 98), c(3, 105), r(12, 60, 42)] },
];

const VO2MAX: Def[] = [
  { id: 'b-vo2-5x4', nombre: 'VO2Max 5×4′', categoria: 'vo2max', descripcion: 'Cinco series de 4′ al 112 % con 4′ de recuperación.', bloques: [...calentarActivo(), s(5, 4, 112, 4, 50), ...volverCalma()] },
  { id: 'b-vo2-6x3', nombre: 'VO2Max 6×3′', categoria: 'vo2max', descripcion: 'Seis series de 3′ al 118 %. Recuperación igual de larga.', bloques: [...calentarActivo(), s(6, 3, 118, 3, 50), ...volverCalma()] },
  { id: 'b-vo2-8x2', nombre: 'VO2Max 8×2′', categoria: 'vo2max', descripcion: 'Ocho series de 2′ al 122 % con 2′ suaves.', bloques: [...calentarActivo(), s(8, 2, 122, 2, 50), ...volverCalma()] },
  { id: 'b-vo2-3015-3x', nombre: 'VO2Max 30/15 (3×10)', categoria: 'vo2max', descripcion: 'Tres bloques de 10 × (30″ al 125 % / 15″ al 55 %). Recuperaciones muy cortas.', bloques: [...calentarActivo(), ...rep(3, [s(10, 0.5, 125, 0.25, 55), c(5, 50)]), ...volverCalma()] },
  { id: 'b-vo2-piramide', nombre: 'Pirámide VO2 1-2-3-4-3-2-1', categoria: 'vo2max', descripcion: 'Series de 1′, 2′, 3′, 4′, 3′, 2′ y 1′ al 115 % con la misma recuperación.', bloques: [...calentarActivo(), ...[1, 2, 3, 4, 3, 2, 1].flatMap((d) => [c(d, 115), c(d, 50)]), ...volverCalma()] },
  { id: 'b-vo2-billat', nombre: 'VO2 3/3 (4 series)', categoria: 'vo2max', descripcion: 'Cuatro series de 3′ al 120 % y 3′ al 60 %: el clásico para subir el techo aeróbico.', bloques: [...calentarActivo(), s(4, 3, 120, 3, 60), ...volverCalma()] },
  { id: 'b-vo2-6030', nombre: 'VO2Max 60/30 (2×8)', categoria: 'vo2max', descripcion: 'Dos bloques de 8 × (1′ al 118 % / 30″ al 55 %).', bloques: [...calentarActivo(), s(8, 1, 118, 0.5, 55), c(6, 50), s(8, 1, 118, 0.5, 55), ...volverCalma()] },
  { id: 'b-vo2-descendente', nombre: 'VO2 descendente 5-4-3-2-1', categoria: 'vo2max', descripcion: 'Cada serie es más corta y más fuerte: 5′ al 108 % hasta 1′ al 125 %.', bloques: [...calentarActivo(), c(5, 108), c(4, 50), c(4, 112), c(4, 50), c(3, 116), c(3, 50), c(2, 120), c(3, 50), c(1, 125), ...volverCalma(8)] },
  { id: 'b-vo2-hill', nombre: 'Cuestas de VO2 6×2′30″', categoria: 'vo2max', descripcion: 'Seis «cuestas» de 2′30″ al 115 % a cadencia baja, bajando suave entre ellas.', bloques: [...calentarActivo(), s(6, 2.5, 115, 3, 50), ...volverCalma()] },
  { id: 'b-vo2-mixto', nombre: 'VO2 y umbral 60′', categoria: 'vo2max', descripcion: 'Cuatro series de 3′ al 118 % y, tras descansar, 8′ al 97 %.', bloques: [...calentarActivo(), s(4, 3, 118, 3, 50), c(5, 55), c(8, 97), ...volverCalma(7)] },
  { id: 'b-vo2-20-40', nombre: 'VO2 20/40 (3×8)', categoria: 'vo2max', descripcion: 'Tres bloques de 8 × (20″ al 140 % / 40″ al 60 %): más llevadero que el 30/30.', bloques: [...calentarActivo(), ...rep(3, [s(8, 1 / 3, 140, 2 / 3, 60), c(4, 50)]), ...volverCalma()] },
];

export const BIBLIOTECA: Entrenamiento[] = [
  ...RECOVERY,
  ...RAPIDO,
  ...TEST,
  ...ENDURANCE,
  ...SWEETSPOT,
  ...TAPERING,
  ...TEMPO,
  ...THRESHOLD,
  ...VO2MAX,
];
