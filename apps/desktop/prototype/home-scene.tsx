import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { MathUtils, Vector3, type Group } from 'three';
import { Icon } from './components/icons.js';
import './home-scene.css';

export type HomePet = { id: string; agent: string; name: string; configuration: string; status: string; tone: 'violet' | 'mint' | 'peach' };
type Point = [number, number, number];
const palettes = { violet: ['#a996f3','#c5b4ff','#7762c6'], mint: ['#80cbb6','#b1e3d4','#438e7b'], peach: ['#edaa87','#ffd0ad','#ae6e4c'] } as const;
function position(index: number, count: number): Point {
 const columns=Math.min(count,3);const row=Math.floor(index/columns);const rowCount=Math.min(columns,count-row*columns);
 return [(index%columns-(rowCount-1)/2)*2.7,0,(row-(Math.ceil(count/columns)-1)/2)*2.6+(index%2?-.4:.4)];
}

function CameraRig({ target, count, reduced }: { target: Point | null; count: number; reduced: boolean }) {
 const { camera, size } = useThree();
 const look = useRef(new Vector3(0, .8, 0));
 const goal = useRef(new Vector3());
 const destination = useRef(new Vector3());
 useFrame((_, delta) => {
  const narrow = size.width < 650;
  const rows=Math.max(1,Math.ceil(count/3));
  const halfWidth=(Math.min(count,3)-1)*2.7/2+1.1;
  const distance = Math.max(10,halfWidth/(Math.tan(19*Math.PI/180)*(size.width/size.height)))+(rows-1)*2.2;
  destination.current.set(target ? target[0] : 0, target ? 2.4 : 4.5+(rows-1), target ? target[2] + (narrow ? 6.6 : 5.1) : distance);
  goal.current.set(target ? target[0] - (narrow ? 0 : 1) : 0, target ? (narrow ? .55 : 1) : .8, target ? target[2] : 0);
  const rate = reduced ? 1 : 1 - Math.exp(-delta * 5);
  camera.position.lerp(destination.current, rate);look.current.lerp(goal.current, rate);camera.lookAt(look.current);
 });
 return null;
}

function Creature({ pet, at, selected, reduced, onFocus }: { pet: HomePet; at: Point; selected: boolean; reduced: boolean; onFocus: () => void }) {
 const body = useRef<Group>(null);
 const [hover, setHover] = useState(false);
 const [face, belly, ink] = palettes[pet.tone];
 useFrame(({ clock }, delta) => {
  if (!body.current) return;
  body.current.position.y = reduced ? 0 : Math.sin(clock.elapsedTime * 1.7 + at[0]) * .045;
  body.current.rotation.y = MathUtils.damp(body.current.rotation.y, hover ? -.12 : .08, 6, delta);
 });
 return <group position={at}>
  <mesh rotation={[-Math.PI / 2,0,0]} position={[0,.014,0]}><circleGeometry args={[.75,48]}/><meshBasicMaterial color={selected ? '#b3a0ec' : '#d9d2eb'} transparent opacity={.38}/></mesh>
  <group ref={body} onClick={e=>{e.stopPropagation();onFocus();}} onPointerOver={e=>{e.stopPropagation();setHover(true);}} onPointerOut={()=>setHover(false)}>
   <RoundedBox args={[.91,1.12,.68]} radius={.28} smoothness={4} position={[0,.77,0]}><meshStandardMaterial color={belly} roughness={.8}/></RoundedBox>
   <RoundedBox args={[1.23,.8,.76]} radius={.3} smoothness={4} position={[0,1.58,.015]}><meshStandardMaterial color={face} roughness={.65}/></RoundedBox>
   {[-1,1].map(side=><group key={side}>
    <mesh position={[side * .4,2.02,0]} rotation={[0,0,side * -.3]}><coneGeometry args={[.15,.38,3]}/><meshStandardMaterial color={face}/></mesh>
    <mesh position={[side * .25,1.64,.403]}><sphereGeometry args={[.035,12,12]}/><meshBasicMaterial color={ink}/></mesh>
    <mesh position={[side * .36,1.46,.398]} scale={[1,.5,1]}><sphereGeometry args={[.08,12,12]}/><meshBasicMaterial color="#ffd1d8" transparent opacity={.65}/></mesh>
    <mesh position={[side * .28,.18,.15]} scale={[1,.6,1.25]}><sphereGeometry args={[.22,20,20]}/><meshStandardMaterial color={face}/></mesh>
   </group>)}
   <mesh position={[0,1.46,.411]} rotation={[0,0,Math.PI]}><torusGeometry args={[.055,.013,8,16,Math.PI]}/><meshBasicMaterial color={ink}/></mesh>
   <mesh position={[0,.77,.359]} rotation={[0,0,Math.PI/4]}><planeGeometry args={[.18,.18]}/><meshBasicMaterial color="#fff9ed"/></mesh>
  </group>
  <Html center position={[0,1.16,.5]} zIndexRange={[3,1]}>
   <button className="home-pet-hit" aria-label={`聚焦 ${pet.agent} 的${pet.name}（${pet.configuration}）`} aria-pressed={selected} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onFocus();}} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocus={()=>setHover(true)} onBlur={()=>setHover(false)}><span>{pet.agent} · {pet.name}</span></button>
  </Html>
 </group>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 render() { return this.state.failed ? <p className="home-scene-failed" role="alert">场景无法加载，请刷新页面重试。</p> : this.props.children; }
}

