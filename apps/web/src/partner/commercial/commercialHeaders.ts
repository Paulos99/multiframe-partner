export type DataContext = 'work' | 'demo';

export function buildCommercialHeaders(input: {
  context: DataContext;
  mutation: boolean;
  ifMatch?: number | null;
  idempotencyKey?: string | null;
}): Record<string, string> {
  if (input.mutation && (input.ifMatch == null || !Number.isFinite(Number(input.ifMatch)))) {
    throw Object.assign(new Error('Нужен заголовок If-Match'), { status: 428 });
  }
  const headers: Record<string, string> = { 'X-Data-Context': input.context };
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;
  if (input.ifMatch != null) headers['If-Match'] = String(input.ifMatch);
  return headers;
}
