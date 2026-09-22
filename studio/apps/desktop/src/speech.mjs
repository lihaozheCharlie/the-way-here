import { spawn } from 'node:child_process';
export function speechSession(binary) {
  const child = spawn(binary, [], { stdio:['pipe','pipe','pipe'] });
  let output = '', errors = '', closed = false, stopped = false;
  // Auto-stop can finish before the renderer asks for the transcript.
  child.stdin.on('error', () => {});
  const result = new Promise((resolve,reject) => {
    child.stdout.on('data',data => { output += data; });
    child.stderr.on('data',data => { errors += data; });
    child.on('error',reject);
    child.on('close',() => { closed = true; try { const value=JSON.parse(output.trim().split('\n').at(-1)); if (value.error) reject(new Error(value.error)); else resolve(value.text); } catch (error) { reject(new Error(output ? error.message : '语音识别未启动。请在系统设置中允许麦克风和语音识别后重试，也可以直接输入文字。')); } });
  });
  // Early rejection is retained until the renderer requests the result.
  result.catch(() => {});
  return { result, stop:() => { if (!closed && !stopped) { stopped = true; child.stdin.end('\n'); } }, cancel:() => child.kill() };
}
