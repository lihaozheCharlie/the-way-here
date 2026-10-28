import path from "node:path";
import { cacheRootForVault, stateRootForVault } from "@the-way-here/run-manager";
import type { VaultConfig } from "@the-way-here/shared";

type Retention = "rebuildable" | "conditional" | "protected";
interface StorageCategory {
  id: string;
  location: string;
  retention: Retention;
  cleanupRequirements: string[];
  purpose: string;
}

/** Inventory only. A future cleaner must check live owners and references, never recursively delete a cache root. */
export function storagePolicy(vaultRoot: string, config: VaultConfig) {
  const cacheRoot = cacheRootForVault(vaultRoot);
  const stateRoot = stateRootForVault(vaultRoot);
  const desktopCache = process.env.TWH_APP_CACHE_ROOT;
  const categories: StorageCategory[] = [
    { id: "capture-inputs", location: path.join(cacheRoot, "capture-inputs"), retention: "conditional", purpose: "已整理随手记的输入原话与历次输入备份", cleanupRequirements: ["所属任务已结束且不在恢复或保存中", "对应生活记录仍存在且保存完整", "没有尚未提交的补充草稿引用", "清理后历史原话不可恢复，需向用户说明"] },
    { id: "capture-versions", location: path.join(cacheRoot, "capture-versions"), retention: "conditional", purpose: "继续补充前的 Markdown 版本备份", cleanupRequirements: ["对应生活记录已成功保存", "没有进行中的恢复或覆盖写入", "用户接受放弃这些旧版本"] },
    { id: "user-preferences", location: path.join(stateRoot, "user-preferences"), retention: "protected", purpose: "用户明确选择的保存位置，独立于随手记历史和缓存", cleanupRequirements: ["升级和缓存清理不得删除或用应用默认值替换"] },
    { id: "capture-state", location: path.join(stateRoot, "captures"), retention: "protected", purpose: "未保存草稿、待提交补充、历史索引、默认目录和删除标记", cleanupRequirements: ["不能按缓存目录删除；删除标记防止旧任务重新出现"] },
    { id: "runs", location: path.join(stateRoot, "runs"), retention: "protected", purpose: "任务恢复、审批、差异及原始输入的运行副本", cleanupRequirements: ["活动任务不可清理", "已结束任务需独立归档/脱敏策略；仅删除输入缓存不会抹除运行副本"] },
    { id: "app-state", location: stateRoot, retention: "protected", purpose: "AI 配置、登录关联、会话、陪伴起点及其他运行状态", cleanupRequirements: ["未登记的目录默认保留，不能递归删除整个状态目录"] },
    { id: "knowledge", location: path.resolve(vaultRoot, config.paths.wiki), retention: "protected", purpose: "用户知识内容", cleanupRequirements: ["只能通过内容管理操作修改"] },
    { id: "sources", location: path.resolve(vaultRoot, config.paths.sources), retention: "protected", purpose: "生活记录、导入登记、照片原件、人物裁剪及用户确认资料", cleanupRequirements: ["隐藏目录和缩略图也可能是唯一副本或被人物页引用，不能按名称当缓存删除"] },
    { id: "legacy-capture-versions", location: path.join(stateRoot, "capture-versions"), retention: "conditional", purpose: "旧版本应用的日记恢复备份", cleanupRequirements: ["与新版备份相同，需确认对应日记完整且用户放弃旧版本"] },
  ];
  if (desktopCache) {
    const speechRoot = path.join(desktopCache, "speech-recordings");
    categories.push(
      { id: "speech-input", location: speechRoot, retention: "conditional", purpose: "原始录音、预览和精确转写、时间轴", cleanupRequirements: ["录音、转写及整理均已结束", "确认不再被任一窗口或未保存草稿引用", "现阶段未建立录音到日记的持久关联，必须人工确认，不能按时间自动删除"] },
      { id: "speech-conversion", location: path.join(speechRoot, "*", "recognition-input.wav"), retention: "rebuildable", purpose: "可由 recording.caf 重新转换的识别中间文件", cleanupRequirements: ["对应录音及转写已结束", "完整 recording.caf 仍存在且可读取", "只能删除该中间文件，不能删除会话目录"] },
      { id: "legacy-speech", location: path.join(path.dirname(desktopCache), "speech-recordings"), retention: "conditional", purpose: "旧版本原始录音与转写", cleanupRequirements: ["保留原位置，不自动搬迁或删除", "与新版录音相同，需人工确认"] },
      { id: "desktop-state", location: path.dirname(desktopCache), retention: "protected", purpose: "空间位置、文件授权书签、登录、user-preferences.json 中的偏好设置和浏览器草稿", cleanupRequirements: ["缓存清理不能删除 workspace.json、user-preferences.json 及其备份、scoped-access.json、codex-mas、Local Storage、IndexedDB 或整个用户数据目录"] },
    );
  }
  return { version: 1, knowledgeBaseId: config.knowledgeBaseId, cacheRoot, stateRoot, unknownPaths: "protected" as const, categories };
}
