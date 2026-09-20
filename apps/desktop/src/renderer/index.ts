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
import { visibleBubbles } from './bubble-model.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Renderer root is missing');

const canvas = document.createElement('canvas');
canvas.className = 'pet-canvas';
const bubbleLayer = document.createElement('div');
bubbleLayer.className = 'bubble-layer';
const bubbleDeck = document.createElement('div');
bubbleDeck.className = 'bubble-deck';
bubbleDeck.setAttribute('role', 'group');
bubbleDeck.setAttribute('aria-label', '会话通知，悬停或聚焦展开');
bubbleLayer.append(bubbleDeck);
function expandBubbles(expanded: boolean): void {
  bubbleDeck.classList.toggle('is-expanded', expanded);
  void window.pet.bubblesExpanded(expanded);
}
bubbleDeck.addEventListener('pointerenter', () => expandBubbles(true));
bubbleDeck.addEventListener('pointerleave', () => {
  if (!bubbleDeck.contains(document.activeElement)) expandBubbles(false);
});
bubbleDeck.addEventListener('focusin', () => expandBubbles(true));
bubbleDeck.addEventListener('focusout', () => {
  queueMicrotask(() => {
    if (!bubbleDeck.contains(document.activeElement) && !bubbleDeck.matches(':hover')) expandBubbles(false);
  });
});
const notice = document.createElement('p');
notice.className = 'pet-notice';
notice.setAttribute('role', 'status');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function showNotice(message: string): void {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 3500);
}
const toggle = document.createElement('button');
toggle.className = 'bubble-toggle';
toggle.type = 'button';
toggle.title = '隐藏气泡';
function updateBubbleToggleIcon(): void {
  const hidden = bubbleLayer.hidden;
  toggle.setAttribute('aria-label', hidden ? '显示气泡' : '隐藏气泡');
  toggle.title = hidden ? '显示气泡' : '隐藏气泡';
  toggle.innerHTML = hidden
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A11.7 11.7 0 0 1 12 4c5 0 8.5 4 9.5 6a11.8 11.8 0 0 1-3.2 3.8M6.2 6.2C4.5 7.3 3.3 8.8 2.5 10c1 2 4.5 6 9.5 6 1 0 2-.2 2.9-.5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
}
toggle.addEventListener('click', () => {
  bubbleLayer.hidden = !bubbleLayer.hidden;
  void window.pet.bubblesVisible(!bubbleLayer.hidden);
  updateBubbleToggleIcon();
});
updateBubbleToggleIcon();
const resizeHandle = document.createElement('button');
resizeHandle.className = 'resize-handle';
resizeHandle.type = 'button';
resizeHandle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M4 4l6 6M16 20h4v-4m0 4-6-6"/></svg>';
resizeHandle.title = '调整宠物窗口大小';
resizeHandle.setAttribute('aria-label', '调整宠物窗口大小');
const toolbar = document.createElement('div');
toolbar.className = 'pet-toolbar';
toolbar.append(toggle, resizeHandle);
app.append(canvas, bubbleLayer, toolbar, notice);

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
  bubbleDeck.replaceChildren();
  const bubbles = [...visibleBubbles(state)].reverse();
  bubbleDeck.style.setProperty('--stack-height', `${Math.min(3, bubbles.length) * 7 + 66}px`);
  bubbleDeck.setAttribute('aria-label', `${bubbles.length} 个会话通知，悬停或聚焦展开`);
  if (!bubbles.length) expandBubbles(false);
  for (const [index, bubble] of bubbles.entries()) {
    const button = document.createElement('button');
    button.className = `session-bubble session-bubble--${bubble.status}`;
    button.type = 'button';
    button.style.setProperty('--depth', String(Math.min(index, 2)));
    button.style.setProperty('--order', String(bubbles.length - index));
    button.dataset.stackedHidden = String(index > 2);
    const title = document.createElement('strong');
    title.textContent = bubble.name;
    const status = document.createElement('span');
    status.textContent = { working: '正在工作', 'completed-unread': '已完成', 'error-unread': '发生错误' }[bubble.status];
    button.append(title, status);
    button.addEventListener('click', async () => {
      const session = state.sessions[bubble.sessionId];
      if (!session) return;
      try {
        const result = await window.pet.acknowledgeAndOpen({
          provider: session.provider,
          sessionId: session.sessionId,
        });
        const messages = {
          success: '', unsupported: '暂不支持跳转原会话',
          'not-found': '找不到对应 Session。', 'permission-denied': '没有打开窗口的权限。',
        };
        showNotice(messages[result.status]);
      } catch {
        showNotice('暂时无法打开原会话窗口');
      }
    });
    bubbleDeck.append(button);
  }
}

let dragging = false;
let resizing = false;
let lastPointer = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true;
  void window.pet.interaction(true);
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
  void window.pet.interaction(false);
  canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove('pet-canvas--dragging');
}
canvas.addEventListener('pointerup', stopDragging);
canvas.addEventListener('pointercancel', stopDragging);
resizeHandle.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  resizing = true;
  void window.pet.interaction(true);
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
  void window.pet.interaction(false);
  resizeHandle.releasePointerCapture(event.pointerId);
}
resizeHandle.addEventListener('pointerup', stopResizing);
resizeHandle.addEventListener('pointercancel', stopResizing);

const unsubscribeLayout = window.pet.subscribeLayout(layout => {
  const above = layout.bubbles.y < layout.pet.y;
  bubbleLayer.style.justifyContent = above ? 'safe flex-end' : 'flex-start';
  bubbleLayer.dataset.side = above ? 'above' : 'below';
  Object.assign(notice.style, {
    left: `${layout.bubbles.x + 4}px`, width: `${layout.bubbles.width - 8}px`,
    top: above ? 'auto' : `${layout.bubbles.y + 4}px`,
    bottom: above ? `${layout.bounds.height - layout.bubbles.y - layout.bubbles.height + 4}px` : 'auto',
  });
  for (const [element, rect] of [[canvas, layout.pet], [bubbleLayer, layout.bubbles], [toolbar, layout.toolbar]] as const) {
    Object.assign(element.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }
  resize();
});
window.addEventListener('resize', resize);
const unsubscribe = window.pet.subscribeSnapshot(renderBubbles);
void window.pet.requestSnapshot().catch(() => {
  notice.textContent = '无法获取 Session 状态，请重新打开窗口。';
});
window.addEventListener('beforeunload', () => {
  destroyed = true;
  clearTimeout(noticeTimer);
  unsubscribe();
  unsubscribeLayout();
  cancelAnimationFrame(frame);
  pet?.dispose();
  renderer.dispose();
  window.removeEventListener('resize', resize);
});
resize();
frame = requestAnimationFrame(render);
