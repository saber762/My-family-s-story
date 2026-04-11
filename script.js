import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import GUI from "lil-gui";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";

gsap.registerPlugin(ScrollTrigger);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080808);

const scrollGroup = new THREE.Group();
scene.add(scrollGroup);

const torusGroup = new THREE.Group();
scrollGroup.add(torusGroup);

// Camera
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 7;

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector(".webgl"), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.7, 0.4, 0.65,
);
composer.addPass(bloomPass);

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.uniforms["resolution"].value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(fxaaPass);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const dirLight = new THREE.DirectionalLight(0xfff4e0, 2.8);
dirLight.position.set(3, 4, 5);
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0xaabbff, 0.5);
fillLight.position.set(-4, -2, -3);
scene.add(fillLight);

// Textures
const textureLoader = new THREE.TextureLoader();
const diffuse = textureLoader.load("https://raw.githubusercontent.com/danielyl123/person/refs/heads/main/diffuse.jpg");
const normalTex = textureLoader.load("https://raw.githubusercontent.com/danielyl123/person/refs/heads/main/normal.jpg");
const arm = textureLoader.load("https://raw.githubusercontent.com/danielyl123/person/refs/heads/main/arm.jpg");

[diffuse, normalTex, arm].forEach((tex) => {
  tex.repeat.set(2, 2);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
});
diffuse.colorSpace = THREE.SRGBColorSpace;

// Wireframe inner torus (barycentric shader)
function addBarycentricCoords(geo) {
  const g = geo.toNonIndexed();
  const count = g.attributes.position.count;
  const bary = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 3) {
    bary[i * 3] = 1; bary[i * 3 + 1] = 0; bary[i * 3 + 2] = 0;
    bary[(i + 1) * 3] = 0; bary[(i + 1) * 3 + 1] = 1; bary[(i + 1) * 3 + 2] = 0;
    bary[(i + 2) * 3] = 0; bary[(i + 2) * 3 + 1] = 0; bary[(i + 2) * 3 + 2] = 1;
  }
  g.setAttribute("barycentric", new THREE.BufferAttribute(bary, 3));
  return g;
}

const wireMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    attribute vec3 barycentric;
    varying vec3 vBary;
    void main() {
      vBary = barycentric;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vBary;
    float wireMask(vec3 b, float t) {
      vec3 d = fwidth(b);
      vec3 a = smoothstep(vec3(0.0), d * t, b);
      return 1.0 - min(a.x, min(a.y, a.z));
    }
    void main() {
      float wf = wireMask(vBary, 1.6);
      vec3 col = mix(vec3(0.07, 0.01, 0.0), vec3(1.0, 0.28, 0.04), wf);
      col = mix(col, vec3(1.0, 0.8, 0.3) * 2.2, wf * 0.55);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.DoubleSide,
  extensions: { derivatives: true },
});
torusGroup.add(new THREE.Mesh(
  addBarycentricCoords(new THREE.TorusGeometry(2, 0.4, 80, 80)),
  wireMaterial,
));

// Voronoi fragment meshes
const FRAG_SCALE = 50;
const TORUS_R = 2, TORUS_r = 0.4;

function hash2(px, py) {
  const a = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
  const b = Math.sin(px * 269.5 + py * 183.3) * 43758.5453;
  return [a - Math.floor(a), b - Math.floor(b)];
}

function cellSeed(u, v) {
  const n = [Math.floor(u * FRAG_SCALE), Math.floor(v * FRAG_SCALE)];
  const f = [u * FRAG_SCALE - n[0], v * FRAG_SCALE - n[1]];
  let md = Infinity, best = [...n];
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const o = hash2(n[0] + i, n[1] + j);
      const r = [i + o[0] - f[0], j + o[1] - f[1]];
      const d = r[0] * r[0] + r[1] * r[1];
      if (d < md) { md = d; best = [n[0] + i + o[0], n[1] + j + o[1]]; }
    }
  }
  return [best[0] / FRAG_SCALE, best[1] / FRAG_SCALE];
}

