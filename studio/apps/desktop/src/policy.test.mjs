import test from 'node:test';
import assert from 'node:assert/strict';
import { localRoute, allowedExternal, trustedSender } from './policy.mjs';
test('desktop windows only accept local content routes', () => {
  assert.equal(localRoute('/page/a%20b?detached=true'),'/page/a%20b?detached=true');
  for (const value of ['https://example.com','//example.com','/\\example.com','/api/runs',null,'/\n/evil']) assert.throws(() => localRoute(value));
});
test('links cannot launch local files or executable protocols', () => {
  assert.equal(allowedExternal('https://example.com'),true);
  assert.equal(allowedExternal('mailto:hello@example.com'),true);
  for (const value of ['file:///private/data','javascript:alert(1)','smb://server/share','obsidian://open']) assert.equal(allowedExternal(value),false);
});
test('IPC requires exact local origin including ephemeral port', () => {
  assert.equal(trustedSender('http://127.0.0.1:4000/page/a','http://127.0.0.1:4000'),true);
  assert.equal(trustedSender('http://127.0.0.1:4001','http://127.0.0.1:4000'),false);
  assert.equal(trustedSender('http://127.0.0.1:4000.evil.test','http://127.0.0.1:4000'),false);
});
