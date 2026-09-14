import * as THREE from 'three';
import './style.css';

// MineThree is deliberately split into small, replaceable systems: world generation,
// block rendering, player controls, and the HUD. That keeps the prototype easy to grow.
const WORLD_SIZE = 24;
const WORLD_HEIGHT = 18;
const WATER_LEVEL = 3;
const PLAYER_HEIGHT = 1.78;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.58;
const REACH = 6;

const BLOCKS = {
  grass: { label: 'GRASS BLOCK', color: 0x769f4f, side: 0x78904c, top: 0x8fbd61, bottom: 0x795439, solid: true },
  dirt: { label: 'DIRT', color: 0x886141, side: 0x886141, top: 0x976d47, bottom: 0x704d35, solid: true },
  stone: { label: 'STONE', color: 0x7f8d8a, side: 0x7f8d8a, top: 0x9aa19a, bottom: 0x66716f, solid: true },
  wood: { label: 'OAK LOG', color: 0x936238, side: 0x9a6840, top: 0xc2945a, bottom: 0x7e512f, solid: true },
  leaves: { label: 'LEAVES', color: 0x4b9561, side: 0x4b9561, top: 0x5ca36a, bottom: 0x3f7f56, solid: true, transparent: true },
  sand: { label: 'SAND', color: 0xd1b576, side: 0xd1b576, top: 0xe2ca8e, bottom: 0xb39860, solid: true },
  brick: { label: 'BRICK', color: 0xa65c4d, side: 0xa65c4d, top: 0xb86e5b, bottom: 0x834539, solid: true },
};

const HOTBAR = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand', 'brick'];

const viewport = document.querySelector('#viewport');
const blockReadout = document.querySelector('#block-readout');
const coordX = document.querySelector('#coord-x');
const coordY = document.querySelector('#coord-y');
const coordZ = document.querySelector('#coord-z');
const selectedName = document.querySelector('#selected-name');
const hotbarElement = document.querySelector('#hotbar');
const interactionHint = document.querySelector('#interaction-hint');
const pauseOverlay = document.querySelector('#pause-overlay');
const toast = document.querySelector('#toast');
const toastText = document.querySelector('#toast-text');
const controlsCard = document.querySelector('#controls-card');
const helpButton = document.querySelector('#help-button');
const timeReadout = document.querySelector('#time-readout');
const missionProgress = document.querySelector('.mission-progress');
const missionProgressFill = missionProgress.querySelector('span');
const missionCount = document.querySelector('#mission-count');
const tipText = document.querySelector('#tip-text');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ab4b1);
scene.fog = new THREE.Fog(0x8ab4b1, 19, 43);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
viewport.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xb9e0da, 0x2a3b2e, 1.7);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xffe3ae, 2.7);
sun.position.set(-12, 24, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.bias = -0.0008;
scene.add(sun);

const worldGroup = new THREE.Group();
scene.add(worldGroup);
const decorationGroup = new THREE.Group();
scene.add(decorationGroup);
const blockMeshes = new Map();
const blocks = new Map();
const geometry = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const selection = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0xffdc88, transparent: true, opacity: 0.95, depthTest: false })
);
selection.visible = false;
selection.renderOrder = 20;
scene.add(selection);

function key(x, y, z) { return `${x},${y},${z}`; }
function fromKey(value) { return value.split(',').map(Number); }
function inBounds(x, y, z) {
  return x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT;
}
function getBlock(x, y, z) { return blocks.get(key(x, y, z)); }
function setBlock(x, y, z, type) {
  if (inBounds(x, y, z)) blocks.set(key(x, y, z), type);
}
function removeBlock(x, y, z) { blocks.delete(key(x, y, z)); }
function isSolidAt(x, y, z) {
  const type = getBlock(x, y, z);
  return Boolean(type && BLOCKS[type]?.solid);
}

// A tiny deterministic value-noise function gives the starter world gentle variation
// while keeping every reload identical.
function seededNoise(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7 + x * z * 0.17) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function terrainHeight(x, z) {
  const rolling = Math.sin(x * 0.43) * 0.65 + Math.cos(z * 0.38) * 0.65;
  const detail = seededNoise(x, z) * 0.75 + seededNoise(x * 2 + 7, z * 2 - 3) * 0.2;
  const ridge = Math.max(0, Math.sin((x + z) * 0.21 - 1.4)) * 0.75;
  return THREE.MathUtils.clamp(Math.floor(4.2 + rolling + detail + ridge), 2, 8);
}

