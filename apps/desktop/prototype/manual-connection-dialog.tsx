// Browser prototype: all location checks and saves use registered mock data.
import { useEffect, useRef, useState } from 'react';
import { catalog, type AgentEntry } from './connection-options.js';
import { Icon } from './components/icons.js';
type Check = 'checking'|'ready'|'missing'|'unreadable'|'invalid'|'unknown'|'ambiguous';
const providers=catalog.slice(0,6);
export function ManualConnectionDialog({existing,records,onClose,onSave}:{existing:AgentEntry|null;records:AgentEntry[];onClose:()=>void;onSave:(value:AgentEntry)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const heading=useRef<HTMLHeadingElement>(null);
 const [step,setStep]=useState(0);const [path,setPath]=useState(existing?.path??'');const [provider,setProvider]=useState('');const [check,setCheck]=useState<Check>('checking');const [identified,setIdentified]=useState<AgentEntry|null>(null);const [name,setName]=useState<string|null>(existing?.alias??null);const [picker,setPicker]=useState(false);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[]);
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[step]);
 useEffect(()=>{if(step!==1)return;setCheck('checking');setIdentified(null);const timer=setTimeout(()=>{
  const clean=path.trim();const known=catalog.find(a=>a.path===clean);let match:AgentEntry|undefined;
  if(clean==='/demo/missing'||clean===catalog[3]!.path){setCheck('missing');return;}
  if(clean==='/demo/private'){setCheck('unreadable');return;}if(clean==='/demo/broken.json'){setCheck('invalid');return;}
  if(known)match=known;
  else if(clean==='/demo/custom'||clean==='/demo/shared'){if(!provider){setCheck(clean==='/demo/shared'?'ambiguous':'unknown');return;}const chosen=providers.find(a=>a.name===provider);if(chosen)match={...chosen,id:`${chosen.id}-custom-${encodeURIComponent(clean)}`,path:clean,alias:'自选配置'};}
  if(!match){setCheck('unknown');return;}if((existing&&match.name!==existing.name)||(provider&&match.name!==provider)){setCheck('invalid');return;}
  setIdentified(match);setCheck('ready');
 },600);return()=>clearTimeout(timer);},[step,path,provider,existing]);
 const duplicate=identified&&records.some(r=>r.id!==existing?.id&&r.name===identified.name&&r.path===identified.path);
 const ready=check==='ready'&&identified?.path===path.trim()&&!duplicate;
 function next(){if(step===0&&path.trim()){setPicker(false);setStep(1);}else if(step===1&&ready){if(name===null)setName(identified!.alias);setStep(2);}else if(step===2&&ready&&name?.trim())onSave({...identified!,alias:name.trim()});}
 const error=step===1&&(duplicate||['missing','unreadable','invalid'].includes(check));
 const labels=['选择位置','验证配置','命名与确认'];
 return <dialog ref={dialog} className="co-page co-prism cfg-page cfg-dialog" aria-labelledby="manual-dialog-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem" aria-hidden="true"><Icon name="folder"/></span><h2 id="manual-dialog-title">{existing?'更换配置位置':'手动添加'}</h2></div><button className="cfg-dialog-close" aria-label="关闭手动配置" title="关闭" onClick={onClose}><Icon name="close"/></button></header>
  <ol className="cfg-dialog-steps" aria-label="配置步骤">{labels.map((label,i)=><li key={label} className={`${i<step?'is-finished':i===step?'is-current':''} ${i===step&&error?'is-error':''}`} aria-current={i===step?'step':undefined}><span aria-hidden="true">{i<step?<Icon name="check"/>:i===step&&error?<Icon name="alert"/>:i+1}</span><strong>{label}</strong></li>)}</ol>
  <section className="cfg-dialog-body" key={step}><h3 ref={heading} tabIndex={-1}>{labels[step]}</h3>
   {step===0&&<><label className="cfg-path-label" htmlFor="manual-path">配置文件或文件夹</label><div className="cfg-path-input"><Icon name="folder"/><input id="manual-path" value={path} placeholder="选择位置，或粘贴完整路径" onChange={e=>{setPath(e.target.value);setProvider('');setIdentified(null);setCheck('checking');}}/><button className="co-secondary" aria-expanded={picker} onClick={()=>setPicker(v=>!v)}>选择位置</button></div>{picker&&<div className="cfg-location-picker" aria-label="演示位置">{catalog.map(a=><button key={a.id} onClick={()=>{setPath(a.path);setProvider('');setIdentified(null);setPicker(false);}}><span>{a.name} · {a.alias}</span><small>{a.path}</small></button>)}</div>}<details className="cfg-location-help" onToggle={event=>{if(event.currentTarget.open)event.currentTarget.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}><summary><span aria-hidden="true">?</span>这个位置怎么选？<Icon name="down"/></summary><div><p>选择 Agent 的配置目录或文件，不是应用程序本身。</p><p>例如 pi：<code>~/.pi/agent</code>。多个安装或项目选对应位置；找不到时可先自动扫描。</p></div></details></>}
   {step===1&&<><p className="cfg-dialog-path">{path}</p>{check==='checking'?<p className="cfg-validation checking" role="status"><Icon name="replay"/>正在识别并验证…</p>:check==='ready'&&identified?<div className="cfg-dialog-check" role="status"><strong>{identified.name}</strong><ul><li><Icon name="check"/>位置可读取</li><li><Icon name="check"/>配置格式匹配</li></ul></div>:<div className={`cfg-validation ${error?'error':''}`} role={error?'alert':'status'}><Icon name={error?'alert':'search'}/><div><strong>{check==='missing'?'位置不存在':check==='unreadable'?'无法读取此位置':check==='invalid'?'配置格式不匹配':check==='ambiguous'?'发现多种可能的 Agent':'未能识别 Agent 类型'}</strong><p>{check==='missing'?'返回上一步，重新选择位置。':check==='unreadable'?'检查访问权限后，返回重新选择。':check==='invalid'?existing?`请选择 ${existing.name} 的配置位置。`:'返回上一步，选择对应的配置文件或文件夹。':'选择类型后重新验证。'}</p>{(check==='unknown'||check==='ambiguous')&&<select aria-label="Agent 类型" value={provider} onChange={e=>setProvider(e.target.value)}><option value="">选择 Agent 类型</option>{providers.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select>}</div></div>}{duplicate&&<p className="cfg-notice" role="alert">这个配置已添加，请返回选择其他位置。</p>}</>}
   {step===2&&identified&&<><dl className="cfg-dialog-summary"><div><dt>Agent 类型</dt><dd>{identified.name}</dd></div><div><dt>配置位置</dt><dd>{path}</dd></div></dl><div className="cfg-name-field"><label htmlFor="manual-name">配置名称</label><input id="manual-name" maxLength={40} value={name??''} onChange={e=>setName(e.target.value)} aria-describedby="manual-name-hint"/><p id="manual-name-hint">{name?.trim()?'用于区分不同安装或项目，之后也可以修改。':'请输入配置名称，最多 40 个字。'}</p></div></>}
  </section>
  <footer className="cfg-dialog-footer"><div>{step>0&&<button className="co-secondary" onClick={()=>setStep(s=>s-1)}>上一步</button>}<button className="co-primary" disabled={step===0?!path.trim():step===1?!ready:!ready||!name?.trim()} onClick={next}>{step===0?'验证配置':step===1?'下一步':existing?'保存配置':'添加配置'}<Icon name={step===2?'check':'right'}/></button></div></footer>
 </div></dialog>;
}
