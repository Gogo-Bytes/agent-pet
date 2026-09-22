import { useEffect, useRef, useState } from 'react';
import { Badge, Box, Button, Callout, Card, Flex, Heading, RadioGroup, Text } from '@radix-ui/themes';
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
  return <Card asChild size="3"><section aria-label="pi 只读预检">
    <Flex direction="column" gap="3">
      <Heading as="h3" size="4">pi</Heading>
      <Box><Badge>P2a · 检测与只读预检</Badge></Box>
      <Text as="p">仅检测安装候选与用户指定的配置目标，不执行 pi、shell 或扩展，不修改配置。</Text>
      <Text as="p">安装和连接尚未开放。本页不查询开发桥接，不表示已配置、在线或离线。</Text>
      <Flex wrap="wrap" gap="2">
        <Button onClick={() => { void run(() => api.detect()); }}>检测 / 重新扫描</Button>
        <Button variant="soft" onClick={() => { void run(() => api.chooseInstallation()); }}>选择安装包目录</Button>
      </Flex>
      {busy && <Text as="p" role="status" color="gray">正在处理只读请求…</Text>}
      {error && <Callout.Root role="alert" color="red"><Callout.Text>预检请求失败，请重试；未确认任何更改。</Callout.Text></Callout.Root>}
      {state && <>
        <Text as="p">扫描：{state.scan === 'not-run' ? '尚未发起' : state.scan === 'limited' ? '达到预算，结果不完整' : '有限位置检测完成'}</Text>
        {state.scan !== 'not-run' && state.installations.length === 0 && <Text as="p">未找到安装候选；可手动选择。GUI PATH 不代表终端 PATH，alias / wrapper 参数未知。</Text>}
        <Text as="p" id="pi-installation-label" weight="medium">安装身份（不决定配置目录）</Text>
        <RadioGroup.Root name="pi-installation" aria-labelledby="pi-installation-label"
          value={state.selectedInstallation ?? ''} onValueChange={id => { void run(() => api.selectInstallation(id)); }}>
          {state.installations.map(candidate => <RadioGroup.Item key={candidate.id} value={candidate.id} className="preflight-candidate">
            <Text as="span">{candidate.path}<br />{candidate.compatibility === 'verified-0.85.1' ? '标准 pi 0.85.1 元数据已核实（非签名验证）' : `未验证 / 待支持${candidate.version ? ` · ${candidate.version}` : ''}`}</Text>
          </RadioGroup.Item>)}
        </RadioGroup.Root>
        <Heading as="h4" size="3">配置目标（agentDir）</Heading>
        <Text as="p" className="preflight-path">{state.target.path}</Text>
        <Text as="p">{state.target.source === 'default' ? '默认候选' : '手动选择'}，不保证是活跃终端使用的目录。选择本身不读取配置；点击检查才读取必要配置。</Text>
        <Flex wrap="wrap" gap="2">
          <Button variant="soft" onClick={() => { void run(() => api.chooseTarget()); }}>选择配置目录</Button>
          <Button variant="soft" onClick={() => { void run(() => api.useDefaultTarget()); }}>使用默认候选</Button>
          <Button onClick={() => { void run(() => api.inspect()); }}>检查所选目标（只读）</Button>
        </Flex>
        {state.notice !== 'none' && <Callout.Root role="status"><Callout.Text>{state.notice === 'cancelled' ? '已取消选择；目标未更改。' : state.notice === 'busy' ? '前一操作尚未结束，请稍后重试。' : '未能完成检测或选择，请重试。'}</Callout.Text></Callout.Root>}
        {state.inspection && <Box asChild><section aria-label="预检结果">
          <Heading as="h4" size="3" mb="3">预检结果</Heading>
          <Callout.Root color="amber">
            {state.inspection.findings.length ? <Box asChild m="0" pl="4"><ul>
              {state.inspection.findings.map(code => <Text asChild key={code}><li>{findingText[code]}</li></Text>)}
            </ul></Box> : <Callout.Text>有限检查未发现上述冲突；不是安装或加载保证。</Callout.Text>}
          </Callout.Root>
          {selected?.compatibility !== 'verified-0.85.1' && <Text as="p" mt="3">尚未选定已核实的标准 pi 0.85.1 安装；兼容性待确认。</Text>}
          <Text as="p" mt="3">ACL、网络文件系统、运行时 --no-extensions / -e、项目规则和活跃配置仍无法确认。存在冲突或未知规则时，不可据此进入写入。</Text>
        </section></Box>}
      </>}
      <Text as="p" color="gray" size="2">GUI PATH 不代表终端环境；alias / wrapper 参数未知。不扫描会话或整个磁盘，不解析 shell 配置；不改变 ignore、settings 或 trust。打开原 Session 窗口目前不受支持。</Text>
    </Flex>
  </section></Card>;
}
