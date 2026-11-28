// 极简 glob：支持 **、* 和 {a,b} 展开。功能地图的 sources 用它匹配改动路径。
export function globToRegExp(glob) {
  return new RegExp(`^${expand(glob).map(compile).join('|')}$`);
}

export function matchesAny(pathname, globs) {
  return globs.some(glob => globToRegExp(glob).test(pathname));
}

function expand(glob) {
  const match = glob.match(/\{([^{}]+)\}/);
  if (!match) return [glob];
  return match[1].split(',').flatMap(part => expand(glob.replace(match[0], part.trim())));
}

function compile(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') { source += '(?:.*/)?'; i += 1; } else source += '.*';
      } else source += '[^/]*';
    } else source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return source;
}
