/** Soft channel attribution from URL — no role quiz. Persists for the tab session. */

const STORAGE_KEY = 'pm-channel';

export type ChannelAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  ref?: string;
  mgr?: string;
  /** First non-empty referrer host (document.referrer), captured once. */
  referrerHost?: string;
};

function readStored(): ChannelAttribution | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChannelAttribution;
  } catch {
    return null;
  }
}

function writeStored(channel: ChannelAttribution): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(channel));
  } catch {
    /* private mode / quota */
  }
}

function pick(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key)?.trim();
  return v || undefined;
}

/** Capture UTM / ref / mgr from the current URL once; keep first-touch for the tab. */
export function captureChannelFromUrl(href?: string): ChannelAttribution {
  const existing = readStored();
  if (existing && Object.keys(existing).length > 0) return existing;

  const resolved =
    href ??
    (typeof window !== 'undefined' ? window.location.href : 'https://local.invalid/');
  const url = new URL(resolved);
  const p = url.searchParams;
  const channel: ChannelAttribution = {};

  const utm_source = pick(p, 'utm_source');
  const utm_medium = pick(p, 'utm_medium');
  const utm_campaign = pick(p, 'utm_campaign');
  const utm_content = pick(p, 'utm_content');
  const utm_term = pick(p, 'utm_term');
  const ref = pick(p, 'ref');
  const mgr = pick(p, 'mgr');

  if (utm_source) channel.utm_source = utm_source;
  if (utm_medium) channel.utm_medium = utm_medium;
  if (utm_campaign) channel.utm_campaign = utm_campaign;
  if (utm_content) channel.utm_content = utm_content;
  if (utm_term) channel.utm_term = utm_term;
  if (ref) channel.ref = ref;
  if (mgr) channel.mgr = mgr;

  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) channel.referrerHost = host;
    }
  } catch {
    /* ignore */
  }

  writeStored(channel);
  return channel;
}

export function getChannel(): ChannelAttribution {
  return readStored() ?? captureChannelFromUrl();
}

/** Compact label for Metrika params / dashboards. */
export function channelLabel(ch: ChannelAttribution = getChannel()): string {
  if (ch.mgr) return `mgr:${ch.mgr}`;
  if (ch.ref) return `ref:${ch.ref}`;
  if (ch.utm_source) {
    const parts = [ch.utm_source, ch.utm_medium, ch.utm_campaign].filter(Boolean);
    return parts.join('/');
  }
  if (ch.referrerHost) return `referrer:${ch.referrerHost}`;
  return 'direct';
}
