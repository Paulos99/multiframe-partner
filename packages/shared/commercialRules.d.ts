import type { Deal } from './deal';
import type { QuoteRevision } from './quote';

export function pauseDeal(
  deal: Deal,
  input: { reason: string; comment?: string | null; nextActionAt?: string | null; at: string },
): Deal;
export function resumeDeal(deal: Deal, at: string): Deal;
export function declineDeal(
  deal: Deal,
  input: { reason: string; comment?: string | null; early?: boolean; at: string },
): Deal;
export function acceptDeal(
  deal: Deal,
  quote: QuoteRevision,
  assent: Record<string, string> | null,
  at: string,
): Deal;
export function followUpDeal(
  deal: Deal,
  input: { outcome: string; nextActionAt?: string | null; close?: boolean; at: string },
): Deal;
export function advanceAuto(deal: Deal, target: string, at: string): Deal;
export function applyQuoteDocument(
  quote: QuoteRevision,
  action: 'copy_text' | 'generate_pdf' | 'share' | 'confirm_sent',
  at: string,
): { quote: QuoteRevision; changed: boolean; idempotent?: boolean };
export function snapshotFromCalcs(
  roomIds: string[],
  calcsByRoom: Record<string, Array<Record<string, unknown>>>,
): {
  lines: NonNullable<QuoteRevision['snapshot']>['lines'];
  amount: number;
  legacyTotal: boolean;
};
export function sumOrdered(quote: QuoteRevision, assent: Record<string, string>): number;
export function isQuoteFrozen(quote: QuoteRevision | null | undefined): boolean;
export function httpError(status: number, message: string, fields?: Record<string, unknown>): Error & { status: number };
