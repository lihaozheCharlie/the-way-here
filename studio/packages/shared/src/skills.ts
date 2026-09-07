

export interface BuildSkill {
  id: string;
  name: string;
  description: string;
  relativePath: string;
  modifiedAt: string;
}

export interface ReasoningLens {
  id: string;
  displayName: string;
  attention: string;
  signals: string[];
  helperUse: string;
  relativePath: string;
}

export interface SkillTreeNode {
  path: string;
  name: string;
  kind: "directory" | "file";
  modifiedAt: string;
  bytes?: number;
  fileCount?: number;
  skillName?: string;
  children?: SkillTreeNode[];
}

export interface SkillFileContent {
  path: string;
  name: string;
  bytes: number;
  modifiedAt: string;
  content: string;
  truncated: boolean;
  skillName?: string;
  description?: string;
}