function generateWorld() {
  blocks.clear();
  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      const height = terrainHeight(x, z);
      for (let y = 0; y <= height; y += 1) {
        let type = 'stone';
        if (y === height) type = height <= WATER_LEVEL ? 'sand' : 'grass';
        else if (y >= height - 2) type = 'dirt';
        setBlock(x, y, z, type);
      }
    }
  }

  // A few simple trees make the meadow feel like a place without hiding the terrain.
  const treeSpots = [[4, 5], [8, 17], [17, 6], [19, 18], [13, 13]];
  treeSpots.forEach(([x, z], index) => {
    const ground = terrainHeight(x, z);
    if (ground <= WATER_LEVEL) return;
    const trunkHeight = index === 3 ? 4 : 3;
    for (let y = 1; y <= trunkHeight; y += 1) setBlock(x, ground + y, z, 'wood');
    const crownY = ground + trunkHeight;
    for (let ox = -2; ox <= 2; ox += 1) {
      for (let oz = -2; oz <= 2; oz += 1) {
        for (let oy = 0; oy <= 1; oy += 1) {
          const distance = Math.abs(ox) + Math.abs(oz) + oy;
          if (distance < 4 && !(ox === 0 && oz === 0 && oy === 0)) setBlock(x + ox, crownY + oy, z + oz, 'leaves');
        }
      }
    }
    setBlock(x, crownY + 2, z, 'leaves');
  });
}

function getMaterials(type) {
  if (materials.has(type)) return materials.get(type);
  const info = BLOCKS[type];
  const side = new THREE.MeshLambertMaterial({ color: info.side, flatShading: true });
  const top = new THREE.MeshLambertMaterial({ color: info.top, flatShading: true });
  const bottom = new THREE.MeshLambertMaterial({ color: info.bottom, flatShading: true });
  if (info.transparent) {
    [side, top, bottom].forEach((material) => {
      material.transparent = true;
      material.opacity = 0.9;
      material.alphaTest = 0.04;
    });
  }
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z.
  const set = [side, side, top, bottom, side, side];
  materials.set(type, set);
  return set;
}

function isExposed(x, y, z) {
  return [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ].some(([dx, dy, dz]) => !getBlock(x + dx, y + dy, z + dz));
}

function createBlockMesh(x, y, z, type) {
  const mesh = new THREE.Mesh(geometry, getMaterials(type));
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = type !== 'leaves';
  mesh.receiveShadow = true;
  mesh.userData = { x, y, z, type };
  worldGroup.add(mesh);
  blockMeshes.set(key(x, y, z), mesh);
}

function removeBlockMesh(x, y, z) {
  const mesh = blockMeshes.get(key(x, y, z));
  if (!mesh) return;
  worldGroup.remove(mesh);
  blockMeshes.delete(key(x, y, z));
}

function refreshBlock(x, y, z) {
  const existing = blockMeshes.get(key(x, y, z));
  if (existing) removeBlockMesh(x, y, z);
  const type = getBlock(x, y, z);
  if (type && isExposed(x, y, z)) createBlockMesh(x, y, z, type);
}

function refreshAround(x, y, z) {
  refreshBlock(x, y, z);
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(([dx, dy, dz]) => refreshBlock(x + dx, y + dy, z + dz));
}

function buildWorldMeshes() {
  worldGroup.clear();
  blockMeshes.clear();
  blocks.forEach((type, blockKey) => {
    const [x, y, z] = fromKey(blockKey);
    if (isExposed(x, y, z)) createBlockMesh(x, y, z, type);
  });
  blockReadout.textContent = blocks.size.toLocaleString();
}

function addDecorations() {
  decorationGroup.clear();
  // A shallow, translucent water plane leaves room for adding real fluid blocks later.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE + 8, WORLD_SIZE + 8),
    new THREE.MeshPhongMaterial({ color: 0x4da9ad, transparent: true, opacity: 0.3, shininess: 90, depthWrite: false })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD_SIZE / 2, WATER_LEVEL + 0.08, WORLD_SIZE / 2);
  water.receiveShadow = true;
  decorationGroup.add(water);

  // Low-poly clouds are intentionally sparse so the world stays readable.
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xf0f1d9, transparent: true, opacity: 0.62, depthWrite: false });
  [[3, 17, 5], [15, 18, 7], [27, 15.5, 4]].forEach(([x, y, scale], index) => {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, 4 + index * 7);
    [[0, 0, 0, 3], [2.2, .2, .1, 2.2], [-2.1, -.05, -.15, 2], [4.1, -.05, .15, 1.55]].forEach(([ox, oy, oz, size]) => {
      const puff = new THREE.Mesh(new THREE.BoxGeometry(size, .7, 1.4), cloudMaterial);
      puff.position.set(ox * scale / 5, oy, oz);
      cloud.add(puff);
    });
    cloud.scale.setScalar(Math.min(1.1, scale / 5));
    decorationGroup.add(cloud);
  });
}

