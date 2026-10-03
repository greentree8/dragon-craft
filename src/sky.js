// Day/night cycle: sky dome shader (gradient, sun, moon, stars), lights, fog and soft clouds.
import * as THREE from 'three';

const DAY_LENGTH = 600; // seconds for a full day

const PALETTE = {
  dayTop: new THREE.Color(0x2f7fe8), dayHorizon: new THREE.Color(0xbfe4ff),
  duskTop: new THREE.Color(0x3b3a8f), duskHorizon: new THREE.Color(0xff9a5a),
  nightTop: new THREE.Color(0x050818), nightHorizon: new THREE.Color(0x1a2450),
};

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uSunDir;
uniform float uNight, uTime;
float hash(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  float k = pow(max(h, 0.0), 0.55);
  vec3 col = mix(uHorizon, uTop, k);
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.6, clamp(-d.y * 3.0, 0.0, 1.0));

  // sun disc + glow
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 sunCol = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.6, 0.3), 1.0 - smoothstep(0.0, 0.35, uSunDir.y));
  col += sunCol * pow(sd, 900.0) * 14.0;
  col += sunCol * pow(sd, 24.0) * 0.35 * (1.0 - uNight);
  // moon opposite the sun
  float md = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9993, 0.9996, md) * 4.0 * uNight;
  col += vec3(0.4, 0.5, 0.9) * pow(md, 40.0) * 0.12 * uNight;

  // stars
  if (uNight > 0.01 && d.y > -0.05) {
    vec3 sp = floor(d * 220.0);
    float s = hash(sp);
    float star = step(0.9965, s) * (0.5 + 0.5 * sin(uTime * 2.0 + s * 60.0));
    col += vec3(star) * 3.0 * uNight * smoothstep(0.0, 0.15, d.y);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.time = 0.1; // 0 sunrise, .25 noon, .5 sunset, .75 midnight
    this.paused = false;

    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uTime: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
        side: THREE.BackSide, depthWrite: false, fog: false,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b5a45, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -48; cam.right = 48; cam.top = 48; cam.bottom = -48; cam.near = 1; cam.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog(0xbfe4ff, 60, 120);
    this.sunDir = new THREE.Vector3();
    this.buildClouds();
    this._tmp = new THREE.Color();
  }

  buildClouds() {
    const geo = new THREE.SphereGeometry(0.5, 14, 9);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, fog: false });
    const N = 220;
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, N);
    this.clouds.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.cloudData = [];
    let i = 0;
    while (i < N) {
      const cx = (Math.random() - 0.5) * 900, cz = (Math.random() - 0.5) * 900, cy = 150 + Math.random() * 25;
      const parts = 3 + Math.floor(Math.random() * 4);
      for (let k = 0; k < parts && i < N; k++, i++) {
        const w = 12 + Math.random() * 18, d = 9 + Math.random() * 13, h = 5 + Math.random() * 4;
        this.cloudData.push({ x: cx + (Math.random() - 0.5) * 22, y: cy + (Math.random() - 0.5) * 2, z: cz + (Math.random() - 0.5) * 16, w, h, d });
      }
    }
    this.cloudBuf = { m, q, s, p };
    this.scene.add(this.clouds);
  }

  updateClouds(t, center) {
    const { m, q, s, p } = this.cloudBuf;
    const W = 900;
    for (let i = 0; i < this.cloudData.length; i++) {
      const c = this.cloudData[i];
      let x = c.x + t * 2.2;
      // wrap around the player so clouds always surround them
      x = ((x - center.x + W / 2) % W + W) % W - W / 2 + center.x;
      const z = ((c.z - center.z + W / 2) % W + W) % W - W / 2 + center.z;
      p.set(x, c.y, z); s.set(c.w, c.h, c.d);
      m.compose(p, q, s);
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  // returns daylight 0..1
  update(dt, center) {
    if (!this.paused) this.time = (this.time + dt / DAY_LENGTH) % 1;
    const a = this.time * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.28).normalize();
    const y = this.sunDir.y;
    const day = THREE.MathUtils.smoothstep(y, -0.08, 0.3);
    const dusk = 1 - Math.min(1, Math.abs(y) / 0.35); // strongest at the horizon
    const night = 1 - THREE.MathUtils.smoothstep(y, -0.2, 0.05);

    const top = this.uniforms.uTop.value, hor = this.uniforms.uHorizon.value;
    top.copy(PALETTE.nightTop).lerp(PALETTE.dayTop, day).lerp(PALETTE.duskTop, dusk * 0.55 * (1 - night * 0.7));
    hor.copy(PALETTE.nightHorizon).lerp(PALETTE.dayHorizon, day).lerp(PALETTE.duskHorizon, dusk * 0.85 * (1 - night * 0.6));
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uNight.value = night;
    this.uniforms.uTime.value += dt;
    this.dome.position.copy(center);

    // lights: sun by day, cool moonlight by night
    const moon = y < -0.02;
    const lightDir = moon ? this.sunDir.clone().multiplyScalar(-1) : this.sunDir;
    this.sun.position.copy(center).addScaledVector(lightDir, 140);
    this.sun.target.position.copy(center);
    // snap shadow camera to texel grid so shadows don't shimmer
    const step = 96 / 2048;
    this.sun.position.x = Math.round(this.sun.position.x / step) * step;
    this.sun.position.z = Math.round(this.sun.position.z / step) * step;
    this.sun.target.position.x = this.sun.position.x - lightDir.x * 140;
    this.sun.target.position.z = this.sun.position.z - lightDir.z * 140;
    this.sun.target.position.y = center.y;
    this.sun.target.updateMatrixWorld();
    const sunWarm = new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xff9150), dusk * 0.8);
    this.sun.color.copy(moon ? new THREE.Color(0x7f9bff) : sunWarm);
    this.sun.intensity = moon ? 0.55 * (1 - day) : 2.3 * Math.min(1, Math.max(0.15, y * 3));
    this.hemi.intensity = 0.25 + day * 0.6;
    this.hemi.color.copy(hor).lerp(new THREE.Color(0xdfeeff), 0.4);
    this.hemi.groundColor.set(0x5a4a3a).lerp(new THREE.Color(0x15151f), night);

    // fog matches the horizon so far terrain melts into the sky
    this.scene.fog.color.copy(hor);
    this.cloudMat.color.copy(this._tmp.set(0xffffff).lerp(hor, 0.25 * (1 - day)).multiplyScalar(0.15 + 0.85 * day));
    this.cloudMat.emissive.copy(this.cloudMat.color).multiplyScalar(0.55);
    this.updateClouds(performance.now() / 1000, center);
    return day;
  }

  clockString() {
    const hours = ((this.time * 24 + 6) % 24);
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
