/**
 * Чистые функции для materials-video-stream.mjs (тестируются без сети).
 * Копия видео для просмотра лежит рядом с оригиналом: materials/<id>_stream.
 */

export const STREAM_SUFFIX = '_stream';

/** Параметры ffmpeg: H.264 до 1080p + AAC, moov в начале файла, ключевой кадр каждые 2 с (быстрая перемотка). */
export function ffmpegArgs(input, output) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?', '-dn', '-sn',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-maxrate', '4000k', '-bufsize', '8000k',
    '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
    '-vf', "scale=-2:'min(1080,ih)'",
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-write_tmcd', '0', '-map_metadata', '-1',
    '-movflags', '+faststart',
    '-f', 'mp4', output,
  ];
}

function walk(nodes) {
  return Array.isArray(nodes) ? nodes : [];
}

export function isVideoNode(node) {
  return (
    node?.kind === 'file' &&
    !!node.storageKey &&
    (String(node.mime || '').toLowerCase().startsWith('video/') || /\.(mp4|m4v|mov)$/i.test(String(node.name || '')))
  );
}

/** Какие видео ещё без копии (или копия старше оригинала). Только бакет материалов. */
export function planStreamJobs(materials, { force = false } = {}) {
  return walk(materials)
    .filter(isVideoNode)
    .filter((node) => node.bucket === 'materials')
    .filter((node) => force || !node.streamKey || String(node.streamUpdatedAt || '') < String(node.updatedAt || ''))
    .map((node) => ({
      id: node.id,
      name: node.name,
      size: node.size ?? null,
      storageKey: node.storageKey,
      streamKey: `materials/${node.id}${STREAM_SUFFIX}`,
      updatedAt: node.updatedAt || null,
    }));
}

/**
 * Пишет в узлы только streamKey/streamSize/streamUpdatedAt.
 * Узел пропускается, если его успели заменить (storageKey или updatedAt другие).
 */
export function applyStreamResults(platform, results, now) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const applied = [];
  const skipped = [];
  const materials = walk(platform?.materials).map((node) => {
    const r = byId.get(node.id);
    if (!r) return node;
    if (node.storageKey !== r.storageKey || (node.updatedAt || null) !== r.updatedAt) {
      skipped.push(r.id);
      return node;
    }
    applied.push(r.id);
    return { ...node, streamKey: r.streamKey, streamSize: r.streamSize, streamUpdatedAt: now };
  });
  for (const r of results) if (!applied.includes(r.id) && !skipped.includes(r.id)) skipped.push(r.id);
  return { platform: { ...platform, materials }, applied, skipped };
}

/** Верхние атомы MP4 по первым байтам каждого атома: [{type, offset, size}]. */
export function topLevelAtoms(readAt, total) {
  return (async () => {
    const out = [];
    let offset = 0;
    while (offset < total && out.length < 64) {
      const head = await readAt(offset, 16);
      if (head.length < 8) break;
      let size = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (size === 1) size = Number(head.readBigUInt64BE(8));
      if (size === 0) size = total - offset;
      if (size < 8) break;
      out.push({ type, offset, size });
      offset += size;
    }
    return out;
  })();
}

/** moov раньше mdat — плеер может начать показ, не дочитывая файл до конца. */
export function isFaststart(atoms) {
  const moov = atoms.findIndex((a) => a.type === 'moov');
  const mdat = atoms.findIndex((a) => a.type === 'mdat');
  return moov >= 0 && (mdat < 0 || moov < mdat);
}
