/**
 * Cuentas de usuario con Firebase Authentication: con Google o con cualquier correo y
 * contraseña. Firebase recuerda la sesión en cada navegador.
 * El SDK de Firebase se descarga después de mostrar la web (no retrasa la carga inicial).
 */
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

type Fb = typeof import('../multijugador/firebase');
type Auth = typeof import('firebase/auth');

let modulos: Promise<{ fb: Fb; a: Auth }> | null = null;
/** Carga Firebase (una vez). */
export function cargarFirebase() {
  if (!modulos) modulos = Promise.all([import('../multijugador/firebase'), import('firebase/auth')]).then(([fb, a]) => ({ fb, a }));
  return modulos;
}

export interface Usuario {
  uid: string;
  nombre: string;
  email: string;
  foto?: string;
  /** Proveedor: 'google.com' o 'password'. */
  proveedor: string;
}

const aUsuario = (u: User): Usuario => ({
  uid: u.uid,
  nombre: u.displayName || (u.email ? u.email.split('@')[0] : 'Ciclista'),
  email: u.email ?? '',
  foto: u.photoURL ?? undefined,
  proveedor: u.providerData[0]?.providerId ?? 'password',
});

/** Mensajes de error de Firebase en español. */
export function mensajeCuenta(e: unknown) {
  const c = (e as { code?: string })?.code ?? '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Correo o contraseña incorrectos.';
  if (c.includes('email-already-in-use')) return 'Ya hay una cuenta con ese correo: usa «Entrar».';
  if (c.includes('weak-password')) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (c.includes('invalid-email')) return 'Ese correo no parece válido.';
  if (c.includes('too-many-requests')) return 'Demasiados intentos. Espera unos minutos.';
  if (c.includes('popup-closed-by-user') || c.includes('cancelled-popup-request')) return 'Se cerró la ventana de Google sin terminar.';
  if (c.includes('popup-blocked') || c.includes('operation-not-supported'))
    return 'Este navegador no deja abrir la ventana de Google (pasa en algunos iPad). Entra con correo y contraseña.';
  if (c.includes('unauthorized-domain')) return 'Este dominio no está autorizado en Firebase.';
  if (c.includes('network-request-failed')) return 'Sin conexión a internet.';
  return e instanceof Error ? e.message : String(e);
}

export async function entrarConGoogle() {
  const { fb, a } = await cargarFirebase();
  const proveedor = new a.GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: 'select_account' });
  await a.signInWithPopup(fb.auth, proveedor);
}

export async function entrarConCorreo(email: string, clave: string) {
  const { fb, a } = await cargarFirebase();
  await a.signInWithEmailAndPassword(fb.auth, email.trim(), clave);
}

export async function crearCuenta(nombre: string, email: string, clave: string) {
  const { fb, a } = await cargarFirebase();
  const c = await a.createUserWithEmailAndPassword(fb.auth, email.trim(), clave);
  if (nombre.trim()) await a.updateProfile(c.user, { displayName: nombre.trim().slice(0, 30) });
}

export async function recordarClave(email: string) {
  const { fb, a } = await cargarFirebase();
  fb.auth.languageCode = 'es';
  await a.sendPasswordResetEmail(fb.auth, email.trim());
}

export async function cerrarSesion() {
  const { fb, a } = await cargarFirebase();
  await a.signOut(fb.auth);
}

/**
 * Usuario con sesión iniciada (null si no hay, o si solo es la identidad anónima que usa la
 * salida en grupo). `cargando` es true hasta saber si había sesión guardada.
 */
export function useUsuario() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let quitar: (() => void) | undefined;
    let vivo = true;
    void cargarFirebase().then(({ fb, a }) => {
      if (!vivo) return;
      quitar = a.onAuthStateChanged(fb.auth, (u) => {
        setUsuario(u && !u.isAnonymous ? aUsuario(u) : null);
        setCargando(false);
      });
    });
    return () => {
      vivo = false;
      quitar?.();
    };
  }, []);
  return { usuario, cargando, refrescar: () => cargarFirebase().then(({ fb }) => fb.auth.currentUser && setUsuario(aUsuario(fb.auth.currentUser))) };
}
