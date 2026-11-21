/**
 * 🎙️ Voz con los amigos de la salida en grupo, sin tocar la pantalla (como en los juegos online).
 *
 * La voz va directa de un aparato a otro (WebRTC, en malla: cada uno con cada uno; para grupos de
 * amigos de 2 a 6 sobra). Firebase solo sirve para que los aparatos se encuentren:
 *
 *   salas/{sala}/voz/{uid}               = { nombre, t, mudo? }   quién tiene la voz encendida
 *   salas/{sala}/vozSenales/{para}/{id}  = { de, tipo, datos, t }  mensajes para conectarse
 *
 * Para no llamarse los dos a la vez, llama siempre el de uid «menor». El micro va con cancelación
 * de eco y de ruido del navegador; aun así, mejor con auriculares (el ventilador y el rodillo).
 */

export type TipoSenal = 'oferta' | 'respuesta' | 'ice';
export interface Senal {
  de: string;
  tipo: TipoSenal;
  datos: string;
}
export interface Presente {
  uid: string;
  nombre: string;
  mudo?: boolean;
}

/** Cómo se encuentran los aparatos (Firebase en la web; en las pruebas, uno en memoria). */
export interface CanalVoz {
  anunciar(datos: { nombre: string; mudo: boolean }): Promise<void>;
  retirar(): Promise<void>;
  alCambiarPresentes(cb: (lista: Presente[]) => void): () => void;
  enviar(para: string, senal: Senal): Promise<void>;
  /** Llama a `cb` con cada mensaje que llega para mí (y lo borra). */
  alRecibir(cb: (s: Senal) => void): () => void;
}

export interface EstadoVoz {
  activa: boolean;
  conectando: boolean;
  mudo: boolean;
  yoHablando: boolean;
  /** Los demás con la voz encendida: si ya se les oye y si están hablando. */
  otros: { uid: string; nombre: string; conectado: boolean; hablando: boolean; mudo: boolean }[];
  error: string | null;
}

export const ESTADO_VOZ_APAGADA: EstadoVoz = { activa: false, conectando: false, mudo: false, yoHablando: false, otros: [], error: null };

/** Servidores públicos para descubrir la dirección de cada uno (gratis). */
const SERVIDORES_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

interface Par {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  nivel?: () => number;
  /** Candidatos que llegan antes que la oferta o la respuesta. */
  pendientes: RTCIceCandidateInit[];
  llamo: boolean;
}

export class Voz {
  private micro: MediaStream | null = null;
  private pares = new Map<string, Par>();
  private presentes: Presente[] = [];
  private cancelar: (() => void)[] = [];
  private ctx: AudioContext | null = null;
  private nivelYo: (() => number) | null = null;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private estado: EstadoVoz = { ...ESTADO_VOZ_APAGADA };
  private hablando = new Set<string>();

