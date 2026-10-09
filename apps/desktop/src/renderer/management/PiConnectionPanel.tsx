import { useEffect, useRef, useState } from 'react';
import { Box, Button, Callout, Card, Flex, Heading, Text } from '@radix-ui/themes';
import type { PiConnectionApi, PiConnectionState } from '../../shared/pi-connection.js';
import { findingText } from '../../shared/pi-preflight.js';

const statusText: Record<PiConnectionState['status'], string> = {
  'not-configured': '未配置', 'configured-waiting': '已配置，等待加载 / 连接',
  connected: '已连接（收到 legacy hello）', disconnected: '连接已断开', failed: '失败',
};
const noticeText: Record<PiConnectionState['notice'], string> = {
  none: '', 'choose-target': '请先用上方原生选择器选择现有 pi 配置目录；默认候选不能直接部署。',
  busy: '前一操作尚未结束。', 'invalid-plan': '预览已失效，请重新预览；未开始本次部署。',
  'preview-failed': '无法完成预览；未写入或启动连接。', 'stale-plan': '目标在预览后变化；未部署。请检查目标，重启应用后重新选择。',
  'deploy-failed-preserved': '部署失败，可能存在不确定的文件或目录；已保留，不自动删除或重试。',
  'start-failed': '桥接启动失败；若已部署，文件和本次撤回凭证仍保留。',
  'runtime-failed': '无法创建私有运行目录；未部署或启动连接，不会删除已有对象。',
  removed: '本次扩展文件已移除；不确定、非空或外部修改的目录可能保留。运行中的扩展未卸载。',
  'retained-changed': '文件已变化，保留原状；接收已停止，运行中的扩展未卸载。',
  'retained-unknown': '没有可用的本次所有权凭证；不会移除未知文件。',
  'failed-preserved': '撤回未完成；接收已停止，文件与可用凭证保留，可重试。运行中的扩展未卸载。',
  'saved-invalid': '私有保存记录无效、权限不安全或有未完成写入；已拒绝恢复，不会修复、覆盖或删除。',
  'save-failed': '保存结果不确定；保留文件与所有权，未确认持久化成功。若接收已停止，下次启动也不会自动恢复。',
  'resume-required': '已读取私有保存记录；尚未读取目标或开始监听。仅点击恢复才校验原目录与文件。',
  'resume-refused': '恢复被拒绝：原运行目录或扩展已缺失/变化，或端点已存在。不会重建目录、删除 socket 或重新部署。',
  disabled: '已停止接收并保存停用状态；扩展文件保留，运行中的扩展未卸载。',
  'stop-failed': '停止接收失败；不能保证接收已停止。保存结果见下方；重启不会自动恢复。',
  'stop-save-failed': '停止接收和保存停用状态均未确认成功；文件与所有权保留，重启不会自动恢复。',
  'removed-save-failed': '扩展文件已移除，但保存移除结果失败；不能声称记录已清除，禁止重配。',
  stopped: '本次接收已停止；配置文件不会随退出自动删除。',
};

