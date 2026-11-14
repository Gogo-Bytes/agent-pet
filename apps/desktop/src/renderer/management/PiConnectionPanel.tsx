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
  'already-absent': '扩展路径已无文件；只清除了本应用保存记录，没有删除目标目录或未知文件。运行中的扩展未卸载。',
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
  'removed-save-failed': '扩展路径已无文件，但保存移除结果失败；不能声称记录已清除，禁止重配。',
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
          <Flex gap="2" mt="2">
            <Button color="red" disabled={disabled} onClick={() => { setRemoving(false); void run(() => api.remove()); }}>确认停用并选择性移除</Button>
            <Button variant="soft" disabled={disabled} onClick={() => setRemoving(false)}>取消移除</Button>
          </Flex>
        </Box>}
      </>}
    </Flex>
  </section></Card>;
}
