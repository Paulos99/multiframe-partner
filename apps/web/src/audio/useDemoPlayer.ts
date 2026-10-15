import { useCallback, useEffect, useRef, useState } from 'react';
import { parseStubSrc, type StubKind, type StubScene } from './demoAudio';
import { impulseToAudioBuffer } from './reverbImpulse';
import {
  keyBandHz,
  MASTER_PLAYBACK_GAIN,
  STEM_CALIBRATION,
  stemIdFromSrc,
  type StemId,
} from './stemCalibration';
import type { RoomAudioShape } from './roomAudioShape';

export type AudioPlayGroup = 'air' | 'impact' | 'mixed' | 'echo';

export type AudioPlayOptions = {
  side: 'before' | 'after';
  group: AudioPlayGroup;
  /** Room-specific shape from receiving L2 bands (preferred). */
  shape?: RoomAudioShape;
  /** Legacy fallbacks when shape missing. */
  deltaRw?: number;
  deltaLnw?: number;
};

let sharedCtx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const pendingLoads = new Map<string, Promise<AudioBuffer>>();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function getCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Legacy synth contrast — only for `stub:` URLs. */
const DEMO_CONTRAST = {
  master: 0.5,
  beforePeak: 0.9,
  afterPeak: 0.11,
  beforeNoise: 0.34,
  afterNoise: 0.055,
} as const;

function playStub(
  ctx: AudioContext,
  kind: StubKind,
  scene: StubScene,
  onEnd: () => void,
): () => void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = DEMO_CONTRAST.master;
  master.connect(ctx.destination);
  const duration = scene === 'steps' ? 2.4 : 2.8;
  const isAfter = kind === 'after';
  const peak = isAfter ? DEMO_CONTRAST.afterPeak : DEMO_CONTRAST.beforePeak;
  const nodes: AudioScheduledSourceNode[] = [];

  if (scene === 'steps') {
    for (const t of [0, 0.45, 0.9, 1.35, 1.8]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = isAfter ? 120 : 520;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90 + Math.random() * 30, now + t);
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(peak, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.28);
      osc.connect(f);
      f.connect(g);
      g.connect(master);
      osc.start(now + t);
      osc.stop(now + t + 0.32);
      nodes.push(osc);
    }
  } else {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const noiseAmp = isAfter ? DEMO_CONTRAST.afterNoise : DEMO_CONTRAST.beforeNoise;
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((Math.PI * i) / bufferSize);
      const wobble = Math.sin(i / (ctx.sampleRate / (isAfter ? 70 : 160)));
      data[i] = (Math.random() * 2 - 1) * noiseAmp * env * wobble;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = isAfter ? 380 : 1400;
    f.Q.value = isAfter ? 0.55 : 0.85;
    src.connect(f);
    f.connect(master);
    src.start(now);
    src.stop(now + duration);
    nodes.push(src);
  }

  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  const timer = window.setTimeout(finish, duration * 1000 + 50);

  return () => {
    window.clearTimeout(timer);
    ended = true;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* ignore */
    }
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
  };
}

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const hit = bufferCache.get(url);
  if (hit) return hit;
  const pending = pendingLoads.get(url);
  if (pending) return pending;

  const job = (async () => {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`audio fetch ${res.status}`);
    const raw = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(raw.slice(0));
    bufferCache.set(url, buf);
    pendingLoads.delete(url);
    return buf;
  })().catch((err) => {
    pendingLoads.delete(url);
    throw err;
  });

  pendingLoads.set(url, job);
  return job;
}

/** Fetch+decode stems ahead of clicks so play/stop stay synchronous. */
export function preloadDemoAudio(urls: readonly string[]): Promise<void> {
  const ctx = getCtx();
  const unique = [...new Set(urls.filter(Boolean))];
  return Promise.all(
    unique.map((url) =>
      loadBuffer(ctx, url).catch(() => {
        /* keep other stems; play will retry */
        return null;
      }),
    ),
  ).then(() => undefined);
}

/** Unlock AudioContext on a user gesture (e.g. «Пропустить» на расчёте). */
export function unlockDemoAudio(): void {
  const ctx = getCtx();
  if (ctx.state === 'suspended') void ctx.resume();
}

type Chain = {
  input: AudioNode;
  output: AudioNode;
  teardown: () => void;
};

