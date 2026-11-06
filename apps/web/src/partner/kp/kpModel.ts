/**
 * Коммерческое предложение по проекту: несколько комнат одного объекта.
 * Эффект MultiFrame показывается один раз на объект и считается теми же функциями,
 * что страница результата Проблемомера (deriveSimulation, reverb), без дБ.
 */
import type { JobObject, OrgSettings, Project } from '../../../../../packages/shared/partner';
import { HYBRID_CLASS_LABELS, HOUSE_TYPE_OPTIONS, type ClassLabel, type RoomAnswers, type SessionState } from '../../state/types';
import { withDerived } from '../../state/session';
import { encodeRoomAnswers } from '../../state/shareLink';
import { DEFAULT_ROOM_WISHES } from '../../state/types';
import { deriveSimulation } from '../../state/simulation';
import { sessionFromRoom } from '../roomLink';
import { roomTitle } from '../projectDesk';
import { kpRooms, kpStamp } from './kpStamp';

export { kpRooms, kpStamp };

export type KpEffect = {
  classBefore: ClassLabel;
  classAfter: ClassLabel;
  impactPct: number;
  airPct: number;
  echoPct: number;
};

export type KpRoomLine = {
  id: string;
  title: string;
  areaM2: number;
  panels: number;
  dowels: number;
  installCost: number | null;
  subtotal: number;
};

export type KpModel = {
  number: string;
  dateLabel: string;
  clientName: string;
  address: string;
  companyName: string;
  manager: { name: string; phone: string } | null;
  rooms: KpRoomLine[];
  areaM2: number;
  houseLabel: string;
  slabLabel: string;
  ceilingLabel: string;
  /** Комната, чьи ответы дают эффект и QR. */
  effectRoomId: string | null;
  effectAnswers: RoomAnswers | null;
  effect: KpEffect | null;
  /** Эффект в комнатах разный — под блоком короткая пометка. */
  effectNote: string;
  prices: { panel: number; dowel: number | null; installPerM2: number | null };
  totals: { panels: number; dowels: number; panelsCost: number; dowelsCost: number; installCost: number; total: number };
  demo: boolean;
  stamp: string;
};

/** Сессия Проблемомера по сохранённым ответам комнаты — та же, что открывает ссылка клиента. */
export function kpSession(room: Pick<JobObject, 'room' | 'roomName'>): SessionState {
  return withDerived(sessionFromRoom(room));
}

export function effectFromSession(session: SessionState): KpEffect | null {
  // Тот же выбор, что на странице результата (resultShared.tsx).
  const sim = session.derived?.simulation ?? deriveSimulation(session.answers);
  return {
    classBefore: sim.before.classLabel,
    classAfter: sim.after.classLabel,
    impactPct: sim.perceivedImpactPct,
    airPct: sim.perceivedAirPct,
    echoPct: Math.max(0, Math.round(sim.reverb.echoInRoomBefore - sim.reverb.echoInRoomAfter)),
  };
}

function hasSlabAnswers(room: JobObject): boolean {
  const a = room.room?.answers as Record<string, unknown> | null | undefined;
  return Boolean(a && (a.slabType || a.houseType || a.objectStage));
}

const SLAB_SHORT: Record<string, string> = { hollow: 'ПК', monolith: 'Монолит', wood: 'Деревянное' };
const THICK_SHORT: Record<string, string> = {
  up_to_160: 'до 160',
  about_160_200: '160–200',
  about_200_250: '200–250',
  over_250: 'от 250',
};

function slabLabel(a: RoomAnswers | null): string {
  if (!a) return 'не указано';
  const t = SLAB_SHORT[a.slabType as string];
  const th = THICK_SHORT[a.slabThickness as string];
  if (!t) return 'не указано';
  return th ? `${t} ${th}` : t;
}

function houseLabel(a: RoomAnswers | null): string {
  const label = HOUSE_TYPE_OPTIONS.find((o) => o.id === a?.houseType)?.label;
  if (!label || a?.houseType === 'unknown') return 'не указано';
  return label.replace(/\s*\(.*\)$/, '');
}

export function kpNumber(project: Pick<Project, 'id'>, demo: boolean, date: Date): string {
  if (demo) return 'ДЕМО-001';
  const tail = project.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
  const d = `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${d}-${tail}`;
}

