import * as THREE from 'three';

/** アイソメ風の俯瞰カメラ。パン・ズーム・回転（マウス/タッチ/キーボード） */
export class CameraController {
  constructor(dom, terrain) {
    this.dom = dom; this.terrain = terrain;
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 1200);
    this.target = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI / 4; this.pitch = THREE.MathUtils.degToRad(52); this.dist = 90;
    this.minDist = 18; this.maxDist = 260;
    this.keys = new Set(); this.ptrs = new Map(); this.last = null;
    this.bind();
    this.apply();
  }
  bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', e => e.preventDefault());
    d.addEventListener('pointerdown', e => { d.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, e); this.snap(); this.moved = 0; });
    d.addEventListener('pointermove', e => this.onMove(e));
    const up = e => { this.ptrs.delete(e.pointerId); this.snap(); };
    d.addEventListener('pointerup', e => { if (this.moved < 5 && this.onTap) this.onTap(e); up(e); });
    d.addEventListener('pointercancel', up);
    d.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    addEventListener('keydown', e => this.keys.add(e.key.toLowerCase()));
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
  }
  snap() { // 2点間の状態を記録
    const p = [...this.ptrs.values()];
    this.last = p.length === 2 ? { dist: Math.hypot(p[0].clientX - p[1].clientX, p[0].clientY - p[1].clientY), ang: Math.atan2(p[1].clientY - p[0].clientY, p[1].clientX - p[0].clientX) } : null;
  }
  onMove(e) {
    const prev = this.ptrs.get(e.pointerId); if (!prev) return;
    const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.ptrs.set(e.pointerId, e);
    if (this.ptrs.size === 1) {
      if (e.buttons & 2 || e.shiftKey) { this.yaw -= dx * 0.006; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.6, 1.25); }
      else this.pan(-dx, -dy);
    } else if (this.ptrs.size === 2 && this.last) {
      const p = [...this.ptrs.values()];
      const dist = Math.hypot(p[0].clientX - p[1].clientX, p[0].clientY - p[1].clientY);
      const ang = Math.atan2(p[1].clientY - p[0].clientY, p[1].clientX - p[0].clientX);
      this.zoom(this.last.dist / Math.max(dist, 1));
      this.yaw -= ang - this.last.ang;
      this.last = { dist, ang };
    }
  }
  pan(dx, dy) {
    const s = this.dist * 0.0017, sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.target.x += (dx * cos + dy * sin) * s * -1 * -1;
    this.target.z += (-dx * sin + dy * cos) * s;
    const lim = 110; this.target.x = THREE.MathUtils.clamp(this.target.x, -lim, lim); this.target.z = THREE.MathUtils.clamp(this.target.z, -lim, lim);
  }
  zoom(f) { this.dist = THREE.MathUtils.clamp(this.dist * f, this.minDist, this.maxDist); }
  rotate(a) { this.yaw += a; }
  update(dt) {
    const sp = this.dist * dt * 0.9;
    if (this.keys.has('w')) this.pan(0, -sp / (this.dist * 0.0017));
    if (this.keys.has('s')) this.pan(0, sp / (this.dist * 0.0017));
    if (this.keys.has('a')) this.pan(-sp / (this.dist * 0.0017), 0);
    if (this.keys.has('d')) this.pan(sp / (this.dist * 0.0017), 0);
    if (this.keys.has('q')) this.yaw += dt * 1.5;
    if (this.keys.has('e')) this.yaw -= dt * 1.5;
    this.apply();
  }
  apply() {
    this.target.y = Math.max(this.terrain.heightAt(this.target.x, this.target.z), 0);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(this.target);
  }
}
