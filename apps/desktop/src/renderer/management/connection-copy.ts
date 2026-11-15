import type { Finding } from '../../shared/pi-preflight.js';
import type { PiConnectionState } from '../../shared/pi-connection.js';
export const connectionNoticeText: Record<PiConnectionState['notice'], string> = {
  none: '', 'choose-target': '请先选择 pi 使用的配置文件夹。', busy: '还有一项操作正在进行，请稍候。',
  'invalid-plan': '这份设置预览已过期，请重新查看。',
  'preview-failed': '暂时无法查看设置，请重试。',
  'stale-plan': '文件夹中的内容发生了变化。',
  'deploy-failed-preserved': '添加连接文件失败。',
  'start-failed': '暂时无法连接，已添加的文件会保留。',
  'runtime-failed': '无法准备连接所需的临时文件夹。',
  removed: 'Agent Pet 的连接文件已移除。',
  'already-absent': '连接文件已经不存在，已清除本应用的记录。',
  'retained-changed': '连接文件已被修改，因此没有删除。',
  'retained-unknown': '无法确认这个文件由 Agent Pet 创建，因此没有删除。',
  'failed-preserved': '还没能移除连接文件。',
  'saved-invalid': '保存的连接信息有问题，暂时无法使用。',
  'save-failed': '未能确认连接信息是否保存成功。',
  'resume-required': '之前的连接已保存，点击下方按钮即可重新连接。',
  'resume-refused': '暂时无法重新连接：需要的文件可能已移动、改动，或连接地址仍被占用。',
  disabled: '连接已暂停，连接文件会保留。',
  'stop-failed': '未能确认连接是否暂停，请重新打开应用后检查。',
  'stop-save-failed': '未能确认连接是否暂停，也未能确认是否保存成功。',
  'removed-save-failed': '连接文件已不存在，但移除结果没有保存成功。',
  stopped: '连接已暂停，配置文件会保留。',
};

export function connectionSummary(state: PiConnectionState | null): { title: string; tone: 'online' | 'waiting' | 'quiet' | 'error' } {
  if (!state) return { title: '暂不支持连接', tone: 'quiet' };
  if (state.receiving === 'unknown' || state.status === 'failed' || state.saved === 'invalid' || state.saved === 'uncertain') {
    return { title: '连接需要处理', tone: 'error' };
  }
  if (state.status === 'connected' && state.receiving === 'active') return { title: '已连接', tone: 'online' };
  if (state.canResume) return state.saved === 'disabled'
    ? { title: '已暂停', tone: 'quiet' }
    : { title: '等待重新连接', tone: 'waiting' };
  if (state.receiving === 'active') return {
    title: state.status === 'disconnected' ? '等待 pi 重新连接' : '等待 pi', tone: 'waiting',
  };
  if (state.canConfigure) return { title: '还未连接', tone: 'quiet' };
  return { title: '已暂停', tone: 'quiet' };
}

export const findingSummary: Record<Finding, string> = {
  unsafe: '文件权限受限', unreadable: '无法读取配置', 'missing-target': '文件夹不存在',
  'root-entry': '扩展入口不受支持', 'root-manifest': '扩展入口不受支持',
  'manifest-unknown': '无法识别扩展设置', 'existing-extension': '已有同名文件',
  'ignore-unknown': '存在忽略规则', 'settings-unknown': '无法识别扩展设置',
  budget: '检查未完成', 'platform-unknown': '系统不受支持',
};