const fragments = (() => {
  const baseGeo = new THREE.TorusGeometry(TORUS_R, TORUS_r, 100, 100);
  const nonIndexed = baseGeo.toNonIndexed();
  baseGeo.dispose();
  const pos = nonIndexed.attributes.position.array;
  const nrm = nonIndexed.attributes.normal.array;
  const uvData = nonIndexed.attributes.uv.array;
  const tris = pos.length / 9;

  const cellMap = new Map();
  for (let t = 0; t < tris; t++) {
    const uc = (uvData[t * 6] + uvData[t * 6 + 2] + uvData[t * 6 + 4]) / 3;
    const vc = (uvData[t * 6 + 1] + uvData[t * 6 + 3] + uvData[t * 6 + 5]) / 3;
    const s = cellSeed(uc, vc);
    const k = `${s[0].toFixed(9)}_${s[1].toFixed(9)}`;
    if (!cellMap.has(k)) cellMap.set(k, { s, t: [] });
    cellMap.get(k).t.push(t);
  }

  const mat = new THREE.MeshStandardMaterial({
    map: diffuse, normalMap: normalTex, roughnessMap: arm,
    roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
  });

  const list = [];
  const TWO_PI = Math.PI * 2;

  for (const { s: seed, t: triList } of cellMap.values()) {
    if (!triList.length) continue;
    const vc = triList.length * 3;
    const pArr = new Float32Array(vc * 3), nArr = new Float32Array(vc * 3), uvArr = new Float32Array(vc * 2);
    let vi = 0;
    for (const tri of triList) {
      for (let v = 0; v < 3; v++) {
        const sv = tri * 3 + v;
        pArr[vi * 3] = pos[sv * 3]; pArr[vi * 3 + 1] = pos[sv * 3 + 1]; pArr[vi * 3 + 2] = pos[sv * 3 + 2];
        nArr[vi * 3] = nrm[sv * 3]; nArr[vi * 3 + 1] = nrm[sv * 3 + 1]; nArr[vi * 3 + 2] = nrm[sv * 3 + 2];
        uvArr[vi * 2] = uvData[sv * 2]; uvArr[vi * 2 + 1] = uvData[sv * 2 + 1];
        vi++;
      }
    }

    const phi = seed[0] * TWO_PI, theta = seed[1] * TWO_PI;
    const cx = (TORUS_R + TORUS_r * Math.cos(theta)) * Math.cos(phi);
    const cy = (TORUS_R + TORUS_r * Math.cos(theta)) * Math.sin(phi);
    const cz = TORUS_r * Math.sin(theta);
    const cellCenter = new THREE.Vector3(cx, cy, cz);
    const majorPt = new THREE.Vector3(TORUS_R * Math.cos(phi), TORUS_R * Math.sin(phi), 0);
    const cellNormal = cellCenter.clone().sub(majorPt).normalize();

    const SHRINK = 0.96;
    for (let i = 0; i < pArr.length; i += 3) {
      pArr[i] = (pArr[i] - cx) * SHRINK;
      pArr[i + 1] = (pArr[i + 1] - cy) * SHRINK;
      pArr[i + 2] = (pArr[i + 2] - cz) * SHRINK;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pArr, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nArr, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));

    const rnd = hash2(seed[0] * 137.53, seed[1] * 137.53);
    const up = Math.abs(cellNormal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const tang = new THREE.Vector3().crossVectors(cellNormal, up).normalize();
    const bitang = new THREE.Vector3().crossVectors(cellNormal, tang);
    const aa = rnd[0] * TWO_PI;
    const rotAxis = tang.clone().multiplyScalar(Math.cos(aa)).addScaledVector(bitang, Math.sin(aa)).normalize();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(cellCenter).addScaledVector(cellNormal, 0.015);
    mesh.userData = { cellCenter, cellNormal, rotAxis, maxAngle: 0.7 + rnd[1] * 0.9, lift: 0 };
    torusGroup.add(mesh);
    list.push(mesh);
  }

  nonIndexed.dispose();
  return list;
})();

// Invisible raycaster mesh
const rcMesh = new THREE.Mesh(
  new THREE.TorusGeometry(TORUS_R, TORUS_r, 80, 80),
  new THREE.MeshBasicMaterial({ visible: false }),
);
torusGroup.add(rcMesh);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-999, -999);
window.addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// GUI
const gui = new GUI({ title: "Digital Donut" });

const bloomFolder = gui.addFolder("Bloom");
bloomFolder.add(bloomPass, "strength", 0, 3, 0.01);
bloomFolder.add(bloomPass, "radius", 0, 1, 0.01);
bloomFolder.add(bloomPass, "threshold", 0, 1, 0.01);

