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
import { getAuth, signInAnonymously, type User } from 'firebase/auth';
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
 * Devuelve el usuario actual o entra de forma anónima.
 * Firebase recuerda la identidad anónima en el navegador, así que cada
 * dispositivo conserva la misma entre visitas.
 */
export async function entrarAnonimo(): Promise<User> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  const credencial = await signInAnonymously(auth);
  return credencial.user;
}

export * from 'firebase/database';