generateWorld();
buildWorldMeshes();
addDecorations();

const spawn = { x: 12.5, z: 18.5 };
let player = {
  x: spawn.x,
  y: terrainHeight(12, 18) + 1.02,
  z: spawn.z,
  velocityY: 0,
  onGround: false,
};
let yaw = 0;
let pitch = -0.28;
let isLocked = false;
let selectedIndex = 0;
const keys = new Set();
const inventory = { grass: 12, dirt: 20, stone: 18, wood: 8, leaves: 16, sand: 10, brick: 6 };
const missionGoal = 3;
let blocksGathered = 0;

function updateCamera() {
  camera.position.set(player.x, player.y + EYE_HEIGHT, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function collidesAt(x, y, z) {
  const minX = Math.floor(x - PLAYER_RADIUS);
  const maxX = Math.floor(x + PLAYER_RADIUS);
  const minY = Math.floor(y + 0.05);
  const maxY = Math.floor(y + PLAYER_HEIGHT - 0.05);
  const minZ = Math.floor(z - PLAYER_RADIUS);
  const maxZ = Math.floor(z + PLAYER_RADIUS);
  for (let bx = minX; bx <= maxX; bx += 1) {
    for (let by = minY; by <= maxY; by += 1) {
      for (let bz = minZ; bz <= maxZ; bz += 1) {
        if (isSolidAt(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

function movePlayer(dx, dz) {
  const nextX = player.x + dx;
  if (!collidesAt(nextX, player.y, player.z) && nextX > -0.2 && nextX < WORLD_SIZE + 0.2) player.x = nextX;
  const nextZ = player.z + dz;
  if (!collidesAt(player.x, player.y, nextZ) && nextZ > -0.2 && nextZ < WORLD_SIZE + 0.2) player.z = nextZ;
}

function updatePlayer(delta) {
  if (!isLocked) return;
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.2 : 3.5;
  let forward = 0;
  let strafe = 0;
  if (keys.has('KeyW')) forward += 1;
  if (keys.has('KeyS')) forward -= 1;
  if (keys.has('KeyD')) strafe += 1;
  if (keys.has('KeyA')) strafe -= 1;
  if (forward || strafe) {
    const length = Math.hypot(forward, strafe);
    forward /= length;
    strafe /= length;
    const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * delta;
    const dz = (-Math.cos(yaw) * forward + Math.sin(yaw) * strafe) * speed * delta;
    movePlayer(dx, dz);
  }

  player.velocityY -= 18 * delta;
  const nextY = player.y + player.velocityY * delta;
  if (!collidesAt(player.x, nextY, player.z)) {
    player.y = nextY;
    player.onGround = false;
  } else {
    if (player.velocityY < 0) player.onGround = true;
    player.velocityY = 0;
  }
  if (player.y < -5) {
    player.x = spawn.x; player.y = terrainHeight(12, 18) + 1.02; player.z = spawn.z;
  }
}

function currentTarget() {
  raycaster.setFromCamera(center, camera);
  const hits = raycaster.intersectObjects([...blockMeshes.values()], false);
  return hits.find((hit) => hit.distance <= REACH) || null;
}

function updateSelection() {
  const hit = currentTarget();
  if (!hit) {
    selection.visible = false;
    return null;
  }
  selection.visible = true;
  selection.position.copy(hit.object.position);
  return hit;
}

function showToast(message) {
  toastText.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function updateMission() {
  const progress = Math.min(blocksGathered / missionGoal, 1);
  missionProgressFill.style.width = `${progress * 100}%`;
  missionProgress.setAttribute('aria-valuenow', blocksGathered.toString());
  missionCount.textContent = `${Math.min(blocksGathered, missionGoal).toString().padStart(2, '0')} / ${missionGoal.toString().padStart(2, '0')}`;
  if (blocksGathered >= missionGoal) {
    tipText.textContent = 'The first morning is yours. Keep shaping the ridge.';
  } else if (blocksGathered > 0) {
    tipText.textContent = `${missionGoal - blocksGathered} more block${missionGoal - blocksGathered === 1 ? '' : 's'} to complete your first log.`;
  }
}

function mineBlock() {
  const hit = currentTarget();
  if (!hit) return;
  const { x, y, z, type } = hit.object.userData;
  if (y === 0) {
    showToast('The bedrock is too deep to mine');
    return;
  }
  removeBlock(x, y, z);
  inventory[type] = (inventory[type] || 0) + 1;
  blocksGathered += 1;
  refreshAround(x, y, z);
  blockReadout.textContent = blocks.size.toLocaleString();
  renderHotbar();
  updateMission();
  showToast(`Mined ${BLOCKS[type].label.toLowerCase()}`);
}

function placeBlock() {
  const hit = currentTarget();
  if (!hit) return;
  const type = HOTBAR[selectedIndex];
  if ((inventory[type] || 0) <= 0) {
    showToast(`No ${BLOCKS[type].label.toLowerCase()} left`);
    return;
  }
  const normal = hit.face.normal;
  const { x, y, z } = hit.object.userData;
  const px = x + Math.round(normal.x);
  const py = y + Math.round(normal.y);
  const pz = z + Math.round(normal.z);
  if (!inBounds(px, py, pz) || getBlock(px, py, pz)) return;
  if (collidesAt(player.x, player.y, player.z) || collidesAt(px + 0.5, py, pz + 0.5)) {
    showToast('There is not enough room there');
    return;
  }
  setBlock(px, py, pz, type);
  inventory[type] -= 1;
  refreshAround(px, py, pz);
  blockReadout.textContent = blocks.size.toLocaleString();
  renderHotbar();
  showToast(`Placed ${BLOCKS[type].label.toLowerCase()}`);
}

function renderHotbar() {
  hotbarElement.innerHTML = '';
  HOTBAR.forEach((type, index) => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = `hotbar-slot${index === selectedIndex ? ' selected' : ''}`;
    slot.setAttribute('aria-label', `${index + 1}: ${BLOCKS[type].label}`);
    slot.innerHTML = `<span class="slot-number">${index + 1}</span><span class="block-icon ${type}"></span><span class="slot-count">${inventory[type] || 0}</span>`;
    slot.addEventListener('click', () => {
      selectedIndex = index;
      renderHotbar();
    });
    hotbarElement.appendChild(slot);
  });
  selectedName.textContent = BLOCKS[HOTBAR[selectedIndex]].label;
}

function updateCoordinates() {
  coordX.textContent = `X ${Math.floor(player.x).toString().padStart(2, '0')}`;
  coordY.textContent = `Y ${Math.floor(player.y).toString().padStart(2, '0')}`;
  coordZ.textContent = `Z ${Math.floor(player.z).toString().padStart(2, '0')}`;
}

function requestLock() {
  renderer.domElement.requestPointerLock?.();
}

renderer.domElement.addEventListener('click', () => {
  if (!isLocked) requestLock();
});
renderer.domElement.addEventListener('mousedown', (event) => {
  if (!isLocked) return;
  if (event.button === 0) mineBlock();
  if (event.button === 2) placeBlock();
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === renderer.domElement;
  interactionHint.classList.toggle('hidden', isLocked);
  pauseOverlay.classList.toggle('visible', !isLocked);
  if (isLocked) pauseOverlay.classList.remove('visible');
});
document.addEventListener('mousemove', (event) => {
  if (!isLocked) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
});
document.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code.startsWith('Digit')) {
    const index = Number(event.code.slice(5)) - 1;
    if (index >= 0 && index < HOTBAR.length) { selectedIndex = index; renderHotbar(); }
  }
  if (event.code === 'Space' && player.onGround && isLocked) {
    player.velocityY = 7;
    player.onGround = false;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));

// The help card is useful both before and after pointer lock, and does not interrupt play.
helpButton.addEventListener('click', () => {
  const isOpen = controlsCard.classList.toggle('open');
  helpButton.setAttribute('aria-expanded', isOpen.toString());
});
document.querySelector('#close-help').addEventListener('click', () => {
  controlsCard.classList.remove('open');
  helpButton.setAttribute('aria-expanded', 'false');
});
pauseOverlay.addEventListener('click', requestLock);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderHotbar();
updateMission();
updateCamera();
updateCoordinates();
showToast('Meadow Ridge is ready');

const clock = new THREE.Clock();
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  const totalMinutes = (8 * 60 + 42 + Math.floor(elapsed / 5)) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  timeReadout.textContent = `DAY 01 · ${hours}:${minutes}`;
  updatePlayer(delta);
  updateCamera();
  updateSelection();
  updateCoordinates();
  // Very slight motion keeps the water from feeling like a flat UI card.
  const water = decorationGroup.children[0];
  if (water) water.material.opacity = 0.28 + Math.sin(elapsed * 0.7) * 0.025;
  renderer.render(scene, camera);
}
animate();
