export type FeedbackType = 'bug' | 'idea' | 'question';
export type FeedbackStatus = 'new' | 'in_progress' | 'fixed' | 'rejected';

export type FeedbackContext = {
  page: string;
  pageTitle: string;
  device: string;
  screen: string;
  appVersion: string;
  online: boolean | null;
};

export type FeedbackPhoto = {
  id: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  url?: string;
  thumbUrl?: string;
};

export type FeedbackItem = {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  text: string;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  companyName: string;
  userId: string;
  authorName: string;
  authorLogin: string;
  authorRole: string;
  context: FeedbackContext;
  photos: FeedbackPhoto[];
  reply: string;
  repliedAt: string | null;
  repliedBy: string | null;
  replyAuthorName: string;
};

export const FEEDBACK_TYPES: readonly FeedbackType[];
export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string>;
export const FEEDBACK_STATUSES: readonly FeedbackStatus[];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string>;
export const FEEDBACK_TEXT_MAX: number;
export const FEEDBACK_REPLY_MAX: number;
export const FEEDBACK_PHOTO_LIMIT: number;

export function canSendFeedback(role: string | null | undefined): boolean;
export function canManageFeedback(role: string | null | undefined): boolean;
export function isFeedbackType(value: unknown): value is FeedbackType;
export function isFeedbackStatus(value: unknown): value is FeedbackStatus;
export function cleanFeedbackText(raw: unknown): { value?: string; error?: string };
export function cleanFeedbackReply(raw: unknown): string;
export function cleanFeedbackContext(raw: unknown): FeedbackContext;
export function countNewFeedback(items: ReadonlyArray<{ status?: string }> | null | undefined): number;
export function filterFeedback<T extends { status?: string; type?: string; orgId?: string; createdAt?: string }>(
  items: ReadonlyArray<T> | null | undefined,
  filter?: { status?: string | null; type?: string | null; orgId?: string | null },
): T[];