function buildPeakingEq(ctx: AudioContext, gainsDb: readonly number[]): Chain {
  const hz = keyBandHz();
  const filters: BiquadFilterNode[] = [];
  let first: AudioNode | null = null;
  let prev: AudioNode | null = null;

  for (let i = 0; i < hz.length; i++) {
    const g = gainsDb[i] ?? 0;
    if (Math.abs(g) < 0.35) continue;
    const f = ctx.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = hz[i]!;
    f.Q.value = 1.41;
    f.gain.value = g;
    filters.push(f);
    if (!first) first = f;
    if (prev) prev.connect(f);
    prev = f;
  }

  if (!first || !prev) {
    const bypass = ctx.createGain();
    bypass.gain.value = 1;
    return {
      input: bypass,
      output: bypass,
      teardown: () => {
        try {
          bypass.disconnect();
        } catch {
          /* ignore */
        }
      },
    };
  }

  return {
    input: first,
    output: prev,
    teardown: () => {
      for (const f of filters) {
        try {
          f.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

function softLimiter(ctx: AudioContext): DynamicsCompressorNode {
  // Safety only — must NOT squash «До» into «После» or the claimed Δ disappears.
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -1.5;
  c.knee.value = 3;
  c.ratio.value = 2;
  c.attack.value = 0.003;
  c.release.value = 0.25;
  return c;
}

/**
 * Dry stem → trim → slab muffling → До/После gain+EQ → room convolver → limiter.
 */
function roomProcess(
  ctx: AudioContext,
  stemId: StemId,
  opts: AudioPlayOptions,
): Chain {
  const shape = opts.shape;
  const cal = STEM_CALIBRATION[stemId] ?? STEM_CALIBRATION.music;
  const trimDb = cal.trimDb;
  const isAfter = opts.side === 'after';
  const isEcho = opts.group === 'echo' || shape?.mode === 'echo';

  const beforeGainDb = shape?.beforeGainDb ?? 0;
  const afterGainDb = isAfter
    ? (shape?.afterGainDb ?? (isEcho ? -1.5 : legacyAfterGain(opts)))
    : 0;
  const deltaEq =
    isAfter && !isEcho
      ? (shape?.deltaEqDb ?? legacyDeltaEq(opts))
      : [0, 0, 0, 0, 0, 0, 0];

  const mufflingHz = isAfter
    ? (shape?.mufflingHzAfter ?? (isEcho ? 14000 : 2800))
    : (shape?.mufflingHzBefore ?? (isEcho ? 12000 : 2200));

  const rt60 = isAfter ? (shape?.rt60After ?? 0.4) : (shape?.rt60Before ?? 0.9);
  const wet = isAfter ? (shape?.wetAfter ?? 0.12) : (shape?.wetBefore ?? 0.35);
  const flutter = isAfter
    ? (shape?.flutterAfter ?? 0.15)
    : (shape?.flutterBefore ?? 0.45);

  const trim = ctx.createGain();
  trim.gain.value = dbToGain(trimDb);

  // Two cascaded LPs ≈ 24 dB/oct — one biquad at ~1.5 kHz is still too open on dry music.
  const muffler1 = ctx.createBiquadFilter();
  muffler1.type = 'lowpass';
  muffler1.frequency.value = mufflingHz;
  muffler1.Q.value = 0.707;
  const muffler2 = ctx.createBiquadFilter();
  muffler2.type = 'lowpass';
  muffler2.frequency.value = isEcho ? mufflingHz : mufflingHz * 1.05;
  muffler2.Q.value = 0.707;

  const roomGain = ctx.createGain();
  roomGain.gain.value = dbToGain(beforeGainDb);

  const afterGain = ctx.createGain();
  afterGain.gain.value = dbToGain(afterGainDb);

  const deltaEqChain = buildPeakingEq(ctx, deltaEq);

  const dryGain = ctx.createGain();
  dryGain.gain.value = Math.max(0.15, 1 - wet);
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;

  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  convolver.buffer = impulseToAudioBuffer(ctx, { sampleRate: ctx.sampleRate, rt60, flutter });

  const merge = ctx.createGain();
  merge.gain.value = 1;

  const limiter = softLimiter(ctx);
  const ceiling = ctx.createGain();
  ceiling.gain.value = MASTER_PLAYBACK_GAIN;

  // trim → muffler×2 → room → after → EQ → split dry/wet → merge → limiter
  trim.connect(muffler1);
  muffler1.connect(muffler2);
  muffler2.connect(roomGain);
  roomGain.connect(afterGain);
  afterGain.connect(deltaEqChain.input);
  deltaEqChain.output.connect(dryGain);
  deltaEqChain.output.connect(convolver);
  dryGain.connect(merge);
  convolver.connect(wetGain);
  wetGain.connect(merge);
  merge.connect(limiter);
  limiter.connect(ceiling);

  return {
    input: trim,
    output: ceiling,
    teardown: () => {
      deltaEqChain.teardown();
      try {
        trim.disconnect();
        muffler1.disconnect();
        muffler2.disconnect();
        roomGain.disconnect();
        afterGain.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        convolver.disconnect();
        merge.disconnect();
        limiter.disconnect();
        ceiling.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Legacy: relative После vs missing shape — broadband Δ only, still on top of «До».
 */
function legacyAfterGain(opts: AudioPlayOptions): number {
  const air = Math.max(7, Math.min(16, Math.abs(opts.deltaRw ?? 8) * 1.5));
  const imp = Math.max(6, Math.min(14, Math.abs(opts.deltaLnw ?? 6) * 1.5));
  if (opts.group === 'air') return -air;
  if (opts.group === 'impact') return -imp;
  return -((air + imp) / 2);
}

/** Legacy residual tilt around broadband (not a second full |Δ|). */
function legacyDeltaEq(opts: AudioPlayOptions): number[] {
  if (opts.group === 'impact') {
    return [-2, -3, -3.5, -2, -1, 0, 0.5];
  }
  if (opts.group === 'air') {
    return [1, 0.5, 0, -1, -2.5, -3.5, -4];
  }
  return [0, -0.5, -1.5, -1.5, -2, -2.5, -3];
}

function playStem(
  ctx: AudioContext,
  buffer: AudioBuffer,
  srcUrl: string,
  opts: AudioPlayOptions | undefined,
  onEnd: () => void,
): () => void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  let teardownProcess: (() => void) | null = null;

  if (opts) {
    const stemId = opts.shape?.stemId ?? stemIdFromSrc(srcUrl);
    const chain = roomProcess(ctx, stemId, opts);
    src.connect(chain.input);
    chain.output.connect(master);
    teardownProcess = chain.teardown;
  } else {
    const g = ctx.createGain();
    g.gain.value = 0.85;
    src.connect(g);
    g.connect(master);
    teardownProcess = () => {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  let stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    onEnd();
  };

  src.onended = finish;
  src.start(0);

  return () => {
    if (stopped) return;
    stopped = true;
    src.onended = null;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* ignore */
    }
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    try {
      src.disconnect();
      master.disconnect();
    } catch {
      /* ignore */
    }
    teardownProcess?.();
  };
}

export function useDemoPlayer() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Bumps on every stop/play so stale async loads never start audio. */
  const generationRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  const durationMs = useRef(2400);

  const clearRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stop = useCallback(() => {
    generationRef.current += 1;
    stopRef.current?.();
    stopRef.current = null;
    clearRaf();
    activeIdRef.current = null;
    setActiveId(null);
    setProgress(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const play = useCallback(
    async (id: string, src: string, opts?: AudioPlayOptions) => {
      generationRef.current += 1;
      const gen = generationRef.current;
      stopRef.current?.();
      stopRef.current = null;
      clearRaf();

      const stub = parseStubSrc(src);
      const ctx = getCtx();
      // Resume only if needed; already-running ctx keeps clicks instant.
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          /* ignore — play may still work after next gesture */
        }
      }
      if (gen !== generationRef.current) return;

      const clearUiIfMine = () => {
        if (gen !== generationRef.current) return;
        if (activeIdRef.current !== id) return;
        clearRaf();
        activeIdRef.current = null;
        setActiveId(null);
        setProgress(0);
        stopRef.current = null;
      };

      const startProgress = (ms: number) => {
        if (gen !== generationRef.current) return;
        durationMs.current = ms;
        if (prefersReducedMotion()) return;
        const tick = () => {
          if (gen !== generationRef.current) return;
          const p = Math.min(1, (performance.now() - startedAt.current) / durationMs.current);
          setProgress(p);
          if (p < 1 && stopRef.current) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      };

      const armUi = () => {
        startedAt.current = performance.now();
        activeIdRef.current = id;
        setActiveId(id);
        setProgress(prefersReducedMotion() ? 0.5 : 0);
      };

      if (stub) {
        armUi();
        startProgress(stub.scene === 'talk' ? 2800 : 2400);
        if (gen !== generationRef.current) return;
        stopRef.current = playStub(ctx, stub.kind, stub.scene, clearUiIfMine);
        return;
      }

      try {
        // Prefer sync cache hit — no fetch/decode on click.
        let buffer = bufferCache.get(src);
        if (!buffer) buffer = await loadBuffer(ctx, src);
        if (gen !== generationRef.current) return;
        armUi();
        startProgress(buffer.duration * 1000);
        stopRef.current = playStem(ctx, buffer, src, opts, clearUiIfMine);
      } catch {
        if (gen !== generationRef.current) return;
        activeIdRef.current = null;
        setActiveId(null);
        setProgress(0);
        stopRef.current = null;
      }
    },
    [],
  );

  return { activeId, progress, play, stop };
}
