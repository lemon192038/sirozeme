import * as THREE from 'three';

export const WORLD_SIZE = 240;
export const WATER_LEVEL = 0;

function hash(ix, iz, seed) {
  let h = ix * 374761393 + iz * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, z * f, seed + i * 17) * amp; amp *= 0.5; f *= 2; }
  return s;
}

export class Terrain {
  constructor(seed = 1234) {
    this.seed = seed;
    this.group = new THREE.Group();
    this.build();
  }

  /** 高さ関数（カメラ・将来の建築判定でも使用）。中心は城用に平坦化。 */
  heightAt(x, z) {
    const n = fbm(x * 0.02, z * 0.02, this.seed);
    const m = Math.pow(fbm(x * 0.012 + 50, z * 0.012 + 50, this.seed + 9), 2.2);
    let h = (n - 0.42) * 26 + m * 60;
    const d = Math.hypot(x, z), flat = 1 - THREE.MathUtils.smoothstep(d, 18, 42);
    h = h * (1 - flat) + 2.2 * flat;
    const edge = THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), WORLD_SIZE * 0.4, WORLD_SIZE * 0.5);
    return h * (1 - edge) - 6 * edge;
  }

  biomeAt(x, z, h) {
    const slope = Math.abs(this.heightAt(x + 1.5, z) - h) + Math.abs(this.heightAt(x, z + 1.5) - h);
    if (h < WATER_LEVEL + 0.2) return 'water';
    if (h < WATER_LEVEL + 0.9) return 'sand';
    if (h > 24) return 'peak';
    if (slope > 2.6 || h > 15) return 'rock';
    return fbm(x * 0.05 + 9, z * 0.05 - 4, this.seed + 3) > 0.55 ? 'forest' : 'grass';
  }

  build() {
    const seg = 200, geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const palette = {
      water: 0x2f6f8f, sand: 0xd8c48a, grass: 0x6fa04a, forest: 0x4d8a3a, rock: 0x7d7a74, peak: 0xf0f0f4
    };
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = this.heightAt(x, z);
      pos.setY(i, h);
      c.setHex(palette[this.biomeAt(x, z, h)]);
      const j = 0.94 + hash(Math.round(x * 3), Math.round(z * 3), 7) * 0.12; // 色ムラ
      col.set([c.r * j, c.g * j, c.b * j], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    land.receiveShadow = true;
    this.land = land;
    this.group.add(land);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 1.6, WORLD_SIZE * 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3b86ad, transparent: true, opacity: 0.8, roughness: 0.25, metalness: 0.1 })
    );
    water.position.y = WATER_LEVEL;
    this.group.add(water);

    this.scatter();
    this.buildCastle();
  }

  /** 樹木・岩を InstancedMesh で描画（パフォーマンス要件） */
  scatter() {
    const trees = [], rocks = [];
    let s = 99;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9000 && trees.length < 2500; i++) {
      const x = (rnd() - 0.5) * WORLD_SIZE * 0.9, z = (rnd() - 0.5) * WORLD_SIZE * 0.9;
      if (Math.hypot(x, z) < 30) continue;
      const h = this.heightAt(x, z), b = this.biomeAt(x, z, h);
      if (b === 'forest' || (b === 'grass' && rnd() < 0.04)) trees.push([x, h, z, 0.8 + rnd() * 0.8]);
      else if ((b === 'rock' || b === 'peak') && rnd() < 0.15) rocks.push([x, h, z, 0.6 + rnd() * 1.6]);
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), trees.length);
    const leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x2f6e35, flatShading: true }), trees.length);
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a8780, flatShading: true }), rocks.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    trees.forEach(([x, h, z, k], i) => {
      m.compose(p.set(x, h + 0.5 * k, z), q.identity(), sc.set(k, k, k)); trunk.setMatrixAt(i, m);
      m.compose(p.set(x, h + 1.9 * k, z), q.identity(), sc.set(k, k, k)); leaf.setMatrixAt(i, m);
    });
    rocks.forEach(([x, h, z, k], i) => {
      q.setFromEuler(e.set(rnd() * 3, rnd() * 3, 0));
      m.compose(p.set(x, h + 0.3 * k, z), q, sc.set(k, k * 0.7, k)); rock.setMatrixAt(i, m);
    });
    for (const o of [trunk, leaf, rock]) { o.castShadow = true; o.frustumCulled = false; this.group.add(o); }
    this.counts = { trees: trees.length, rocks: rocks.length };
  }

  /** プレースホルダーの城（STAGE 3 で旗占領・防衛システムに置換予定） */
  buildCastle() {
    const g = new THREE.Group(), h = this.heightAt(0, 0);
    const stone = new THREE.MeshStandardMaterial({ color: 0xb8b2a5, flatShading: true });
    const box = (w, hh, d, x, y, z, mat = stone) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
      mesh.position.set(x, y + hh / 2, z); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
    };
    const R = 12;
    box(R * 2, 3, 1, 0, 0, -R); box(R * 2, 3, 1, 0, 0, R); box(1, 3, R * 2, -R, 0, 0); box(1, 3, R * 2, R, 0, 0);
    for (const [x, z] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 6, 10), stone); t.position.set(x, 3, z); t.castShadow = true; g.add(t);
      const r = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.5, 10), new THREE.MeshStandardMaterial({ color: 0x9c3b32 })); r.position.set(x, 7.2, z); r.castShadow = true; g.add(r);
    }
    box(6, 6, 6, 0, 0, -5); // 城主の館
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), new THREE.MeshStandardMaterial({ color: 0x5a4028 }));
    pole.position.set(0, 8, -5); g.add(pole);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2, 8, 1), new THREE.MeshStandardMaterial({ color: 0x2b6fd6, side: THREE.DoubleSide }));
    this.flag.position.set(1, 9.4, -5); g.add(this.flag);
    g.position.y = h;
    this.group.add(g);
  }

  update(t) { // 旗のはためき
    if (!this.flag) return;
    const p = this.flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(t * 4 + p.getX(i) * 3) * 0.12 * (p.getX(i) + 1));
    p.needsUpdate = true;
  }
}
