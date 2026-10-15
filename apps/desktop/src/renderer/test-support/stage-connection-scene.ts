import type { ConnectionSceneId } from './connection-scenes-data.js';

/** Navigate real components only inside the browser demo. No production routing hooks. */
export async function stageConnectionScene(scene: ConnectionSceneId, signal: AbortSignal) {
  async function find<T extends Element>(query: () => T | undefined | null): Promise<T> {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const value = query(); if (value) return value;
    return new Promise((resolve, reject) => {
      const clean = () => { observer.disconnect(); clearTimeout(timeout); signal.removeEventListener('abort', abort); };
      const abort = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
      const observer = new MutationObserver(() => { const value = query(); if (value) { clean(); resolve(value); } });
      const timeout = setTimeout(() => { clean(); reject(new Error(`无法打开场景：${scene}`)); }, 8000);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  async function click(label: string) {
    const button = await find(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(value =>
      !value.closest('[hidden]') && !value.disabled && (value.getAttribute('aria-label') === label || value.textContent?.trim() === label)));
    button.click();
  }
  async function input(selector: string, value: string) {
    const element = await find(() => document.querySelector<HTMLInputElement | HTMLSelectElement>(selector));
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  }
  await find(() => document.querySelector('[data-config="demo-pi"]') || document.querySelector('.cfg-empty'));
  await click('连接');
  if (scene.startsWith('scan-') || scene.startsWith('detected')) {
    await click('自动扫描');
    if (scene === 'scan-loading') await find(() => document.querySelector('.cfg-scan-stage'));
    else if (scene === 'scan-error') await find(() => [...document.querySelectorAll('[role="alert"]')].find(value => value.textContent?.includes('扫描失败')));
    else await find(() => document.querySelector('.cfg-discovery-manual'));
    if (scene.startsWith('detected')) {
      await click('一键配置');
      await find(() => document.querySelector('dialog[open]'));
      if (scene !== 'detected') {
        await click('检查并预览');
        await find(() => document.querySelector(scene === 'detected-checking' ? 'dialog [role="status"]' : 'dialog [role="alert"]'));
      }
    }
  } else if (scene.startsWith('manual') || scene === 'change-folder') {
    await click(scene === 'change-folder' ? '更换位置' : '手动添加');
    await find(() => document.querySelector('#manual-path'));
    if (scene === 'manual-help') (await find(() => document.querySelector<HTMLDetailsElement>('.cfg-location-help'))).open = true;
    else if (scene !== 'manual' && scene !== 'change-folder') {
      await click('选择位置');
      if (scene === 'manual-picker-error') await find(() => document.querySelector('dialog [role="alert"]'));
      else {
        await find(() => { const element = document.querySelector<HTMLInputElement>('#manual-path'); return element?.value ? element : null; });
        await click('验证配置');
        await find(() => document.querySelector('#manual-provider'));
        if (scene !== 'manual-type') {
          await input('#manual-provider', scene === 'manual-unsupported' ? 'claude' : 'pi');
          if (scene === 'manual-duplicate') await find(() => document.querySelector('dialog [role="alert"]'));
          else if (scene === 'manual-unsupported') await find(() => document.querySelector('dialog [role="status"]'));
          else {
            await click('重新检查');
            if (scene === 'manual-checking') await find(() => document.querySelector('dialog [role="status"]'));
            else {
              await find(() => document.querySelector('.cfg-dialog-check'));
              if (['manual-name', 'manual-name-empty', 'manual-save-error'].includes(scene)) {
                await click('下一步');
                await find(() => document.querySelector('#manual-name'));
                if (scene === 'manual-name-empty') { await input('#manual-name', ''); await find(() => document.querySelector<HTMLButtonElement>('.cfg-dialog-footer .co-primary:disabled')); }
                if (scene === 'manual-save-error') { await click('添加配置'); await find(() => document.querySelector('dialog [role="alert"]')); }
              }
            }
          }
        }
      }
    }
  } else {
    if (scene !== 'empty' && scene !== 'multiple') {
      // The explicit selection also opens the detail in narrow viewports.
      (await find(() => document.querySelector<HTMLButtonElement>('[data-config="demo-pi"]'))).click();
      await find(() => document.querySelector('.cfg-detail'));
    }
    if (scene.startsWith('rename')) { await click('重命名'); await find(() => document.querySelector('#config-name')); if (scene === 'rename-empty') { await input('#config-name', ''); await find(() => document.querySelector('.cfg-rename-error')); } }
    if (scene.startsWith('preview')) { await click('设置连接'); await find(() => document.querySelector('.cfg-preview')); }
    if (scene.startsWith('remove')) { await click('移除连接'); await find(() => document.querySelector('.cfg-removal')); if (scene === 'remove-error') { await click('确认移除'); await find(() => document.querySelector('.cfg-removal [role="alert"]')); } }
  }
}
