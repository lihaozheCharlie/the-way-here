export const PHOTO_PEOPLE_START = "<photo-people>";
export const PHOTO_PEOPLE_END = "</photo-people>";
export interface PhotoPersonBinding {
  photoId: string;
  personId: string;
  pageId?: string;
  pagePath?: string;
}

export const PHOTO_IDENTITY_INSTRUCTIONS = `用户已授权你在本次照片记忆构建中完成同名人物消歧与合并，无需为人物合并二次询问。
用户已选择的人物页面 ID 是明确关联，必须沿用，不能改成新人物或换到其他同名页。
只有称呼、没有页面 ID，表示尚未关联，不代表新人物。结合当前库的人物姓名、别名、已有档案及用户确认的讲述判断是否同一人，能确认时直接合并到已有页。
“我”“自己”等第一人称称呼应结合叙述者和已有本人档案解析，不要因此另建一个人。不要根据照片外观识别身份。
旧版来源中的“新人物，勿与同名者自动合并”是缺少关联时的占位标记，不是用户要求新建；本次授权取代该限制。
确实无法判定时保留未决项并继续其他内容，不勉强合并，也不为此发起二次询问。`;

/** The model decides identity; this parser only validates the returned references. */
export function parsePhotoPersonBindings(output: string): PhotoPersonBinding[] | undefined {
  const start = output.lastIndexOf(PHOTO_PEOPLE_START);
  if (start < 0) return undefined;
  const end = output.indexOf(PHOTO_PEOPLE_END, start);
  if (end < 0) throw new Error("人物关联结果不完整");
  const raw = output.slice(start + PHOTO_PEOPLE_START.length, end).trim();
  if (raw.length > 256_000) throw new Error("人物关联结果过长");
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error("人物关联结果不是有效 JSON"); }
  if (!Array.isArray(data?.people) || data.people.length > 400) throw new Error("人物关联列表无效");
  const seen = new Set<string>();
  return data.people.map((item: any) => {
    if (!item || ![item.photoId, item.personId].every((id) => typeof id === "string" && /^[a-z0-9-]{1,80}$/i.test(id))) throw new Error("人物关联引用无效");
    const hasId = item.pageId !== undefined;
    const hasPath = item.pagePath !== undefined;
    if (hasId === hasPath) throw new Error("每个人物关联只能指定一个页面 ID 或路径");
    const reference = hasId ? item.pageId : item.pagePath;
    if (typeof reference !== "string" || !reference.trim() || reference.length > 500 || /[\0\r\n]/.test(reference)) throw new Error("人物页面引用无效");
    const key = `${item.photoId}:${item.personId}`;
    if (seen.has(key)) throw new Error("人物关联引用重复");
    seen.add(key);
    return { photoId: item.photoId, personId: item.personId, ...(hasId ? { pageId: reference } : { pagePath: reference }) };
  });
}

export function photoPeopleVisibleAnswer(output: string): string {
  const start = output.lastIndexOf(PHOTO_PEOPLE_START);
  const end = output.indexOf(PHOTO_PEOPLE_END, start);
  return start < 0 || end < 0 ? output : `${output.slice(0, start)}${output.slice(end + PHOTO_PEOPLE_END.length)}`.trim();
}
