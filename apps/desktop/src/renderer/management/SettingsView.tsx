import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { defaultPreferences, type ManagementState, type PreferencePatch, type Preferences } from '../../shared/preferences.js';
import { Icon, type IconName } from './components/icons.js';
import './settings.css';

const sections = [
  { id: 'render', label: '渲染', title: '场景渲染', copy: '选择画质档位，或单独调整帧率与清晰度。', detail: '画质与性能', icon: 'monitor' },
  { id: 'app', label: '软件', title: '软件行为', copy: '设置应用入口、启动与退出方式。', detail: '入口与启动', icon: 'software' },
  { id: 'pet', label: '宠物', title: '桌面宠物', copy: '调整宠物大小、显示方式和动画。', detail: '显示与动作', icon: 'pet' },
  { id: 'reminders', label: '提醒', title: '任务提醒', copy: '选择需要显示的任务提醒。', detail: '完成与出错', icon: 'bell' },
  { id: 'about', label: '关于', title: '关于 Agent Pet', copy: '', detail: '项目与使用说明', icon: 'info' },
] as const;
type Section = typeof sections[number]['id'];
type BooleanKey = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences];
const presets = [
  { name: '省电', fps: 30, resolution: 75, copy: '减少耗电', icon: 'leaf' },
  { name: '均衡', fps: 60, resolution: 100, copy: '日常推荐', icon: 'gauge' },
  { name: '清晰', fps: 60, resolution: 150, copy: '细节优先', icon: 'sparkles' },
] as const;

type SettingsProps = {
  visible: boolean;
  state: ManagementState | null;
  busy: boolean;
  onChange: (patch: PreferencePatch) => void;
  onLogin: (enabled: boolean) => void;
  onReset: () => Promise<void>;
  error?: string;
  onOpenProject?: () => void;
};

