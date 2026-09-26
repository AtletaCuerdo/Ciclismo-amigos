/**
 * Ciclista 3D: la bici (bici.ts) y el ciclista humano (ciclistaHumano.ts) montados juntos.
 * Ejes locales: +X hacia delante, +Y arriba, Z a los lados. Unidades en metros.
 *
 * - 4 modelos de bici (ruta, aero, escaladora, cabra de triatlón) y 4 tipos de rueda.
 * - Las piernas siguen a los pedales con cinemática inversa; las manos agarran las manetas
 *   (o las puntas del acople, con los codos en los reposabrazos en la cabra).
 * - Al cambiar de bici o ruedas se reconstruye; al cambiar colores solo se repintan.
 * - Mientras se cargan los modelos humanos se muestra un ciclista sencillo hecho con primitivas.
 */
import * as THREE from 'three';
import type { Avatar } from './avatar';
import {
  BIELA,
  EJE,
  RADIO_RUEDA,
  Z_PEDAL,
  crearMaterialesBici,
  geometriaBici,
  montarBici,
  type GeometriaBici,
  type MaterialesBici,
  type PiezasBici,
} from './bici';
import { mallasListas, precargarMallas } from './cacheMallas';
import { JineteHumano, cargarPlantillasHumanas, plantillasHumanas } from './ciclistaHumano';

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
const EJE_Y = V(0, 1, 0);
const tmpA = new THREE.Vector3();

const MUSLO = 0.46;
const TIBIA = 0.45;
const BRAZO = 0.3;
const ANTEBRAZO = 0.29;

/** Pieza alargada (cápsula de altura 1) que se estira entre dos puntos. */
class Tubo {
  readonly malla: THREE.Mesh;
  constructor(geometria: THREE.BufferGeometry, material: THREE.Material, padre: THREE.Object3D) {
    this.malla = new THREE.Mesh(geometria, material);
    this.malla.castShadow = true;
    padre.add(this.malla);
  }
  entre(a: THREE.Vector3, b: THREE.Vector3) {
    tmpA.subVectors(b, a);
    const largo = tmpA.length();
    this.malla.position.copy(a).addScaledVector(tmpA, 0.5);
    this.malla.scale.set(1, largo, 1);
    this.malla.quaternion.setFromUnitVectors(EJE_Y, tmpA.divideScalar(largo || 1));
    return this;
  }
}

function etiquetaNombre(texto: string) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 256;
  lienzo.height = 64;
  const ctx = lienzo.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,17,21,0.75)';
  ctx.beginPath();
  // roundRect no existe en iOS antiguos
  if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 8, 248, 48, 24);
  else ctx.rect(4, 8, 248, 48);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto.slice(0, 16), 128, 33);
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      transparent: true,
      sizeAttenuation: false, // mismo tamaño en pantalla esté cerca o lejos
    }),
  );
  sprite.scale.set(0.14, 0.035, 1);
  sprite.position.set(0.1, 2.0, 0);
  sprite.renderOrder = 10;
  return sprite;
}

/** Articulación intermedia (rodilla o codo) de una cadena de dos huesos en el plano XY. */
function articulacion(
  origen: THREE.Vector3,
  fin: THREE.Vector3,
  l1: number,
  l2: number,
  haciaDelante: boolean,
  salida: THREE.Vector3,
) {
  const dx = fin.x - origen.x;
  const dy = fin.y - origen.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.001);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const ang = haciaDelante ? base + a : base - a;
  return salida.set(origen.x + l1 * Math.cos(ang), origen.y + l1 * Math.sin(ang), origen.z);
}

interface MaterialesCiclista {
  maillot: THREE.MeshStandardMaterial;
  culotte: THREE.MeshStandardMaterial;
  casco: THREE.MeshStandardMaterial;
  piel: THREE.MeshStandardMaterial;
  negro: THREE.MeshStandardMaterial;
  blanco: THREE.MeshStandardMaterial;
}

