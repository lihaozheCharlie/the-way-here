/** Options are applied before rendering evidence, never to generated Markdown. */
export interface ImportSelection {
  owner?: string;
  excludeGroups?: boolean;
  startDate?: string;
  endDate?: string;
  excludedMerchants?: string[];
}
export function withinImportPeriod(value: string | undefined, selection: ImportSelection): boolean {
  if (!selection.startDate && !selection.endDate) return true;
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  const day = value.slice(0, 10);
  return (!selection.startDate || day >= selection.startDate) && (!selection.endDate || day <= selection.endDate);
}

/** Validate direct HTTP callers as well as the mobile string-options adapter. */
export function normalizeImportSelection(value: unknown): ImportSelection {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("导入筛选选项无效");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["owner", "excludeGroups", "startDate", "endDate", "excludedMerchants"].includes(key))) throw new Error("导入筛选包含不支持的选项");
  if (input.owner !== undefined && (typeof input.owner !== "string" || input.owner.length > 160)) throw new Error("参与者名称无效");
  if (input.excludeGroups !== undefined && typeof input.excludeGroups !== "boolean") throw new Error("群聊选项无效");
  for (const key of ["startDate", "endDate"]) {
    const date = input[key]; if (date === undefined) continue;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("导入日期无效");
  }
  if (input.startDate && input.endDate && String(input.startDate) > String(input.endDate)) throw new Error("开始日期不能晚于结束日期");
  if (input.excludedMerchants !== undefined && (!Array.isArray(input.excludedMerchants) || input.excludedMerchants.length > 100 || input.excludedMerchants.some(value => typeof value !== "string" || value.length > 160))) throw new Error("排除商户列表无效");
  return { owner: typeof input.owner === "string" ? input.owner.trim() || undefined : undefined, excludeGroups: input.excludeGroups as boolean | undefined, startDate: input.startDate as string | undefined, endDate: input.endDate as string | undefined, excludedMerchants: (input.excludedMerchants as string[] | undefined)?.map(value => value.trim()).filter(Boolean) };
}
