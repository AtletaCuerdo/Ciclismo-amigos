/**
 * Conexión con Firebase (proyecto "ciclismo-amigos", plan gratuito Spark).
 *
 * Esta configuración NO es secreta: Firebase la diseña para ir dentro de la
 * web pública. Lo que protege los datos son las reglas de seguridad de la
 * Realtime Database (ver README).
 *
 * Este módulo se importa de forma dinámica (solo al unirse a la salida) para
 * no hacer más pesada la carga inicial de la web.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyCIySBMX4amJBnd_pfEzge7psFnqkbGWSE',
  authDomain: 'ciclismo-amigos.firebaseapp.com',
  databaseURL: 'https://ciclismo-amigos-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'ciclismo-amigos',
  storageBucket: 'ciclismo-amigos.firebasestorage.app',
  messagingSenderId: '641206517016',
  appId: '1:641206517016:web:6972761791b8ea74ceb26d',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

/**
 * Devuelve el usuario con cuenta. RideCrew ya no deja usar la web sin cuenta (ni entrar de forma
 * anónima): sin sesión, falla y quien llama lo trata como «sin conexión».
 */
export async function usuarioActual(): Promise<User> {
  await auth.authStateReady();
  const u = auth.currentUser;
  if (!u || u.isAnonymous) throw new Error('Hace falta entrar con una cuenta');
  return u;
}

export * from 'firebase/database';