export function SettingsView({ visible, state, busy, onChange, onLogin, onReset, error, onOpenProject }: SettingsProps) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const categories = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const [section, setSection] = useState<Section>('render');
  const [resetting, setResetting] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState('');
  const [notice, setNotice] = useState('');
  const values = state?.preferences ?? defaultPreferences;
  const disabled = busy || !state;
  const selected = sections.find(item => item.id === section)!;
  const preset = presets.find(item => item.fps === values.fps && item.resolution === values.resolution);
  const [sizeDraft, setSizeDraft] = useState(values.petSize);
  const sizePending = useRef(false);
  const sizePercent = Math.round(sizeDraft / 140 * 100);
  useEffect(() => { setSizeDraft(values.petSize); sizePending.current = false; }, [values.petSize, state?.preferenceError]);
  function commitSize() {
    if (!sizePending.current || disabled) return;
    sizePending.current = false;
    update({ petSize: sizeDraft });
  }
  const failure = error || state?.preferenceError || state?.login.error;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!resetting) return;
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [resetting]);
  useEffect(() => { if (!visible) setResetting(false); }, [visible]);

  useEffect(() => {
    const nav = categories.current;
    if (!visible || !nav || typeof ResizeObserver === 'undefined') return;
    const reveal = () => {
      const selected = nav.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!selected) return;
      const item = selected.getBoundingClientRect(), bounds = nav.getBoundingClientRect();
      if (item.top < bounds.top) nav.scrollTop += item.top - bounds.top;
      else if (item.bottom > bounds.bottom) nav.scrollTop += item.bottom - bounds.bottom;
      if (item.left < bounds.left) nav.scrollLeft += item.left - bounds.left;
      else if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right;
    };
    const observer = new ResizeObserver(reveal); observer.observe(nav); reveal();
    return () => observer.disconnect();
  }, [visible, section]);

  function endReset() {
    setResetting(false);
    setResetError('');
    requestAnimationFrame(() => {
      if (resetTrigger.current?.closest('[hidden]')) return;
      resetTrigger.current?.focus({ preventScroll: true });
    });
  }
  async function confirmReset() {
    if (resetPending) return;
    setResetPending(true);
    setResetError('');
    try {
      await onReset();
      if (!mounted.current) return;
      setNotice('所有偏好已恢复默认。');
      endReset();
    } catch {
      if (mounted.current) setResetError('恢复默认失败，未确认更改。请重试。');
    } finally {
      if (mounted.current) setResetPending(false);
    }
  }
  function update(patch: PreferencePatch) {
    setNotice('');
    onChange(patch);
  }
  function toggle(key: BooleanKey, title: string, copy: string, unavailable = false) {
    return <PreferenceSwitch title={title} copy={copy} checked={values[key]} disabled={disabled || unavailable}
      onChange={() => update({ [key]: !values[key] })} />;
  }
  function chooseSection(value: Section, button: HTMLButtonElement) {
    setSection(value);
    setNotice('');
    scrollArea.current?.scrollTo({ top: 0 });
    const nav = button.parentElement;
    if (!nav) return;
    const item = button.getBoundingClientRect();
    const bounds = nav.getBoundingClientRect();
    if (item.top < bounds.top) nav.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) nav.scrollTop += item.bottom - bounds.bottom;
    if (item.left < bounds.left) nav.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right;
  }

  return <section hidden={!visible} className="preferences-page" aria-label="应用偏好" data-section={section}
    onKeyDown={event => { if (event.key.startsWith('Arrow')) event.stopPropagation(); }}>
    <aside className="preferences-sidebar">
      <nav ref={categories} className="preferences-nav" aria-label="设置分类">
        {sections.map((item, index) => <button key={item.id} aria-pressed={section === item.id}
          onClick={event => chooseSection(item.id, event.currentTarget)}>
          <Icon name={item.icon} size={19} />
          <span><strong>{item.label}</strong><small>{item.detail}</small></span>
          <span className="preferences-nav-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <Icon name="right" size={14} className="preferences-nav-arrow" />
        </button>)}
      </nav>
      <button ref={resetTrigger} className="preferences-reset-trigger" aria-label="恢复默认" title="恢复默认"
        disabled={disabled || resetPending} onClick={() => { setResetError(''); setResetting(true); }}>
        <span className="preferences-reset-icon" aria-hidden="true"><Icon name="replay" size={18} /></span>
        <span>恢复默认</span>
      </button>
    </aside>
    <div ref={scrollArea} className="preferences-content">
      {section !== 'about' && <header className="preferences-heading"><h1>{selected.title}</h1><p>{selected.copy}</p></header>}
      {section === 'about' ? <AboutDocument onOpenProject={onOpenProject} /> : <div className="preferences-controls">
        {section === 'render' && <>
          <div className="render-presets" role="group" aria-label="画质档位">
            {presets.map(item => <button key={item.name} aria-pressed={preset === item} disabled={disabled}
              onClick={() => update({ fps: item.fps, resolution: item.resolution })}>
              <span className="render-preset-top"><Icon name={item.icon} size={23} />
                <span className="render-preset-selected">{preset === item && <Icon name="check" size={14} />}</span>
              </span>
              <strong>{item.name}</strong><span className="render-preset-copy">{item.copy}</span>
              <span className="render-preset-stats"><b>{item.fps}</b> FPS <span>· {item.resolution}%</span></span>
            </button>)}
          </div>
          <details className="render-advanced"><summary>精细调整<Icon name="right" size={16} /></summary><div>
            <MenuChoice label="帧率上限" values={[30, 60, 120]} value={values.fps} suffix="FPS" disabled={disabled}
              onChange={value => update({ fps: value as Preferences['fps'] })} />
            <MenuChoice label="渲染清晰度" values={[75, 100, 150]} value={values.resolution} suffix="%" disabled={disabled}
              onChange={value => update({ resolution: value as Preferences['resolution'] })} />
            <p>更高的帧率和清晰度会增加耗电与发热。清晰度不改变视角或窗口大小。</p>
          </div></details>
          <MenuGroup title="资源使用" icon="leaf">
            {toggle('pauseHidden', '隐藏时暂停渲染', '宠物隐藏或场景不可见时减少资源占用')}
          </MenuGroup>
        </>}
        {section === 'app' && <>
          <MenuGroup title="应用入口" copy="至少保留一个" icon="monitor"><div className="preference-entry-pair">
            {toggle('tray', '菜单栏图标', !values.dock ? 'Dock 已隐藏，保留此入口' : '从 macOS 顶部菜单栏打开应用', !values.dock)}
            {toggle('dock', 'Dock 图标', !values.tray ? '菜单栏已隐藏，保留此入口' : '从 Dock 打开控制台', !values.tray)}
          </div></MenuGroup>
          <MenuGroup title="启动与退出" icon="software">
            <PreferenceSwitch title="登录时启动" checked={state?.login.enabled ?? false}
              copy={state?.login.supported ? '登录电脑后启动 Agent Pet' : '开发模式不会将 Electron 加入登录项；打包应用支持此设置'}
              disabled={disabled || !state?.login.supported} onChange={() => { setNotice(''); onLogin(!state?.login.enabled); }} />
            {toggle('startConsole', '启动时打开控制台', '启动后显示管理界面')}
            {toggle('background', '关闭控制台后继续运行', values.background ? '关窗口保留宠物；退出应用会全部结束' : '关闭窗口时，应用和宠物一起退出')}
          </MenuGroup>
        </>}
        {section === 'pet' && <>
          <div className="preference-size">
            <div><label htmlFor="preference-size">宠物大小</label><p>调整桌面上宠物的显示比例</p></div>
            <output htmlFor="preference-size">{sizePercent}<small>%</small></output>
            <input id="preference-size" type="range" min="60" max="140" step="5" value={sizePercent} disabled={disabled}
              style={{ '--range-progress': `${Math.max(0, Math.min(100, (sizePercent - 60) / 80 * 100))}%` } as CSSProperties}
              onChange={event => { sizePending.current = true; setSizeDraft(Math.round(Number(event.target.value) * 140 / 100)); }}
              onPointerUp={commitSize} onBlur={commitSize}
              onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitSize(); }} />
            <div className="preference-scale"><span>60% · 小</span><span>100%</span><span>140% · 大</span></div>
          </div>
          <MenuGroup title="桌面显示" icon="pet">
            {toggle('petVisible', '宠物常驻桌面', '关闭后可从应用入口重新显示')}
            {toggle('offline', 'Agent 未启动时显示', values.petVisible ? '没有 Agent 运行时，也留在桌面' : '开启“宠物常驻桌面”后生效', !values.petVisible)}
            {toggle('topmost', '始终置顶', '显示在其他窗口上方')}
          </MenuGroup>
          <MenuGroup title="动作与气泡" icon="sparkles">
            {toggle('bubbles', '显示气泡', values.bubbles ? '提醒通过宠物气泡显示' : '任务提醒暂停显示，偏好仍会保留')}
            {toggle('reduced', '减少动画', '保留状态变化，减少持续动作')}
          </MenuGroup>
        </>}
        {section === 'reminders' && <>
          <div className={`preference-bubble-note ${!values.bubbles ? 'is-muted' : ''}`}>
            <Icon name="bell" size={21} /><div><strong>{values.bubbles ? '通过宠物气泡提醒' : '气泡已关闭'}</strong>
              <p>{values.bubbles ? '提醒显示在宠物旁，不会打断你的操作。' : '下面的提醒暂不显示，选择会保留。'}</p>
            </div>
            {!values.bubbles && <button disabled={disabled} onClick={() => {
              update({ bubbles: true });
              requestAnimationFrame(() => scrollArea.current?.querySelector<HTMLElement>('[role=switch]:not([disabled])')?.focus({ preventScroll: true }));
            }}>开启气泡<Icon name="right" size={15} /></button>}
          </div>
          <MenuGroup title="任务结果" icon="check">
            {toggle('completed', '任务完成', '任务完成时，显示结果提醒')}
            {toggle('error', '任务出错', '任务出错时，提醒你查看')}
          </MenuGroup>
        </>}
      </div>}
      {busy && <p className="preferences-notice" role="status">正在保存偏好…</p>}
      {failure && <p className="preferences-notice is-error" role="alert">{failure} 请重试。</p>}
      {notice && !failure && <p className="preferences-notice" role="status"><Icon name="check" size={15} />{notice}</p>}
    </div>
    {resetting && <dialog ref={dialog} className="preferences-reset-dialog" aria-labelledby="preferences-reset-title"
      onKeyDown={trapDialogFocus} onCancel={event => { event.preventDefault(); endReset(); }}>
      <div className="preferences-reset-art"><Icon name="replay" size={24} /></div>
      <h2 id="preferences-reset-title">恢复默认偏好？</h2>
      <p>渲染、软件、宠物与提醒设置将恢复默认。已添加的连接和宠物配置会保留。</p>
      {resetError && <p className="is-error" role="alert">{resetError}</p>}
      <div><button autoFocus onClick={endReset}>取消</button>
        <button className="preferences-reset-confirm" disabled={resetPending} onClick={() => { void confirmReset(); }}>
          {resetPending ? '正在恢复…' : '确认恢复'}<Icon name="check" size={16} />
        </button>
      </div>
    </dialog>}
  </section>;
}

