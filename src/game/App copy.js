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
  pass,
} from "/modules/three.tsl.js";

import { GUI } from "/modules/lil-gui.module.min.js";
import { OrbitControls } from "/modules/OrbitControls.js";

import { AxesHelper } from "/components/AxesHelper.webgpu.js";
import { GridHelper } from "/components/GridHelper.webgpu.js";

import { bloom } from "/modules/BloomNode.js";

let camera,
  scene,
  renderer,
  controls,
  createCompute,
  updateCompute,
  postProcessing;

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

  // POST-PROCESSING (BLOOM) SETUP
  postProcessing = new THREE.PostProcessing(renderer);

  // 1. Pass your scene & camera
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode("output");

  // 2. Create a bloom pass (threshold, strength, radius)
  const bloomPass = bloom(scenePassColor, 0.75, 0.1, 0.5);

  // 3. Combine bloom with the scene color
  postProcessing.outputNode = scenePassColor.add(bloomPass);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;

  window.addEventListener("resize", onWindowResize);

  // CREATE AXES & GRID
  const axesHelper = new AxesHelper(scene);
  const gridHelper = new GridHelper(scene);

  const gui = new GUI();
  const bloomFolder = gui.addFolder("Bloom");
  bloomFolder.add(bloomPass.threshold, "value", 0, 2, 0.01).name("Threshold");
  bloomFolder.add(bloomPass.strength, "value", 0, 10, 0.01).name("Strength");
  bloomFolder.add(bloomPass.radius, "value", 0, 1, 0.01).name("Radius");

  const count = Math.pow(2, 14);
  const timeScale = uniform(1);
  const attractionStrength = uniform(0.01); // Tweak this
  const repulsionStrength = uniform(0.02); // Tweak this
  const softening = float(0.05); // Avoid singularities at very small distances
  const dampening = uniform(0.1); // Adjust this to control the strength of dampening

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
      .mul(vec3(5, 2, 5));
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

    const idxVar = instanceIndex.toVar(); // So we can compare in the loop
    // const totalCount = uint( positionBuffer.length );

    Loop(count, ({ i }) => {
      console.log(i);
      // Skip self
      If(i.notEqual(idxVar), () => {
        // Position of the other particle
        const otherPos = positionBuffer.element(i).toVec3().toVar();

        // Vector from other -> me
        const deltaPos = position.sub(otherPos).toVar();
        const distSq = deltaPos.dot(deltaPos).toVar();
        // const dist = distSq.sqrt(); // or “sqrt(distSq)”
        const dir = deltaPos.normalize();

        const repulsion = dir.mul(repulsionStrength).div(distSq.add(softening));
        force.addAssign(repulsion);

        const attraction = dir
          .mul(attractionStrength)
          .div(distSq.add(softening))
          .negate(); // negative direction => pulls them in
        force.addAssign(attraction);
      });
    });

    //Euler integration

    velocity.addAssign(force.mul(delta));

    // Apply dampening to velocity
    velocity.mulAssign(float(1).sub(dampening)); // Reduces velocity over time

    // position

    position.addAssign(velocity.mul(delta));
  });
  updateCompute = update_WebGPU().compute(count);

  // nodes

  material.positionNode = positionBuffer.toAttribute();

  material.colorNode = vec3(0, 1, 0);

  // mesh

  const geometry = new THREE.PlaneGeometry(0.01, 0.01);
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
  postProcessing.renderAsync();
}