  constructor(
    private canal: CanalVoz,
    private miUid: string,
    private nombre: string,
    private alCambiar: (e: EstadoVoz) => void,
    /** Para las pruebas: un micro de mentira. */
    private pedirMicro: () => Promise<MediaStream> = () =>
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }),
  ) {}

  private avisar(cambios: Partial<EstadoVoz> = {}) {
    this.estado = { ...this.estado, ...cambios };
    this.estado.otros = this.presentes
      .filter((p) => p.uid !== this.miUid)
      .map((p) => {
        const par = this.pares.get(p.uid);
        const estado = par?.pc.connectionState;
        return {
          uid: p.uid,
          nombre: p.nombre,
          mudo: !!p.mudo,
          conectado: estado === 'connected',
          hablando: this.hablando.has(p.uid),
        };
      });
    this.alCambiar({ ...this.estado });
  }

  get encendida() {
    return this.estado.activa;
  }

  /** Enciende el micro y entra en la conversación (llamar desde el toque del botón). */
  async encender() {
    if (this.estado.activa || this.estado.conectando) return;
    this.avisar({ conectando: true, error: null });
    try {
      // El audio (y en iOS el permiso del micro) tiene que arrancar con el toque del botón
      this.ctx = new AudioContext();
      void this.ctx.resume().catch(() => undefined);
      this.micro = await this.pedirMicro();
    } catch {
      this.ctx?.close().catch(() => undefined);
      this.ctx = null;
      this.avisar({
        conectando: false,
        error: 'No se pudo usar el micrófono. Revisa que el navegador tenga permiso para usarlo.',
      });
      return;
    }
    this.nivelYo = this.medidor(this.micro) ?? null;
    this.cancelar.push(this.canal.alRecibir((s) => void this.recibir(s)));
    this.cancelar.push(this.canal.alCambiarPresentes((lista) => this.actualizarPresentes(lista)));
    try {
      await this.canal.anunciar({ nombre: this.nombre, mudo: false });
    } catch {
      await this.apagar();
      this.avisar({ error: 'Firebase no deja usar la voz: hay que pegar las reglas nuevas.' });
      return;
    }
    // Quién está hablando (yo y los demás), 5 veces por segundo
    this.reloj = setInterval(() => this.medirHablando(), 200);
    this.avisar({ activa: true, conectando: false, mudo: false });
  }

  async apagar() {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
    for (const c of this.cancelar) c();
    this.cancelar = [];
    for (const uid of [...this.pares.keys()]) this.colgar(uid);
    this.micro?.getTracks().forEach((t) => t.stop());
    this.micro = null;
    this.nivelYo = null;
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.presentes = [];
    this.hablando.clear();
    await this.canal.retirar().catch(() => undefined);
    this.estado = { ...ESTADO_VOZ_APAGADA, error: this.estado.error };
    this.avisar();
  }

  /** Silencia mi micro (los demás se me siguen oyendo). */
  silenciar(mudo: boolean) {
    this.micro?.getAudioTracks().forEach((t) => (t.enabled = !mudo));
    void this.canal.anunciar({ nombre: this.nombre, mudo }).catch(() => undefined);
    this.avisar({ mudo });
  }

  private actualizarPresentes(lista: Presente[]) {
    this.presentes = lista;
    const ahi = new Set(lista.map((p) => p.uid));
    // Los que se han ido
    for (const uid of [...this.pares.keys()]) if (!ahi.has(uid)) this.colgar(uid);
    // Los nuevos: llama el de uid menor
    for (const p of lista) {
      if (p.uid === this.miUid || this.pares.has(p.uid)) continue;
      if (this.miUid < p.uid) void this.llamar(p.uid);
    }
    this.avisar();
  }

  private crearPar(uid: string, llamo: boolean): Par {
    const pc = new RTCPeerConnection({ iceServers: SERVIDORES_ICE });
    for (const t of this.micro?.getTracks() ?? []) pc.addTrack(t, this.micro!);
    const audio = new Audio();
    audio.autoplay = true;
    // En iOS el audio tiene que estar en la página para sonar
    audio.setAttribute('playsinline', '');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    const par: Par = { pc, audio, pendientes: [], llamo };
    pc.ontrack = (ev) => {
      const flujo = ev.streams[0] ?? new MediaStream([ev.track]);
      audio.srcObject = flujo;
      void audio.play().catch(() => undefined);
      par.nivel = this.medidor(flujo);
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) void this.canal.enviar(uid, { de: this.miUid, tipo: 'ice', datos: JSON.stringify(ev.candidate.toJSON()) }).catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // Se reintenta desde cero (llama otra vez el de uid menor)
        this.colgar(uid);
        if (this.miUid < uid) setTimeout(() => this.presentes.some((p) => p.uid === uid) && void this.llamar(uid), 3000);
      }
      this.avisar();
    };
    this.pares.set(uid, par);
    return par;
  }

  private async llamar(uid: string) {
    const par = this.crearPar(uid, true);
    const oferta = await par.pc.createOffer();
    await par.pc.setLocalDescription(oferta);
    await this.canal.enviar(uid, { de: this.miUid, tipo: 'oferta', datos: JSON.stringify(oferta) });
  }

  private async recibir(s: Senal) {
    if (!this.micro || s.de === this.miUid) return;
    try {
      if (s.tipo === 'oferta') {
        // Una oferta nueva sustituye a la conexión que hubiera con él
        if (this.pares.has(s.de)) this.colgar(s.de);
        const par = this.crearPar(s.de, false);
        await par.pc.setRemoteDescription(JSON.parse(s.datos));
        const respuesta = await par.pc.createAnswer();
        await par.pc.setLocalDescription(respuesta);
        await this.canal.enviar(s.de, { de: this.miUid, tipo: 'respuesta', datos: JSON.stringify(respuesta) });
        await this.vaciarPendientes(par);
      } else if (s.tipo === 'respuesta') {
        const par = this.pares.get(s.de);
        if (!par || par.pc.signalingState !== 'have-local-offer') return;
        await par.pc.setRemoteDescription(JSON.parse(s.datos));
        await this.vaciarPendientes(par);
      } else {
        const par = this.pares.get(s.de);
        const c = JSON.parse(s.datos) as RTCIceCandidateInit;
        if (!par) return;
        if (par.pc.remoteDescription) await par.pc.addIceCandidate(c);
        else par.pendientes.push(c);
      }
    } catch {
      // Un mensaje viejo o desordenado: se ignora (si falla la conexión, se reintenta sola)
    }
    this.avisar();
  }

  private async vaciarPendientes(par: Par) {
    for (const c of par.pendientes.splice(0)) await par.pc.addIceCandidate(c).catch(() => undefined);
  }

  private colgar(uid: string) {
    const par = this.pares.get(uid);
    if (!par) return;
    this.pares.delete(uid);
    this.hablando.delete(uid);
    par.pc.onconnectionstatechange = null;
    par.pc.close();
    par.audio.srcObject = null;
    par.audio.remove();
  }

  /** Volumen de un flujo de audio (0-1), para saber quién habla. */
  private medidor(flujo: MediaStream): (() => number) | undefined {
    if (!this.ctx) return undefined;
    try {
      const fuente = this.ctx.createMediaStreamSource(flujo);
      const analizador = this.ctx.createAnalyser();
      analizador.fftSize = 512;
      fuente.connect(analizador);
      const datos = new Uint8Array(analizador.fftSize);
      return () => {
        analizador.getByteTimeDomainData(datos);
        let suma = 0;
        for (const v of datos) suma += ((v - 128) / 128) ** 2;
        return Math.sqrt(suma / datos.length);
      };
    } catch {
      return undefined;
    }
  }

  private medirHablando() {
    const UMBRAL = 0.04;
    const yo = !this.estado.mudo && (this.nivelYo?.() ?? 0) > UMBRAL;
    let cambio = yo !== this.estado.yoHablando;
    for (const [uid, par] of this.pares) {
      const habla = (par.nivel?.() ?? 0) > UMBRAL;
      if (habla !== this.hablando.has(uid)) {
        cambio = true;
        if (habla) this.hablando.add(uid);
        else this.hablando.delete(uid);
      }
    }
    if (cambio) this.avisar({ yoHablando: yo });
  }
}

