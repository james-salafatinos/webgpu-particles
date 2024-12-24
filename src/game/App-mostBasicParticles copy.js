import * as THREE from "/modules/three.webgpu.js";
import {
  float,
  If,
  PI,
  color,
  cos,
  instanceIndex,
  Loop,
  mix,
  mod,
  sin,
  instancedArray,
  Fn,
  uint,
  uniform,
  uniformArray,
  hash,
  vec3,
  vec4,
} from "/modules/three.tsl.js";

import { GUI } from "/modules/lil-gui.module.min.js";
import { OrbitControls } from "/modules/OrbitControls.js";

import { AxesHelper } from "/components/AxesHelper.webgpu.js";
import { GridHelper } from "/components/GridHelper.webgpu.js";

let camera, scene, renderer, controls, createCompute, updateCompute;

create();

function create() {
  camera = new THREE.PerspectiveCamera(
    25,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(3, 5, 8);

  scene = new THREE.Scene();

  // ambient light

  const ambientLight = new THREE.AmbientLight("#ffffff", 0.5);
  scene.add(ambientLight);

  // directional light

  const directionalLight = new THREE.DirectionalLight("#ffffff", 1.5);
  directionalLight.position.set(4, 2, 0);
  scene.add(directionalLight);

  // renderer

  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(update);
  renderer.setClearColor("#000000");
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;

  window.addEventListener("resize", onWindowResize);

  // CREATE AXES & GRID
  const axesHelper = new AxesHelper(scene);
  const gridHelper = new GridHelper(scene);

  const gui = new GUI();

  const count = Math.pow(2, 5);
  const timeScale = uniform(1);
  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const positionBuffer = instancedArray(count, "vec3");
  const velocityBuffer = instancedArray(count, "vec3");

  const sphericalToVec3 = Fn(([phi, theta]) => {
    const sinPhiRadius = sin(phi);

    return vec3(
      sinPhiRadius.mul(sin(theta)),
      cos(phi),
      sinPhiRadius.mul(cos(theta))
    );
  });

  console.log("###1.", positionBuffer);

  const create_WebGPU = Fn(() => {
    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);

    const basePosition = vec3(
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
    )
      .sub(0.5)
      .mul(vec3(5, 0.2, 5));
    position.assign(basePosition);

    const phi = hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
      .mul(PI)
      .mul(2);
    const theta = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).mul(
      PI
    );
    const baseVelocity = sphericalToVec3(phi, theta).mul(0.05);
    velocity.assign(baseVelocity);
  });

  createCompute = create_WebGPU().compute(count);
  console.log("###2.", createCompute);

  const reset = () => {
    renderer.computeAsync(createCompute);
  };

  reset();

  const update_WebGPU = Fn(() => {
    const delta = float(1 / 60)
      .mul(timeScale)
      .toVar(); // uses fixed delta to consistant result
    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);

    // force

    const force = vec3(0).toVar();

    //Euler integration

    velocity.addAssign(force.mul(delta));

    // position

    position.addAssign(velocity.mul(delta));
  });
  updateCompute = update_WebGPU().compute(count);

  // nodes

  material.positionNode = positionBuffer.toAttribute();

  material.colorNode = vec3(0, 1, 0);

  // mesh

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  scene.add(mesh);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function update() {
  controls.update();

  renderer.compute(updateCompute);
  renderer.render(scene, camera);
}
