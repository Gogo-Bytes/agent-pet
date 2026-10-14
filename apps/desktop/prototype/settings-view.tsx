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
 const scrollArea=useRef<HTMLDivElement>(null);
 const [section,setSection]=useState<Section>('render');
 const [values,setValues]=useState(defaults);
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
 const preset=presets.find(item=>item.fps===values.fps&&item.resolution===values.resolution);
 const selectedSection=sections.find(item=>item.id===section)!;
 return <section hidden={!visible} className="preferences-page" aria-label="应用偏好">
  <nav className="preferences-nav" aria-label="设置分类">{sections.map(item=><button key={item.id} aria-pressed={section===item.id} onClick={event=>{setSection(item.id);setResetting(false);scrollArea.current?.scrollTo({top:0});event.currentTarget.scrollIntoView({block:'nearest',inline:'nearest'});}}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
  <div ref={scrollArea} className="preferences-content">
   {section!=='about'&&<header className="preferences-heading"><span className={`preferences-emblem tone-${section}`}><Icon name={selectedSection.icon}/></span><h1>{selectedSection.title}</h1></header>}
   {section==='about'?<article className="preferences-about" aria-label="关于 Agent Pet"><header className="about-document-header"><h1>Agent Pet</h1><p className="about-document-meta">版本 {__DESKTOP_VERSION__}<span>·</span>桌面宠物项目</p><p className="about-document-lead">通过 3D 宠物的动作，观察 AI Agent 的工作状态。</p></header><section><h2>项目简介</h2><p>Agent Pet 是一个运行在本机的桌面宠物项目。当 Agent 工作、完成任务或遇到错误时，宠物会用不同的状态作出反馈。</p><p>它的目标是让桌面多一个有趣的小伙伴，也让你更容易知道 Agent 是否需要关注。</p></section><section><h2>当前进展</h2><p>目前以 <strong>macOS</strong> 和 <strong>pi</strong> 的本机接入为起点。其他 Agent 的支持正在规划中，项目不会只围绕 pi 设计。</p><ul><li>连接配置：管理本机 Agent 的配置位置与名称。</li><li>宠物展示：用形象与动画表达任务状态。</li><li>后续方向：更多 Agent、可导入的宠物，以及更完整的场景交互。</li></ul></section><section><h2>使用方式</h2><ol><li><strong>配置连接。</strong> 在连接页添加 Agent，检查配置是否可用。</li><li><strong>选择宠物。</strong> 为 Agent 选择使用的形象。</li><li><strong>调整偏好。</strong> 在设置中选择显示、提醒和运行方式。</li></ol><p>设计上尽量减少专业操作，让没有技术背景的人也能轻松使用。</p></section><section><h2>数据与隐私</h2><p>项目观察 Agent 的名称与状态，不读取对话正文，也不代替你启动、审批或控制 Agent。</p></section><section className="about-document-links"><h2>项目链接</h2><a href="https://github.com/Gogo-Bytes/agent-pet" target="_blank" rel="noopener noreferrer">Gogo-Bytes / agent-pet<Icon name="right"/></a><p>源码、项目文档与问题反馈都在 GitHub 仓库中。</p></section></article>:<div className="preferences-layout"><div className="preferences-controls">
    {section==='render'&&<><div className="render-presets" aria-label="画质档位">{presets.map(item=><button key={item.name} aria-pressed={preset===item} onClick={()=>setValues(current=>({...current,fps:item.fps,resolution:item.resolution}))}><Icon name={item.name==='省电'?'sleep':item.name==='均衡'?'grid':'signal'}/><strong>{item.name}</strong><small>{item.copy}</small></button>)}</div><p className="render-current">{preset?.name??'自定义'} · {values.fps} FPS · {values.resolution}% 清晰度</p><details className="render-advanced"><summary>调整帧率与清晰度<Icon name="down"/></summary><div><label className="preference-select">帧率上限<select aria-label="帧率上限" value={values.fps} onChange={e=>update('fps',Number(e.target.value))}><option value="30">30 FPS</option><option value="60">60 FPS</option><option value="120">120 FPS</option></select></label><label className="preference-select">渲染清晰度<select aria-label="渲染清晰度" value={values.resolution} onChange={e=>update('resolution',Number(e.target.value))}><option value="75">75% · 更省资源</option><option value="100">100% · 标准</option><option value="150">150% · 更细腻</option></select></label><p>更高帧率和清晰度会增加耗电与发热。清晰度不改变视角或窗口大小。</p></div></details></>}
    {section==='pet'&&<div className="preference-size"><label htmlFor="preference-size">宠物大小</label><output htmlFor="preference-size">{values.size}%</output><input id="preference-size" type="range" min="60" max="140" step="5" value={values.size} onChange={e=>update('size',Number(e.target.value))}/><div className="preference-scale"><span>小</span><span>大</span></div></div>}
    {rows.map(row=><PreferenceSwitch key={row.key} title={row.title} copy={row.copy} checked={values[row.key]} disabled={(row.key==='tray'&&!values.dock)||(row.key==='dock'&&!values.tray)} onChange={()=>update(row.key,!values[row.key])}/>)}
    {section==='reminders'&&!values.bubbles&&<p className="preference-note">气泡已关闭。<button onClick={()=>update('bubbles',true)}>开启气泡</button></p>}
   </div>
</div>}
   {section!=='about'&&<footer className="preferences-footer"><span>Agent Pet</span>{resetting?<div className="preferences-reset"><span>恢复所有偏好？</span><button onClick={()=>setResetting(false)}>取消</button><button onClick={()=>{setValues(defaults);setResetting(false);}}>确认恢复</button></div>:<button onClick={()=>setResetting(true)}><Icon name="replay"/>恢复默认</button>}</footer>}
  </div>
 </section>;
}
function PreferenceSwitch({title,copy,checked,disabled,onChange}:{title:string;copy:string;checked:boolean;disabled:boolean;onChange:()=>void}) {
 return <button className="preference-row" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={onChange}><span><strong>{title}</strong><small>{copy}</small></span><span className={`preference-toggle ${checked?'on':''}`} aria-hidden="true"><i/></span></button>;
}
