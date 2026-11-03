import type { SourceImportChannel, SourceImportFile } from "@the-way-here/shared";
import { ImportRequestError, type ImportRequest } from "../imports/import-store.js";
/** Adapts the string-only mobile protocol to the same importer used by Mac. */
export function prepareMobileImportRequest(files: SourceImportFile[], options: Record<string, string>, now = new Date()): ImportRequest {
  const allowed = new Set(["files", "chatgpt", "claude", "gemini", "deepseek", "doubao", "other-ai", "alipay"]);
  const channel = options.importChannel || "files";
  if (!allowed.has(channel)) throw new ImportRequestError(400, "不支持这个导入渠道");
  const date = (key: string) => {
    const value = options[key]?.trim();
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value) throw new ImportRequestError(400, "导入日期无效");
    return value;
  };
  let startDate = date("startDate");
  const endDate = date("endDate");
  if (options.recentMonths) {
    const months = Number(options.recentMonths);
    if (!Number.isInteger(months) || months < 1 || months > 120) throw new ImportRequestError(400, "最近月份范围无效");
    const start = new Date(now); start.setUTCMonth(start.getUTCMonth() - months); startDate = start.toISOString().slice(0, 10);
  }
  if (startDate && endDate && startDate > endDate) throw new ImportRequestError(400, "开始日期不能晚于结束日期");
  if (options.excludeGroups && !["true", "false"].includes(options.excludeGroups)) throw new ImportRequestError(400, "群聊选项无效");
  const owner = options.owner?.trim();
  if (owner && owner.length > 160) throw new ImportRequestError(400, "参与者名称过长");
  const excludedMerchants = (options.excludedMerchants || "").split(/[,，\n]/).map(value => value.trim()).filter(Boolean);
  if (excludedMerchants.length > 100 || excludedMerchants.some(value => value.length > 160)) throw new ImportRequestError(400, "排除商户列表过长");
  return { files, channel: channel as SourceImportChannel, targetFolder: options.folder, importOptions: { owner, excludeGroups: options.excludeGroups === "true", startDate, endDate, excludedMerchants } };
}
