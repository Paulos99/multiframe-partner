export function roomContribution(calcs: Array<{
  id?: string;
  calcType?: string;
  amount?: number;
  revisionSeq?: number;
  divergent?: boolean;
}>): { calcType: 'preliminary' | 'detailed'; amount: number; calculationId: string } | null;

export function checklistComplete(items: Array<{ state?: string; reason?: string | null }>): boolean;