function AboutDocument({ onOpenProject }: { onOpenProject: (() => void) | undefined }) {
  return <article className="preferences-about" aria-label="关于 Agent Pet">
    <header className="about-document-header"><h1>Agent Pet</h1>
      <p className="about-document-meta"><span className="about-version">版本 0.1.0</span><span aria-hidden="true">·</span>桌面宠物项目</p>
      <p className="about-document-lead">通过 3D 宠物的动作，观察 AI Agent 的工作状态。</p>
    </header>
    <section><h2>项目简介</h2><p>Agent Pet 是一个运行在本机的桌面宠物项目。当 Agent 工作、完成任务或遇到错误时，宠物会用不同的状态作出反馈。</p>
      <p>它的目标是让桌面多一个有趣的小伙伴，也让你更容易知道 Agent 是否需要关注。</p></section>
    <section><h2>当前进展</h2><p>目前以 <strong>macOS</strong> 和 <strong>pi</strong> 的本机接入为起点。其他 Agent 的支持正在规划中，项目不会只围绕 pi 设计。</p>
      <ul><li>连接配置：管理本机 Agent 的配置位置与名称；真实部署需要预览与授权。</li>
        <li>宠物展示：用现有 3D 形象与动画表达任务状态。</li>
        <li>后续方向：更多 Agent、可导入的宠物，以及更完整的场景交互。</li></ul>
      <p>正式界面与真实 pi 全链路验收分别记录；当前版本仍是本机 MVP，尚未完成正式分发验收。</p>
    </section>
    <section><h2>使用方式</h2><ol><li><strong>配置连接。</strong> 在连接页添加 Agent，检查配置是否可用。</li>
      <li><strong>选择宠物。</strong> 查看已有形象和动作；尚未实现的收藏与导入会明确说明。</li>
      <li><strong>调整偏好。</strong> 在设置中选择显示、提醒和运行方式。</li></ol>
      <p>设计上尽量减少专业操作，让没有技术背景的人也能轻松使用。</p></section>
    <section><h2>数据与隐私</h2><p>项目观察 Agent 的名称与状态，不读取对话正文，也不代替你启动、审批或控制 Agent。</p></section>
    <section className="about-document-links"><h2>项目链接</h2>
      <button className="about-project-link" disabled={!onOpenProject} onClick={onOpenProject}>Gogo-Bytes / agent-pet<Icon name="right" /></button>
      <p>源码、项目文档与问题反馈都在 GitHub 仓库中。</p>
    </section>
  </article>;
}

