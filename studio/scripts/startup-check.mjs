import net from 'node:net';
import path from 'node:path';
import { readFile, stat, writeFile, unlink } from 'node:fs/promises';

try {
  const [action, value, requested] = process.argv.slice(2);
  if (action === 'port') {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须是 1 到 65535 之间的整数。');
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', (error) => reject(new Error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请停止已有服务，或使用 --port 指定其他端口。` : error.message)));
      server.listen({ port, host: '127.0.0.1' }, () => server.close(resolve));
    });
  } else if (action === 'lock') {
    try { await writeFile(value, requested, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(await readFile(value, 'utf8'));
      if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error('启动锁无效，请确认没有其他启动过程后删除 studio/.runtime/startup.lock。');
      try { process.kill(owner, 0); }
      catch (check) {
        if (check.code !== 'ESRCH') throw check;
        await unlink(value);
        await writeFile(value, requested, { flag: 'wx' });
        process.exit(0);
      }
      throw new Error('已有启动过程正在准备环境，请等待它完成后再试。');
    }
  } else if (action === 'knowledge-base') {
    const { default: YAML } = await import('yaml');
    const config = YAML.parse(await readFile(path.join(value, 'the-way-here.config.yaml'), 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('工作区配置必须是 YAML 对象。');
    const bases = config.knowledgeBases;
    if (!bases) { if (requested) console.log(requested); process.exit(0); }
    const ids = Object.keys(bases);
    if (requested) {
      if (!bases[requested]) throw new Error(`知识库不存在：${requested}。可用知识库：${ids.join('、')}`);
      console.log(requested);
    } else {
      const present = [];
      for (const id of ids) {
        const paths = { ...config.paths, ...bases[id].paths };
        if (await Promise.all([paths.wiki, paths.sources].map(async (entry) => {
          if (typeof entry !== 'string') return false;
          const resolved = path.resolve(value, entry);
          if (!resolved.startsWith(`${path.resolve(value)}${path.sep}`)) return false;
          return stat(resolved).then((info) => info.isDirectory(), () => false);
        })).then((values) => values.every(Boolean))) present.push(id);
      }
      const custom = present.filter((id) => id !== 'demo');
      const selected = custom.includes(config.defaultKnowledgeBase) ? config.defaultKnowledgeBase : custom[0] || (present.includes('demo') ? 'demo' : undefined);
      if (!selected) throw new Error('找不到已存在的知识库目录，请检查配置或用 --knowledge-base 明确指定。');
      console.log(selected);
    }
  } else throw new Error(`未知启动检查：${action}`);
} catch (error) { console.error(`错误：${error.message}`); process.exitCode = 1; }
