import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushTargets } from './push-targets.mjs';

const remotes = ['origin', 'wayhere'];
const off = ['agents/landing', 'feature/x'];
const on = ['main'];

// 第一轮裁判用 19 种写法实测出的表，加上它指出的三个缺口。任何一条回退都会在这里变红。
const cases = [
  ['git push origin main', on, true],
  ['git push -u origin main', on, true],
  ['git push --force origin main', on, true],
  ['cd /repo && git push origin main', on, true],
  ['git -C /repo push origin main', on, true],
  ['git push --no-verify origin main', on, true],
  ['git push origin HEAD:main', on, true],
  ['cd /repo && git push origin HEAD:main', on, true],
  ['git push origin HEAD:refs/heads/main', on, true],
  ['git push origin main:main', on, true],
  ['git push origin +HEAD:main', on, true],
  ['git push --all origin', off, true],
  ['git push --mirror origin', off, true],
  ['git push', on, true],
  ['git push origin HEAD', on, true],
  ['git push origin agents/landing; git push origin main', off, true],
  ['git push origin agents/landing && git push origin HEAD:main', off, true],
  ['TWH_JUDGE_BYPASS=1 git push origin main', on, true],
  ['git -c core.hooksPath=/dev/null push origin main', on, true],
  ['git push origin agents/landing', off, false],
  ['git push -u origin agents/landing', off, false],
  ['git push origin HEAD', off, false],
  ['git push', off, false],
  ['git push -o ci.skip origin agents/landing', off, false],
  ['git push origin agents/landing; git push origin feature/x', off, false],
  ['git status', off, false],
];

for (const [command, branches, expectMain] of cases) {
  for (const branch of branches) {
    test(`${command}  (当前分支 ${branch})`, () => {
      const result = pushTargets(command, { remotes, branch });
      assert.equal(result.main.length > 0, expectMain, `到 main: ${JSON.stringify(result)}`);
      assert.equal(result.bypass, /--no-verify|TWH_JUDGE_BYPASS|core\.hooksPath/.test(command));
    });
  }
}

test('一条命令里有几个 git push 就解析几个', () => {
  assert.equal(pushTargets('git push origin a; git push origin b; git push origin main', { remotes }).count, 3);
});

test('远程名不会被当成引用规格', () => {
  const result = pushTargets('git push wayhere main', { remotes });
  assert.equal(result.main.length, 1);
});