export function buildKpModel(input: {
  project: Pick<Project, 'id' | 'name' | 'clientName' | 'address' | 'city'>;
  rooms: JobObject[];
  org: OrgSettings | null | undefined;
  manager: { name: string; phone: string } | null;
  date?: Date;
  demo?: boolean;
}): KpModel {
  const date = input.date || new Date();
  const list = kpRooms(input.rooms);
  if (!list.length) throw new Error('В проекте нет комнат с расчётом калькулятора');
  const org = input.org;
  const rooms: KpRoomLine[] = list.map((r) => {
    const e = r.estimate!;
    const panelsCost = e.panelsCost ?? 0;
    const dowelsCost = e.dowelsCost ?? 0;
    const installCost = e.installCost ?? null;
    return {
      id: r.id,
      title: roomTitle(r),
      areaM2: Number(r.room?.areaM2) || 0,
      panels: e.panels,
      dowels: e.dowels,
      installCost,
      subtotal: e.totalCost ?? panelsCost + dowelsCost + (installCost ?? 0),
    };
  });
  const effectRoom = list.find(hasSlabAnswers) || list[0]!;
  const session = kpSession(effectRoom);
  const effect = effectFromSession(session);
  const differs = list.some((r) => {
    if (r === effectRoom || !hasSlabAnswers(r)) return false;
    const other = effectFromSession(kpSession(r));
    return (
      !!other &&
      !!effect &&
      (other.impactPct !== effect.impactPct || other.airPct !== effect.airPct || other.echoPct !== effect.echoPct)
    );
  });
  const sum = (f: (r: JobObject) => number) => list.reduce((acc, r) => acc + f(r), 0);
  const totals = {
    panels: sum((r) => r.estimate!.panels),
    dowels: sum((r) => r.estimate!.dowels),
    panelsCost: sum((r) => r.estimate!.panelsCost ?? 0),
    dowelsCost: sum((r) => r.estimate!.dowelsCost ?? 0),
    installCost: sum((r) => r.estimate!.installCost ?? 0),
    total: rooms.reduce((acc, r) => acc + r.subtotal, 0),
  };
  const areaM2 = Math.round(rooms.reduce((acc, r) => acc + r.areaM2, 0) * 10) / 10;
  const panelPrice = org?.panelPriceRub || (totals.panels ? Math.round(totals.panelsCost / totals.panels) : 0);
  return {
    number: kpNumber(input.project, Boolean(input.demo), date),
    dateLabel: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    clientName: input.project.clientName || input.project.name || 'Клиент',
    address: [input.project.address, input.project.city].filter(Boolean).join(', '),
    companyName: org?.companyName || '',
    manager: input.manager,
    rooms,
    areaM2,
    houseLabel: houseLabel(session.answers.room),
    slabLabel: slabLabel(session.answers.room),
    ceilingLabel: 'Натяжной',
    effectRoomId: effectRoom.id,
    effectAnswers: session.answers.room,
    effect,
    effectNote: differs ? 'В комнатах перекрытие отличается — эффект показан для комнаты «' + roomTitle(effectRoom) + '».' : '',
    prices: {
      panel: panelPrice,
      dowel: org?.dowelPriceRub ?? (totals.dowels ? Math.round(totals.dowelsCost / totals.dowels) : null),
      installPerM2: org?.installPricePerM2 ?? (areaM2 ? Math.round(totals.installCost / areaM2) : null),
    },
    totals,
    demo: Boolean(input.demo),
    stamp: kpStamp(input.rooms),
  };
}

export function classLabel(cls: ClassLabel): string {
  return HYBRID_CLASS_LABELS[cls];
}

/**
 * Короткий ?p= для QR: без полей, которые ссылка и так восстанавливает по умолчанию
 * (тип потолка, «не знаю» о шуме, пожелания по умолчанию). Ответы после раскрытия те же.
 */
export function kpShareToken(answers: RoomAnswers): string {
  const room: Record<string, unknown> = { ...answers };
  delete room.plannedCeiling;
  if (room.noiseKind === 'unknown') delete room.noiseKind;
  if (!room.roomTypeCustom) delete room.roomTypeCustom;
  const wishes = Array.isArray(room.roomWishes) ? (room.roomWishes as string[]) : [];
  if (wishes.length === DEFAULT_ROOM_WISHES.length && wishes.every((w, i) => w === DEFAULT_ROOM_WISHES[i])) delete room.roomWishes;
  return encodeRoomAnswers(room as unknown as RoomAnswers);
}
