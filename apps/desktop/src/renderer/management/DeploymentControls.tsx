import type { AgentConfiguration, ConfigurationsState } from '../../shared/configurations.js';
import type { ConfigurationsApi } from '../../shared/configurations.js';
import { findingText } from '../../shared/pi-preflight.js';
import { noticeText } from './connection-copy.js';
export function DeploymentControls({ record, api, run, busy }: { record: AgentConfiguration; api: ConfigurationsApi; run: (action: () => Promise<ConfigurationsState>) => Promise<boolean>; busy: boolean }) {
  const state = record.connection;
  if (!state) return <p className="cfg-notice">此 Agent 的接入尚未支持。配置可以保留，暂不能接收状态。</p>;
  const disabled = busy || state.busy;
  const notice = state.notice === 'resume-required' && state.saved === 'disabled'
    ? '已保存停用；当前未开始监听。点击恢复后会校验原目录与文件，再开始接收。'
    : noticeText[state.notice];
  return <div className="cfg-deployment">
    {state.notice !== 'none' && <p className="cfg-notice" role="status">{notice}</p>}
    {state.canConfigure && <>
      <p>接入前会预览读取范围和改动，确认后才写入。配置可用不表示 Agent 已在线。</p>
      <details><summary>读取与保存说明</summary><p>只检查所选目录及祖先 metadata、settings.json、extensions/package.json、固定入口和 ignore 的存在。不读取对话、Session 或登录凭据。确认后，仅新建 extensions/agent-pet.ts；私有接收凭据与所有权保存于本应用数据目录，重启需明确恢复。不改 settings、ignore 或 trust，不启动或重载 Agent。</p></details>
      <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.preview(record.id))}>预览接入改动</button>
    </>}
    {state.preview && <section className="cfg-preview" aria-label="部署预览"><h3>部署预览</h3><code>{state.preview.path}</code>
      <p>{state.preview.action === 'create' ? '独占新建私有文件（0600），不会覆盖。' : '检测到问题，已阻止部署。'}</p>
      <p>待创建目录：{state.preview.createDirectories.join('、') || '无'}</p>
      {state.preview.findings.map(finding => <p key={finding}>{findingText[finding]}</p>)}
      {record.installation && state.preview.action === 'blocked' && state.preview.findings.some(value => ['unsafe', 'missing-target', 'unreadable'].includes(value)) && <p>默认位置尚未初始化时，请先正常打开一次 pi 完成初始化，再重新预览；已有目录请检查权限，或通过手动添加使用自定义配置。</p>}
      <p>确认后开始接收并保存私有凭据（目录 0700、文件 0600）。退出保留配置，重启不自动监听；原 /tmp 目录丢失或端点存在时拒绝恢复。请自行在安全时机打开 pi 或 /reload。扩展需要启用，配置根和项目信任需要正确；这里不会更改这些设置。</p>
      <div className="cfg-form-actions"><button className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>取消预览</button>
        <button className="cfg-primary" disabled={disabled || state.preview.action !== 'create'} onClick={() => void run(() => api.confirm(record.id, state.preview!.id))}>确认部署并开始接收</button></div>
    </section>}
    {state.canResume && <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.resume(record.id))}>恢复已保存连接</button>}
    {state.canRemove && <button className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.disable(record.id))}>停用接收并保留文件</button>}
  </div>;
}
