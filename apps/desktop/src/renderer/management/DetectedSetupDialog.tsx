import { useEffect, useRef, useState } from 'react';
import type { ConfigurationsState, DetectedSetupResult } from '../../shared/configurations.js';
import type { ManagementBridge } from './management-store.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';

/** Read consent for a Main-resolved target. Closing also revokes in-flight work. */
export function DetectedSetupDialog({ installationId, targetPath, configurationId: selectedConfigurationId, provider = 'pi', state, bridge, run, onClose, onPrepared, onCancelError }: {
  installationId: string; targetPath: string; configurationId?: string; state: ConfigurationsState; bridge: ManagementBridge;
  provider?: 'pi' | 'claude' | 'codex';
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
      const result = await Promise.race([provider === 'codex' ? (selectedConfigurationId ? bridge.configurations.prepareDetectedCodex(installationId, requestId, selectedConfigurationId) : bridge.configurations.prepareDetectedCodex(installationId, requestId)) : provider === 'claude' ? bridge.configurations.prepareDetectedClaude(installationId, requestId) : bridge.configurations.prepareDetected(installationId, requestId), cancellation]);
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
  const label = provider === 'codex' ? 'Codex CLI' : provider === 'claude' ? 'Claude Code' : 'pi';
  return <Dialog label={`连接 ${label}`} className="cfg-page cfg-dialog cfg-compact-dialog" onClose={close}>
    <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name={provider === 'codex' ? 'command' : provider === 'claude' ? 'flower' : 'pi'} /></span><h2>连接 {label}</h2></div><button className="cfg-dialog-close" aria-label="取消配置检查" onClick={close}><Icon name="close" /></button></header>
      <section className="cfg-dialog-body"><p className="cfg-consent-intro">先检查配置文件夹，不会改动 {label} 文件。</p><code className="cfg-file-path" title={targetPath}>{targetPath}</code>
        <details><summary>检查范围</summary><p>{provider === 'codex' ? '检查程序、配置文件夹及上级文件夹，并读取 hooks.json。下一步会展示预览，确认后才添加通知。' : provider === 'claude' ? '检查程序、配置文件夹及上级文件夹，并读取 settings.json。下一步会展示预览，确认后才添加连接。' : '检查配置文件夹及上级文件夹，读取 settings.json、extensions/package.json，并检查扩展入口和忽略规则。'}</p></details>
        {checking && <p role="status">正在检查，可随时取消。</p>}{error && <p role="alert">{error}</p>}
      </section><footer className="cfg-dialog-footer"><div><button className="co-secondary" onClick={close}>{checking ? '取消检查' : '取消'}</button><button className="co-primary" disabled={checking} onClick={() => void prepare()}>检查并预览<Icon name="right" /></button></div></footer>
    </div>
  </Dialog>;
}
