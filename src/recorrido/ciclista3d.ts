/**
 * Ciclista 3D low-poly construido con primitivas de Three.js (sin modelos externos).
 * Ejes locales: +X hacia delante, +Y arriba, Z a los lados. Unidades en metros.
 * Las piernas siguen a los pedales con una cinemática inversa de dos huesos.
 */
import * as THREE from 'three';
import type { Avatar } from './avatar';

const RADIO_RUEDA = 0.34;
const BIELA = 0.17;
const MUSLO = 0.44;
const TIBIA = 0.44;

// Puntos del cuadro (x, y) en el plano de la bici
const P = {
  bujeTrasero: new THREE.Vector3(-0.5, RADIO_RUEDA, 0),
  eje: new THREE.Vector3(0, 0.3, 0), // eje de pedalier
  sillin: new THREE.Vector3(-0.13, 0.86, 0),
  direccionArriba: new THREE.Vector3(0.43, 0.83, 0),
  direccionAbajo: new THREE.Vector3(0.46, 0.63, 0),
  bujeDelantero: new THREE.Vector3(0.55, RADIO_RUEDA, 0),
  cadera: new THREE.Vector3(-0.1, 0.96, 0),
  hombro: new THREE.Vector3(0.3, 1.3, 0),
  cabeza: new THREE.Vector3(0.44, 1.43, 0),
  mano: new THREE.Vector3(0.5, 0.93, 0),
};

const EJE_Y = new THREE.Vector3(0, 1, 0);

/** Cilindro de altura 1 que se coloca entre dos puntos cualquiera. */
class Tubo {
  readonly malla: THREE.Mesh;
  constructor(radio: number, material: THREE.Material, padre: THREE.Object3D, lados = 6) {
    this.malla = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 1, lados), material);
    padre.add(this.malla);
  }
  entre(a: THREE.Vector3, b: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(b, a);
    const largo = d.length();
    this.malla.position.copy(a).addScaledVector(d, 0.5);
    this.malla.scale.set(1, largo, 1);
    this.malla.quaternion.setFromUnitVectors(EJE_Y, d.divideScalar(largo || 1));
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
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(lienzo),
      depthTest: false,
      transparent: true,
      sizeAttenuation: false, // mismo tamaño en pantalla esté cerca o lejos
    }),
  );
  sprite.scale.set(0.14, 0.035, 1);
  sprite.position.set(0.1, 2.05, 0);
  sprite.renderOrder = 10;
  return sprite;
}

export class Ciclista3D {
  /** Grupo exterior: posición y rumbo. */
  readonly raiz = new THREE.Group();
  /** Grupo interior: inclinación según la pendiente. */
  private cuerpo = new THREE.Group();
  private materiales: Record<keyof Avatar, THREE.MeshLambertMaterial>;
  private ruedas: THREE.Object3D[] = [];
  private bielas: { brazo: Tubo; pedal: THREE.Mesh; lado: number }[] = [];
  private piernas: { muslo: Tubo; tibia: Tubo; pie: THREE.Mesh; lado: number }[] = [];
  private anguloBiela = 0;
  private etiqueta: THREE.Sprite | null = null;

