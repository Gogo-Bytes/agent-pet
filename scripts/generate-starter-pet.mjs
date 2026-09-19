// Project-authored geometry and animations, dedicated to CC0-1.0.
// Rebuild the bundled fixture with: node scripts/generate-starter-pet.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const chunks = [];
const bufferViews = [];
const accessors = [];
let byteLength = 0;
function accessor(values, type, components, min, max) {
  const data = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => data.writeFloatLE(value, index * 4));
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length });
  chunks.push(data);
  byteLength += data.length;
  accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126,
    count: values.length / components, type, ...(min ? { min, max } : {}) });
  return accessors.length - 1;
}
const vertices = [
  [-.5,-.5,-.5], [.5,-.5,-.5], [.5,.5,-.5], [-.5,.5,-.5],
  [-.5,-.5,.5], [.5,-.5,.5], [.5,.5,.5], [-.5,.5,.5],
];
const faces = [[4,5,6,7], [1,0,3,2], [5,1,2,6], [0,4,7,3], [7,6,2,3], [0,1,5,4]];
const positions = faces.flatMap(([a,b,c,d]) => [a,b,c,a,c,d].flatMap(i => vertices[i]));
const position = accessor(positions, 'VEC3', 3, [-.5,-.5,-.5], [.5,.5,.5]);
const colors = [[.48,.3,.88,1], [.72,.58,1,1], [.06,.06,.12,1], [.3,1,.8,1]];
const materials = colors.map(color => ({ pbrMetallicRoughness: {
  baseColorFactor: color, metallicFactor: 0, roughnessFactor: .85,
} }));
const meshes = colors.map((_, material) => ({ primitives: [{ attributes: { POSITION: position }, material }] }));
const nodes = [{ name: 'Pet', children: [] }];
function part(name, mesh, translation, scale) {
  nodes[0].children.push(nodes.length);
  nodes.push({ name, mesh, translation, scale });
}
part('Body', 0, [0,-.1,0], [1,.85,.7]);
part('Head', 1, [0,.65,0], [1.2,.8,.8]);
part('LeftEye', 2, [-.28,.7,.42], [.19,.22,.07]);
part('RightEye', 2, [.28,.7,.42], [.19,.22,.07]);
part('Mouth', 3, [0,.42,.42], [.32,.07,.07]);
part('LeftEar', 0, [-.43,1.18,0], [.22,.28,.35]);
part('RightEar', 0, [.43,1.18,0], [.22,.28,.35]);
part('LeftFoot', 1, [-.32,-.72,.13], [.32,.35,.58]);
part('RightFoot', 1, [.32,-.72,.13], [.32,.35,.58]);
part('LeftArm', 1, [-.68,-.12,0], [.25,.6,.4]);
part('RightArm', 1, [.68,-.12,0], [.25,.6,.4]);
const animations = [];
function animate(name, duration, points) {
  const input = accessor([0, duration / 2, duration], 'SCALAR', 1, [0], [duration]);
  const output = accessor(points.flat(), 'VEC3', 3);
  animations.push({ name, samplers: [{ input, output, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] });
}
animate('Idle', 2.4, [[0,0,0],[0,.04,0],[0,0,0]]);
animate('Work', .6, [[-.06,0,0],[.06,.08,0],[-.06,0,0]]);
animate('Success', .8, [[0,0,0],[0,.3,0],[0,0,0]]);
animate('Error', .2, [[-.05,0,0],[.05,0,0],[-.05,0,0]]);
const document = { asset: { version: '2.0', generator: 'Agent Pet starter generator' },
  scene: 0, scenes: [{ nodes: [0] }], nodes, meshes, materials, animations,
  buffers: [{ byteLength }], bufferViews, accessors };
const json = Buffer.from(JSON.stringify(document));
const jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
json.copy(jsonPadded);
const binary = Buffer.concat(chunks);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8);
header.writeUInt32LE(jsonPadded.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binary.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
const directory = new URL('../packages/pet-runtime/assets/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('starter.glb', directory), Buffer.concat([header, jsonPadded, binHeader, binary]));
