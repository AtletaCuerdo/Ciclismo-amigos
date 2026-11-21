/**
 * 📻 Radio de RideCrew: emisoras de internet por estilos, sin preparar nada (como cambiar de
 * emisora en el coche de un videojuego). Cada estilo tiene varias emisoras de verdad, elegidas de
 * Radio Browser (base de datos libre y gratuita de radios por internet), preferiblemente sin
 * anuncios; se dice siempre cuál suena. Si una falla, pasa a la siguiente y, si fallan todas, busca
 * otra del mismo estilo en Radio Browser.
 *
 * En iPhone/iPad el volumen de una web no se puede cambiar (lo mandan los botones del aparato):
 * allí no hay fundido entre emisoras ni se baja la radio cuando habla un amigo.
 */

export interface Fuente {
  nombre: string;
  /** Identificador en Radio Browser (para pedir la dirección al día). */
  uuid: string;
  /** Dirección de reserva por si Radio Browser no responde. */
  url: string;
}
export interface Emisora {
  id: IdEmisora;
  emoji: string;
  nombre: string;
  descripcion: string;
  /** Etiqueta de Radio Browser para buscar otras si fallan todas. */
  etiqueta: string;
  fuentes: Fuente[];
}
export type IdEmisora = 'regueton' | 'edm' | 'rock' | 'actual' | 'metal' | 'gta';

export const EMISORAS: Emisora[] = [
  {
    id: 'regueton',
    emoji: '🔥',
    nombre: 'Reguetón',
    descripcion: 'Reguetón y urbano latino',
    etiqueta: 'reggaeton',
    fuentes: [
      { nombre: 'Latina Reggaeton', uuid: 'ff25f556-1f64-4e7d-9c3f-68e51d3a43c3', url: 'https://latinareggaeton.ice.infomaniak.ch/latinareggaeton.mp3' },
      { nombre: 'Top Urbano', uuid: '25bf9ae3-16f1-4ffa-8651-b67e1ba22d64', url: 'https://radio.dominiserver.com/proxy/topurbano?mp=/stream' },
    ],
  },
  {
    id: 'edm',
    emoji: '⚡',
    nombre: 'EDM',
    descripcion: 'Electrónica y house para las series',
    etiqueta: 'edm',
    fuentes: [
      { nombre: 'Technolovers Electro House', uuid: '830a7eff-916d-456c-842a-d7786e475658', url: 'https://stream.technolovers.fm/electro-house?ref=radiobrowser' },
      { nombre: 'Club (rautemusik)', uuid: '5f7cdd03-86fc-4d13-89c1-2f9a0b92fc23', url: 'https://club-high.rautemusik.fm/?ref=radiobrowser' },
      { nombre: '0nlineradio Remix', uuid: 'a8c1c86e-e1c0-4e86-ba15-74c258ac0af9', url: 'https://stream.0nlineradio.com/remix?ref=radiobrowser' },
    ],
  },
  {
    id: 'rock',
    emoji: '🎸',
    nombre: 'Rock clásico',
    descripcion: 'Queen, Led Zeppelin, Deep Purple, los Stones…',
    etiqueta: 'classic rock',
    fuentes: [
      { nombre: 'Oxygen Classic Rock', uuid: 'c240655a-c086-49d7-a0c6-a1baf886c99f', url: 'https://oxygenmusic.hu:8443/oxygenclassicrock' },
      { nombre: 'RdMix Classic Rock 70s 80s 90s', uuid: '7afae7e3-8d06-42f5-b59e-a52d6e09e60e', url: 'https://cast1.torontocast.com:4610/stream' },
    ],
  },
  {
    id: 'actual',
    emoji: '🎧',
    nombre: 'Éxitos actuales',
    descripcion: 'Lo que suena ahora, sin parar',
    etiqueta: 'top 40',
    fuentes: [
      { nombre: 'REYFM #hitsonly', uuid: '666c9c6b-c054-11e9-8502-52543be04c81', url: 'https://listen.reyfm.de/hitsonly_192kbps.mp3' },
      { nombre: 'Aktuelle Hits (rautemusik)', uuid: 'e94afa1a-0f96-4a57-8b97-112bb5cd348d', url: 'https://breakz-2012-high.rautemusik.fm/?ref=radiobrowser-akthits' },
    ],
  },
  {
    id: 'metal',
    emoji: '🤘',
    nombre: 'Heavy metal',
    descripcion: 'Metal y rock duro: para apretar los dientes',
    etiqueta: 'metal',
    fuentes: [
      { nombre: 'Rock Antenne Heavy Metal', uuid: '4b473070-a3c2-41bd-8d98-c2db5f5954bc', url: 'https://stream.rockantenne.de/heavy-metal/stream/aacp' },
      { nombre: 'Hotmix Metal', uuid: 'bc59bb52-9386-4c3d-a2bf-782756bea3fa', url: 'https://streaming.hotmixradio.com/hotmix-metal-en-mp3?provider=radiobrowser' },
      { nombre: 'FluxFM Metal', uuid: 'd4f41697-61c8-4cd5-bcd3-93c0d5248a84', url: 'https://fluxfm.streamabc.net/flx-metalfm-mp3-320-9154971' },
    ],
  },
  {
    id: 'gta',
    emoji: '🌴',
    nombre: 'Estilo GTA',
    descripcion: 'G-funk de la costa oeste y sintes ochenteros, como en las radios de los juegos',
    etiqueta: 'synthwave',
    fuentes: [
      { nombre: 'West Coast – G-Funk & Hip-Hop', uuid: 'b449c3c0-db5f-4f01-a81e-3bc1c769e188', url: 'https://r.bgp.rodeo/listen/west_coast/radio.mp3' },
      { nombre: 'Nightride FM (synthwave)', uuid: 'e50b0b40-c0a2-4953-bf77-689890f60ce1', url: 'https://stream.nightride.fm/nightride.mp3' },
    ],
  },
];

