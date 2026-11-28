// 解析一条 Bash 命令里每个 git push 的目标分支，以及有没有绕过门的写法。纯函数，不碰 git。
export function pushTargets(command, { remotes = [], branch = 'HEAD' } = {}) {
  const pushes = [];
  const bypass = /--no-verify|core\.hooksPath|TWH_JUDGE_BYPASS|TWH_SKIP_HOOKS|GIT_CONFIG_(?:COUNT|PARAMETERS|GLOBAL)\b/.test(command);
  for (const match of command.matchAll(/\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*push\b([^&|;\n]*)/g)) {
    const words = match[0].trim().split(/\s+/);
    const tokens = words.slice(words.indexOf('push') + 1);
    const flags = [];
    const names = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.startsWith('-')) {
        flags.push(token.split('=')[0]);
        if (['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(token)) i += 1;
      } else names.push(token);
    }
    const specs = names.filter(name => !remotes.includes(name));
    const destinations = specs.length ? specs : [branch];
    const toMain = flags.includes('--all') || flags.includes('--mirror') || destinations.some(spec => {
      const target = spec.includes(':') ? spec.slice(spec.lastIndexOf(':') + 1) : spec === 'HEAD' ? branch : spec;
      return target.replace(/^\+/, '').replace(/^refs\/heads\//, '') === 'main';
    });
    pushes.push({ toMain, before: command.slice(0, match.index) });
  }
  return { count: pushes.length, main: pushes.filter(push => push.toMain), bypass };
}
