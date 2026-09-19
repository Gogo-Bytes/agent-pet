import {
  AmbientLight,
  Color,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { SessionState } from '@agent-pet/domain';
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
app.append(canvas, bubbleLayer, toggle, notice);

const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new Scene();
const camera = new PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0.2, 4);
scene.add(new AmbientLight(new Color('#ffffff'), 2));

// Placeholder geometry keeps the window and interaction loop testable before a GLB is selected.
const pet = new Mesh(
  new IcosahedronGeometry(1, 2),
  new MeshStandardMaterial({ color: '#7c5cff', roughness: 0.65 }),
);
scene.add(pet);

function resize(): void {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function render(): void {
  pet.rotation.y += 0.006;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function renderBubbles(state: SessionState): void {
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

window.addEventListener('resize', resize);
const unsubscribe = window.pet.subscribeSnapshot(renderBubbles);
void window.pet.requestSnapshot().catch(() => {
  notice.textContent = '无法获取 Session 状态，请重新打开窗口。';
});
window.addEventListener('beforeunload', unsubscribe);
resize();
render();
