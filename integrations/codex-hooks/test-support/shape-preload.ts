import { observeHookShape, recordHookShape } from './hook-shape.js';
const file = process.env.AGENT_PET_CODEX_SHAPE_FILE;
const approved = '/tmp/agent-pet-codex-start-20261019-5f92c8-r2/runtime/startup-shape.ndjson';
if (file === approved) observeHookShape(process.stdin, input => recordHookShape(file, input));
