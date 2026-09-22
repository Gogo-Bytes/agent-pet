import { useEffect, useRef, useState } from 'react';
import { Cat, Cable, Settings } from 'lucide-react';
import { Box, Button, Callout, Card, Checkbox, Flex, Grid, Heading, TabNav, Text, Theme } from '@radix-ui/themes';
import type { ManagementState } from '../../shared/preferences.js';
import { PiPreflightPanel } from './PiPreflightPanel.js';
import { PetSizeControl } from './PetSizeControl.js';

export function ManagementApp({ bridge = window.management }: { bridge?: Window['management'] }) {
  const [page, setPage] = useState('Agent 连接');
  const [state, setState] = useState<ManagementState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sizeSaving, setSizeSaving] = useState(false);
  const mounted = useRef(false);
  const pushRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let pushed = false;
    const off = bridge.subscribe(value => { pushed = true; if (active) { pushRevision.current++; setState(value); } });
    void bridge.getState().then(value => { if (active && !pushed) setState(value); }, () => { if (active) setError('无法读取应用设置，请重试。'); });
    return () => { active = false; mounted.current = false; off(); };
  }, [bridge]);
  async function change(action: () => Promise<ManagementState>) {
    if (sizeSaving) return;
    setBusy(true); setError('');
    const revision = pushRevision.current;
    try { const confirmed = await action(); if (mounted.current && pushRevision.current === revision) setState(confirmed); }
    catch { setError('操作失败，未确认更改。请重试。'); }
    finally { setBusy(false); }
  }
  async function resize(petSize: number) {
    const revision = pushRevision.current;
    const confirmed = await bridge.updatePreferences({ petSize });
    if (!mounted.current) return null;
    if (pushRevision.current === revision) setState(confirmed);
    // Main publishes even failed writes before replying; still stop failed commit queues.
    return confirmed.preferenceError;
  }
  return <Theme appearance="light" accentColor="indigo" grayColor="slate" radius="large">
    <Grid className="management-shell">
      <Box asChild p="4" className="management-sidebar"><aside>
        <Heading as="h1" size="5" mb="5">Agent Pet</Heading>
        <TabNav.Root aria-label="管理导航" className="management-navigation">
          {([['Agent 连接', Cable], ['宠物', Cat], ['设置', Settings]] as const).map(([name, Icon]) =>
            <TabNav.Link key={name} active={page === name} asChild>
              <button type="button" aria-label={name} onClick={() => setPage(name)}>
                <Flex as="span" align="center" gap="2"><Icon size={19} aria-hidden="true" />{name}</Flex>
              </button>
            </TabNav.Link>)}
        </TabNav.Root>
        <Text as="p" color="gray" size="2" mt="5" className="sidebar-note">macOS 预览版 · P2a</Text>
      </aside></Box>
      <Box asChild p={{ initial: '4', sm: '6' }} className="management-main"><main>
        <Heading as="h2" size="6" mb="3">{page}</Heading>
        <Text as="p" color="gray" size="2" mb="4">关闭此窗口后，宠物与已配置的开发桥接继续运行。可从菜单栏重新打开；退出请使用“退出 Agent Pet”。</Text>
        {error && <Callout.Root role="alert" color="red" mb="3"><Callout.Text>{error}</Callout.Text></Callout.Root>}
        {!state && error && <Button disabled={busy || sizeSaving} onClick={() => { void change(() => bridge.getState()); }}>重新读取设置</Button>}
        {page !== '宠物' && state?.preferenceError && <Callout.Root role="alert" color="red" mb="3"><Callout.Text>{state.preferenceError}</Callout.Text></Callout.Root>}
        {/* Plain hidden/inert boundaries cannot be overridden by Themes layout display rules.
            Keep connection and pet request owners mounted across navigation. */}
        <div hidden={page !== 'Agent 连接'} inert={page !== 'Agent 连接'}>
          <Flex direction="column" gap="4">
            <Card asChild size="3"><section>
              <Heading as="h3" size="4" mb="3">让宠物关注你的工作</Heading>
              <Text as="p">只读观察 Session 名称和状态，不读取对话正文，也不控制 Agent。</Text>
            </section></Card>
            <PiPreflightPanel api={bridge.piPreflight} />
            <Card asChild size="3"><section><Heading as="h3" size="4" mb="3">其他 Agent</Heading><Text as="p">Codex 和 Claude Code 接入尚不支持。</Text></section></Card>
          </Flex>
        </div>
        <div hidden={page !== '宠物'} inert={page !== '宠物'}>
          <Flex direction="column" gap="4">
            <Card asChild size="3"><section>
              <Heading as="h3" size="4" mb="3">当前宠物 · starter.glb</Heading>
              <Text as="p" mb="3">沿用应用内置模型。当前没有其他形象或模型导入功能。</Text>
              <Text as="p" color="gray" size="2">直接在桌面查看宠物；管理窗口不运行第二个 3D 预览。</Text>
            </section></Card>
            <Card asChild size="3"><section>
              <Heading as="h3" size="4" mb="3">显示与尺寸</Heading>
              {state ? <Box>
                <Text as="label"><Flex as="span" align="center" gap="2">
                  <Checkbox disabled={busy || sizeSaving} checked={state.preferences.petVisible} onCheckedChange={checked => { void change(() => bridge.updatePreferences({ petVisible: checked === true })); }} />显示宠物
                </Flex></Text>
                <PetSizeControl confirmedSize={state.preferences.petSize} preferenceError={state.preferenceError}
                  disabled={busy} visible={page === '宠物'} save={resize} onSavingChange={setSizeSaving} />
              </Box> : <Text as="p">正在读取偏好…</Text>}
            </section></Card>
          </Flex>
        </div>
        {page === '设置' && <Flex direction="column" gap="4">
          <Card asChild size="3"><section>
            <Heading as="h3" size="4" mb="3">启动</Heading>
            {state ? <>
              <Text as="label"><Flex as="span" align="center" gap="2">
                <Checkbox disabled={busy || sizeSaving || !state.login.supported} checked={state.login.enabled} onCheckedChange={checked => { void change(() => bridge.setLogin(checked === true)); }} />登录时启动 Agent Pet
              </Flex></Text>
              <Text as="p" mt="3">默认关闭，不会在启动应用时自动注册登录项。</Text>
              {!state.login.supported && <Text as="p" color="gray" size="2" mt="3">仅打包后的 macOS 应用支持。开发模式不会将 Electron 加入登录项。</Text>}
              {state.login.error && <Callout.Root role="alert" color="red" mt="3"><Callout.Text>{state.login.error}</Callout.Text></Callout.Root>}
            </> : <Text as="p">正在读取设置…</Text>}
          </section></Card>
          <Card asChild size="3"><section>
            <Heading as="h3" size="4" mb="3">关于与数据</Heading>
            <Text as="p" mb="3">P2a 只读预检，非一键接入或正式发布验收。</Text>
            <Text as="p" mb="3">偏好仅保存宠物显隐与大小。Session 未读状态不会跨重启保存。登录项以系统实际状态为准。</Text>
            <Text as="p">所有窗口隐藏后，仍可通过菜单栏、Dock 或重新打开应用找回管理窗口。</Text>
          </section></Card>
        </Flex>}
      </main></Box>
    </Grid>
  </Theme>;
}