export const emisoraPorId = (id: IdEmisora) => EMISORAS.find((e) => e.id === id)!;

export interface EstadoRadio {
  emisora: IdEmisora | null;
  /** Nombre de la emisora real que suena. */
  sonando: string | null;
  cargando: boolean;
  error: string | null;
}
export const RADIO_APAGADA: EstadoRadio = { emisora: null, sonando: null, cargando: false, error: null };

const API = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
const esIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function pedirApi<T>(ruta: string): Promise<T | null> {
  for (const base of API) {
    try {
      const r = await fetch(base + ruta, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return (await r.json()) as T;
    } catch {
      // se prueba el siguiente servidor
    }
  }
  return null;
}

export class Radio {
  private audios: HTMLAudioElement[] = [];
  private actual = 0;
  private estado: EstadoRadio = { ...RADIO_APAGADA };
  /** Para no mezclar intentos de una emisora con los de la siguiente. */
  private turno = 0;
  private volumen = 0.8;
  private agachada = false;
  private fundido: ReturnType<typeof setInterval> | null = null;
  private readonly ios = esIos();

  constructor(private alCambiar: (e: EstadoRadio) => void) {
    for (let i = 0; i < 2; i++) {
      const a = new Audio();
      a.preload = 'none';
      a.setAttribute('playsinline', '');
      this.audios.push(a);
    }
  }

  get emisora() {
    return this.estado.emisora;
  }

  private avisar(c: Partial<EstadoRadio>) {
    this.estado = { ...this.estado, ...c };
    this.alCambiar({ ...this.estado });
  }

  /** Pone una emisora (llamar desde un toque la primera vez: los navegadores no dejan sonar sin él). */
  async poner(id: IdEmisora, desde = 0) {
    const turno = ++this.turno;
    const e = emisoraPorId(id);
    this.avisar({ emisora: id, cargando: true, error: null });
    for (let i = desde; i < e.fuentes.length; i++) {
      const f = e.fuentes[i];
      // La dirección al día (y Radio Browser cuenta la escucha); si no responde, la guardada
      const r = await pedirApi<{ ok?: boolean; url?: string }>(`/json/url/${f.uuid}`);
      if (turno !== this.turno) return;
      const url = r?.ok !== false && r?.url?.startsWith('https://') ? r.url : f.url;
      if (await this.sonar(url, turno)) {
        this.avisar({ sonando: f.nombre, cargando: false });
        return;
      }
      if (turno !== this.turno) return;
    }
    // Todas fallan: otra del mismo estilo en Radio Browser
    const otras = await pedirApi<{ name: string; url_resolved: string }[]>(
      `/json/stations/search?tag=${encodeURIComponent(e.etiqueta)}&is_https=true&hidebroken=true&order=votes&reverse=true&limit=8`,
    );
    for (const o of otras ?? []) {
      if (turno !== this.turno) return;
      if (!o.url_resolved.startsWith('https://') || e.fuentes.some((f) => f.url === o.url_resolved)) continue;
      if (await this.sonar(o.url_resolved, turno)) {
        this.avisar({ sonando: o.name.trim().slice(0, 40), cargando: false });
        return;
      }
    }
    if (turno === this.turno) this.avisar({ cargando: false, sonando: null, error: 'Ahora mismo no responde ninguna emisora de este estilo. Prueba otra.' });
  }

  /** Otra emisora del mismo estilo (la siguiente de la lista). */
  otra() {
    const id = this.estado.emisora;
    if (!id) return;
    const e = emisoraPorId(id);
    const i = e.fuentes.findIndex((f) => f.nombre === this.estado.sonando);
    void this.poner(id, (i + 1) % e.fuentes.length);
  }

  apagar() {
    this.turno++;
    if (this.fundido) clearInterval(this.fundido);
    for (const a of this.audios) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    this.avisar({ ...RADIO_APAGADA });
  }

  /** Baja la radio mientras habla un amigo (no en iPhone/iPad: allí no se puede). */
  agachar(si: boolean) {
    if (this.agachada === si) return;
    this.agachada = si;
    if (!this.ios) this.audios[this.actual].volume = this.volObjetivo();
  }

  private volObjetivo() {
    return this.volumen * (this.agachada ? 0.25 : 1);
  }

  /** Arranca la dirección en el otro reproductor y, cuando suena, funde de uno a otro (8 s de margen). */
  private sonar(url: string, turno: number): Promise<boolean> {
    const sig = 1 - this.actual;
    const nuevo = this.audios[sig];
    const viejo = this.audios[this.actual];
    return new Promise((resolver) => {
      let hecho = false;
      const acabar = (ok: boolean) => {
        if (hecho) return;
        hecho = true;
        clearTimeout(tiempo);
        nuevo.onplaying = null;
        nuevo.onerror = null;
        if (!ok || turno !== this.turno) {
          nuevo.pause();
          nuevo.removeAttribute('src');
          resolver(false);
          return;
        }
        this.actual = sig;
        this.fundir(viejo, nuevo);
        resolver(true);
      };
      const tiempo = setTimeout(() => acabar(false), 8000);
      nuevo.onplaying = () => acabar(true);
      nuevo.onerror = () => acabar(false);
      if (!this.ios) nuevo.volume = viejo.paused ? this.volObjetivo() : 0;
      nuevo.src = url;
      nuevo.play().catch(() => acabar(false));
    });
  }

  private fundir(viejo: HTMLAudioElement, nuevo: HTMLAudioElement) {
    if (this.fundido) clearInterval(this.fundido);
    const parar = () => {
      viejo.pause();
      viejo.removeAttribute('src');
    };
    if (this.ios || viejo.paused) {
      parar();
      return;
    }
    // Fundido de 2 s
    let paso = 0;
    const meta = this.volObjetivo();
    const v0 = viejo.volume;
    this.fundido = setInterval(() => {
      paso++;
      const k = Math.min(1, paso / 20);
      nuevo.volume = meta * k;
      viejo.volume = v0 * (1 - k);
      if (k >= 1) {
        clearInterval(this.fundido!);
        this.fundido = null;
        parar();
      }
    }, 100);
  }
}

/**
 * 🎛️ DJ automático: en las series (o si aprietas por encima del 88 % del FTP) pone EDM y, cuando
 * aflojas por debajo del 75 %, vuelve a tu emisora. Se queda al menos 90 s en cada una para que
 * las series cortas (30″/30″) no la cambien a cada rato; para volver hay que aflojar 45 s seguidos.
 */
export class DjAutomatico {
  private desde = 0;
  private fuerteDesde = 0;
  private suaveDesde = 0;
  modo: 'base' | 'cana' = 'base';

  /** `intensidad`: % del FTP que toca (entreno) o que llevas (rodando libre). Devuelve la emisora que toca o null si no cambia. */
  decidir(intensidad: number | null, base: IdEmisora, ahora: number): IdEmisora | null {
    if (intensidad === null) return null;
    const fuerte = intensidad >= 0.88;
    const suave = intensidad < 0.75;
    this.fuerteDesde = fuerte ? this.fuerteDesde || ahora : 0;
    this.suaveDesde = suave ? this.suaveDesde || ahora : 0;
    if (ahora - this.desde < 90_000) return null;
    if (this.modo === 'base' && fuerte && ahora - this.fuerteDesde >= 5000) {
      this.modo = 'cana';
      this.desde = ahora;
      return 'edm';
    }
    if (this.modo === 'cana' && suave && ahora - this.suaveDesde >= 45_000) {
      this.modo = 'base';
      this.desde = ahora;
      return base === 'edm' ? 'rock' : base;
    }
    return null;
  }
}
