/**
 * Writes a short dry clap-like WAV (attack + silence) if WavPack convert fails.
 * Usage: node scripts/write-clap-wav.mjs [outPath]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(__dirname, '../public/audio/clap.wav');

const sr = 44100;
const duration = 1.8;
const n = Math.floor(sr * duration);
const samples = new Float32Array(n);

// Two-hand clap: sharp transient + short body
for (let i = 0; i < n; i++) {
  const t = i / sr;
  let s = 0;
  if (t < 0.012) {
    const env = Math.exp(-t * 280);
    s += (Math.random() * 2 - 1) * env * 0.95;
  }
  if (t >= 0.004 && t < 0.05) {
    const u = t - 0.004;
    const env = Math.exp(-u * 90);
    s += Math.sin(2 * Math.PI * 1800 * u) * env * 0.35;
    s += (Math.random() * 2 - 1) * env * 0.25;
  }
  samples[i] = s;
}

let peak = 0;
for (const v of samples) peak = Math.max(peak, Math.abs(v));
const k = peak > 1e-6 ? 0.89 / peak : 1;
for (let i = 0; i < n; i++) samples[i] *= k;

const pcm = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) {
  const x = Math.max(-1, Math.min(1, samples[i]));
  pcm.writeInt16LE((x * 32767) | 0, i * 2);
}

const dataSize = pcm.length;
const buf = Buffer.alloc(44 + dataSize);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);
pcm.copy(buf, 44);

writeFileSync(out, buf);
console.log('wrote', out, 'bytes', buf.length);
