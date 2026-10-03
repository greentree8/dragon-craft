// Shared rounded geometry for the dragon and animals.
import * as THREE from 'three';

// A rounded body part: a superellipsoid with the given size (e = 1 is an ellipsoid, lower is boxier),
// with analytic smooth normals so it shades like a soft, organic shape.
export function softGeometry(w, h, d, e) {
  const big = Math.max(w, h, d) > 0.45;
  const ws = big ? 28 : 16, hs = big ? 18 : 10;
  const g = new THREE.SphereGeometry(0.5, ws, hs);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const sgn = Math.sign, pw = (v, k) => sgn(v) * Math.pow(Math.abs(v), k);
  const sz = [w, h, d];
  for (let i = 0; i < pos.count; i++) {
    const dir = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v * 2);
    const p = dir.map((v, k) => pw(v, e) * sz[k] * 0.5);
    const n = dir.map((v, k) => pw(v, 2 - e) / (sz[k] * 0.5));
    const len = Math.hypot(...n) || 1;
    pos.setXYZ(i, p[0], p[1], p[2]);
    nor.setXYZ(i, n[0] / len, n[1] / len, n[2] / len);
  }
  return g;
}