export class Ciclista3D {
  /** Grupo exterior: posición y rumbo. */
  readonly raiz = new THREE.Group();
  /** Grupo interior: inclinación según la pendiente. */
  private inclinacion = new THREE.Group();
  private cuerpo: THREE.Group | null = null;
  private avatar: Avatar;
  private geo!: GeometriaBici;
  private bici: PiezasBici | null = null;
  private matBici: MaterialesBici;
  private matCiclista: MaterialesCiclista;
  private piernas: { muslo: Tubo; tibia: Tubo; pie: THREE.Mesh; lado: number }[] = [];
  private anguloBiela = Math.random() * Math.PI * 2;
  private avanceCadena = 0;
  private etiqueta: THREE.Sprite | null = null;
  private humano: JineteHumano | null = null;
  private destruido = false;
  private pedalIzq = new THREE.Vector3();
  private pedalDer = new THREE.Vector3();
  private caderaTmp = new THREE.Vector3();
  private rodillaTmp = new THREE.Vector3();
  private pieTmp = new THREE.Vector3();

  constructor(avatar: Avatar, nombre?: string) {
    this.avatar = avatar;
    this.matBici = crearMaterialesBici(avatar.bici, avatar.bici2, avatar.modelo);
    const m = (color: string, roughness: number) => new THREE.MeshStandardMaterial({ color, roughness });
    this.matCiclista = {
      maillot: m(avatar.maillot, 0.55),
      culotte: m(avatar.culotte, 0.6),
      casco: m(avatar.casco, 0.3),
      piel: m(avatar.piel, 0.65),
      negro: m('#18181a', 0.45),
      blanco: m('#f2f2f2', 0.6),
    };
    this.raiz.add(this.inclinacion);
    this.construir();
    if (nombre) this.ponerNombre(nombre);
  }

  private liberarCuerpo() {
    this.humano?.destruir();
    this.humano = null;
    if (this.bici) {
      this.bici.propias.forEach((g) => g.dispose());
      this.bici.cadena.destruir();
      this.bici = null;
    }
    if (this.cuerpo) {
      // Solo las geometrías del ciclista sencillo (las de la bici se liberan arriba)
      for (const p of this.piernas) {
        p.muslo.malla.geometry.dispose();
        p.tibia.malla.geometry.dispose();
        p.pie.geometry.dispose();
      }
      this.cuerpo.children.forEach((o) => {
        if (o instanceof THREE.Mesh && o.userData.sencillo) o.geometry.dispose();
      });
      this.inclinacion.remove(this.cuerpo);
    }
  }

  private construir() {
    this.liberarCuerpo();
    // Las mallas del cuadro y el casco pueden estar guardadas en el navegador: se leen antes
    if (!mallasListas()) {
      void precargarMallas().then(() => {
        if (!this.destruido) this.construir();
      });
      return;
    }
    const c = new THREE.Group();
    this.cuerpo = c;
    this.inclinacion.add(c);
    this.piernas = [];
    const G = geometriaBici(this.avatar.modelo);
    this.geo = G;

    this.bici = montarBici(this.avatar.modelo, this.avatar.ruedas, this.matBici);
    c.add(this.bici.grupo);

    // ---- Ciclista ----
    // Con los modelos humanos cargados se usa el ciclista realista; si no, el hecho por código
    const plantillas = plantillasHumanas();
    if (plantillas) {
      try {
        this.humano = new JineteHumano(
          plantillas,
          this.avatar,
          { cadera: G.cadera, agarre: G.agarre, codo: G.codo, cabra: G.cabra },
          c,
        );
        this.humano.actualizarColores(this.avatar);
        this.pedalear(0, 0, 0);
        return;
      } catch (e) {
        console.warn('No se pudo montar el ciclista humano; se usa el sencillo', e);
        this.humano = null;
      }
    } else {
      void cargarPlantillasHumanas()
        .then(() => {
          if (!this.destruido && !this.humano) this.construir();
        })
        .catch((e) => console.warn('No se pudieron cargar los modelos del ciclista', e));
    }
    this.ciclistaSencillo(c, G);
    this.pedalear(0, 0, 0);
  }

