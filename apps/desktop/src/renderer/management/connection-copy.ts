import type { Finding } from '../../shared/pi-preflight.js';
import type { PiConnectionState } from '../../shared/pi-connection.js';
export const noticeText: Record<PiConnectionState['notice'], string> = {
  none: '', 'choose-target': '请先用上方原生选择器选择现有 pi 配置目录；默认候选不能直接部署。',
  busy: '前一操作尚未结束。', 'invalid-plan': '预览已失效，请重新预览；未开始本次部署。',
  'preview-failed': '无法完成预览；未写入或启动连接。', 'stale-plan': '目标在预览后变化；未部署。请检查目标，重启应用后重新选择。',
  'deploy-failed-preserved': '部署失败，可能存在不确定的文件或目录；已保留，不自动删除或重试。',
  'start-failed': '桥接启动失败；若已部署，文件和本次撤回凭证仍保留。',
  'runtime-failed': '无法创建私有运行目录；未部署或启动连接，不会删除已有对象。',
  removed: '本次扩展文件已移除；不确定、非空或外部修改的目录可能保留。运行中的扩展未卸载。',
  'already-absent': '扩展路径已无文件；只清除了本应用保存记录，没有删除目标目录或未知文件。运行中的扩展未卸载。',
  'retained-changed': '文件已变化，保留原状；接收已停止，运行中的扩展未卸载。',
  'retained-unknown': '没有可用的本次所有权凭证；不会移除未知文件。',
  'failed-preserved': '撤回未完成；接收已停止，文件与可用凭证保留，可重试。运行中的扩展未卸载。',
  'saved-invalid': '私有保存记录无效、权限不安全或有未完成写入；已拒绝恢复，不会修复、覆盖或删除。',
  'save-failed': '保存结果不确定；保留文件与所有权，未确认持久化成功。若接收已停止，下次启动也不会自动恢复。',
  'resume-required': '已读取私有保存记录；当前未开始监听。点击恢复后会校验原目录与文件，再开始接收。',
  'resume-refused': '恢复被拒绝：原运行目录或扩展已缺失/变化，或端点已存在。不会重建目录、删除 socket 或重新部署。',
  disabled: '已停止接收并保存停用状态；扩展文件保留，运行中的扩展未卸载。',
  'stop-failed': '停止接收失败；不能保证接收已停止。保存结果见下方；重启不会自动恢复。',
  'stop-save-failed': '停止接收和保存停用状态均未确认成功；文件与所有权保留，重启不会自动恢复。',
  'removed-save-failed': '扩展路径已无文件，但保存移除结果失败；不能声称记录已清除，禁止重配。',
  stopped: '本次接收已停止；配置文件不会随退出自动删除。',
};

/** Short product copy; protocol/ownership details remain in the explicit operation preview. */
export const connectionNoticeText: Record<PiConnectionState['notice'], string> = {
  none: '', 'choose-target': '请先选择 pi 使用的配置文件夹。', busy: '还有一项操作正在进行，请稍候。',
  'invalid-plan': '这份设置预览已过期，请重新查看。本次没有添加新的连接文件。',
  'preview-failed': '暂时无法查看设置，请重试。没有改动文件，也没有开始连接。',
  'stale-plan': '文件夹中的内容发生了变化。请重新打开应用，再查看设置；这次没有添加文件。',
  'deploy-failed-preserved': '添加连接文件失败。已有文件会保留，请先查看下方的详细原因。',
  'start-failed': '暂时无法连接，已添加的文件会保留。请重新打开 Agent Pet 后重试，或移除此连接。',
  'runtime-failed': '无法准备连接所需的临时文件夹。没有改动 pi 的文件，请重新打开应用后再试。',
  removed: 'Agent Pet 的连接文件已移除。其他文件会保留；运行中的 pi 需要你在空闲时重新加载。',
  'already-absent': '连接文件已经不存在，已清除本应用的记录。其他文件未改动；运行中的 pi 需要你在空闲时重新加载。',
  'retained-changed': '连接文件已被修改，因此没有删除。连接已暂停；运行中的 pi 不会自动重新加载。',
  'retained-unknown': '无法确认这个文件由 Agent Pet 创建，因此没有删除。',
  'failed-preserved': '还没能移除连接文件。连接已暂停，文件会保留，你可以重试。运行中的 pi 不会自动重新加载。',
  'saved-invalid': '保存的连接信息有问题，暂时无法使用。已有文件不会被覆盖或删除，请查看详细原因。',
  'save-failed': '未能确认连接信息是否保存成功。已有文件会保留；如果连接已暂停，下次打开也不会自动连接。',
  'resume-required': '之前的连接已保存，点击下方按钮即可重新连接。',
  'resume-refused': '暂时无法重新连接：需要的文件可能已移动、改动，或连接地址仍被占用。请查看详细原因；不会自动删除或重建文件。',
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
  if (state.status === 'connected' && state.receiving === 'active') return { title: '已连接', description: '宠物现在可以跟随 pi 的工作状态。', tone: 'online' };
  if (state.canResume) return state.saved === 'disabled'
    ? { title: '已暂停', description: '暂停不会关闭 pi，连接文件会保留。', tone: 'quiet' }
    : { title: '等待重新连接', description: '点击「重新连接」，继续使用之前的设置。', tone: 'waiting' };
  if (state.receiving === 'active') return {
    title: state.status === 'disconnected' ? '等待 pi 重新连接' : '等待 pi',
    description: '请打开 pi。如果它已经在运行，请在空闲时输入 /reload，让它加载连接组件。', tone: 'waiting',
  };
  if (state.canConfigure) return { title: '还未连接', description: '完成连接设置后，宠物就能跟随 pi 的工作状态。', tone: 'quiet' };
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
