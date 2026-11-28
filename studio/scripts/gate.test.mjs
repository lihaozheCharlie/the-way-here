import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectSteps } from './gate.mjs';

const steps = [['lint', 'pnpm', ['lint']], ['typecheck', 'pnpm', ['typecheck']], ['build', 'pnpm', ['build']]];

test('不给名字就全跑', () => {
  assert.deepEqual(selectSteps(steps, []), steps);
});

test('按名字只跑一步，取到的是步骤而不是命令', () => {
  assert.deepEqual(selectSteps(steps, ['build']), [['build', 'pnpm', ['build']]]);
  assert.deepEqual(selectSteps(steps, ['lint', 'build']).map(([name]) => name), ['lint', 'build']);
});

test('名字都不认识时返回空数组', () => {
  assert.deepEqual(selectSteps(steps, ['nope']), []);
});
