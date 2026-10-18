import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { packageCodexCompression } from './package-codex-compression.mjs';

export async function packageCodex(studio) {
  const require = createRequire(path.join(studio, 'package.json'));
  const main = require.resolve('@openai/codex/package.json');
  const version = JSON.parse(await readFile(main, 'utf8')).version;
  if (version !== '0.162.1') throw new Error('MAS Codex 版本必须与已验收的 0.162.1 一致');
  const platform = createRequire(main).resolve(`@openai/codex-darwin-${process.arch}/package.json`);
  const triple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : process.arch === 'x64' ? 'x86_64-apple-darwin' : undefined;
  if (!triple) throw new Error('MAS Codex 架构不受支持');
  const source = path.join(path.dirname(platform), 'vendor', triple);
  const output = path.join(studio, '.runtime/package/codex');
  await rm(output, {recursive:true, force:true}); await mkdir(output, {recursive:true});
  await cp(source, output, {recursive:true, verbatimSymlinks:true});
  await cp(path.join(studio, 'scripts/licenses/codex'), path.join(output, 'licenses'), {recursive:true});
  await packageCodexCompression(studio, output);
  await writeFile(path.join(output, 'distribution.json'), JSON.stringify({name:'OpenAI Codex', version, license:'Apache-2.0', source:`https://github.com/openai/codex/tree/rust-v${version}`, bundledFor:'Mac App Store', configuration:'isolated login; application knowledge tools only'}, null, 2));
}
