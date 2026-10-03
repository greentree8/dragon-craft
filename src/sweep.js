// Organic geometry: a tube swept along a curve with a different elliptical radius at each point
// (good for necks, tails, horns, legs and bones), and a membrane mesh with a gentle sag.
import * as THREE from 'three';

const _up = new THREE.Vector3(0, 1, 0), _alt = new THREE.Vector3(0, 0, 1);

// points: [[x,y,z]...] centreline. radii: [[rx, ry]...] half-width (side) and half-height per point.
// The ends are closed with a rounded dome. `uvScale` stretches the texture along the length.
export function sweep(points, radii, sides = 14, uvScale = 1) {
  const P = points.map((p) => new THREE.Vector3(...p));
  const n = P.length;
  const pos = [], uv = [], idx = [];
  let len = 0;
  const lens = [0];
  for (let i = 1; i < n; i++) { len += P[i].distanceTo(P[i - 1]); lens.push(len); }
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3();
  let prevN = null;
  for (let i = 0; i < n; i++) {
    T.copy(P[Math.min(n - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
    const ref = Math.abs(T.dot(_up)) > 0.95 ? _alt : _up;
    N.copy(ref).addScaledVector(T, -ref.dot(T)).normalize();
    if (prevN && N.dot(prevN) < 0) N.negate();
    prevN = N.clone();
    Bn.crossVectors(T, N).normalize();
    const [rx, ry] = radii[i];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const c = Math.cos(a) * rx, s = Math.sin(a) * ry;
      pos.push(P[i].x + Bn.x * c + N.x * s, P[i].y + Bn.y * c + N.y * s, P[i].z + Bn.z * c + N.z * s);
      uv.push(k / sides * 2, lens[i] * uvScale);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
    idx.push(a, c, b, b, c, d);
  }
  // domed caps
  const cap = (i, dir) => {
    const ti = dir < 0 ? 1 : n - 2;
    T.copy(P[dir < 0 ? 0 : n - 1]).sub(P[ti]).normalize();
    const [rx, ry] = radii[i];
    const apex = P[i].clone().addScaledVector(T, Math.max(rx, ry) * 0.55);
    const ai = pos.length / 3;
    pos.push(apex.x, apex.y, apex.z); uv.push(0, lens[i] * uvScale);
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k, b = i * sides + ((k + 1) % sides);
      if (dir < 0) idx.push(ai, b, a); else idx.push(ai, a, b);
    }
  };
  cap(0, -1);
  cap(n - 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the winding above can come out inside-out depending on the curve direction; make sure normals face outward
  const nor = g.attributes.normal, p = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) c.add(P[i]);
  c.divideScalar(n);
  let out = 0;
  for (let i = 0; i < p.count; i += 7) out += (p.getX(i) - c.x) * nor.getX(i) + (p.getY(i) - c.y) * nor.getY(i) + (p.getZ(i) - c.z) * nor.getZ(i);
  if (out < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// Evenly spaced centreline for a straight-ish chain with a radius profile function of t in [0,1].
export function lineSweep(a, b, radiusAt, count = 8, sides = 14, uvScale = 1) {
  const pts = [], rad = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    rad.push(radiusAt(t));
  }
  return sweep(pts, rad, sides, uvScale);
}

// A wing membrane: the polygon (x, z-back pairs, in the XZ plane) filled radially from its centre so the
// interior can droop a little between the bones.
export function membraneGeometry(poly, sag = 0.09, rings = 4) {
  let cx = 0, cz = 0;
  for (const [x, z] of poly) { cx += x; cz += z; }
  cx /= poly.length; cz /= poly.length;
  // resample the outline so each edge has a few points
  const outline = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const steps = 3;
    for (let s = 0; s < steps; s++) outline.push([a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps]);
  }
  const m = outline.length;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const f = 1 - r / rings; // 1 at the outline, 0 at the centre
    for (let i = 0; i < m; i++) {
      const x = cx + (outline[i][0] - cx) * f, z = cz + (outline[i][1] - cz) * f;
      pos.push(x, -sag * (1 - f) * (1 - f) * 0 - sag * Math.sin((1 - f) * Math.PI * 0.5) * 0.6, z);
      uv.push(x * 0.3, z * 0.3);
    }
  }
  for (let r = 0; r < rings; r++) for (let i = 0; i < m; i++) {
    const a = r * m + i, b = r * m + (i + 1) % m, c = a + m, d = b + m;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
