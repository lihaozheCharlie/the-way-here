// git 调 hook 时设置了 GIT_DIR（仓库 git 目录的绝对路径），但不设 GIT_WORK_TREE，这时 git 把"当前目录"当成工作树。
// hook 脚本里再切到 studio/ 子目录调 git，工作树就成了 studio/，每个已跟踪文件都被当成"已删除"；
// 把这些 GIT_* 变量传给子工具（gate、裁决校验）也是同样的后果。
// 约定：hook 里的 git 命令一律在 git 启动 hook 的那个目录（仓库根）下跑；启动其他工具时用这里的干净环境。
import { spawnSync } from 'node:child_process';

export function hookRoot() {
  // git 从仓库根启动 hook，所以进程的初始工作目录就是仓库根；用 git 再确认一次。
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8' });
  if (root.status !== 0) {
    console.error(`hook 里找不到仓库根：${root.stderr.trim()}`);
    process.exit(1);
  }
  return root.stdout.trim();
}

export function hookEnv(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !name.startsWith('GIT_')));
}
