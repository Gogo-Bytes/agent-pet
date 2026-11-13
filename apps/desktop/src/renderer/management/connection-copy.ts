import type { Finding } from '../../shared/pi-preflight.js';
import type { PiConnectionState } from '../../shared/pi-connection.js';
export const connectionNoticeText: Record<PiConnectionState['notice'], string> = {
  none: '', 'choose-target': '请先选择 pi 使用的配置文件夹。', busy: '还有一项操作正在进行，请稍候。',
  'invalid-plan': '这份设置预览已过期，请重新查看。本次没有添加新的连接文件。',
  'preview-failed': '暂时无法查看设置，请重试。没有改动文件，也没有开始连接。',
  'stale-plan': '文件夹中的内容发生了变化。请重新打开应用，再查看设置；这次没有添加文件。',
  'deploy-failed-preserved': '添加连接文件失败。已有文件会保留，请检查文件夹权限。',
  'start-failed': '暂时无法连接，已添加的文件会保留。请重新打开 Agent Pet 后重试，或移除此连接。',
  'runtime-failed': '无法准备连接所需的临时文件夹。没有改动 pi 的文件，请重新打开应用后再试。',
  removed: 'Agent Pet 的连接文件已移除。其他文件会保留；运行中的 pi 需要你在空闲时重新加载。',
  'already-absent': '连接文件已经不存在，已清除本应用的记录。其他文件未改动；运行中的 pi 需要你在空闲时重新加载。',
  'retained-changed': '连接文件已被修改，因此没有删除。连接已暂停；运行中的 pi 不会自动重新加载。',
  'retained-unknown': '无法确认这个文件由 Agent Pet 创建，因此没有删除。',
  'failed-preserved': '还没能移除连接文件。连接已暂停，文件会保留，你可以重试。运行中的 pi 不会自动重新加载。',
  'saved-invalid': '保存的连接信息有问题，暂时无法使用。已有文件会保留，请重新打开应用后检查。',
  'save-failed': '未能确认连接信息是否保存成功。已有文件会保留；如果连接已暂停，下次打开也不会自动连接。',
  'resume-required': '之前的连接已保存，点击下方按钮即可重新连接。',
  'resume-refused': '暂时无法重新连接：需要的文件可能已移动、改动，或连接地址仍被占用。请检查原文件后重试。',
  disabled: '连接已暂停，连接文件会保留。运行中的 pi 不会自动重新加载。',
  'stop-failed': '未能确认连接是否暂停，请重新打开应用后检查。下次打开不会自动连接。',
  'stop-save-failed': '未能确认连接是否暂停，也未能确认是否保存成功。文件会保留，下次打开不会自动连接。',
  'removed-save-failed': '连接文件已不存在，但移除结果没有保存成功。暂时不能重新添加，请重新打开应用后检查。',
  stopped: '连接已暂停，配置文件会保留。',
};

export function connectionSummary(state: PiConnectionState | null): { title: string; description: string; tone: 'online' | 'waiting' | 'quiet' | 'error' } {
  if (!state) return { title: '暂不支持连接', description: '这条记录可以保留，暂时还不能让宠物跟随它的工作状态。', tone: 'quiet' };
  if (state.receiving === 'unknown' || state.status === 'failed' || state.saved === 'invalid' || state.saved === 'uncertain') {
    return { title: '连接需要处理', description: '请查看下方提示。已有文件会保留，不会自动覆盖或删除。', tone: 'error' };
  }
  if (state.status === 'connected' && state.receiving === 'active') return { title: '已连接', description: '', tone: 'online' };
  if (state.canResume) return state.saved === 'disabled'
    ? { title: '已暂停', description: '暂停不会关闭 pi，连接文件会保留。', tone: 'quiet' }
    : { title: '等待重新连接', description: '', tone: 'waiting' };
  if (state.receiving === 'active') return {
    title: state.status === 'disconnected' ? '等待 pi 重新连接' : '等待 pi',
    description: '请打开 pi。如果它已经在运行，请在空闲时输入 /reload，让它加载连接组件。', tone: 'waiting',
  };
  if (state.canConfigure) return { title: '还未连接', description: '', tone: 'quiet' };
  return { title: '已暂停', description: '当前没有接收 pi 的状态，已有文件会保留。', tone: 'quiet' };
}

export const findingSummary: Record<Finding, string> = {
  unsafe: '文件夹或文件的权限不符合要求，请检查所选位置和访问权限。',
  unreadable: '有文件无法读取或格式不正确，请检查文件内容和访问权限。',
  'missing-target': '还没有这个文件夹，请查看下方是否可以新建。',
  'root-entry': 'pi 使用了其他扩展入口，暂时无法自动添加连接组件。原有设置会保留。',
  'root-manifest': 'pi 指定了其他扩展入口，暂时无法自动添加连接组件。原有设置会保留。',
  'manifest-unknown': '暂时无法识别这个文件夹的扩展设置，请查看检查详情。',
  'existing-extension': '这里已有同名连接文件。为保护原文件，不会覆盖，请先确认它的来源。',
  'ignore-unknown': '这个文件夹有忽略规则，可能导致 pi 找不到连接组件。原规则会保留。',
  'settings-unknown': '暂时无法识别 pi 的部分扩展设置。原设置会保留，请查看检查详情。',
  budget: '检查未能完成，你可以重试或选择其他文件夹。',
  'platform-unknown': '暂时还不能在这个系统上检查文件夹。',
};
