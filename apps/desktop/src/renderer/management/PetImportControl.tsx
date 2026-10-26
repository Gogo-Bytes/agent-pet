import { useEffect, useRef, useState } from 'react';
import type { PetAssetsApi, PetImportPreview } from '../../shared/pet-assets.js';
import { GlassButton } from '../shared/ui/Glass.js';

const failures: Record<string, string> = {
  duplicate: '这个宠物已在收藏中。', limit: '宠物收藏已达到数量上限。',
  busy: '文件选择尚未结束，请稍后重试。', 'saved-invalid': '收藏记录无法读取，已停止导入。',
  'not-supported': '当前环境不支持宠物导入。',
};

export function PetImportControl({ api, disabled, onImported }: {
  api: PetAssetsApi; disabled: boolean; onImported: (id: string) => void;
}) {
  const [preview, setPreview] = useState<PetImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const working = useRef(false);
  const pending = useRef<PetImportPreview | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const value = pending.current; pending.current = null;
      if (value) void api.cancel(value.token).catch(() => {});
    };
  }, [api]);
  async function choose() {
    if (working.current || disabled) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await api.choose();
      if (!mounted.current) {
        if (result.ok) await api.cancel(result.preview.token);
        return;
      }
      if (result.ok) { pending.current = result.preview; setPreview(result.preview); }
      else if (result.reason !== 'cancelled') setError(failures[result.reason] ?? '无法导入：请检查 pet.json、pet.glb 和文件大小，仅支持自包含模型。');
    } catch { if (mounted.current) setError('无法读取宠物文件夹，请重试。'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  async function cancel() {
    const value = pending.current;
    if (!value || working.current) return;
    pending.current = null; setPreview(null); setError('');
    try { await api.cancel(value.token); }
    catch { if (mounted.current) setError('取消未确认，请关闭管理窗口以释放预览。'); }
  }
  async function confirm() {
    const value = pending.current;
    if (!value || working.current || disabled) return;
    working.current = true; setBusy(true); setError('');
    try {
      const state = await api.confirm(value.token);
      if (!state.records.some(asset => asset.id === value.manifest.id)) throw new Error('收藏中未找到导入结果，请重新读取状态。');
      if (mounted.current) onImported(value.manifest.id);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '导入未完成，文件可能已保留，请重新读取状态。');
    } finally {
      pending.current = null; working.current = false;
      if (mounted.current) { setBusy(false); setPreview(null); }
    }
  }
  return <>
    {!preview && <GlassButton disabled={disabled || busy} onClick={() => void choose()}>{busy ? '正在读取…' : '添加宠物'}</GlassButton>}
    {preview && <section className="pet-import-preview" aria-label="导入预览">
      <strong>{preview.manifest.id}</strong>
      <span>{preview.modelBytes < 1024 * 1024 ? `${Math.ceil(preview.modelBytes / 1024)} KB` : `${(preview.modelBytes / 1024 / 1024).toFixed(1)} MB`} · {preview.manifest.license}</span>
      <span>复制预览时的文件到收藏，原文件不变。加载后播放模型已有动画。</span>
      <div><GlassButton disabled={disabled || busy} onClick={() => void confirm()}>{busy ? '正在导入…' : '确认导入'}</GlassButton>
        <GlassButton disabled={busy} onClick={() => void cancel()}>取消导入</GlassButton></div>
    </section>}
    {error && <p role="alert">{error}</p>}
  </>;
}