function MenuGroup({ title, copy, icon, children }: { title: string; copy?: string; icon: IconName; children: ReactNode }) {
  return <section className="preference-group" aria-label={title}><header><Icon name={icon} size={18} /><h2>{title}</h2>{copy && <p>{copy}</p>}</header><div>{children}</div></section>;
}
function PreferenceSwitch({ title, copy, checked, disabled, onChange }: { title: string; copy: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  const description = useId();
  return <div className={`preference-row ${disabled ? 'is-disabled' : ''}`}><span><strong>{title}</strong><small id={description}>{copy}</small></span>
    <button className="preference-switch" role="switch" aria-label={title} aria-describedby={description} aria-checked={checked} disabled={disabled} onClick={onChange}>
      <span aria-hidden="true" />
    </button>
  </div>;
}
function MenuChoice({ label, values, value, suffix, disabled, onChange }: { label: string; values: number[]; value: number; suffix: string; disabled: boolean; onChange: (value: number) => void }) {
  return <div className="preference-choice"><span>{label}</span><div role="radiogroup" aria-label={label}>
    {values.map((option, index) => <button key={option} role="radio" aria-checked={value === option} disabled={disabled} tabIndex={value === option ? 0 : -1}
      onClick={() => onChange(option)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 :
          (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? values.length - 1 : 1)) % values.length;
        onChange(values[next]!);
        (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus({ preventScroll: true });
      }}>{option}<small>{suffix}</small></button>)}
  </div></div>;
}
function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLButtonElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLButtonElement))) {
    event.preventDefault(); first.focus();
  }
}