export function PiConnectionPanel({ api }: { api: PiConnectionApi }) {
  const [state, setState] = useState<PiConnectionState | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const active = useRef(false);
  const pending = useRef(false);
  const revision = useRef(-1);
  useEffect(() => {
    active.current = true; revision.current = -1;
    const accept = (value: PiConnectionState) => {
      if (active.current && value.revision >= revision.current) { revision.current = value.revision; setState(value); }
    };
    const off = api.subscribe(accept);
    void api.getState().then(accept, () => { if (active.current) setError(true); });
    return () => { active.current = false; off(); };
  }, [api]);
  async function run(action: () => Promise<PiConnectionState>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(false);
    try {
      const value = await action();
      if (active.current && value.revision >= revision.current) { revision.current = value.revision; setState(value); }
    } catch { if (active.current) setError(true); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  const disabled = busy || state?.busy;
  return <Card asChild size="3"><section aria-label="pi 授权接入">
    <Flex direction="column" gap="3">
      <Heading as="h3" size="4">授权部署与连接 · 本机试用</Heading>
      <Text as="p" role="status">连接状态：{state ? statusText[state.status] : '正在读取…'}</Text>
      <Text as="p">此入口不扫描或启动 pi。先在上方选择现有配置目录，再明确同意读取预览；选择目录本身不是写入授权。</Text>
      <Text as="p" size="2">预览读取范围：所选目录和祖先的安全 metadata，settings.json、extensions/package.json，固定入口 index.ts / index.js / agent-pet.ts 及两级 .gitignore / .ignore / .fdignore 的存在与 metadata。不读取会话或对话。取消预览不会写入文件或启动监听。</Text>
      <Text as="p" size="2">连接依据是最近一次已验证 token 的 legacy hello / 断线通知，不是 managed auth/ack，也不是所有 Session 的在线汇总。在线不等于业务状态已验收。</Text>
      <Callout.Root color="amber"><Callout.Text>确认部署会在应用 userData 的固定 pi-connection 目录（0700）内私有保存连接凭据与所有权（0600）。退出停止接收但保留记录与原运行目录。重启只读私有记录，不读目标、不自动监听；须明确点击“恢复已保存连接”。停用状态也会保存。旧版本未保存的文件不会自动认领。/tmp 丢失或系统重启可能使原端点不可恢复；不会重建或抢占端点。刷新页面只取消旧预览。</Callout.Text></Callout.Root>
      {state?.mode === 'development-env' && <Text as="p">检测到显式开发环境配置；本入口不会替换、回退或创建第二个桥接。请自行管理原开发配置。</Text>}
      {error && <Callout.Root role="alert" color="red"><Callout.Text>请求失败，未确认操作结果。请重新读取状态，不要假定部署或移除成功。</Callout.Text></Callout.Root>}
      {state?.notice !== undefined && state.notice !== 'none' && <Callout.Root role="status"><Callout.Text>{noticeText[state.notice]}</Callout.Text></Callout.Root>}
      <Flex wrap="wrap" gap="2">
        <Button disabled={disabled || !state?.canConfigure} onClick={() => { setRemoving(false); void run(() => api.preview()); }}>同意读取所选目标并预览部署</Button>
        <Button variant="soft" disabled={disabled} onClick={() => { void run(() => api.getState()); }}>刷新连接状态</Button>
      </Flex>
      {state?.preview && <Box asChild><section aria-label="部署预览">
        <Heading as="h4" size="3" mb="2">部署预览</Heading>
        <Text as="p">目标：{state.preview.target.path}</Text>
        <Text as="p">{state.preview.action === 'create' ? '独占新建私有文件（0600），不覆盖：' : '阻止部署：'}{state.preview.path}</Text>
        <Text as="p">待创建目录：{state.preview.createDirectories.join('、') || '无'}</Text>
        {state.preview.findings.map(f => <Text as="p" key={f}>{findingText[f]}</Text>)}
        <Text as="p" mt="2">确认将写入上述扩展并启动本次私有桥接，凭据只由 Main 持有，并按上方政策私有持久化；重启后必须明确恢复。不会更改 settings、ignore 或 trust。该目录须是 pi 活跃配置根，扩展须启用，项目须按需信任。请自行在安全时机打开 pi 或 /reload；本应用不会自动加载、重载或控制 Agent。</Text>
        <Flex gap="2" mt="3">
          <Button disabled={disabled || state.preview.action !== 'create'} onClick={() => { const id = state.preview!.id; void run(() => api.confirm(id)); }}>确认部署并开始接收</Button>
          <Button variant="soft" disabled={disabled} onClick={() => { void run(() => api.cancel()); }}>取消预览</Button>
        </Flex>
      </section></Box>}
      {state && <Text as="p">接收：{state.receiving === 'active' ? '监听中' : state.receiving === 'stopped' ? '已停止' : '结果不确定'}；保存：{({ none: '无', ready: '已保存（重启需明确恢复）', disabled: '已保存停用', invalid: '记录无效', uncertain: '结果不确定' })[state.saved]}</Text>}
      {state?.canResume && <Button disabled={disabled} onClick={() => { void run(() => api.resume()); }}>恢复已保存连接</Button>}
      {state?.canRemove && <Button variant="soft" disabled={disabled} onClick={() => { void run(() => api.disable()); }}>停用接收并保存（保留文件）</Button>}
      {state?.deployedPath && <Text as="p">本次部署文件：{state.deployedPath}</Text>}
      {state?.canRemove && <>
        <Button color="red" variant="soft" disabled={disabled} onClick={() => setRemoving(true)}>停用接收并撤回本次文件…</Button>
        {removing && <Box>
          <Text as="p">仅移除仍匹配本次凭证、身份与内容的文件；保留用户修改和未知对象。停止接收与删除文件都不表示运行中扩展已卸载，请自行安全重载或关闭 pi。</Text>
          <Flex gap="2" mt="2">
            <Button color="red" disabled={disabled} onClick={() => { setRemoving(false); void run(() => api.remove()); }}>确认停用并选择性移除</Button>
            <Button variant="soft" disabled={disabled} onClick={() => setRemoving(false)}>取消移除</Button>
          </Flex>
        </Box>}
      </>}
    </Flex>
  </section></Card>;
}
