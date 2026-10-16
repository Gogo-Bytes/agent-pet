import { useEffect, useRef, useState } from 'react';
import type { ConfigurationsState, DetectedSetupResult } from '../../shared/configurations.js';
import type { ManagementBridge } from './management-store.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';

/** Read consent for a Main-resolved default only. Closing also revokes in-flight work. */
export function DetectedSetupDialog({ installationId, targetPath, state, bridge, run, onClose, onPrepared, onCancelError }: {
  installationId: string; targetPath: string; state: ConfigurationsState; bridge: ManagementBridge;
  run(work: () => Promise<ConfigurationsState>): Promise<boolean>;
  onClose(): void; onPrepared(id: string): void;
  onCancelError(message: string): void;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ cancel(): void } | null>(null);
  useEffect(() => () => { pending.current?.cancel(); }, []);
  function close() { pending.current?.cancel(); onClose(); }
  async function prepare() {
    if (pending.current) return;
    setChecking(true); setError('');
    const requestId = crypto.randomUUID();
    let cancelled = false;
    let configurationId: string | null = null;
    let timedOut = false;
    let release!: (value: DetectedSetupResult) => void;
    const cancellation = new Promise<DetectedSetupResult>(resolve => { release = resolve; });
    const job = { cancel() {
      if (cancelled) return;
      cancelled = true;
      // Release the visible request independently of a delayed IPC reply. Main revokes the same id.
      void bridge.configurations.cancelDetected(requestId).catch(() => onCancelError('检查取消未确认；尚未部署。请重新打开配置详情核对状态后重试。'));
      release({ state, configurationId: null, reason: 'cancelled' });
    } };
    pending.current = job;
    const saved = await run(async () => {
      const result = await Promise.race([bridge.configurations.prepareDetected(installationId, requestId), cancellation]);
      if (!cancelled) { configurationId = result.configurationId; timedOut = result.reason === 'timeout'; }
      return result.state;
    });
    if (pending.current === job) pending.current = null;
    if (cancelled) return;
    setChecking(false);
    if (timedOut) setError('检查花的时间太长了，还没有添加文件。可以取消或稍后重试。');
    else if (saved && configurationId) onPrepared(configurationId);
    else if (!saved) setError('检查未完成，尚未确认结果。请重试或取消后重新扫描。');
  }
  return <Dialog label="连接 pi" className="cfg-page cfg-dialog cfg-compact-dialog" onClose={close}>
    <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="pi" /></span><h2>连接 pi</h2></div><button className="cfg-dialog-close" aria-label="取消配置检查" onClick={close}><Icon name="close" /></button></header>
      <section className="cfg-dialog-body"><p className="cfg-consent-intro">先检查配置文件夹，不会改动 pi 文件。</p><code className="cfg-file-path" title={targetPath}>{targetPath}</code>
        <details><summary>检查范围</summary><p>只检查这个文件夹及上级文件夹的安全性，读取 settings.json、extensions/package.json，并查看扩展入口和忽略规则。不读取对话、会话或登录信息，不更改原有设置，也不会启动或重新加载 pi。</p></details>
        {checking && <p role="status">正在检查，可随时取消。</p>}{error && <p role="alert">{error}</p>}
      </section><footer className="cfg-dialog-footer"><div><button className="co-secondary" onClick={close}>{checking ? '取消检查' : '取消'}</button><button className="co-primary" disabled={checking} onClick={() => void prepare()}>检查并预览<Icon name="right" /></button></div></footer>
    </div>
  </Dialog>;
}
