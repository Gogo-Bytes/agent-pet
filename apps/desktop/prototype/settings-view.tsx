// Browser-only preference exploration; no OS settings or agent configuration writes.
import { useState } from 'react';
import { Icon } from './components/icons.js';
import './settings-view.css';
const sections = [{id:'display',label:'显示',icon:'pet'},{id:'reminders',label:'提醒',icon:'alert'},{id:'startup',label:'启动',icon:'clock'}] as const;
type Section = typeof sections[number]['id'];
const defaults = {visible:true,size:100,bubbles:true,reduced:false,completed:true,error:true,login:false,console:false};
export function SettingsView({visible}:{visible:boolean}) {
 const [section,setSection]=useState<Section>('display');
 const [values,setValues]=useState(defaults);
 const [sample,setSample]=useState<'completed'|'error'>('completed');
 const [resetting,setResetting]=useState(false);
 const update=<K extends keyof typeof defaults>(key:K,value:typeof defaults[K])=>setValues(current=>({...current,[key]:value}));
 const toggle=(key:Exclude<keyof typeof defaults,'size'>)=>update(key,!values[key]);
 const hasReminder=values.bubbles&&values[sample];
 const rows=section==='display' ? [
  {key:'visible',title:'显示桌面宠物',copy:'随时可以从菜单栏找回来'},
  {key:'bubbles',title:'显示气泡',copy:'在宠物旁显示任务结果'},
  {key:'reduced',title:'减少动画',copy:'保留状态变化，减少持续动作'}
 ] as const : section==='reminders' ? [
  {key:'completed',title:'任务完成',copy:'完成时显示结果提醒'},
  {key:'error',title:'任务出错',copy:'出错时显示提醒'}
 ] as const : [
  {key:'login',title:'登录时启动',copy:'登录电脑后启动 Agent Pet'},
  {key:'console',title:'启动时打开控制台',copy:'启动后显示管理界面'}
 ] as const;
 return <section hidden={!visible} className="preferences-page" aria-label="应用偏好">
  <nav className="preferences-nav" aria-label="设置分类">{sections.map(item=><button key={item.id} aria-pressed={section===item.id} onClick={()=>{setSection(item.id);setResetting(false);}}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
  <div className="preferences-content">
   <header className="preferences-heading"><span className={`preferences-emblem tone-${section}`}><Icon name={sections.find(item=>item.id===section)!.icon}/></span><h1>{section==='display'?'桌面显示':section==='reminders'?'任务提醒':'启动方式'}</h1></header>
   <div className="preferences-layout"><div className="preferences-controls">
    {section==='display'&&<div className="preference-size"><label htmlFor="preference-size">宠物大小</label><output htmlFor="preference-size">{values.size}%</output><input id="preference-size" type="range" min="60" max="140" step="5" value={values.size} onChange={e=>update('size',Number(e.target.value))}/><div className="preference-scale"><span>小</span><span>大</span></div></div>}
    {rows.map(row=><PreferenceSwitch key={row.key} title={row.title} copy={row.copy} checked={values[row.key]} onChange={()=>toggle(row.key)}/>)}
    {section==='reminders'&&!values.bubbles&&<p className="preference-note">气泡已关闭。<button onClick={()=>{update('bubbles',true);}}>开启气泡</button></p>}
   </div>
   <aside className="preference-preview" aria-label={section==='startup'?'启动预览':'桌面预览'}>
    <header><span>{section==='startup'?'启动后':'桌面预览'}</span>{section==='reminders'&&<select aria-label="预览提醒类型" value={sample} onChange={e=>setSample(e.target.value as 'completed'|'error')}><option value="completed">完成</option><option value="error">出错</option></select>}</header>
    <div className="preference-desktop" data-reduced={values.reduced}>
     <div className="preview-app"><i/><i/><i/><span>桌面</span></div>
     {section==='startup'&&values.console&&<div className="preview-console"><Icon name="settings"/><strong>Agent Pet</strong><span>控制台</span></div>}
     {values.visible&&((section==='reminders'&&hasReminder)||(section==='display'&&values.bubbles))&&<div className={`preview-bubble ${section==='display'?'completed':sample}`}><Icon name={section==='display'||sample==='completed'?'check':'alert'}/>{section==='display'||sample==='completed'?'任务完成':'任务出错'}</div>}
     {values.visible?<div className="preview-companion" style={{scale:values.size/100}}>
      <svg className="preview-pet" viewBox="0 0 120 140" aria-hidden="true"><path fill="#b7a3e6" d="M26 38 18 8 48 23M73 23 103 8 95 39"/><rect x="22" y="69" width="76" height="64" rx="29" fill="#b7a3e6"/><rect x="12" y="26" width="96" height="63" rx="28" fill="#9b80d3"/><circle cx="42" cy="53" r="3" fill="#685185"/><circle cx="79" cy="53" r="3" fill="#685185"/><path d="M51 67q9 9 18 0" fill="none" stroke="#685185" strokeWidth="3" strokeLinecap="round"/><path d="m60 96 4 8 9 4-9 4-4 8-4-8-9-4 9-4Z" fill="#fff"/></svg>
     </div>:<span className="preview-empty"><Icon name="pet"/>宠物已隐藏</span>}
    </div>
    <p>{section==='display'?`${values.size}% · ${values.reduced?'减少动画':'标准动画'}`:section==='reminders'?(!values.visible?'宠物隐藏时不显示气泡':hasReminder?'气泡显示在宠物旁':'不显示此类气泡'):values.console?(values.visible?'宠物与控制台一起打开':'只打开控制台'):(values.visible?'只显示桌面宠物':'宠物保持隐藏，可从菜单栏打开')}</p>
   </aside></div>
   <footer className="preferences-footer"><span>Agent Pet</span>{resetting?<div className="preferences-reset"><span>恢复所有偏好？</span><button onClick={()=>setResetting(false)}>取消</button><button onClick={()=>{setValues(defaults);setResetting(false);}}>确认恢复</button></div>:<button onClick={()=>setResetting(true)}><Icon name="replay"/>恢复默认</button>}</footer>
  </div>
 </section>;
}
function PreferenceSwitch({title,copy,checked,onChange}:{title:string;copy:string;checked:boolean;onChange:()=>void}) {
 return <button className="preference-row" role="switch" aria-checked={checked} aria-label={title} onClick={onChange}><span><strong>{title}</strong><small>{copy}</small></span><span className={`preference-toggle ${checked?'on':''}`} aria-hidden="true"><i/></span></button>;
}
