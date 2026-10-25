import { useEffect, useRef, useState } from 'react';
import { AUDIO_MAX_CARACTERES, AUDIO_MAX_S, TEXTO_MAX, type Mensaje } from '../multijugador/useSalida';

interface Props {
  mensajes: Mensaje[];
  miUid: string | null;
  /** El chat no funciona (p. ej. faltan las reglas de Firebase). */
  rechazado: boolean;
  onEnviar: (texto: string) => Promise<boolean>;
  /** Manda un mensaje de voz («data:audio/…;base64,…» y su duración en s). */
  onEnviarAudio: (audio: string, dur: number) => Promise<boolean>;
}

/** Formato que se graba: MP4/AAC si se puede (lo reproduce todo, también el iPad); si no, WebM/Opus. */
function formatoAudio() {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

const leerComoTexto = (b: Blob) =>
  new Promise<string>((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(b);
  });

/**
 * Botón para grabar un mensaje de voz: un toque empieza, otro lo manda (como mucho 20 s).
 * Se graba con poca calidad (24 kbit/s): basta para la voz y ocupa poco en Firebase.
 */
function GrabarAudio({ onAudio, onError }: { onAudio: (audio: string, dur: number) => void; onError: (t: string) => void }) {
  const [segundos, setSegundos] = useState<number | null>(null);
  const grabador = useRef<MediaRecorder | null>(null);
  const formato = formatoAudio();

  const parar = () => grabador.current?.state === 'recording' && grabador.current.stop();

  // Tope de 20 s
  useEffect(() => {
    if (segundos === null) return;
    if (segundos >= AUDIO_MAX_S) {
      parar();
      return;
    }
    const id = setTimeout(() => setSegundos((s) => (s === null ? s : s + 1)), 1000);
    return () => clearTimeout(id);
  }, [segundos]);

  if (formato === null) return null;

  const empezar = async () => {
    try {
      const pista = await navigator.mediaDevices.getUserMedia({ audio: true });
      const g = new MediaRecorder(pista, { ...(formato ? { mimeType: formato } : {}), audioBitsPerSecond: 24000 });
      const trozos: Blob[] = [];
      const inicio = Date.now();
      g.ondataavailable = (e) => e.data.size && trozos.push(e.data);
      g.onstop = async () => {
        pista.getTracks().forEach((t) => t.stop());
        setSegundos(null);
        const dur = (Date.now() - inicio) / 1000;
        if (dur < 0.7) return; // toque sin querer
        const texto = await leerComoTexto(new Blob(trozos, { type: g.mimeType || formato || 'audio/webm' }));
        if (texto.length > AUDIO_MAX_CARACTERES) onError('El audio es demasiado largo.');
        else onAudio(texto, Math.min(AUDIO_MAX_S, dur));
      };
      grabador.current = g;
      g.start();
      setSegundos(0);
    } catch {
      onError('No se puede usar el micrófono: dale permiso al navegador.');
    }
  };

  return segundos === null ? (
    <button type="button" className="boton-secundario chat-micro" onClick={() => void empezar()} title="Mandar un mensaje de voz">
      🎤
    </button>
  ) : (
    <button type="button" className="boton-principal chat-micro grabando" onClick={parar} title="Parar y mandar">
      ⏺ {segundos}s · Enviar
    </button>
  );
}

/** Un solo audio sonando a la vez en todo el chat. */
let sonando: HTMLAudioElement | null = null;

function BotonAudio({ m }: { m: Mensaje }) {
  const [activo, setActivo] = useState(false);
  const alternar = () => {
    if (activo && sonando) {
      sonando.pause();
      sonando = null;
      setActivo(false);
      return;
    }
    sonando?.pause();
    const a = new Audio(m.audio);
    sonando = a;
    a.onended = a.onpause = () => setActivo(false);
    void a.play().then(() => setActivo(true)).catch(() => setActivo(false));
  };
  return (
    <button type="button" className="chat-audio" onClick={alternar}>
      {activo ? '⏸' : '▶️'} {Math.round(m.dur ?? 0)} s
    </button>
  );
}

/** Mensajes rápidos: se mandan con un toque, sin dejar de pedalear. */
const RAPIDOS = ['👍', '¡Vamos!', 'Espérame', 'Tira tú', 'Relevo', 'Subo fuerte', '😅', '🔥'];
/** Con el chat cerrado, cada mensaje nuevo se ve este tiempo. */
const VISIBLE_MS = 12000;

const hora = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Chat del grupo dentro del recorrido. Cerrado: los mensajes nuevos aparecen un rato y se
 * van solos. Abierto: la conversación, mensajes rápidos y un campo para escribir.
 */
export function ChatGrupo({ mensajes, miUid, rechazado, onEnviar, onEnviarAudio }: Props) {
  const [errorAudio, setErrorAudio] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Hasta dónde he leído (para el contador de no leídos) y cuándo llegó cada mensaje
  const [leidoHasta, setLeidoHasta] = useState(() => Date.now());
  const llegada = useRef(new Map<string, number>());
  const [, refrescar] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  const montaje = useRef(Date.now());
  const ahora = Date.now();
  // Los mensajes que ya estaban al entrar no cuentan como nuevos
  for (const m of mensajes)
    if (!llegada.current.has(m.id)) llegada.current.set(m.id, m.t > montaje.current - 5000 ? ahora : 0);

  // Con el chat abierto todo queda leído y se baja al último mensaje
  const ultimo = mensajes[mensajes.length - 1]?.id;
  useEffect(() => {
    if (!abierto) return;
    setLeidoHasta(Date.now());
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [abierto, ultimo]);

  // Repintar para que los mensajes recientes se oculten solos
  useEffect(() => {
    const id = setInterval(() => refrescar((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const noLeidos = mensajes.filter((m) => m.uid !== miUid && (llegada.current.get(m.id) ?? 0) > leidoHasta).length;
  const recientes = mensajes.filter((m) => ahora - (llegada.current.get(m.id) ?? 0) < VISIBLE_MS).slice(-3);

  const enviar = async (t: string) => {
    if (!t.trim() || enviando) return;
    setEnviando(true);
    const ok = await onEnviar(t);
    setEnviando(false);
    if (ok) setTexto('');
  };

  const burbuja = (m: Mensaje) => (
    <div key={m.id} className={`chat-mensaje ${m.uid === miUid ? 'mio' : ''}`}>
      <strong>{m.uid === miUid ? 'Tú' : m.nombre}</strong> {m.audio ? <BotonAudio m={m} /> : m.texto}
      {abierto && <span className="chat-hora">{hora(m.t)}</span>}
    </div>
  );

  if (!abierto)
    return (
      <div className="hud-chat">
        {recientes.length > 0 && <div className="chat-recientes">{recientes.map(burbuja)}</div>}
        <button className="boton-secundario chat-abrir" onClick={() => setAbierto(true)} title="Chat del grupo">
          💬 Chat{noLeidos > 0 && <span className="chat-contador">{noLeidos}</span>}
        </button>
      </div>
    );

  return (
    <div className="hud hud-chat abierto">
      <div className="chat-cabecera">
        <strong>💬 Chat del grupo</strong>
        <button className="chat-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el chat">
          ✕
        </button>
      </div>
      <div className="chat-lista" ref={lista}>
        {mensajes.length === 0 && <span className="chat-vacio">Aún no hay mensajes. ¡Saluda!</span>}
        {mensajes.map(burbuja)}
      </div>
      {rechazado && <span className="chat-error">Firebase no deja usar el chat: hay que pegar las reglas nuevas.</span>}
      {errorAudio && <span className="chat-error">{errorAudio}</span>}
      <div className="chat-rapidos">
        {RAPIDOS.map((r) => (
          <button key={r} className="chat-rapido" onClick={() => void enviar(r)} disabled={enviando}>
            {r}
          </button>
        ))}
      </div>
      <form
        className="chat-escribir"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <input
          type="text"
          value={texto}
          maxLength={TEXTO_MAX}
          placeholder="Escribe un mensaje…"
          enterKeyHint="send"
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Mensaje"
        />
        <button className="boton-principal" type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </button>
        <GrabarAudio
          onError={setErrorAudio}
          onAudio={(audio, dur) => {
            setErrorAudio(null);
            void onEnviarAudio(audio, dur);
          }}
        />
      </form>
    </div>
  );
}
