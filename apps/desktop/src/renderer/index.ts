import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { SessionState } from '@agent-pet/domain';
import { parseBundledPet, type LoadedPet, type PetMotion } from '@agent-pet/pet-runtime/model';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import { selectPetMotion } from './pet-motion.js';
import { bubbleLabel, visibleBubbles } from './bubble-model.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Renderer root is missing');

const canvas = document.createElement('canvas');
canvas.className = 'pet-canvas';
const bubbleLayer = document.createElement('div');
bubbleLayer.className = 'bubble-layer';
const notice = document.createElement('p');
notice.className = 'pet-notice';
notice.setAttribute('role', 'status');
const toggle = document.createElement('button');
toggle.className = 'bubble-toggle';
toggle.textContent = '隐藏气泡';
toggle.addEventListener('click', () => {
  bubbleLayer.hidden = !bubbleLayer.hidden;
  toggle.textContent = bubbleLayer.hidden ? '显示气泡' : '隐藏气泡';
});
const resizeHandle = document.createElement('div');
resizeHandle.className = 'resize-handle';
resizeHandle.setAttribute('aria-label', '调整宠物窗口大小');
resizeHandle.setAttribute('role', 'slider');
app.append(canvas, bubbleLayer, toggle, resizeHandle, notice);

const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new Scene();
const camera = new PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, .4, 4.2);
camera.lookAt(0, .2, 0);
scene.add(new AmbientLight(new Color('#ffffff'), 2));
const light = new DirectionalLight('#ffffff', 3);
light.position.set(3, 5, 4);
scene.add(light);
let pet: LoadedPet | undefined;
let motion: PetMotion = 'idle';
let destroyed = false;
notice.textContent = '正在加载内置 GLB 宠物…';
async function loadStarter(): Promise<void> {
  try {
    const response = await fetch(starterUrl);
    if (!response.ok) throw new Error('Bundled model is unavailable');
    const loaded = await parseBundledPet(await response.arrayBuffer(), {
      idle: 'Idle', working: 'Work', success: 'Success', error: 'Error',
    });
    if (destroyed) { loaded.dispose(); return; }
    pet = loaded;
    pet.root.scale.setScalar(1.1);
    scene.add(pet.root);
    pet.setMotion(motion);
    notice.textContent = '';
  } catch {
    if (!destroyed) notice.textContent = '内置宠物加载失败，请重新打开窗口。';
  }
}
void loadStarter();

function resize(): void {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

let lastFrame = 0;
let frame = 0;
function render(now: number): void {
  frame = requestAnimationFrame(render);
  if (document.hidden) { lastFrame = now; return; }
  if (now - lastFrame < 1000 / 30) return;
  pet?.update((now - lastFrame) / 1000);
  lastFrame = now;
  renderer.render(scene, camera);
}

function renderBubbles(state: SessionState): void {
  motion = selectPetMotion(state.bubbles);
  pet?.setMotion(motion);
  bubbleLayer.replaceChildren();
  for (const bubble of visibleBubbles(state)) {
    const button = document.createElement('button');
    button.className = `session-bubble session-bubble--${bubble.status}`;
    button.type = 'button';
    button.textContent = bubbleLabel(bubble);
    button.addEventListener('click', async () => {
      const session = state.sessions[bubble.sessionId];
      if (!session) return;
      try {
        const result = await window.pet.acknowledgeAndOpen({
          provider: session.provider,
          sessionId: session.sessionId,
        });
        const messages = {
          success: '', unsupported: '此 Session 暂不支持打开窗口（模拟 Session 不连接真实 Agent）。',
          'not-found': '找不到对应 Session。', 'permission-denied': '没有打开窗口的权限。',
        };
        notice.textContent = messages[result.status];
      } catch {
        notice.textContent = '打开窗口失败；已确认的气泡不会恢复。';
      }
    });
    bubbleLayer.append(button);
  }
}

let dragging = false;
let resizing = false;
let lastPointer = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastPointer = { x: event.screenX, y: event.screenY };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('pet-canvas--dragging');
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const delta = { x: event.screenX - lastPointer.x, y: event.screenY - lastPointer.y };
  lastPointer = { x: event.screenX, y: event.screenY };
  void window.pet.moveWindowBy(delta);
});
function stopDragging(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove('pet-canvas--dragging');
}
canvas.addEventListener('pointerup', stopDragging);
canvas.addEventListener('pointercancel', stopDragging);
resizeHandle.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  resizing = true;
  lastPointer = { x: event.screenX, y: event.screenY };
  resizeHandle.setPointerCapture(event.pointerId);
});
resizeHandle.addEventListener('pointermove', (event) => {
  if (!resizing) return;
  const delta = { x: event.screenX - lastPointer.x, y: event.screenY - lastPointer.y };
  lastPointer = { x: event.screenX, y: event.screenY };
  void window.pet.resizeWindowBy(delta);
});
function stopResizing(event: PointerEvent): void {
  if (!resizing) return;
  resizing = false;
  resizeHandle.releasePointerCapture(event.pointerId);
}
resizeHandle.addEventListener('pointerup', stopResizing);
resizeHandle.addEventListener('pointercancel', stopResizing);

window.addEventListener('resize', resize);
const unsubscribe = window.pet.subscribeSnapshot(renderBubbles);
void window.pet.requestSnapshot().catch(() => {
  notice.textContent = '无法获取 Session 状态，请重新打开窗口。';
});
window.addEventListener('beforeunload', () => {
  destroyed = true;
  unsubscribe();
  cancelAnimationFrame(frame);
  pet?.dispose();
  renderer.dispose();
  window.removeEventListener('resize', resize);
});
resize();
frame = requestAnimationFrame(render);