const lightsFolder = gui.addFolder("Lights");
lightsFolder.add(scene.children.find(c => c.isAmbientLight), "intensity", 0, 2, 0.01).name("ambient");
lightsFolder.add(dirLight, "intensity", 0, 6, 0.1).name("key light");
lightsFolder.add(fillLight, "intensity", 0, 3, 0.1).name("fill light");

const fragParams = { hoverRadius: 0.75, liftDist: 0.28, liftSpeedUp: 0.15, liftSpeedDown: 0.06 };
const fragFolder = gui.addFolder("Fragments");
fragFolder.add(fragParams, "hoverRadius", 0.2, 1.5, 0.01).name("hover radius");
fragFolder.add(fragParams, "liftDist", 0, 1, 0.01).name("lift distance");
fragFolder.add(fragParams, "liftSpeedUp", 0.01, 0.5, 0.01).name("speed up");
fragFolder.add(fragParams, "liftSpeedDown", 0.01, 0.3, 0.01).name("speed down");

gui.addFolder("Renderer").add(renderer, "toneMappingExposure", 0, 3, 0.01).name("exposure");
gui.close();

// Tick
const clock = new THREE.Clock();
let lastTime = 0;
const hover = { point: new THREE.Vector3(), active: 0 };
const _localHover = new THREE.Vector3();

function smoothstep(min, max, v) {
  const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

const tick = () => {
  const elapsed = clock.getElapsedTime();
  const delta = elapsed - lastTime;
  lastTime = elapsed;

  controls.update();

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(rcMesh);
  if (hits.length > 0) {
    torusGroup.worldToLocal(_localHover.copy(hits[0].point));
    hover.point.copy(_localHover);
    hover.active = Math.min(hover.active + delta * 5, 1);
  } else {
    hover.active = Math.max(hover.active - delta * 2.5, 0);
  }

  for (const frag of fragments) {
    const { cellCenter, cellNormal, rotAxis, maxAngle } = frag.userData;
    let target = 0;
    if (hover.active > 0.01) {
      const dist = cellCenter.distanceTo(hover.point);
      target = (1 - smoothstep(0.4, fragParams.hoverRadius, dist)) * hover.active;
    }
    const speed = target > frag.userData.lift ? fragParams.liftSpeedUp : fragParams.liftSpeedDown;
    frag.userData.lift = THREE.MathUtils.lerp(frag.userData.lift, target, speed);
    const lift = frag.userData.lift;
    frag.position.copy(cellCenter).addScaledVector(cellNormal, 0.015 + lift * fragParams.liftDist);
    frag.quaternion.setFromAxisAngle(rotAxis, lift * maxAngle);
  }

  composer.render();
  requestAnimationFrame(tick);
};
tick();

// GSAP scroll animations
gsap.set(scrollGroup.position, { x: 0, y: 0, z: 0 });
gsap.set(scrollGroup.rotation, { x: 0.15, y: 0, z: 0 });
gsap.from(scrollGroup.rotation, { y: Math.PI, duration: 2.4, ease: "power3.out" });
gsap.from(scrollGroup.position, { y: -2, duration: 2.4, ease: "power3.out" });

const idleTween = gsap.to(torusGroup.rotation, {
  y: Math.PI * 2, duration: 22, ease: "none", repeat: -1, paused: true,
});
gsap.delayedCall(2.5, () => idleTween.play());

const scrollTl = gsap.timeline({
  scrollTrigger: {
    trigger: "body",
    start: "top top",
    end: "bottom bottom",
    scrub: 4.0,
    onUpdate: self => {
      if (self.progress > 0.02) idleTween.pause();
      else idleTween.resume();
    },
  },
});

scrollTl
  .to(scrollGroup.position, { x: -2.3, y: 0, z: 0, duration: 1, ease: "power1.inOut" }, 0)
  .to(scrollGroup.rotation, { x: Math.PI * 0.5, y: -Math.PI * 0.6, z: Math.PI * 0.25, duration: 1, ease: "power1.inOut" }, 0)
  .to(scrollGroup.position, { x: 2.3, y: 0, z: 0, duration: 1, ease: "power1.inOut" }, 1)
  .to(scrollGroup.rotation, { x: -Math.PI * 0.5, y: Math.PI * 0.6, z: -Math.PI * 0.25, duration: 1, ease: "power1.inOut" }, 1);

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  fxaaPass.uniforms["resolution"].value.set(1 / window.innerWidth, 1 / window.innerHeight);
});
