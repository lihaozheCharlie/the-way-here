import path from "node:path";
import { WikiIndex } from "@the-way-here/wiki-core";
import { searchWiki } from "../services/wiki-search.js";

const queries: string[] = [];
let knowledgeBaseId = "";
let vaultRoot = "";
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  const value = process.argv[++index];
  if (!value) throw new Error(`缺少 ${flag} 的参数`);
  if (flag === "--knowledge-base") knowledgeBaseId = value;
  else if (flag === "--root") vaultRoot = path.resolve(value);
  else if (flag === "--query") queries.push(value);
  else throw new Error(`未知参数：${flag}`);
}
if (!knowledgeBaseId || !vaultRoot || !queries.length || queries.length > 3) throw new Error("需要 --root、--knowledge-base 和 1–3 个 --query");

const index = new WikiIndex(vaultRoot, knowledgeBaseId);
await index.rebuild();
if (index.config.knowledgeBaseId !== knowledgeBaseId) throw new Error("检索知识库与本轮绑定的知识库不一致");
process.stdout.write(`${JSON.stringify(searchWiki(index, queries), null, 2)}\n`);
