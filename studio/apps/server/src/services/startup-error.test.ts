import { expect, it } from "vitest";
import { startupErrorMessage } from "./startup-error.js";
it("explains settings failures without leaking parser excerpts or secrets", () => {
  const message = startupErrorMessage(new Error('全局 Agent 设置无法读取：invalid JSON private-test-key'));
  expect(message).toContain("钥匙串");
  expect(message).toContain("更换知识空间无法解决");
  expect(message).not.toContain("private-test-key");
  expect(startupErrorMessage(new Error('unknown private-test-key'))).not.toContain('private-test-key');
});