  constructor(avatar: Avatar, nombre?: string) {
    const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    this.materiales = {
      maillot: mat(avatar.maillot),
      franja: mat(avatar.franja),
      culotte: mat(avatar.culotte),
      casco: mat(avatar.casco),
      bici: mat(avatar.bici),
      piel: mat(avatar.piel),
    };
    const negro = mat('#1a1a1a');
    const metal = mat('#9aa0a8');
    const m = this.materiales;
    const c = this.cuerpo;
    this.raiz.add(c);

    // --- Ruedas ---
    for (const centro of [P.bujeTrasero, P.bujeDelantero]) {
      const rueda = new THREE.Group();
      rueda.position.copy(centro);
      rueda.add(new THREE.Mesh(new THREE.TorusGeometry(RADIO_RUEDA - 0.015, 0.022, 6, 28), negro));
      rueda.add(new THREE.Mesh(new THREE.TorusGeometry(RADIO_RUEDA - 0.05, 0.01, 4, 28), metal));
      // Radios (se ven girar)
      for (let i = 0; i < 3; i++) {
        const radio = new THREE.Mesh(new THREE.BoxGeometry(0.01, (RADIO_RUEDA - 0.05) * 2, 0.01), metal);
        radio.rotation.z = (i * Math.PI) / 3;
        rueda.add(radio);
      }
      c.add(rueda);
      this.ruedas.push(rueda);
    }

    // --- Cuadro ---
    const tubo = (a: THREE.Vector3, b: THREE.Vector3, r = 0.022, material: THREE.Material = m.bici) =>
      new Tubo(r, material, c).entre(a, b);
    for (const z of [-0.05, 0.05]) {
      const bt = P.bujeTrasero.clone().setZ(z);
      tubo(bt, P.eje, 0.013);
      tubo(bt, P.sillin, 0.012);
      const bd = P.bujeDelantero.clone().setZ(z);
      tubo(P.direccionAbajo, bd, 0.014);
    }
    tubo(P.eje, P.sillin, 0.024);
    tubo(P.sillin, P.direccionArriba);
    tubo(P.eje, P.direccionAbajo, 0.028);
    tubo(P.direccionAbajo, P.direccionArriba, 0.03);
    // Manillar y potencia
    const potencia = P.direccionArriba.clone().add(new THREE.Vector3(0.08, 0.05, 0));
    tubo(P.direccionArriba, potencia, 0.018, negro);
    tubo(potencia.clone().setZ(-0.21), potencia.clone().setZ(0.21), 0.015, negro);
    for (const z of [-0.2, 0.2]) {
      tubo(potencia.clone().setZ(z), new THREE.Vector3(0.62, 0.78, z), 0.014, negro);
    }
    // Sillín
    const sillin = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.12), negro);
    sillin.position.copy(P.sillin).add(new THREE.Vector3(-0.02, 0.03, 0));
    c.add(sillin);

    // --- Bielas y pedales ---
    for (const lado of [-1, 1]) {
      const brazo = new Tubo(0.012, metal, c, 4);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.08), negro);
      c.add(pedal);
      this.bielas.push({ brazo, pedal, lado });
    }

    // --- Ciclista ---
    const piel = m.piel;
    // Torso: cilindro inclinado de la cadera al hombro, más franja
    const torso = new Tubo(0.15, m.maillot, c, 10);
    torso.entre(P.cadera, P.hombro);
    const franja = new Tubo(0.155, m.franja, c, 10);
    franja.entre(
      P.cadera.clone().lerp(P.hombro, 0.45),
      P.cadera.clone().lerp(P.hombro, 0.62),
    );
    // Culotte (cadera)
    const culo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m.culotte);
    culo.position.copy(P.cadera);
    culo.scale.set(1.1, 0.8, 1.2);
    c.add(culo);
    // Hombros
    const hombros = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m.maillot);
    hombros.position.copy(P.hombro);
    hombros.scale.set(0.9, 0.8, 1.3);
    c.add(hombros);
    // Cuello y cabeza
    new Tubo(0.05, piel, c).entre(P.hombro, P.cabeza);
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), piel);
    cabeza.position.copy(P.cabeza);
    c.add(cabeza);
    // Casco: media esfera alargada
    const casco = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      m.casco,
    );
    casco.position.copy(P.cabeza).add(new THREE.Vector3(-0.01, 0.02, 0));
    casco.scale.set(1.25, 0.95, 1);
    casco.rotation.z = -0.25;
    c.add(casco);
    // Brazos: manga (maillot) + antebrazo (piel)
    for (const z of [-0.19, 0.19]) {
      const hombro = P.hombro.clone().setZ(z * 0.9);
      const mano = P.mano.clone().setZ(z);
      const codo = hombro.clone().lerp(mano, 0.5).add(new THREE.Vector3(-0.04, -0.03, 0));
      new Tubo(0.05, m.maillot, c).entre(hombro, codo);
      new Tubo(0.04, piel, c).entre(codo, mano);
      const guante = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), negro);
      guante.position.copy(mano);
      c.add(guante);
    }
    // Piernas (se animan)
    for (const lado of [-1, 1]) {
      const muslo = new Tubo(0.07, m.culotte, c, 8);
      const tibia = new Tubo(0.05, piel, c, 8);
      const pie = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.08), negro);
      c.add(pie);
      this.piernas.push({ muslo, tibia, pie, lado });
    }

    if (nombre) this.ponerNombre(nombre);
    this.pedalear(0, 0);
  }

  ponerNombre(nombre: string) {
    if (this.etiqueta) this.raiz.remove(this.etiqueta);
    this.etiqueta = etiquetaNombre(nombre);
    this.raiz.add(this.etiqueta);
  }

  cambiarAvatar(avatar: Avatar) {
    for (const k of Object.keys(this.materiales) as (keyof Avatar)[]) {
      this.materiales[k].color.set(avatar[k]);
    }
  }

  /**
   * Avanza la animación.
   * @param velocidadMs velocidad en m/s (gira las ruedas)
   * @param cadenciaRpm cadencia (gira las bielas y mueve las piernas)
   */
  pedalear(velocidadMs: number, cadenciaRpm: number, dt = 0) {
    for (const r of this.ruedas) r.rotation.z -= (velocidadMs / RADIO_RUEDA) * dt;
    this.anguloBiela -= (cadenciaRpm / 60) * Math.PI * 2 * dt;

    for (const b of this.bielas) {
      const a = this.anguloBiela + (b.lado > 0 ? 0 : Math.PI);
      const z = 0.1 * b.lado;
      const pedal = new THREE.Vector3(P.eje.x + BIELA * Math.cos(a), P.eje.y + BIELA * Math.sin(a), z);
      b.brazo.entre(P.eje.clone().setZ(z * 0.8), pedal);
      b.pedal.position.copy(pedal);
    }

    for (const p of this.piernas) {
      const a = this.anguloBiela + (p.lado > 0 ? 0 : Math.PI);
      const z = 0.1 * p.lado;
      const cadera = P.cadera.clone().setZ(z);
      const pie = new THREE.Vector3(P.eje.x + BIELA * Math.cos(a), P.eje.y + BIELA * Math.sin(a) + 0.03, z);
      // Cinemática inversa: la rodilla apunta hacia delante
      const d = new THREE.Vector3().subVectors(pie, cadera);
      const dist = Math.min(d.length(), MUSLO + TIBIA - 0.001);
      const angBase = Math.atan2(d.y, d.x);
      const angCadera = Math.acos((MUSLO * MUSLO + dist * dist - TIBIA * TIBIA) / (2 * MUSLO * dist));
      const angMuslo = angBase + angCadera;
      const rodilla = new THREE.Vector3(
        cadera.x + MUSLO * Math.cos(angMuslo),
        cadera.y + MUSLO * Math.sin(angMuslo),
        z,
      );
      p.muslo.entre(cadera, rodilla);
      p.tibia.entre(rodilla, pie);
      p.pie.position.copy(pie).add(new THREE.Vector3(0.03, -0.01, 0));
    }
  }

  /** Coloca el ciclista: posición, rumbo (vector de dirección en XZ) y pendiente en %. */
  colocar(posicion: THREE.Vector3, direccionX: number, direccionZ: number, pendientePct: number) {
    this.raiz.position.copy(posicion);
    this.raiz.rotation.y = Math.atan2(-direccionZ, direccionX);
    this.cuerpo.rotation.z = Math.atan(pendientePct / 100);
  }

  destruir() {
    const materiales = new Set<THREE.Material>();
    this.raiz.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        materiales.add(o.material as THREE.Material);
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        materiales.add(o.material);
      }
    });
    materiales.forEach((m) => m.dispose());
    this.raiz.removeFromParent();
  }
}
