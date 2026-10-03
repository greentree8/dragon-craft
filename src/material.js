// PBR material for terrain/blocks with world-space triplanar grain, so surfaces don't look like flat colour.
import * as THREE from 'three';

let noiseTex = null;

// Tileable value noise: R = fine grain, G = medium blotches, B = large patches.
function getNoise() {
  if (noiseTex) return noiseTex;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const layer = (cells) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const out = new Float32Array(N * N);
    const s = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells, fy = (y / N) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = s(fx - x0), ty = s(fy - y0);
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      out[y * N + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
    return out;
  };
  const fine = [layer(64), layer(32)], mid = [layer(16), layer(8)], big = [layer(4), layer(2)];
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = 255 * (fine[0][i] * 0.6 + fine[1][i] * 0.4);
    data[i * 4 + 1] = 255 * (mid[0][i] * 0.6 + mid[1][i] * 0.4);
    data[i * 4 + 2] = 255 * (big[0][i] * 0.6 + big[1][i] * 0.4);
    data[i * 4 + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.anisotropy = 4;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

export function makeTerrainMaterial({ roughness = 0.95, detail = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: getNoise() };
    shader.uniforms.uDetail = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNor = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNor;
        uniform sampler2D uNoise;
        uniform float uDetail;
        vec3 triNoise(float scale, vec3 w) {
          vec3 p = vWPos * scale;
          return texture2D(uNoise, p.zy).rgb * w.x + texture2D(uNoise, p.xz).rgb * w.y + texture2D(uNoise, p.xy).rgb * w.z;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 w = pow(abs(normalize(vWNor)), vec3(4.0));
          w /= (w.x + w.y + w.z);
          float fine = triNoise(0.9, w).r;
          float mid = triNoise(0.21, w).g;
          float big = triNoise(0.045, w).b;
          float t = (fine - 0.5) * 0.34 + (mid - 0.5) * 0.5 + (big - 0.5) * 0.45;
          diffuseColor.rgb *= 1.0 + t * uDetail;
        }`);
  };
  return mat;
}
