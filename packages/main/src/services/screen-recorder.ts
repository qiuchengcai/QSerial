/**
 * Screen Recorder - 录屏管理器
 * 使用 Electron capturePage 定时截帧 + ffmpeg 编码为 MP4
 */

import { BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';

let ffmpegPath: string;
// Packaged: ffmpeg-static is in extraResources. Dev: in node_modules.
const extraResPath = path.join(process.resourcesPath, "ffmpeg-static", "ffmpeg.exe");
const bundled = process.platform === "win32" ? extraResPath : path.join(process.resourcesPath, "ffmpeg-static", "ffmpeg");
if (fs.existsSync(bundled)) {
  ffmpegPath = bundled;
} else {
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    ffmpegPath = "ffmpeg";
  }
}

interface ActiveRecording {
  id: string;
  window: BrowserWindow;
  fps: number;
  frameDir: string;
  frameCount: number;
  interval: ReturnType<typeof setInterval> | null;
  startedAt: number;
}

const activeRecordings = new Map<string, ActiveRecording>();

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `qserial-rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function startRecording(
  window: BrowserWindow,
  fps: number = 10,
): Promise<string> {
  const id = `rec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const frameDir = createTempDir();

  const recording: ActiveRecording = {
    id,
    window,
    fps: Math.min(Math.max(fps, 1), 30),
    frameDir,
    frameCount: 0,
    interval: null,
    startedAt: Date.now(),
  };

  recording.interval = setInterval(async () => {
    if (window.isDestroyed()) {
      return;
    }
    try {
      const image = await window.webContents.capturePage();
      const framePath = path.join(frameDir, `frame_${String(recording.frameCount).padStart(6, '0')}.png`);
      fs.writeFileSync(framePath, image.toPNG());
      recording.frameCount++;
    } catch {
      // 窗口可能被最小化或不可访问
    }
  }, Math.round(1000 / recording.fps));

  activeRecordings.set(id, recording);
  return id;
}

export async function stopRecording(
  id: string,
  outputPath?: string,
): Promise<{ id: string; duration_ms: number; frames: number; fps: number; file: string; size: number }> {
  const recording = activeRecordings.get(id);
  if (!recording) {
    throw new Error(`Recording not found: ${id}`);
  }

  if (recording.interval) {
    clearInterval(recording.interval);
    recording.interval = null;
  }

  activeRecordings.delete(id);

  const duration_ms = Date.now() - recording.startedAt;

  // 等待最后一帧写入
  await new Promise((r) => setTimeout(r, 200));

  if (recording.frameCount === 0) {
    // 没有帧，清理临时目录
    fs.rmSync(recording.frameDir, { recursive: true, force: true });
    throw new Error('No frames captured');
  }

  // 默认输出到 docs 目录
  const outFile = outputPath || path.resolve(
    process.cwd?.() || __dirname,
    '../../docs',
    `recording-${Date.now()}.mp4`,
  );
  const outDir = path.dirname(outFile);
  fs.mkdirSync(outDir, { recursive: true });

  // 使用 ffmpeg 编码
  const framePattern = path.join(recording.frameDir, 'frame_%06d.png');

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(recording.fps),
      '-i', framePattern,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '23',
      '-movflags', '+faststart',
      outFile,
    ];

    const ffmpeg = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('close', (code: number) => {
      // 清理临时帧目录
      fs.rmSync(recording.frameDir, { recursive: true, force: true });

      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        return;
      }

      const stat = fs.statSync(outFile);
      resolve({
        id: recording.id,
        duration_ms,
        frames: recording.frameCount,
        fps: recording.fps,
        file: outFile,
        size: stat.size,
      });
    });

    ffmpeg.on('error', (err: Error) => {
      fs.rmSync(recording.frameDir, { recursive: true, force: true });
      reject(err);
    });
  });
}

export function listRecordings(): Array<{ id: string; startedAt: number; elapsed_ms: number; fps: number; frames: number }> {
  return Array.from(activeRecordings.values()).map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    elapsed_ms: Date.now() - r.startedAt,
    fps: r.fps,
    frames: r.frameCount,
  }));
}

export function stopAllRecordings(): void {
  for (const id of activeRecordings.keys()) {
    const recording = activeRecordings.get(id)!;
    if (recording.interval) clearInterval(recording.interval);
    fs.rmSync(recording.frameDir, { recursive: true, force: true });
    activeRecordings.delete(id);
  }
}
