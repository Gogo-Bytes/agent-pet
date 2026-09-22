import { join } from 'node:path';
import type { PreflightState } from '../shared/pi-preflight.js';
import { detectInstallations, identifyInstallation, inspectTarget, limits, ReadBudget, scanPaths } from './pi-preflight-files.js';

export class PiPreflight {
  private state: PreflightState;
  private generation = 0;
  private reading = false;
  private picking = false;
  private controller?: AbortController;
  private closed = false;
  constructor(private readonly options: { home: string; guiPath: string; pick(kind: 'installation' | 'target'): Promise<string | null> }) {
    this.state = { revision: 0, installations: [], selectedInstallation: null,
      target: { path: join(options.home, '.pi/agent'), source: 'default' }, inspection: null, scan: 'not-run', notice: 'none' };
  }
  snapshot(): PreflightState { return structuredClone(this.state); }
  close(): void { this.closed = true; this.generation++; this.controller?.abort(); }
  private begin(): number {
    if (this.closed) throw new Error('Preflight unavailable');
    this.controller?.abort();
    this.state.revision = ++this.generation;
    this.state.notice = 'none';
    return this.generation;
  }
  private async read<T>(work: (budget: ReadBudget) => Promise<T>): Promise<T> {
    if (this.reading) throw new Error('busy');
    this.reading = true;
    const controller = new AbortController(); this.controller = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = work(new ReadBudget(controller.signal)).finally(() => { this.reading = false; });
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, limits.milliseconds);
      })]);
    } finally { if (timer) clearTimeout(timer); }
    // A timed-out OS call cannot be forcibly cancelled; the single reader stays occupied until it settles.
  }
  async detect(): Promise<PreflightState> {
    const generation = this.begin();
    if (this.reading) { this.state.notice = 'busy'; return this.snapshot(); }
    try {
      const result = await this.read(budget => detectInstallations(scanPaths(this.options.home, this.options.guiPath), budget));
      if (generation === this.generation) {
        this.state.installations = result.installations.map((candidate, index) => ({ ...candidate, id: `scan-${generation}-${index}` }));
        this.state.selectedInstallation = null;
        this.state.scan = this.options.guiPath.length > 32768 || this.options.guiPath.split(':').length > limits.pathEntries ? 'limited' : result.scan;
      }
    } catch { if (generation === this.generation) { this.state.scan = 'limited'; this.state.notice = 'failed'; } }
    return this.snapshot();
  }
  selectInstallation(id: unknown): PreflightState {
    if (typeof id !== 'string' || id.length > 80 || !this.state.installations.some(candidate => candidate.id === id)) throw new Error('Invalid installation selection');
    this.begin(); this.state.selectedInstallation = id; return this.snapshot();
  }
  useDefaultTarget(): PreflightState {
    this.begin(); this.state.target = { path: join(this.options.home, '.pi/agent'), source: 'default' };
    this.state.inspection = null; return this.snapshot();
  }
  async choose(kind: 'installation' | 'target'): Promise<PreflightState> {
    const generation = this.begin();
    if (this.picking || (kind === 'installation' && this.reading)) { this.state.notice = 'busy'; return this.snapshot(); }
    this.picking = true;
    try {
      const path = await this.options.pick(kind);
      if (generation !== this.generation) return this.snapshot();
      if (path === null) { this.state.notice = 'cancelled'; return this.snapshot(); }
      // Native dialog is the only source of paths. Selection itself does not inspect configuration.
      new ReadBudget().validatePath(path);
      if (kind === 'target') {
        this.state.target = { path, source: 'chosen' }; this.state.inspection = null;
      } else {
        const candidate = await this.read(budget => identifyInstallation(path, `chosen-${generation}`, true, budget));
        if (generation === this.generation && candidate) {
          this.state.installations = [...this.state.installations.filter(item => item.path !== candidate.path).slice(-34), candidate];
          this.state.selectedInstallation = candidate.id;
        } else if (generation === this.generation) this.state.notice = 'failed';
      }
    } catch { if (generation === this.generation) this.state.notice = 'failed'; }
    finally { this.picking = false; }
    return this.snapshot();
  }
  async inspect(): Promise<PreflightState> {
    const generation = this.begin();
    if (this.reading) { this.state.notice = 'busy'; return this.snapshot(); }
    const target = { ...this.state.target };
    this.state.inspection = null;
    try {
      const inspection = await this.read(budget => inspectTarget(target, budget));
      if (generation === this.generation) this.state.inspection = inspection;
    } catch { if (generation === this.generation) this.state.inspection = { target, findings: ['budget'] }; }
    return this.snapshot();
  }
}
