import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function assertSpeechEngine(engineRoot) {
  await Promise.all(['whisper-cli', 'ggml-large-v3-q5_0.bin', 'ggml-silero-v5.1.2.bin'].map(file => access(path.join(engineRoot, file))));
}

function run(command, args, { signal, onProgress, timeout = 600_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], signal });
    let diagnostics = '', previousProgress = -1;
    const timer = setTimeout(() => { child.kill(); }, timeout);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => {
      diagnostics = (diagnostics + data).slice(-8_000);
      const match = [...diagnostics.matchAll(/progress\s*=\s*(\d+)%/g)].at(-1);
      const percent = match ? Math.min(99, Number(match[1])) : -1;
      if (percent > previousProgress) { previousProgress = percent; onProgress?.(percent); }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('本地语音精确识别未完成，原始录音和预览文字仍已保留。'));
    });
  });
}

export function whisperTranscript(data) {
  if (!Array.isArray(data?.transcription) || !data.transcription.length) throw new Error('没有识别到语音');
  let previous = 0;
  const segments = data.transcription.map(segment => {
    const { from, to } = segment.offsets || {};
    if (typeof segment.text !== 'string' || !Number.isFinite(from) || !Number.isFinite(to) || from < previous || to < from) throw new Error('语音转写时间轴不完整');
    previous = from;
    return { from, to, text: segment.text.trim() };
  });
  const text = segments.map(segment => segment.text).filter(Boolean).join('\n')
    .replace(/(?<!\d),|,(?!\d)/g, '，').replace(/\.(?=\n|$)/g, '。').replace(/[，,]$/, '。');
  if (!text) throw new Error('没有识别到语音');
  return { text, segments };
}

/** The complete saved recording is authoritative; live Apple dictation is only a preview. */
export async function transcribeRecording(recording, engineRoot, { signal, onProgress } = {}) {
  await assertSpeechEngine(engineRoot);
  const folder = path.dirname(recording);
  const wav = path.join(folder, 'recognition-input.wav');
  const output = path.join(folder, 'transcript-whisper');
  await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', recording, wav], { signal, timeout: 60_000 });
  await run(path.join(engineRoot, 'whisper-cli'), [
    '-m', path.join(engineRoot, 'ggml-large-v3-q5_0.bin'), '-f', wav,
    '-l', 'zh', '--prompt', '普通话口述，使用简体中文和完整标点。',
    '--vad', '--vad-model', path.join(engineRoot, 'ggml-silero-v5.1.2.bin'),
    '-oj', '-of', output, '-pp',
  ], { signal, onProgress });
  const result = whisperTranscript(JSON.parse(await readFile(`${output}.json`, 'utf8')));
  await writeFile(`${output}.txt`, result.text + '\n', { encoding: 'utf8', mode: 0o600 });
  onProgress?.(100);
  return result.text;
}
