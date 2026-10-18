/**
 * Тот же алгоритм, что в funnel.ts.
 * Node-сервер импортирует этот файл: Cloud Function не грузит TypeScript.
 * Не правьте вручную — меняйте funnel.ts и прогоните тест apps/api/funnel.test.js.
 */
const PROBLEM_STAGES = [
    'open',
    'result',
    'pdf',
    'share'
];
const CALC_STAGES = [
    'open',
    'calc_done',
    'pdf'
];
function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function dayStamp(at) {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(at));
    return match ? match[1] : 'noday';
}
export function funnelPassKey(event, tool) {
    const sessionId = text(event.sessionId);
    if (sessionId) return `${tool}\u0000s\u0000${sessionId}`;
    const org = text(event.orgId);
    const user = text(event.userId) || text(event.login) || 'anonymous';
    return `${tool}\u0000f\u0000${org}\u0000${user}\u0000${dayStamp(event.at)}`;
}
function countReached(events, tool, stages) {
    const reached = new Map();
    for (const raw of events){
        if (!raw || typeof raw !== 'object') continue;
        const event = raw;
        if (event.tool !== tool) continue;
        const stage = stages.indexOf(text(event.action));
        if (stage < 0) continue;
        const key = funnelPassKey(event, tool);
        const prev = reached.get(key) ?? -1;
        if (stage > prev) reached.set(key, stage);
    }
    const counts = stages.map(()=>0);
    for (const maxStage of reached.values()){
        for(let index = 0; index <= maxStage; index += 1){
            counts[index] += 1;
        }
    }
    return counts;
}
export function computeAnalyticsFunnel(events) {
    const list = Array.isArray(events) ? events : [];
    const problemomer = countReached(list, 'problemomer', PROBLEM_STAGES);
    const calculator = countReached(list, 'calculator', CALC_STAGES);
    return {
        problemomer: {
            open: problemomer[0] ?? 0,
            result: problemomer[1] ?? 0,
            pdf: problemomer[2] ?? 0,
            share: problemomer[3] ?? 0
        },
        calculator: {
            open: calculator[0] ?? 0,
            calcDone: calculator[1] ?? 0,
            pdf: calculator[2] ?? 0
        }
    };
}
export function funnelStepPercent(part, whole) {
    const base = typeof whole === 'number' && Number.isFinite(whole) ? whole : 0;
    const value = typeof part === 'number' && Number.isFinite(part) ? part : 0;
    if (base <= 0) return '—';
    const ratio = Math.min(1, Math.max(0, value / base));
    return `${Math.round(ratio * 100)}%`;
}
