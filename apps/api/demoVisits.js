/**
 * Демо-выезды для стенда. Дата «плавает» вместе с сегодняшним днём (demoDay, demoMinute по Москве),
 * пока выезд не изменили вручную. Так календарь и напоминания на стенде всегда живые.
 */

function roomsOf(platform, orgId) {
  return (platform.objects || []).filter((o) => o.orgId === orgId && o.projectId && !o.archivedAt);
}

function firstUser(platform, orgId, role) {
  return (platform.users || []).find((u) => u.orgId === orgId && u.role === role && !u.disabled) || null;
}

/** Выезды на неделю вокруг сегодняшнего дня: замеры у новых комнат, монтажи у комнат на монтаже. */
export function buildDemoVisits(platform) {
  const out = [];
  const plan = [
    // [смещение в днях, минуты от полуночи, длительность]
    { day: -1, minute: 11 * 60, dur: 60 },
    { day: 0, minute: 10 * 60, dur: 60 },
    { day: 0, minute: 15 * 60, dur: 90 },
    { day: 1, minute: 10 * 60, dur: 60 },
    { day: 1, minute: 12 * 60 + 30, dur: 60 },
    { day: 2, minute: 9 * 60 + 30, dur: 60 },
    { day: 3, minute: 14 * 60, dur: 60 },
    { day: 5, minute: 11 * 60, dur: 60 },
  ];
  const installPlan = [
    { day: -3, minute: 10 * 60, dur: 300 },
    { day: 0, minute: 9 * 60, dur: 360 },
    { day: 2, minute: 10 * 60, dur: 300 },
    { day: 4, minute: 9 * 60, dur: 420 },
    { day: 8, minute: 10 * 60, dur: 300 },
  ];
  const now = new Date().toISOString();
  for (const orgId of ['org_demo', 'org_demo_spb']) {
    const measurer = firstUser(platform, orgId, 'measurer');
    const crew = firstUser(platform, orgId, 'crew');
    const owner = firstUser(platform, orgId, 'owner');
    if (!measurer || !crew || !owner) continue;
    const rooms = roomsOf(platform, orgId);
    const seen = new Set();
    const byStatus = (statuses) =>
      rooms.filter((r) => statuses.includes(r.status) && !seen.has(r.projectId) && (seen.add(r.projectId), true));
    const toMeasure = byStatus(['draft', 'measured']);
    const toInstall = byStatus(['install', 'quote_sent']);
    toMeasure.slice(0, plan.length).forEach((room, i) => {
      const p = plan[i];
      out.push({
        id: `vis_demo_${orgId}_m${i}`,
        orgId,
        kind: 'measure',
        projectId: room.projectId,
        objectId: null,
        demo: true,
        demoDay: p.day,
        demoMinute: p.minute,
        startsAt: now,
        durationMin: p.dur,
        // Два выезда в одно время у одного человека: на стенде видно предупреждение о пересечении.
        userId: measurer.id,
        note: i === 0 ? 'Клиент просил позвонить за час' : '',
        doneAt: null,
        createdBy: owner.id,
        createdAt: now,
        updatedAt: now,
      });
    });
    if (out.length && orgId === 'org_demo') {
      const clash = out.find((v) => v.orgId === orgId && v.demoDay === 1 && v.demoMinute === 10 * 60);
      const other = toMeasure[plan.length] || toMeasure[0];
      if (clash && other) {
        out.push({ ...clash, id: `vis_demo_${orgId}_clash`, projectId: other.projectId, demoMinute: 10 * 60 + 30, note: 'Пересекается с другим замером' });
      }
    }
    toInstall.slice(0, installPlan.length).forEach((room, i) => {
      const p = installPlan[i];
      out.push({
        id: `vis_demo_${orgId}_i${i}`,
        orgId,
        kind: 'install',
        projectId: room.projectId,
        objectId: null,
        demo: true,
        demoDay: p.day,
        demoMinute: p.minute,
        startsAt: now,
        durationMin: p.dur,
        userId: crew.id,
        note: '',
        doneAt: null,
        createdBy: owner.id,
        createdAt: now,
        updatedAt: now,
      });
    });
  }
  return out;
}