type Fb = typeof import('./firebase');

/** Encuentro por Firebase: presencia en `voz` y mensajes en `vozSenales` (con borrado al salir). */
export function canalFirebase(fb: Fb, sala: string, uid: string): CanalVoz {
  const miRef = fb.ref(fb.db, `salas/${sala}/voz/${uid}`);
  const buzon = fb.ref(fb.db, `salas/${sala}/vozSenales/${uid}`);
  return {
    async anunciar({ nombre, mudo }) {
      await fb.onDisconnect(miRef).remove();
      await fb.set(miRef, { nombre: nombre.slice(0, 30) || 'Ciclista', t: fb.serverTimestamp(), ...(mudo ? { mudo: true } : {}) });
    },
    async retirar() {
      await fb.onDisconnect(miRef).cancel().catch(() => undefined);
      await fb.remove(miRef);
      await fb.remove(buzon).catch(() => undefined);
    },
    alCambiarPresentes(cb) {
      return fb.onValue(fb.ref(fb.db, `salas/${sala}/voz`), (snap) => {
        const lista: Presente[] = [];
        snap.forEach((h) => {
          const v = h.val();
          if (v && typeof v.nombre === 'string') lista.push({ uid: h.key as string, nombre: v.nombre, mudo: !!v.mudo });
        });
        cb(lista);
      });
    },
    async enviar(para, s) {
      await fb.push(fb.ref(fb.db, `salas/${sala}/vozSenales/${para}`), { ...s, t: fb.serverTimestamp() });
    },
    alRecibir(cb) {
      // Lo que quedara de otra vez, fuera; luego cada mensaje se lee y se borra
      void fb.remove(buzon).catch(() => undefined);
      return fb.onChildAdded(buzon, (snap) => {
        const v = snap.val();
        void fb.remove(snap.ref).catch(() => undefined);
        if (v && typeof v.de === 'string' && typeof v.datos === 'string') cb({ de: v.de, tipo: v.tipo, datos: v.datos });
      });
    },
  };
}
