import { useEffect, useRef, useState } from 'react';
import { findingText, type PiPreflightApi, type PreflightState } from '../../shared/pi-preflight.js';

export function PiPreflightPanel({ api }: { api: PiPreflightApi }) {
  const [state, setState] = useState<PreflightState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    const current = ++request.current;
    void api.getState().then(value => { if (current === request.current) setState(value); }, () => { if (current === request.current) setError(true); });
    return () => { request.current++; };
  }, [api]);
  async function run(action: () => Promise<PreflightState>) {
    const current = ++request.current;
    setBusy(true); setError(false);
    try { const value = await action(); if (current === request.current) setState(value); }
    catch { if (current === request.current) setError(true); }
    finally { if (current === request.current) setBusy(false); }
  }
  const selected = state?.installations.find(candidate => candidate.id === state.selectedInstallation);
  return <section aria-label="pi 只读预检"><h3>pi</h3><span className="badge">P2a · 检测与只读预检</span>
    <p>仅检测安装候选与用户指定的配置目标，不执行 pi、shell 或扩展，不修改配置。</p>
    <p>安装和连接尚未开放。本页不查询开发桥接，不表示已配置、在线或离线。</p>
    <div className="preflight-actions">
      <button onClick={() => { void run(() => api.detect()); }}>检测 / 重新扫描</button>
      <button onClick={() => { void run(() => api.chooseInstallation()); }}>选择安装包目录</button>
    </div>
    {busy && <p role="status">正在处理只读请求…</p>}
    {error && <p role="alert">预检请求失败，请重试；未确认任何更改。</p>}
    {state && <>
      <p>扫描：{state.scan === 'not-run' ? '尚未发起' : state.scan === 'limited' ? '达到预算，结果不完整' : '有限位置检测完成'}</p>
      {state.scan !== 'not-run' && state.installations.length === 0 && <p>未找到安装候选；可手动选择。GUI PATH 不代表终端 PATH，alias / wrapper 参数未知。</p>}
      <fieldset><legend>安装身份（不决定配置目录）</legend>
        {state.installations.map(candidate => <label className="preflight-candidate" key={candidate.id}>
          <input type="radio" name="pi-installation" checked={candidate.id === state.selectedInstallation} onChange={() => { void run(() => api.selectInstallation(candidate.id)); }} />
          <span>{candidate.path}<br />{candidate.compatibility === 'verified-0.85.1' ? '标准 pi 0.85.1 元数据已核实（非签名验证）' : `未验证 / 待支持${candidate.version ? ` · ${candidate.version}` : ''}`}</span>
        </label>)}
      </fieldset>
      <h4>配置目标（agentDir）</h4><p className="preflight-path">{state.target.path}</p>
      <p>{state.target.source === 'default' ? '默认候选' : '手动选择'}，不保证是活跃终端使用的目录。选择本身不读取配置；点击检查才读取必要配置。</p>
      <div className="preflight-actions">
        <button onClick={() => { void run(() => api.chooseTarget()); }}>选择配置目录</button>
        <button onClick={() => { void run(() => api.useDefaultTarget()); }}>使用默认候选</button>
        <button onClick={() => { void run(() => api.inspect()); }}>检查所选目标（只读）</button>
      </div>
      {state.notice !== 'none' && <p role="status">{state.notice === 'cancelled' ? '已取消选择；目标未更改。' : state.notice === 'busy' ? '前一操作尚未结束，请稍后重试。' : '未能完成检测或选择，请重试。'}</p>}
      {state.inspection && <div aria-label="预检结果"><h4>预检结果</h4>
        {state.inspection.findings.length ? <ul>{state.inspection.findings.map(code => <li key={code}>{findingText[code]}</li>)}</ul> : <p>有限检查未发现上述冲突；不是安装或加载保证。</p>}
        {selected?.compatibility !== 'verified-0.85.1' && <p>尚未选定已核实的标准 pi 0.85.1 安装；兼容性待确认。</p>}
        <p>ACL、网络文件系统、运行时 --no-extensions / -e、项目规则和活跃配置仍无法确认。存在冲突或未知规则时，不可据此进入写入。</p>
      </div>}
    </>}
    <p className="muted">GUI PATH 不代表终端环境；alias / wrapper 参数未知。不扫描会话或整个磁盘，不解析 shell 配置；不改变 ignore、settings 或 trust。打开原 Session 窗口目前不受支持。</p>
  </section>;
}
