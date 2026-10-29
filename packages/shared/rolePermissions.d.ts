export const STP_MANAGER_ROLE: 'stp_manager';
export const STP_MANAGER_LABEL: string;
export const STP_ORG_ID: 'org_stp';
export const STP_ORG_NAME: string;
export function isStpManager(role: unknown): boolean;
export function stpManagerMayCall(method: string, path: string): boolean;
