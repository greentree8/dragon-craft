// Shared voxel collision helpers (axis-separated AABB movement).
import { isSolid } from './blocks.js';

export function boxCollides(world, x, y, z, hx, hy, hz) {
  const x0 = Math.floor(x - hx), x1 = Math.floor(x + hx - 1e-6);
  const y0 = Math.floor(y - hy), y1 = Math.floor(y + hy - 1e-6);
  const z0 = Math.floor(z - hz), z1 = Math.floor(z + hz - 1e-6);
  for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
    if (isSolid(world.getBlock(bx, by, bz))) return true;
  }
  return false;
}

// Moves `pos` (box centre) by vel*dt, zeroing velocity on contact. Returns which axes were blocked.
export function moveBox(world, pos, vel, hx, hy, hz, dt) {
  const hit = { x: false, y: false, z: false, ground: false };
  const axes = [['x', 0], ['z', 2], ['y', 1]];
  for (const [name] of axes) {
    const d = vel[name] * dt;
    if (d === 0) continue;
    const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.4));
    const sd = d / steps;
    for (let i = 0; i < steps; i++) {
      const nx = name === 'x' ? pos.x + sd : pos.x;
      const ny = name === 'y' ? pos.y + sd : pos.y;
      const nz = name === 'z' ? pos.z + sd : pos.z;
      if (boxCollides(world, nx, ny, nz, hx, hy, hz)) {
        hit[name] = true;
        if (name === 'y' && vel.y < 0) hit.ground = true;
        vel[name] = 0;
        break;
      }
      pos[name] += sd;
    }
  }
  return hit;
}