  /** Ciclista hecho con cápsulas (mientras cargan los modelos o si fallan). */
  private ciclistaSencillo(c: THREE.Group, G: GeometriaBici) {
    const m = this.matCiclista;
    const pieza = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const o = new THREE.Mesh(g, mat);
      o.castShadow = true;
      o.userData.sencillo = true;
      c.add(o);
      return o;
    };
    const esfera = (p: THREE.Vector3, r: number, mat: THREE.Material, escala: [number, number, number] = [1, 1, 1]) => {
      const e = pieza(new THREE.SphereGeometry(r, 16, 12), mat);
      e.position.copy(p);
      e.scale.set(...escala);
      return e;
    };
    const capsula = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
      const dir = b.clone().sub(a);
      const o = pieza(new THREE.CapsuleGeometry(r, Math.max(0.001, dir.length() - 2 * r), 4, 12), mat);
      o.position.copy(a).addScaledVector(dir, 0.5);
      o.quaternion.setFromUnitVectors(EJE_Y, dir.normalize());
      return o;
    };
    esfera(G.cadera, 0.15, m.culotte, [1.15, 0.85, 1.25]);
    capsula(G.cadera, G.hombro, 0.13, m.maillot).scale.set(0.85, 1, 1.3);
    esfera(G.hombro, 0.12, m.maillot, [0.9, 0.85, 1.75]);
    capsula(G.hombro, G.cabeza, 0.048, m.piel);
    esfera(G.cabeza, 0.098, m.piel, [1.08, 1, 0.92]);
    esfera(G.cabeza.clone().add(V(-0.01, 0.02)), 0.118, m.casco, [1.25, 0.85, 1.02]);
    for (const lado of [-1, 1]) {
      const hombro = G.hombro.clone().setZ(0.19 * lado);
      const mano = G.agarre.clone().setZ(G.zMano * lado);
      const codo = G.codo
        ? G.codo.clone().setZ(G.codo.z * lado)
        : articulacion(hombro, mano, BRAZO, ANTEBRAZO, false, new THREE.Vector3());
      capsula(hombro, codo, 0.05, m.maillot);
      capsula(codo, mano, 0.04, m.piel);
      esfera(mano, 0.042, m.negro, [1.2, 0.9, 1]);
    }
    for (const lado of [-1, 1]) {
      const muslo = new Tubo(new THREE.CapsuleGeometry(0.078, 0.85, 4, 12), m.culotte, c);
      const tibia = new Tubo(new THREE.CapsuleGeometry(0.052, 0.85, 4, 12), m.piel, c);
      const pie = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.16, 4, 10), m.blanco);
      pie.castShadow = true;
      c.add(pie);
      this.piernas.push({ muslo, tibia, pie, lado });
    }
  }

  ponerNombre(nombre: string) {
    if (this.etiqueta) {
      this.etiqueta.material.map?.dispose();
      this.etiqueta.material.dispose();
      this.raiz.remove(this.etiqueta);
    }
    this.etiqueta = etiquetaNombre(nombre);
    this.raiz.add(this.etiqueta);
  }

  cambiarAvatar(avatar: Avatar) {
    const a = this.avatar;
    const cambiaBici = avatar.modelo !== a.modelo;
    const reconstruir =
      cambiaBici ||
      avatar.ruedas !== a.ruedas ||
      avatar.sexo !== a.sexo ||
      avatar.pelo !== a.pelo ||
      avatar.barba !== a.barba ||
      avatar.cascoModelo !== a.cascoModelo ||
      avatar.colorPelo !== a.colorPelo;
    this.avatar = avatar;
    if (cambiaBici) {
      // El material del cuadro lleva la posición del tubo diagonal (rotulación)
      Object.values(this.matBici).forEach((m) => m.dispose());
      this.matBici = crearMaterialesBici(avatar.bici, avatar.bici2, avatar.modelo);
    } else {
      const u = this.matBici.cuadro.userData.uniformes;
      u.uPintura.value.set(avatar.bici);
      u.uPintura2.value.set(avatar.bici2);
      this.matBici.bici2.color.set(avatar.bici2);
    }
    this.matCiclista.maillot.color.set(avatar.maillot);
    this.matCiclista.culotte.color.set(avatar.culotte);
    this.matCiclista.casco.color.set(avatar.casco);
    this.matCiclista.piel.color.set(avatar.piel);
    if (reconstruir) this.construir();
    else this.humano?.actualizarColores(avatar);
  }

  /**
   * Avanza la animación.
   * @param velocidadMs velocidad en m/s (gira las ruedas)
   * @param cadenciaRpm cadencia (gira las bielas y mueve las piernas)
   */
  pedalear(velocidadMs: number, cadenciaRpm: number, dt: number) {
    const b = this.bici;
    if (!b) return;
    for (const r of b.ruedas) r.rotation.z -= (velocidadMs / RADIO_RUEDA) * dt;
    const giro = (cadenciaRpm / 60) * Math.PI * 2 * dt;
    this.anguloBiela -= giro;
    this.avanceCadena += giro * b.radioPlato;
    b.platos.rotation.z = this.anguloBiela;
    b.bielaIzq.rotation.z = this.anguloBiela + Math.PI;
    if (giro !== 0 || dt === 0) b.cadena.colocar(this.avanceCadena);

    for (const [i, lado] of [[0, -1], [1, 1]] as const) {
      const a = this.anguloBiela + (lado > 0 ? 0 : Math.PI);
      const p = (lado < 0 ? this.pedalIzq : this.pedalDer).set(
        EJE.x + BIELA * Math.cos(a),
        EJE.y + BIELA * Math.sin(a),
        lado * (Z_PEDAL + 0.028),
      );
      const pedal = b.pedales[i];
      pedal.position.copy(p);
      // El pedal acompaña a la zapatilla (punta algo abajo, más en la parte baja)
      pedal.rotation.z = -0.3 + 0.2 * Math.sin(a);
    }

    if (this.humano) {
      this.humano.posar({ izq: this.pedalIzq, der: this.pedalDer }, this.anguloBiela);
      return;
    }

    const G = this.geo;
    for (const p of this.piernas) {
      const z = 0.1 * p.lado;
      this.caderaTmp.copy(G.cadera).setZ(z);
      this.pieTmp.copy(p.lado < 0 ? this.pedalIzq : this.pedalDer).add(V(0, 0.045)).setZ(z);
      articulacion(this.caderaTmp, this.pieTmp, MUSLO, TIBIA, true, this.rodillaTmp);
      p.muslo.entre(this.caderaTmp, this.rodillaTmp);
      p.tibia.entre(this.rodillaTmp, this.pieTmp);
      p.pie.position.copy(this.pieTmp).add(V(0.03, -0.02));
      p.pie.rotation.z = Math.PI / 2;
    }
  }

  /** Coloca el ciclista: posición, rumbo (vector de dirección en XZ) y pendiente en %. */
  colocar(posicion: THREE.Vector3, direccionX: number, direccionZ: number, pendientePct: number) {
    this.raiz.position.copy(posicion);
    this.raiz.rotation.y = Math.atan2(-direccionZ, direccionX);
    this.inclinacion.rotation.z = Math.atan(pendientePct / 100);
  }

  destruir() {
    this.destruido = true;
    this.liberarCuerpo();
    if (this.etiqueta) {
      this.etiqueta.material.map?.dispose();
      this.etiqueta.material.dispose();
    }
    Object.values(this.matBici).forEach((m) => m.dispose());
    Object.values(this.matCiclista).forEach((m) => m.dispose());
    this.raiz.removeFromParent();
  }
}
