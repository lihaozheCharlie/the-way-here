import { spawn } from 'node:child_process';
export function speechSession(binary, onEvent = () => {}, recordingRoot) {
  const child = spawn(binary, recordingRoot ? [recordingRoot] : [], { stdio:['pipe','pipe','pipe'] });
  let pauseWaiter;
  let transcript = '', recordingPath = '';
  let output = '', pending = '', errors = '', closed = false, stopped = false;
  // Auto-stop can finish before the renderer asks for the transcript.
  child.stdin.on('error', () => {});
  child.stdout.setEncoding('utf8');
  const result = new Promise((resolve,reject) => {
    child.stdout.on('data', data => {
      pending += data;
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        try {
          const value = JSON.parse(line);
          if (value.event === 'paused' && pauseWaiter) { pauseWaiter.resolve(); pauseWaiter = undefined; }
          else if (value.event === 'processing') onEvent({ event: 'processing' });
          else if (value.event === 'progress' && Number.isFinite(value.percent)) onEvent({ event: 'progress', percent: Math.max(0, Math.min(100, value.percent)) });
          else if (value.event === 'ready') onEvent({ event: 'ready' });
          else if (value.event === 'level' && Number.isFinite(value.level)) onEvent({ event: 'level', level: Math.max(0, Math.min(1, value.level)) });
          else if (value.event === 'transcript' && typeof value.text === 'string' && value.text.trim()) {
            transcript = value.text; onEvent({ event: 'transcript', text: transcript });
          } else if (value.event === 'recording' && typeof value.recordingPath === 'string') {
            recordingPath = value.recordingPath; onEvent({ event: 'recording', recordingPath });
          } else output += line + '\n';
        } catch { output += line + '\n'; }
      }
    });
    child.stderr.on('data',data => { errors += data; });
    child.on('error',reject);
    child.on('close', () => {
      closed = true; if (pauseWaiter) { pauseWaiter.reject(new Error('录音已结束')); pauseWaiter = undefined; }
      try {
        const value = JSON.parse((output + pending).trim().split('\n').at(-1));
        const text = typeof value.text === 'string' && value.text.trim() ? value.text : transcript;
        if (value.error && !text) throw new Error(value.error);
        if (typeof text !== 'string') throw new Error('语音识别结果无效');
        if (String(value.warning || '').startsWith('录音备份')) onEvent({ event: 'warning', message: value.warning });
        else if ((value.warning || value.error)) onEvent({ event: 'warning', message: '部分语音未能完成识别，已保留识别文字和原始录音。' });
        resolve(text);
      } catch (error) {
        if (transcript) {
          onEvent({ event: 'warning', message: '识别意外中断，已保留识别文字和原始录音。' });
          resolve(transcript);
        } else reject(new Error(recordingPath ? '未能识别这段语音，原始录音已保留，可打开录音重试。' : output ? error.message : '语音识别未启动。请在系统设置中允许麦克风和语音识别后重试，也可以直接输入文字。'));
      }
    });
  });
  // Early rejection is retained until the renderer requests the result.
  result.catch(() => {});
  return { result, pause: (paused) => {
    if (closed || stopped || pauseWaiter) return Promise.reject(new Error('录音状态已变化，请重试'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pauseWaiter = undefined; reject(new Error('录音暂停状态未确认，请完成录音后重试')); }, 5000);
      pauseWaiter = { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } };
      child.stdin.write(paused ? 'pause\n' : 'resume\n');
    });
  }, stop:(discard = false) => { if (!closed && !stopped) { stopped = true; child.stdin.end(discard ? 'discard\n' : '\n'); } }, cancel:() => { child.kill(); } };
}
