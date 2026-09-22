export type Finding = 'unsafe' | 'unreadable' | 'missing-target' | 'root-entry' | 'root-manifest' | 'manifest-unknown' | 'existing-extension' | 'ignore-unknown' | 'settings-unknown' | 'budget' | 'platform-unknown';
export const findingText: Record<Finding, string> = {
  unsafe: '路径、所有者、权限或文件类型不安全；不跟随配置符号链接。',
  unreadable: '无法安全读取必要文件，或 JSON 格式不受支持。',
  'missing-target': '配置目录不存在；本阶段不会创建目录。',
  'root-entry': 'extensions 根 index.ts / index.js 会阻止独立文件自动发现。',
  'root-manifest': 'extensions 根 manifest 声明入口；不会修改或绕过。',
  'manifest-unknown': '根 manifest 语义无法确认，需要人工检查。',
  'existing-extension': '已有 agent-pet.ts；所有权未知，不能覆盖或认定已安装。',
  'ignore-unknown': '发现 ignore 文件；本阶段不解析规则，无法确认是否被忽略。',
  'settings-unknown': 'settings 扩展规则不为空或不受支持，无法确认排除/恢复语义。',
  budget: '达到检测时间或工作量上限，结果不完整；可重新检测或手动选择。',
  'platform-unknown': '此平台的路径与权限检查未支持。',
};
export interface InstallationCandidate {
  id: string;
  path: string;
  compatibility: 'verified-0.85.1' | 'unverified';
  version: string | null;
}
export interface TargetCandidate { path: string; source: 'default' | 'chosen' }
export interface Inspection { target: TargetCandidate; findings: Finding[] }
export interface PreflightState {
  revision: number;
  installations: InstallationCandidate[];
  selectedInstallation: string | null;
  target: TargetCandidate;
  inspection: Inspection | null;
  scan: 'not-run' | 'complete' | 'limited';
  notice: 'none' | 'cancelled' | 'failed' | 'busy';
}
export interface PiPreflightApi {
  getState(): Promise<PreflightState>;
  detect(): Promise<PreflightState>;
  chooseInstallation(): Promise<PreflightState>;
  selectInstallation(id: string): Promise<PreflightState>;
  chooseTarget(): Promise<PreflightState>;
  useDefaultTarget(): Promise<PreflightState>;
  inspect(): Promise<PreflightState>;
}