export function HomeScene({ pets, visible, onSelect }: { pets: HomePet[]; visible: boolean; onSelect: (id: string) => void }) {
 const [focused, setFocused] = useState<string | null>(null);
 const [reduced, setReduced] = useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [documentVisible, setDocumentVisible] = useState(!document.hidden);
 const surface = useRef<HTMLDivElement>(null);
 const active = pets.find(pet=>pet.id===focused);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);const visibility=()=>setDocumentVisible(!document.hidden);document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(!visible||!pets.some(p=>p.id===focused))setFocused(null);},[pets,visible,focused]);
 function overview(restore=false) { setFocused(null);if(restore)surface.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({preventScroll:true}); }
 function focus(pet: HomePet) { setFocused(pet.id);onSelect(pet.id.split('-')[0]!); }
 return <div ref={surface} className={`home-scene ${active?'is-focused':''}`} hidden={!visible} aria-label="在线 Agent 宠物场景" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();overview(true);}if(e.key.startsWith('Arrow'))e.stopPropagation();}}>
  <SceneBoundary><Canvas camera={{position:[0,4.5,10],fov:38}} dpr={[1,1.5]} gl={{alpha:true,antialias:true}} frameloop={visible&&documentVisible?'always':'never'} onPointerMissed={()=>overview()}>
   <ambientLight intensity={2}/><directionalLight intensity={3} position={[-3,7,5]} color="#fff5ed"/><directionalLight intensity={1} position={[4,3,-4]} color="#d6ceff"/>
   <CameraRig count={pets.length} target={active?position(pets.indexOf(active),pets.length):null} reduced={reduced}/>
   <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.07,0]}><circleGeometry args={[Math.max(5.4,Math.ceil(pets.length/3)*1.8),80]}/><meshStandardMaterial color="#ede7fc" roughness={1}/></mesh>
   {pets.map((pet,index)=><Creature key={pet.id} pet={pet} at={position(index,pets.length)} selected={focused===pet.id} reduced={reduced} onFocus={()=>focus(pet)}/>)}
  </Canvas></SceneBoundary>
  {active?<><div className="pet-identity home-focus-info" role="status"><span className="identity-agent">{active.agent}</span><h1>{active.name}</h1><span className="identity-status">{active.status}</span><small>{active.configuration}</small></div><button className="home-overview" onClick={()=>overview(true)}><Icon name="left"/>返回全景</button></>:pets.length?<p className="home-scene-hint">点击宠物，查看信息</p>:<div className="home-scene-empty"><h1>还没有在线的 Agent</h1><p>Agent 启动并连接后，它的宠物会出现在这里。</p><p>可以从底部「连接」添加配置。</p></div>}
 </div>;
}
