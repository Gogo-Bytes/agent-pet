import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connectionScenes, findConnectionScene } from './connection-scenes-data.js';
import './connection-scenes.css';

function Catalog() {
  const [id, setId] = useState(() => findConnectionScene(new URLSearchParams(location.search).get('scene'))[0]);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('loading');
  const [width, setWidth] = useState('wide');
  const frame = useRef<HTMLIFrameElement>(null);
  const selected = findConnectionScene(id);
  const index = connectionScenes.findIndex(scene => scene[0] === id);
  const groups = [...new Set(connectionScenes.map(scene => scene[1]))];
  function select(next: typeof id) { setStatus('loading'); setId(next); setRevision(value => value + 1); const url = new URL(location.href); url.searchParams.set('scene', next); history.pushState(null, '', url); }
  useEffect(() => {
    const message = (event: MessageEvent) => { if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'connection-scene' && event.data.scene === id) setStatus(event.data.status); };
    const back = () => { setId(findConnectionScene(new URLSearchParams(location.search).get('scene'))[0]); setRevision(value => value + 1); setStatus('loading'); };
    window.addEventListener('message', message); window.addEventListener('popstate', back);
    return () => { window.removeEventListener('message', message); window.removeEventListener('popstate', back); };
  }, [id]);
  return <div className="scene-catalog">
    <aside><header><span className="catalog-eyebrow">Agent Pet · Demo Web</span><h1>连接页全部场景 <small>{connectionScenes.length}</small></h1><p>按编号逐个调整。这里都是示例，不会连接或修改本机 pi。</p></header>
      <nav aria-label="连接页场景目录">{groups.map(group => <section key={group}><h2>{group}</h2>{connectionScenes.map((scene, number) => scene[1] === group && <a key={scene[0]} href={`?scene=${scene[0]}`} aria-current={id === scene[0] ? 'page' : undefined} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); select(scene[0]); }}><span>{String(number + 1).padStart(2, '0')}</span>{scene[2]}</a>)}</section>)}</nav>
    </aside>
    <main><header className="scene-toolbar"><div><span className="catalog-eyebrow">{selected[1]} · {index + 1} / {connectionScenes.length}</span><h2>{selected[2]}</h2><p>{selected[3]}</p></div><div className="scene-actions"><button disabled={index === 0} onClick={() => select(connectionScenes[index - 1]![0])}>上一个</button><button disabled={index === connectionScenes.length - 1} onClick={() => select(connectionScenes[index + 1]![0])}>下一个</button></div></header>
      <div className="scene-options"><label htmlFor="demo-window">窗口</label><select id="demo-window" value={width} onChange={event => setWidth(event.target.value)}><option value="wide">宽窗口</option><option value="narrow">窄窗口 · 390</option><option value="short">矮窗口 · 480</option></select><span role="status">{status === 'ready' ? '可以操作 · 返回本场景请重新打开' : status === 'error' ? '场景打开失败，请重试' : '正在打开场景…'}</span><button onClick={() => { setStatus('loading'); setRevision(value => value + 1); }}>重新打开</button><a href={`connection-scene-frame.html?scene=${id}`} target="_blank" rel="noreferrer">单独打开 ↗</a></div>
      <div className={`scene-viewport scene-${width}`}><iframe key={`${id}-${revision}`} ref={frame} title={`场景 ${index + 1}：${selected[2]}`} src={`connection-scene-frame.html?scene=${id}`} /></div>
    </main>
  </div>;
}
createRoot(document.getElementById('app')!).render(<Catalog />);
