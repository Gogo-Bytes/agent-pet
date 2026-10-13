import { createRoot } from 'react-dom/client';
import { GlassButton, GlassSurface, GlassToolbar } from './components/glass.js';
import './glass-study.css';
function Study() {
  return <main><header><p>Agent Pet · 材质验证</p><h1>看透背景，看清操作。</h1><span>线条用于检查边缘弯曲；浅色背景用于检查实际界面的质感。</span></header><div className="study-scenes">{['lines', 'soft'].map(scene => <section className={`study-scene ${scene}`} key={scene}><GlassToolbar className="study-toolbar"><button aria-label="重新播放">↻</button><button>▷ 待机</button><button>⌄</button></GlassToolbar><GlassButton className="study-button" aria-pressed>星星</GlassButton><GlassSurface className="study-panel" material="panel"><h2>动作</h2><p>文字与图标保持清晰</p><button>▷ 庆祝</button><button>▷ 工作</button></GlassSurface></section>)}</div></main>;
}
createRoot(document.getElementById('root')!).render(<Study />);
