import * as THREE from 'three';
import { Terrain } from '../world/Terrain.js';
import { CameraController } from './Camera.js';
import { TimeManager } from './TimeManager.js';
import { UIManager } from '../ui/UIManager.js';

export const QUALITY = {
  low:   { pixelRatio: 1,   shadows: false, shadowSize: 512 },
  mid:   { pixelRatio: 1.25, shadows: true, shadowSize: 1024 },
  high:  { pixelRatio: 1.75, shadows: true, shadowSize: 2048 },
  ultra: { pixelRatio: 2.5, shadows: true, shadowSize: 4096 }
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1400);
    this.settings = Object.assign({ quality: mobile ? 'mid' : 'high', fps: 0 }, JSON.parse(this.load('koc_settings') || '{}'));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.settings.quality !== 'low' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9cc4e4, 180, 520);
    this.terrain = new Terrain();
    this.scene.add(this.terrain.group);
    this.cam = new CameraController(canvas, this.terrain);
    this.time = new TimeManager();
    this.setupLights();
    this.raycaster = new THREE.Raycaster();
    this.cam.onTap = e => this.pick(e);
    this.ui = new UIManager(this);
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock(); this.acc = 0;
  }
  load(k) { try { return localStorage.getItem(k); } catch { return null; } }
  saveSettings() { try { localStorage.setItem('koc_settings', JSON.stringify(this.settings)); } catch {} }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a5a3a, 0.7);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
    this.sun.castShadow = true;
    const s = this.sun.shadow.camera; s.left = s.bottom = -90; s.right = s.top = 90; s.near = 1; s.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }
  applyQuality() {
    const q = QUALITY[this.settings.quality];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.cam.camera.aspect = innerWidth / innerHeight;
    this.cam.camera.updateProjectionMatrix();
  }
  pick(e) {
    this.raycaster.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.cam.camera);
    const hit = this.raycaster.intersectObject(this.terrain.land)[0];
    if (!hit) return;
    const { x, y, z } = hit.point, b = this.terrain.biomeAt(x, z, y);
    const names = { water: '水域（建築不可）', sand: '砂地', grass: '草原', forest: '森林', rock: '岩場', peak: '山岳' };
    this.ui.setInfo(`${names[b]}｜座標 (${x.toFixed(0)}, ${z.toFixed(0)})｜標高 ${y.toFixed(1)}`);
  }
  updateDayNight() {
    const h = this.time.hour, a = ((h - 6) / 12) * Math.PI; // 6時に日の出
    const up = Math.sin(a);
    const t = this.cam.target;
    this.sun.position.set(t.x + Math.cos(a) * 120, Math.max(up, 0.08) * 140 + 20, t.z + 60);
    this.sun.target.position.copy(t);
    this.sun.intensity = 0.15 + Math.max(up, 0) * 2.1;
    this.hemi.intensity = 0.25 + Math.max(up, 0) * 0.55;
    const day = new THREE.Color(0x9cc4e4), night = new THREE.Color(0x0b1226), dusk = new THREE.Color(0xe59a6a);
    const sky = night.clone().lerp(day, THREE.MathUtils.clamp(up * 2 + 0.2, 0, 1));
    if (Math.abs(up) < 0.25) sky.lerp(dusk, 0.35 * (1 - Math.abs(up) / 0.25));
    this.scene.background = sky; this.scene.fog.color.copy(sky);
  }
  start() {
    let accRender = 0;
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      accRender += dt;
      const lim = this.settings.fps ? 1 / this.settings.fps : 0;
      if (accRender < lim - 0.002) return;
      const step = accRender; accRender = 0;
      this.time.update(step);
      this.cam.update(step);
      this.terrain.update(this.clock.elapsedTime);
      this.updateDayNight();
      this.ui.update(step);
      this.renderer.render(this.scene, this.cam.camera);
    };
    loop();
  }
}
