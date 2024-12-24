import * as THREE from "/modules/three.webgpu.js";
import {
  float,
  If,
  PI,
  color,
  cos,
  instanceIndex,
  Loop,
  sqrt,
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

// Global Variables
let camera, scene, renderer, controls;
let createCompute, updateCompute;

// Buffers
const count = Math.pow(2, 6);
const positionBuffer = instancedArray(count, "vec3");
const velocityBuffer = instancedArray(count, "vec3");
const edgePositionBuffer = instancedArray(count, "vec3");
const edgeActiveBuffer = instancedArray(count, "uint");

// Uniforms
const uniforms = {
  timeScale: uniform(1),
  attractionStrength: uniform(0.02),
  repulsionStrength: uniform(0.01),
  dampening: uniform(0.001),
};

create();

function create() {
  initCamera();
  initScene();
  initRenderer();
  initControls();
  initHelpers();
  initGUI();

  setupComputeNodes();
  createParticles();
  createEdges();

  window.addEventListener("resize", onWindowResize);
}

function initCamera() {
  camera = new THREE.PerspectiveCamera(
    25,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(3, 5, 8);
}

function initScene() {
  scene = new THREE.Scene();

  // Lights
  const ambientLight = new THREE.AmbientLight("#ffffff", 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight("#ffffff", 1.5);
  directionalLight.position.set(4, 2, 0);
  scene.add(directionalLight);
}

function initRenderer() {
  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(update);
  renderer.setClearColor("#000000");
  document.body.appendChild(renderer.domElement);
}

function initControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;
}

function initHelpers() {
  new AxesHelper(scene);
  new GridHelper(scene);
}

function initGUI() {
  const gui = new GUI();

  gui.add(uniforms.timeScale, "value", 0, 2, 0.01).name("Time Scale");
  gui
    .add(uniforms.attractionStrength, "value", 0, 0.1, 0.001)
    .name("Attraction Strength");
  gui
    .add(uniforms.repulsionStrength, "value", 0, 0.1, 0.001)
    .name("Repulsion Strength");
  gui.add(uniforms.dampening, "value", 0, 1, 0.01).name("Dampening");
}



function setupComputeNodes() {
  const sphericalToVec3 = Fn(([phi, theta]) => {
    const sinPhiRadius = sin(phi);
    return vec3(
      sinPhiRadius.mul(sin(theta)),
      cos(phi),
      sinPhiRadius.mul(cos(theta))
    );
  });

  const create_WebGPU = Fn(() => {
    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);
    const edgePosition = edgePositionBuffer.element(instanceIndex);

    const edgeActive = edgeActiveBuffer.element(instanceIndex);

    const basePosition = vec3(
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
    )
      .sub(0.5)
      .mul(vec3(5, 2, 5));
    position.assign(basePosition);

    const baseEdgePosition = vec3(
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
    )
      .sub(0.5)
      .mul(vec3(5, 0.2, 5));
    edgePosition.assign(baseEdgePosition);

    const baseEdgeActive = uint(hash(instanceIndex).mul(100).mod(2));
    edgeActive.assign(baseEdgeActive);

    const phi = hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
      .mul(PI)
      .mul(2);
    const theta = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).mul(
      PI
    );
    const baseVelocity = sphericalToVec3(phi, theta).mul(0.05);
    velocity.assign(baseVelocity);
  });

  const update_WebGPU = Fn(() => {
    const delta = float(1 / 60)
      .mul(uniforms.timeScale)
      .toVar();

    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);
    const edgePosition = edgePositionBuffer.element(instanceIndex);
    const edgeActive = edgeActiveBuffer.element(instanceIndex);
    

    const force = vec3(0).toVar();
    const idxVar = instanceIndex.toVar();

    Loop(count, ({ i }) => {
      If(i.notEqual(idxVar), () => {
        const otherPos = positionBuffer.element(i).toVec3().toVar();
        const deltaPos = position.sub(otherPos).toVar();
        const distSq = deltaPos.dot(deltaPos).toVar();
        const dir = deltaPos.normalize();

        const repulsion = dir
          .mul(uniforms.repulsionStrength)
          .div(distSq.add(0.05));
        force.addAssign(repulsion);

        const attraction = dir
          .mul(uniforms.attractionStrength)
          .div(distSq.add(0.05))
          .negate();
        force.addAssign(attraction);

        If(edgeActive.equal(uint(1)), () => {
          const midpoint = position.add(otherPos).div(2);
          edgePosition.assign(midpoint);
        });

        //take position, get the distance and direction between the particles (which we have), divide by two, add that vector to the position, that is the new current position of the edgepartcile poc position
     
      })
    });

    //Euler integration
    velocity.addAssign(force.mul(delta));
    velocity.mulAssign(float(1).sub(uniforms.dampening));
    position.addAssign(velocity.mul(delta));
  });

  createCompute = create_WebGPU().compute(count);
  updateCompute = update_WebGPU().compute(count);
  renderer.computeAsync(createCompute);
}

function createParticles() {
  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  material.positionNode = positionBuffer.toAttribute();
  material.colorNode = vec3(1, 1, 0);

  const geometry = new THREE.PlaneGeometry(0.05, 0.05);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  scene.add(mesh);
}

function createEdges() {
  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  material.positionNode = edgePositionBuffer.toAttribute();
  material.colorNode = vec3(0, 0, 1);

  const geometry = new THREE.PlaneGeometry(0.1, 0.05);
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
