import { describe, expect, it } from 'vitest';
import { buildLocalDemoObjects, buildLocalDemoOrgs, DEMO_KP_ANSWERS } from '../demoSeed';
import { buildKpModel, kpShareToken, kpStamp } from './kpModel';
import { buildKpHtml } from './kpHtml';
import { encodeRoomAnswers, sessionFromShareToken } from '../../state/shareLink';
import { deriveSimulation } from '../../state/simulation';
import { PILLARS } from '../../state/reportPdf';
import { productAbout } from '../../state/recommendations';
import type { JobObject, OrgSettings } from '../../../../../packages/shared/partner';

const org = buildLocalDemoOrgs().find((o) => o.id === 'org_demo')!.settings as OrgSettings;
const rooms = buildLocalDemoObjects().filter((o) => o.id.startsWith('obj_a11'));
const project = { id: 'prj_chernov', name: 'Чернов А.', clientName: 'Чернов А.', address: 'ул. Бауманская, 33', city: 'Москва' };
const manager = { name: 'Елена Крылова', phone: '+7 900 123-45-67' };

/** Числа страницы результата для тех же ответов: открываем ссылку из QR, как клиент. */
function resultPageNumbers(answers: NonNullable<ReturnType<typeof buildKpModel>['effectAnswers']>) {
  const session = sessionFromShareToken(kpShareToken(answers))!;
  const sim = session.derived?.simulation ?? deriveSimulation(session.answers);
  return {
    impactPct: sim.perceivedImpactPct,
    airPct: sim.perceivedAirPct,
    echoPct: sim.reverb.echoInRoomBefore - sim.reverb.echoInRoomAfter,
  };
}

describe('Коммерческое предложение', () => {
  const model = buildKpModel({ project, rooms, org, manager, demo: true, date: new Date('2026-11-06T12:00:00Z') });

  it('эффект один на объект и совпадает со страницей результата для тех же ответов', () => {
    expect(model.effect).not.toBeNull();
    const page = resultPageNumbers(model.effectAnswers!);
    expect({ impactPct: model.effect!.impactPct, airPct: model.effect!.airPct, echoPct: model.effect!.echoPct }).toEqual(page);
    // Утверждённый образец: 65 / 68 / 50.
    expect(page).toEqual({ impactPct: 65, airPct: 68, echoPct: 50 });
    expect(model.effectAnswers).toMatchObject(DEMO_KP_ANSWERS);
    expect(model.effectNote).toBe('');
    // Короткий QR раскрывается в те же ответы, что полная ссылка.
    expect(sessionFromShareToken(kpShareToken(model.effectAnswers!))!.answers.room).toEqual(
      sessionFromShareToken(encodeRoomAnswers(model.effectAnswers!))!.answers.room,
    );
    expect(kpShareToken(model.effectAnswers!).length).toBeLessThan(encodeRoomAnswers(model.effectAnswers!).length);
  });

  it('комнаты: площадь, материалы, монтаж и итог; общая смета — сумма комнат', () => {
    expect(model.rooms.map((r) => [r.title, r.areaM2])).toEqual([
      ['Кабинет', 22],
      ['Спальня', 14],
      ['Гостиная', 26],
    ]);
    expect(model.areaM2).toBe(62);
    expect(model.totals.panels).toBe(rooms.reduce((n, r) => n + r.estimate!.panels, 0));
    expect(model.totals.total).toBe(model.rooms.reduce((n, r) => n + r.subtotal, 0));
    expect(model.totals.total).toBe(model.totals.panelsCost + model.totals.dowelsCost + model.totals.installCost);
    expect(model.houseLabel).toBe('Блочный');
    expect(model.slabLabel).toBe('ПК 160–200');
  });

  it('HTML: две страницы, один QR результата, проценты один раз, без дБ', () => {
    const html = buildKpHtml(model, {
      logos: { stp: 'data:,', mf: 'data:,' },
      panel: 'data:,',
      qr: { result: 'data:,r', site: 'data:,s', calc: 'data:,c' },
      pillars: PILLARS,
      about: [...productAbout(model.effectAnswers!, 'mixed').paragraphs],
    });
    expect(html.match(/class="page"/g)).toHaveLength(2);
    expect(html.match(/data-kp-qr/g)).toHaveLength(1);
    expect(html.match(/data-kp-room/g)).toHaveLength(3);
    expect(html).toContain('тише ≈ на 65%*');
    expect(html).toContain('тише ≈ на 68%*');
    expect(html).toContain('меньше ≈ на 50%*');
    expect(html.match(/\*ориентировочно/g)).toHaveLength(3);
    expect(html).not.toMatch(/дБ/);
    expect(html).not.toMatch(/https?:\/\/[^"]*\?p=/); // ссылка не подписана текстом
    expect(html).toContain('Уникальность системы');
    for (const p of PILLARS) expect(html).toContain(p.title);
    expect(html).toContain('+7 900 123-45-67');
    expect(html).toContain('Елена Крылова');
    expect(html).toContain('не инженерный расчёт');
  });

  it('отпечаток меняется вместе с площадью или ответами комнаты', () => {
    const before = kpStamp(rooms);
    const changed = rooms.map((r, i) => (i === 1 ? { ...r, room: { ...r.room, areaM2: 15 } } : r));
    expect(kpStamp(changed)).not.toBe(before);
    expect(kpStamp([...rooms].reverse())).toBe(before);
    const demoDoc = rooms.flatMap((r) => r.documents || []).find((d) => d.kind === 'offer');
    expect(demoDoc?.stamp).toBe(before);
  });

  it('разное перекрытие в комнатах — пометка под эффектом', () => {
    const mixed: JobObject[] = rooms.map((r, i) =>
      i === 2 ? { ...r, room: { ...r.room, answers: { ...r.room.answers, slabType: 'monolith', floorAbove: 'unknown' } } } : r,
    );
    const m = buildKpModel({ project, rooms: mixed, org, manager, demo: true });
    expect(m.effectNote).toContain('Кабинет');
  });
});
