// Browser-only preference exploration; no OS settings or renderer configuration writes.
import { useRef, useState } from 'react';
import { Icon } from './components/icons.js';
import './settings-view.css';
declare const __DESKTOP_VERSION__: string;
const sections = [{id:'render',label:'渲染',title:'场景渲染',icon:'grid'},{id:'app',label:'软件',title:'软件行为',icon:'settings'},{id:'pet',label:'宠物',title:'桌面宠物',icon:'pet'},{id:'reminders',label:'提醒',title:'任务提醒',icon:'alert'},{id:'about',label:'关于',title:'关于 Agent Pet',icon:'home'}] as const;
type Section = typeof sections[number]['id'];
const defaults = {visible:true,size:100,bubbles:true,reduced:false,completed:true,error:true,login:false,console:false,tray:true,dock:true,background:true,offline:true,names:true,topmost:true,fps:60,resolution:100,pauseHidden:true};
type Preferences = typeof defaults;
type BooleanKey = {[K in keyof Preferences]:Preferences[K] extends boolean?K:never}[keyof Preferences];
const presets=[{name:'省电',copy:'更低负载',fps:30,resolution:75},{name:'均衡',copy:'日常使用',fps:60,resolution:100},{name:'清晰',copy:'更细腻',fps:60,resolution:150}] as const;
export function SettingsView({visible}:{visible:boolean}) {
 const scrollArea=useRef<HTMLElement>(null);
 const [section,setSection]=useState<Section>('render');
 const [values,setValues]=useState(defaults);
 const [sample,setSample]=useState<'completed'|'error'>('completed');
 const [agentRunning,setAgentRunning]=useState(true);
 const [appPreview,setAppPreview]=useState<'startup'|'closed'>('startup');
 const [resetting,setResetting]=useState(false);
 const update=<K extends keyof Preferences>(key:K,value:Preferences[K])=>setValues(current=>({...current,[key]:value}));
 const rows: {key:BooleanKey;title:string;copy:string}[]=section==='pet'?[
  {key:'visible',title:'宠物常驻桌面',copy:'关闭后可从应用入口重新显示'},
  {key:'offline',title:'Agent 未启动时显示',copy:'没有 Agent 运行时，宠物也留在桌面'},
  {key:'names',title:'显示宠物名称',copy:'在宠物旁显示名称'},
  {key:'topmost',title:'始终置顶',copy:'让宠物显示在其他窗口上方'},
  {key:'bubbles',title:'显示气泡',copy:'在宠物旁显示任务结果'},
  {key:'reduced',title:'减少动画',copy:'保留状态变化，减少持续动作'}
 ]:section==='reminders'?[
  {key:'completed',title:'任务完成',copy:'完成时显示结果提醒'},
  {key:'error',title:'任务出错',copy:'出错时显示提醒'}
 ]:section==='app'?[
  {key:'tray',title:'显示菜单栏图标',copy:!values.dock?'Dock 已隐藏，保留此入口':'从 macOS 顶部菜单栏打开应用'},
  {key:'dock',title:'显示 Dock 图标',copy:!values.tray?'菜单栏图标已隐藏，保留此入口':'从 Dock 打开控制台'},
  {key:'login',title:'登录时启动',copy:'登录电脑后启动 Agent Pet'},
  {key:'console',title:'启动时打开控制台',copy:'启动后显示管理界面'},
  {key:'background',title:'关闭控制台后继续运行',copy:'关闭窗口后保留宠物；退出应用仍会全部结束'}
 ]:section==='render'?[
  {key:'pauseHidden',title:'场景隐藏时暂停渲染',copy:'宠物隐藏或场景不可见时减少资源占用'}
 ]:[];
 const stopped=section==='app'&&appPreview==='closed'&&!values.background;
 const petShown=!stopped&&values.visible&&(agentRunning||values.offline);
 const hasReminder=values.bubbles&&values[sample];
 const preset=presets.find(item=>item.fps===values.fps&&item.resolution===values.resolution);
 const selectedSection=sections.find(item=>item.id===section)!;
 return <section ref={scrollArea} hidden={!visible} className="preferences-page" aria-label="应用偏好">
  <nav className="preferences-nav" aria-label="设置分类">{sections.map(item=><button key={item.id} aria-pressed={section===item.id} onClick={event=>{setSection(item.id);setResetting(false);scrollArea.current?.scrollTo({top:0});event.currentTarget.scrollIntoView({block:'nearest',inline:'nearest'});}}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
  <div className="preferences-content">
   <header className="preferences-heading"><span className={`preferences-emblem tone-${section}`}><Icon name={selectedSection.icon}/></span><h1>{selectedSection.title}</h1></header>
   {section==='about'?<div className="preferences-about"><div className="about-brand"><span>✦</span><div><h2>Agent Pet</h2><p>版本 {__DESKTOP_VERSION__}</p></div></div><p className="about-intro">让 AI Agent 的工作状态，变成桌面上宠物的小动作。</p><dl><div><dt>运行方式</dt><dd>本机运行</dd></div><div><dt>观察内容</dt><dd>Agent 名称与状态，不读取对话正文</dd></div></dl><a className="about-github" href="https://github.com/Gogo-Bytes/agent-pet" target="_blank" rel="noopener noreferrer">GitHub 项目<Icon name="right"/></a></div>:<div className="preferences-layout"><div className="preferences-controls">
    {section==='render'&&<><div className="render-presets" aria-label="画质档位">{presets.map(item=><button key={item.name} aria-pressed={preset===item} onClick={()=>setValues(current=>({...current,fps:item.fps,resolution:item.resolution}))}><Icon name={item.name==='省电'?'sleep':item.name==='均衡'?'grid':'signal'}/><strong>{item.name}</strong><small>{item.copy}</small></button>)}</div><p className="render-current">{preset?.name??'自定义'} · {values.fps} FPS · {values.resolution}% 清晰度</p><details className="render-advanced"><summary>调整帧率与清晰度<Icon name="down"/></summary><div><label className="preference-select">帧率上限<select aria-label="帧率上限" value={values.fps} onChange={e=>update('fps',Number(e.target.value))}><option value="30">30 FPS</option><option value="60">60 FPS</option><option value="120">120 FPS</option></select></label><label className="preference-select">渲染清晰度<select aria-label="渲染清晰度" value={values.resolution} onChange={e=>update('resolution',Number(e.target.value))}><option value="75">75% · 更省资源</option><option value="100">100% · 标准</option><option value="150">150% · 更细腻</option></select></label><p>更高帧率和清晰度会增加耗电与发热。清晰度不改变视角或窗口大小。</p></div></details></>}
    {section==='pet'&&<div className="preference-size"><label htmlFor="preference-size">宠物大小</label><output htmlFor="preference-size">{values.size}%</output><input id="preference-size" type="range" min="60" max="140" step="5" value={values.size} onChange={e=>update('size',Number(e.target.value))}/><div className="preference-scale"><span>小</span><span>大</span></div></div>}
    {rows.map(row=><PreferenceSwitch key={row.key} title={row.title} copy={row.copy} checked={values[row.key]} disabled={(row.key==='tray'&&!values.dock)||(row.key==='dock'&&!values.tray)} onChange={()=>update(row.key,!values[row.key])}/>)}
    {section==='reminders'&&!values.bubbles&&<p className="preference-note">气泡已关闭。<button onClick={()=>update('bubbles',true)}>开启气泡</button></p>}
   </div>
   <aside className="preference-preview" aria-label={section==='render'?'渲染设置摘要':'桌面预览'}>
    <header><span>{section==='render'?'当前设置':'桌面预览'}</span>{section==='reminders'?<select aria-label="预览提醒类型" value={sample} onChange={e=>setSample(e.target.value as 'completed'|'error')}><option value="completed">完成</option><option value="error">出错</option></select>:section==='pet'?<select aria-label="预览 Agent 状态" value={agentRunning?'running':'offline'} onChange={e=>setAgentRunning(e.target.value==='running')}><option value="running">Agent 运行中</option><option value="offline">Agent 未启动</option></select>:section==='app'?<select aria-label="预览软件行为" value={appPreview} onChange={e=>setAppPreview(e.target.value as 'startup'|'closed')}><option value="startup">启动后</option><option value="closed">关闭控制台后</option></select>:null}</header>
    {section==='render'?<div className="render-summary"><div><Icon name="play"/><strong>{values.fps}<small> FPS</small></strong><span>帧率上限</span></div><div><Icon name="grid"/><strong>{values.resolution}<small>%</small></strong><span>渲染清晰度</span></div><p>{values.pauseHidden?'不可见时暂停渲染':'不可见时保持渲染'}</p></div>:<><div className="preference-desktop" data-reduced={values.reduced}>
     <div className="preview-app"><i/><i/><i/><span>桌面</span></div>
     {section==='app'&&!stopped&&<><div className="preview-menubar"><span>macOS</span><span>{values.tray&&<Icon name="pet"/>}12:00</span></div>{values.dock&&<div className="preview-dock"><Icon name="pet"/>Agent Pet</div>}{appPreview==='startup'&&values.console&&<div className="preview-console"><Icon name="settings"/><strong>Agent Pet</strong><span>控制台</span></div>}</>}
     {petShown&&((section==='reminders'&&hasReminder)||(section==='pet'&&values.bubbles&&agentRunning&&values.completed))&&<div className={`preview-bubble ${section==='pet'?'completed':sample}`}><Icon name={section==='pet'||sample==='completed'?'check':'alert'}/>{section==='pet'||sample==='completed'?'任务完成':'任务出错'}</div>}
     {petShown?<><div className="preview-companion" style={{scale:values.size/100,bottom:section==='app'&&values.dock?42:24}}><svg className="preview-pet" viewBox="0 0 120 140" aria-hidden="true"><path fill="#b7a3e6" d="M26 38 18 8 48 23M73 23 103 8 95 39"/><rect x="22" y="69" width="76" height="64" rx="29" fill="#b7a3e6"/><rect x="12" y="26" width="96" height="63" rx="28" fill="#9b80d3"/><circle cx="42" cy="53" r="3" fill="#685185"/><circle cx="79" cy="53" r="3" fill="#685185"/><path d="M51 67q9 9 18 0" fill="none" stroke="#685185" strokeWidth="3" strokeLinecap="round"/><path d="m60 96 4 8 9 4-9 4-4 8-4-8-9-4 9-4Z" fill="#fff"/></svg></div>{values.names&&<span className="preview-pet-name">星星</span>}</>:<span className="preview-empty"><Icon name="pet"/>{stopped?'应用已退出':!agentRunning&&!values.offline?'Agent 未启动，宠物隐藏':'宠物已隐藏'}</span>}
    </div><p>{section==='pet'?`${values.size}% · ${values.topmost?'置顶':'不置顶'} · ${values.reduced?'减少动画':'标准动画'}`:section==='reminders'?(!petShown?'宠物隐藏时不显示气泡':hasReminder?'气泡显示在宠物旁':'不显示此类气泡'):stopped?'关闭窗口后，宠物和应用一起退出':appPreview==='closed'?'控制台已关闭，应用继续运行':values.console?'启动时打开控制台':'启动时不打开控制台'}</p></>}
   </aside></div>}
   <footer className="preferences-footer"><span>Agent Pet</span>{resetting?<div className="preferences-reset"><span>恢复所有偏好？</span><button onClick={()=>setResetting(false)}>取消</button><button onClick={()=>{setValues(defaults);setResetting(false);}}>确认恢复</button></div>:<button onClick={()=>setResetting(true)}><Icon name="replay"/>恢复默认</button>}</footer>
  </div>
 </section>;
}
function PreferenceSwitch({title,copy,checked,disabled,onChange}:{title:string;copy:string;checked:boolean;disabled:boolean;onChange:()=>void}) {
 return <button className="preference-row" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={onChange}><span><strong>{title}</strong><small>{copy}</small></span><span className={`preference-toggle ${checked?'on':''}`} aria-hidden="true"><i/></span></button>;
}
