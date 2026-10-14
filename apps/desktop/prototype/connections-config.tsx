// Browser prototype: configuration validity is independent of live communication.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleHelp, Folder, FolderOpen, LoaderCircle, Pencil, Plus, RotateCcw, ScanLine, ShieldCheck, Trash2, TriangleAlert, X } from 'lucide-react';
import { catalog, type AgentEntry } from './connection-options.js';
import type { ConnectionDemo, ConnectionHealths } from './connections.js';
import { ManualConnectionDialog } from './manual-connection-dialog.js';
import { AgentMark } from './menu-components.js';
import { GlassButton } from './components/glass.js';
import './connections-config.css';
type Validity='usable'|'unchecked'|'missing'|'unreadable'|'invalid';
type Config=AgentEntry & {validity:Validity};
const labels:Record<Validity,string>={usable:'配置可用',unchecked:'尚未检查',missing:'位置不存在',unreadable:'无法读取',invalid:'配置需修复'};
const reasons:Record<Validity,string>={usable:'位置可读取，配置格式匹配。',unchecked:'检查配置位置与格式后，确认是否可用。',missing:'原位置已找不到。选择新的配置文件或文件夹。',unreadable:'请检查该位置的访问权限，然后重新检查。',invalid:'配置格式不匹配。修正配置后重新检查，或更换位置。'};
const initial:Config[]=catalog.slice(0,5).map(a=>({...a,validity:a.id==='gemini'?'missing':a.id==='opencode'?'unchecked':'usable'}));
const candidates=catalog.filter(a=>a.id!=='gemini');
function go(page:string){location.hash=`/connections/${page}`;}
function currentPage(){return location.hash.replace(/^#\/connections\/?/,'')||'library';}
function Status({value,checking=false}:{value:Validity;checking?:boolean}){const Glyph=checking?LoaderCircle:value==='usable'?ShieldCheck:value==='unchecked'?CircleHelp:TriangleAlert;return <span className={`cfg-status cfg-${value}`}><span className="cfg-status-emblem" aria-hidden="true"><Glyph size={23} className={checking?'menu-spin':''}/></span><strong>{checking?'检查中…':labels[value]}</strong></span>;}
export function ConnectionsConfig({visible,demo,onConfigured}:{visible:boolean;demo:ConnectionDemo;onConfigured:(healths:ConnectionHealths)=>void}) {
 const requestedDemo=new URLSearchParams(location.search).get('configDemo');
 const sampleDemo:ConnectionDemo=requestedDemo&&['normal','empty','missing','waiting','error'].includes(requestedDemo)?requestedDemo as ConnectionDemo:demo;
 const [page,setPage]=useState(currentPage);const [records,setRecords]=useState<Config[]>(initial);const [scanning,setScanning]=useState(false);const [scanned,setScanned]=useState(false);const [refreshing,setRefreshing]=useState<string[]>([]);const [notice,setNotice]=useState('');
 const [draft,setDraft]=useState<Config|null>(null);const [renameValue,setRenameValue]=useState('');const [manualTarget,setManualTarget]=useState<Config|null|undefined>(undefined);
 const main=useRef<HTMLElement>(null);const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());const lastDemo=useRef(sampleDemo);const activePage=useRef(page);const lastSelected=useRef('');
 const [section,id]=page.split('/');const selected=records.find(r=>r.id===id);const target=section==='confirm'?(draft?.id===id?draft:undefined):selected;
 const library=section==='library';const detail=section==='agent';const browsing=library||detail;const discover=section==='discover';const confirming=section==='confirm';const done=section==='done';const removing=section==='remove';const renaming=section==='rename';
 const current=detail?selected:records.find(r=>r.id===lastSelected.current)??records[0];
 useEffect(()=>{const sync=()=>{activePage.current=currentPage();setPage(currentPage());setNotice('');};addEventListener('hashchange',sync);addEventListener('popstate',sync);return()=>{removeEventListener('hashchange',sync);removeEventListener('popstate',sync);};},[]);
 useEffect(()=>()=>{for(const timer of timers.current.values())clearTimeout(timer);},[]);
 useEffect(()=>{if(lastDemo.current!==sampleDemo){go('library');lastDemo.current=sampleDemo;lastSelected.current='';}setManualTarget(undefined);setRecords(sampleDemo==='empty'||sampleDemo==='missing'?[]:sampleDemo==='error'?[{...initial[0]!,validity:'invalid'}]:sampleDemo==='waiting'?[{...initial[0]!,validity:'unchecked'}]:initial);setScanning(false);setScanned(false);setRefreshing([]);for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();},[sampleDemo]);
 useEffect(()=>{const healths:ConnectionHealths={};for(const record of records){const key=record.id.split('-')[0] as keyof ConnectionHealths;if(healths[key]!=='online')healths[key]=record.health;}onConfigured(healths);},[records,onConfigured]);
 useEffect(()=>{if(!scanning)return;const timer=setTimeout(()=>{setScanning(false);setScanned(true);},900);return()=>clearTimeout(timer);},[scanning]);
 useEffect(()=>{if(!visible)return;const row=browsing&&lastSelected.current?main.current?.querySelector<HTMLElement>(`[data-config="${lastSelected.current}"]`):null;const heading=detail&&matchMedia('(max-width:700px)').matches?main.current?.querySelector<HTMLElement>('.cfg-identity h2'):null;(heading??row??main.current?.querySelector<HTMLElement>('h1'))?.focus({preventScroll:true});main.current?.querySelector('.cfg-content-scroll')?.scrollTo({top:0});},[page,visible]);
 useEffect(()=>{if(renaming)setRenameValue(selected?.alias??'');},[page]);
 function scan(){setScanned(false);setScanning(true);go('discover');}
 function refresh(value:Config){if(timers.current.has(value.id))return;setRefreshing(ids=>[...ids,value.id]);const timer=setTimeout(()=>{setRecords(rs=>rs.map(r=>r.id===value.id?{...r,validity:r.validity==='unchecked'?'usable':r.validity}:r));setRefreshing(ids=>ids.filter(i=>i!==value.id));if(activePage.current==='library'||activePage.current===`agent/${value.id}`)setNotice(`检查完成：${labels[value.validity==='unchecked'?'usable':value.validity]}。`);timers.current.delete(value.id);},650);timers.current.set(value.id,timer);}
 function allocateId(value:AgentEntry){return records.some(r=>r.id===value.id)?`${value.id.split('-')[0]}-config-${crypto.randomUUID()}`:value.id;}
 function saveDraft(){if(!target?.alias.trim())return;if(records.some(r=>r.path===target.path&&r.name===target.name)){setNotice('这个配置已添加，请返回我的连接查看。');return;}setRecords(rs=>[...rs,{...target,alias:target.alias.trim(),validity:'usable'}]);lastSelected.current=target.id;setDraft(null);go(`done/${target.id}`);}
 const addActions=<div className="cfg-add-actions"><button className="cfg-scan-button" onClick={scan}><ScanLine size={20}/><span>自动扫描</span><ArrowRight size={16}/></button><GlassButton className="cfg-manual-button" aria-label="手动添加" title="手动添加 · 选择配置位置" onClick={()=>setManualTarget(null)}><Plus size={23} strokeWidth={1.8}/></GlassButton></div>;
 const title=discover?'自动扫描':confirming?'命名与确认':done?'配置已添加':renaming?'重命名':'移除配置';
 return <section hidden={!visible} className="cfg-page co-embedded" aria-label="Agent 配置管理" data-page={section} onKeyDown={e=>{if(e.key.startsWith('Arrow'))e.stopPropagation();}}>
 <article ref={main} className={`cfg-menu ${browsing?'cfg-browsing':''}`}>
  {browsing?<>
   <header className="cfg-library-head"><div><h1 tabIndex={-1}>我的连接 <span>{records.length.toString().padStart(2,'0')}</span></h1><p>选择一个配置，查看或修改。</p></div>{addActions}</header>
   <div className="cfg-library-body">
    <nav className="cfg-index" aria-label="已添加配置"><span className="cfg-index-label">已添加配置</span>{records.map(value=><button key={value.id} data-config={value.id} aria-pressed={current?.id===value.id} onClick={()=>{lastSelected.current=value.id;go(`agent/${value.id}`);}}><AgentMark agent={value}/><span><strong>{value.alias}</strong><small>{value.name}</small></span><span className={`cfg-index-indicator cfg-${value.validity}`} aria-label={labels[value.validity]}>{value.validity==='usable'?<Check size={13}/>:value.validity==='unchecked'?<span>·</span>:<TriangleAlert size={14}/>}</span><ArrowRight className="cfg-index-arrow" size={16}/></button>)}</nav>
    <div className="cfg-content-scroll">
     {current?<section className="cfg-detail" key={current.id}><button className="cfg-text-button cfg-mobile-back" onClick={()=>go('library')}><ArrowLeft size={17}/>我的连接</button><div className="cfg-detail-panel">
       <div className="cfg-identity"><div className="cfg-emblem"><AgentMark agent={current}/></div><div><span className="cfg-type">{current.name}</span><h2 tabIndex={-1}>{current.alias}</h2></div><button className="cfg-icon-button" aria-label="重命名" title="重命名" onClick={()=>go(`rename/${current.id}`)}><Pencil size={18}/></button></div>
       <div className={`cfg-check cfg-${current.validity}`}><div><Status value={current.validity} checking={refreshing.includes(current.id)}/><p>{reasons[current.validity]}</p></div><button className="cfg-refresh-button" aria-disabled={refreshing.includes(current.id)} onClick={()=>refresh(current)}><RotateCcw size={17} className={refreshing.includes(current.id)?'menu-spin':''}/><span>{refreshing.includes(current.id)?'检查中':'刷新检查'}</span></button></div>
       <div className="cfg-location"><span className="cfg-section-label">配置位置</span><button className="cfg-location-control" aria-label="更换位置" title="更换位置" onClick={()=>setManualTarget(current)}><span className="cfg-folder-emblem" aria-hidden="true"><Folder size={23} strokeWidth={1.6}/></span><code>{current.path}</code><span className="cfg-location-action"><span>更换位置</span><ArrowRight size={17}/></span></button></div>
      </div>
      <div className="cfg-detail-end"><span>移除后保留 Agent 程序和文件</span><button className="cfg-text-button cfg-delete" onClick={()=>go(`remove/${current.id}`)}><Trash2 size={15}/>移除配置</button></div>
     </section>:<div className="cfg-empty"><FolderOpen/><h2>{detail?'配置未找到':'从第一个连接开始'}</h2><p>{detail?'这条配置已移除，请选择其他配置。':'自动扫描本机，或选择已有配置位置。'}</p>{detail&&<button className="cfg-secondary" onClick={()=>go('library')}>返回列表</button>}</div>}
     {notice&&<p className="cfg-notice" role="status">{notice}</p>}
    </div>
   </div>
  </>:<>
   <header className="cfg-subpage-head"><button className="cfg-text-button" onClick={()=>go(confirming?'discover':renaming||removing?`agent/${id}`:'library')}><ArrowLeft size={17}/>{confirming?'扫描结果':renaming||removing?'配置详情':'我的连接'}</button><span>{title}</span></header>
   <div className="cfg-content-scroll">
    {discover&&<section className="cfg-discovery"><div className="cfg-discovery-heading"><div><h1 tabIndex={-1}>自动扫描</h1><p>{scanning?'正在查找个人与项目配置…':scanned?sampleDemo==='missing'?'没有找到配置。试试手动选择位置。':`找到 ${candidates.length} 个配置，选择要添加的。`:'查找已有的 Agent 配置。'}</p></div><button className="cfg-secondary" disabled={scanning} onClick={scan}><RotateCcw size={16}/>重新扫描</button></div>
     {scanning?<div className="cfg-scan-stage" role="status"><div className="cfg-scan-art"><ScanLine/></div><strong>正在查找配置</strong><p>个人配置与项目配置</p><button className="cfg-secondary" onClick={()=>{setScanning(false);go('library');}}><X size={16}/>取消扫描</button></div>:scanned&&sampleDemo!=='missing'?<div className="cfg-results">{candidates.map(a=>{const added=records.some(r=>r.path===a.path&&r.name===a.name);return <div className="cfg-result" key={a.id}><AgentMark agent={a}/><div><strong>{a.alias}<span>{a.name}</span></strong><code>{a.path}</code></div>{added?<span className="cfg-already"><Check size={16}/>已添加</span>:<button className="cfg-secondary" aria-label={`添加 ${a.name} ${a.alias}`} onClick={()=>{const value=draft?.path===a.path&&draft.name===a.name?draft:{...a,id:allocateId(a),validity:'usable' as const};setDraft(value);go(`confirm/${value.id}/scan`);}}>添加<Plus size={16}/></button>}</div>;})}</div>:<div className="cfg-empty"><ScanLine/><h2>未找到配置</h2><p>选择配置目录或文件，让我们识别它。</p></div>}
     {!scanning&&<button className="cfg-text-button cfg-discover-manual" onClick={()=>setManualTarget(null)}><FolderOpen size={18}/>手动添加<ArrowRight size={16}/></button>}
    </section>}
    {(confirming||done||removing)&&target&&<section className={`cfg-form-page ${removing?'cfg-removal':''}`}><span className="cfg-form-sign" aria-hidden="true">{done?<CheckCircle2/>:removing?<Trash2/>:<Plus/>}</span><h1 tabIndex={-1}>{title}</h1><p className="cfg-form-intro">{removing?'只移除 Agent Pet 中的这条配置。Agent 程序和文件都会保留。':done?'你可以在配置详情中再次检查或修改。':'给这个配置起个容易区分的名字。'}</p><div className="cfg-form-target"><AgentMark agent={target}/><div><strong>{target.name}{!confirming&&` · ${target.alias}`}</strong><code>{target.path}</code></div></div>
     {confirming&&<form onSubmit={e=>{e.preventDefault();saveDraft();}}><div className="cfg-name-field"><label htmlFor="cfg-add-name">配置名称</label><input id="cfg-add-name" maxLength={40} value={target.alias} onChange={e=>setDraft({...target,alias:e.target.value})} aria-describedby="cfg-name-hint"/><p id="cfg-name-hint">用于区分安装或项目，最多 40 个字。</p></div><div className="cfg-form-actions"><button type="button" className="cfg-secondary" onClick={()=>go('discover')}>返回修改</button><button className="cfg-primary" disabled={!target.alias.trim()}>确认添加<Check size={17}/></button></div></form>}
     {done&&<div className="cfg-form-actions"><button className="cfg-secondary" onClick={()=>go('library')}>返回列表</button><button className="cfg-primary" onClick={()=>go(`agent/${id}`)}>查看配置<ArrowRight size={17}/></button></div>}
     {removing&&<div className="cfg-form-actions"><button className="cfg-secondary" onClick={()=>go(`agent/${id}`)}>取消</button><button className="cfg-primary cfg-danger" onClick={()=>{clearTimeout(timers.current.get(id!));timers.current.delete(id!);setRefreshing(ids=>ids.filter(v=>v!==id));setRecords(rs=>rs.filter(r=>r.id!==id));lastSelected.current='';go('library');}}>确认移除<Trash2 size={17}/></button></div>}
    </section>}
    {renaming&&selected&&<section className="cfg-form-page"><span className="cfg-form-sign"><Pencil/></span><h1 tabIndex={-1}>重命名</h1><p className="cfg-form-intro">只修改显示名称，配置位置保持不变。</p><div className="cfg-form-target"><AgentMark agent={selected}/><div><strong>{selected.name}</strong><code>{selected.path}</code></div></div><form onSubmit={e=>{e.preventDefault();const alias=renameValue.trim();if(!alias)return;setRecords(rs=>rs.map(r=>r.id===id?{...r,alias}:r));go(`agent/${id}`);}}><div className="cfg-name-field"><label htmlFor="cfg-rename-name">配置名称</label><input id="cfg-rename-name" maxLength={40} value={renameValue} onChange={e=>setRenameValue(e.target.value)}/><p>用于区分安装或项目，最多 40 个字。</p></div><div className="cfg-form-actions"><button type="button" className="cfg-secondary" onClick={()=>go(`agent/${id}`)}>取消</button><button className="cfg-primary" disabled={!renameValue.trim()||renameValue.trim()===selected.alias}>保存名称<Check size={17}/></button></div></form></section>}
    {((renaming&&!selected)||((confirming||done||removing)&&!target))&&<div className="cfg-empty"><h1 tabIndex={-1}>配置未找到</h1><p>请重新选择配置。</p><button className="cfg-primary" onClick={()=>go('library')}>返回列表</button></div>}
    {notice&&<p className="cfg-notice" role="status">{notice}</p>}
   </div>
  </>}
 </article>{manualTarget!==undefined&&visible&&<ManualConnectionDialog existing={manualTarget} records={records} onClose={()=>setManualTarget(undefined)} onSave={value=>{const record:Config={...(manualTarget??value),path:value.path,alias:value.alias,id:manualTarget?.id??allocateId(value),validity:'usable'};setRecords(rs=>[...rs.filter(r=>r.id!==record.id),record]);lastSelected.current=record.id;setManualTarget(undefined);go(`agent/${record.id}`);}}/>}
 </section>;
}
