/**
 * Gate C prototype store — demo fixtures only.
 * NOT production proof. Persists to localStorage for clickable paths.
 */
(function (global) {
  const KEY = "mf_gate_c_proto_v1";

  const ROLES = {
    sales: { id: "sales", label: "Продажи", person: "Мария Ковалёва", org: "Неболайн" },
    owner: { id: "owner", label: "Владелец", person: "Игорь Неболин", org: "Неболайн" },
    measurer: { id: "measurer", label: "Замерщик", person: "Павел Рыжов", org: "Неболайн" },
    crew: { id: "crew", label: "Монтаж", person: "Денис Орлов", org: "Неболайн" },
    admin: { id: "admin", label: "StP Admin", person: "Елена Степанова", org: "MultiFrame StP" },
  };

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
  }

  function seed() {
    const dealActive = {
      dealId: "deal_nv_041",
      projectId: "prj_nv_soroka",
      stage: "calculated",
      outcome: null,
      active: true,
      lossReason: null,
      stageAtOutcome: null,
      paused: false,
      closedAt: null,
      nextActionAt: "2026-10-24",
    };
    const dealPaused = {
      dealId: "deal_nv_038",
      projectId: "prj_nv_park",
      stage: "assessed",
      outcome: "early_paused",
      active: true,
      lossReason: "Клиент уехал на 2 недели",
      stageAtOutcome: "assessed",
      paused: true,
      closedAt: null,
      nextActionAt: "2026-10-28",
    };

    return {
      version: 1,
      role: null,
      offline: false,
      syncState: "online",
      toastSeq: 0,
      consultationSessionId: null,
      sessionDraft: null,
      ui: {
        projectTab: "rooms",
        dealSheet: null,
        academyNode: "N0",
        academyPath: [],
        academyDone: null,
        adminStep: "signals",
        installMode: "checklist",
        loadingDemo: false,
      },
      org: {
        id: "org_neboline",
        name: "Неболайн",
        city: "Санкт-Петербург",
        segment: "Натяжные потолки · жилой сегмент",
      },
      staff: [
        { id: "u_maria", name: "Мария Ковалёва", role: "sales" },
        { id: "u_pavel", name: "Павел Рыжов", role: "measurer" },
        { id: "u_denis", name: "Денис Орлов", role: "crew" },
        { id: "u_igor", name: "Игорь Неболин", role: "owner" },
      ],
      projects: [
        {
          id: "prj_nv_soroka",
          name: "Сорокина · ул. Заречная 14",
          client: "Анна Сорокина",
          phone: "+7 921 ···· 4412",
          address: "СПб, ул. Заречная 14, кв. 67",
          phase: "Active",
          rooms: [
            {
              id: "room_sor_bedroom",
              name: "Спальня",
              areaM2: 14.2,
              status: "open",
              preliminary: { revisionId: "crev_p1", amount: 48600, segment: "comfort" },
              detailed: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: null,
              schemeOk: false,
            },
            {
              id: "room_sor_living",
              name: "Гостиная",
              areaM2: 22.5,
              status: "open",
              preliminary: null,
              detailed: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: null,
              assigneeCrew: null,
              schemeOk: false,
            },
          ],
        },
        {
          id: "prj_nv_park",
          name: "Парк Хаус · корп. 3",
          client: "Сергей Мишин",
          phone: "+7 911 ···· 2201",
          address: "СПб, пр. Парковый 8",
          phase: "Active",
          rooms: [
            {
              id: "room_park_kids",
              name: "Детская",
              areaM2: 12.0,
              status: "open",
              preliminary: { revisionId: "crev_pk1", amount: 39200, segment: "standard" },
              detailed: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: null,
              schemeOk: true,
            },
          ],
        },
        {
          id: "prj_nv_install",
          name: "Васильев · Невский 102",
          client: "Олег Васильев",
          phone: "+7 981 ···· 7730",
          address: "СПб, Невский пр. 102",
          phase: "Install",
          rooms: [
            {
              id: "room_vas_hall",
              name: "Зал",
              areaM2: 18.4,
              status: "install",
              preliminary: { revisionId: "crev_v1", amount: 61000, segment: "comfort" },
              detailed: { revisionId: "crev_v2", amount: 62800, segment: "comfort" },
              techReady: true,
              roomAssent: "ordered",
              materialsReady: true,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: "u_denis",
              schemeOk: true,
              installChecklist: [
                { id: "c1", label: "Схема раскроя сверена", done: true, na: false, reason: "" },
                { id: "c2", label: "Профиль и крепёж на объекте", done: true, na: false, reason: "" },
                { id: "c3", label: "Полотно принято без брака", done: false, na: false, reason: "" },
                { id: "c4", label: "Электрика под точки согласована", done: false, na: false, reason: "" },
                { id: "c5", label: "Клиент подтвердил доступ", done: true, na: false, reason: "" },
              ],
              blocker: null,
            },
            {
              id: "room_vas_kitchen",
              name: "Кухня",
              areaM2: 9.1,
              status: "open",
              preliminary: { revisionId: "crev_vk", amount: 28400, segment: "standard" },
              detailed: null,
              techReady: false,
              roomAssent: "deferred",
              materialsReady: false,
              assigneeMeasurer: null,
              assigneeCrew: null,
              schemeOk: false,
            },
          ],
        },
        {
          id: "prj_nv_empty",
          name: "Черновик — новый запрос",
          client: "",
          phone: "",
          address: "",
          phase: "Draft",
          rooms: [],
          emptyDemo: true,
        },
      ],
      deals: [dealActive, dealPaused],
      quotes: [
        {
          revisionId: "qrev_041_1",
          dealId: "deal_nv_041",
          lifecycle: "draft",
          amount: 48600,
          rooms: ["room_sor_bedroom"],
          label: "КП v1 · Спальня предварительный",
        },
      ],
      calcHistory: [
        { revisionId: "crev_p1", roomId: "room_sor_bedroom", kind: "preliminary", amount: 48600, at: "2026-10-21T10:00:00Z" },
      ],
      partners: [
        {
          id: "org_neboline",
          name: "Неболайн",
          city: "СПб",
          health: "stalled_quote",
          signal: { code: "STALL_QUOTE_SENT", stage: "quote_sent_confirmed", days: 9, n: 14, coverage: 0.71 },
          funnel: { consultations: 42, offered: 18, accepted: 7, early_declined: 5, early_paused: 3 },
          training: { attempts: 11, passRate: 0.64, annaAvg: 71 },
          intervention: null,
        },
        {
          id: "org_potolokplus",
          name: "ПотолокПлюс",
          city: "Казань",
          health: "ok",
          signal: null,
          funnel: { consultations: 28, offered: 16, accepted: 9, early_declined: 2, early_paused: 1 },
          training: { attempts: 8, passRate: 0.75, annaAvg: 82 },
          intervention: null,
        },
        {
          id: "org_tihiy",
          name: "ТихийПотолок",
          city: "Екатеринбург",
          health: "low_offer",
          signal: { code: "LOW_MULTIFRAME_OFFER", stage: "consultation", days: 0, n: 6, coverage: 0.4 },
          funnel: { consultations: 15, offered: 2, accepted: 1, early_declined: 1, early_paused: 0 },
          training: { attempts: 2, passRate: 0.5, annaAvg: 55 },
          intervention: null,
        },
      ],
      interventions: [],
      ownerInbox: [
        { id: "oi1", kind: "assign", title: "Нет замерщика на гостиную", projectId: "prj_nv_soroka", roomId: "room_sor_living", severity: "warn" },
        { id: "oi2", kind: "blocker", title: "Монтаж: открытый blocker", projectId: "prj_nv_install", roomId: "room_vas_hall", severity: "danger" },
        { id: "oi3", kind: "paused", title: "Сделка на паузе — Парк Хаус", projectId: "prj_nv_park", dealId: "deal_nv_038", severity: "info" },
      ],
      events: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return seed();
      return data;
    } catch {
      return seed();
    }
  }

  let state = load();

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function get() {
    return state;
  }

  function setRole(roleId) {
    state.role = roleId;
    save();
  }

  function resetAll() {
    state = seed();
    save();
  }

  function setOffline(v) {
    state.offline = !!v;
    state.syncState = v ? "offline" : "online";
    save();
  }

  function project(id) {
    return state.projects.find((p) => p.id === id);
  }

  function room(projectId, roomId) {
    const p = project(projectId);
    return p && p.rooms.find((r) => r.id === roomId);
  }

  function activeDeal(projectId) {
    return state.deals.find((d) => d.projectId === projectId && d.active);
  }

  function quotesForDeal(dealId) {
    return state.quotes.filter((q) => q.dealId === dealId);
  }

  function pushEvent(type, payload) {
    state.events.unshift({ id: uid("evt"), type, at: new Date().toISOString(), payload });
    save();
  }

  /** Quick-entry: start consultation session without Deal */
  function startQuickConsultation() {
    state.consultationSessionId = uid("csess");
    state.sessionDraft = {
      kind: "quick",
      consultationSessionId: state.consultationSessionId,
      areaM2: 14,
      segment: "comfort",
      noise: "соседи сверху",
      pmDone: false,
      calcDone: false,
      amount: null,
      multiframeOffered: false,
      bound: false,
    };
    save();
    return state.sessionDraft;
  }

  function markMultiframeOffered() {
    const d = state.sessionDraft;
    if (!d) return { ok: false, error: "no_draft" };
    d.multiframeOffered = true;
    // ChatGPT Gate C note: bind to consultationSessionId, NOT dealId
    pushEvent("multiframe_offered", {
      consultationSessionId: d.consultationSessionId,
      dealId: null,
      unbound: true,
    });
    save();
    return { ok: true, consultationSessionId: d.consultationSessionId };
  }

  function finishPmOnDraft() {
    if (!state.sessionDraft) return;
    state.sessionDraft.pmDone = true;
    save();
  }

  function finishCalcOnDraft(amount) {
    if (!state.sessionDraft) return;
    state.sessionDraft.calcDone = true;
    state.sessionDraft.amount = amount;
    save();
  }

  function bindDraft({ projectName, roomName, client }) {
    const d = state.sessionDraft;
    if (!d || !d.calcDone) return { ok: false, error: "need_calc" };
    if (state.offline) return { ok: false, error: "offline" };
    const projectId = uid("prj");
    const roomId = uid("room");
    const dealId = uid("deal");
    const crev = uid("crev");
    const proj = {
      id: projectId,
      name: projectName,
      client: client || projectName,
      phone: "",
      address: "",
      phase: "Active",
      rooms: [
        {
          id: roomId,
          name: roomName,
          areaM2: d.areaM2,
          status: "open",
          preliminary: { revisionId: crev, amount: d.amount, segment: d.segment },
          detailed: null,
          techReady: false,
          roomAssent: null,
          materialsReady: false,
          assigneeMeasurer: null,
          assigneeCrew: null,
          schemeOk: false,
        },
      ],
    };
    state.projects.unshift(proj);
    state.deals.unshift({
      dealId,
      projectId,
      stage: "calculated",
      outcome: null,
      active: true,
      lossReason: null,
      stageAtOutcome: null,
      paused: false,
      closedAt: null,
      nextActionAt: null,
    });
    state.calcHistory.push({
      revisionId: crev,
      roomId,
      kind: "preliminary",
      amount: d.amount,
      at: new Date().toISOString(),
      consultationSessionId: d.consultationSessionId,
    });
    pushEvent("quick_bind", {
      projectId,
      roomId,
      dealId,
      consultationSessionId: d.consultationSessionId,
      multiframeOffered: d.multiframeOffered,
    });
    state.sessionDraft = { ...d, bound: true, projectId, roomId, dealId };
    save();
    return { ok: true, projectId, roomId, dealId };
  }

  function saveCalcToRoom(projectId, roomId, kind, amount) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    const revisionId = uid("crev");
    const entry = { revisionId, amount, segment: r.preliminary?.segment || "comfort" };
    if (kind === "detailed") {
      r.detailed = entry;
      r.schemeOk = true;
      // detailed alone doesn't make tech-ready without materials+assent+assignee
    } else {
      r.preliminary = entry;
    }
    state.calcHistory.push({ revisionId, roomId, kind, amount, at: new Date().toISOString() });
    const deal = activeDeal(projectId);
    if (deal && !deal.paused && deal.stage === "new") deal.stage = "calculated";
    if (deal && !deal.paused && (deal.stage === "assessed" || deal.stage === "inquiry")) deal.stage = "calculated";
    save();
    return { ok: true, revisionId };
  }

  function createQuote(dealId) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal || deal.paused) return { ok: false };
    const p = project(deal.projectId);
    const roomIds = p.rooms.filter((r) => r.preliminary || r.detailed).map((r) => r.id);
    const amount = p.rooms.reduce((s, r) => s + (r.detailed?.amount || r.preliminary?.amount || 0), 0);
    const revisionId = uid("qrev");
    state.quotes.push({
      revisionId,
      dealId,
      lifecycle: "draft",
      amount,
      rooms: roomIds,
      label: `КП v${quotesForDeal(dealId).length + 1}`,
    });
    save();
    return { ok: true, revisionId };
  }

  /** copy/PDF ≠ sent */
  function shareQuote(revisionId, mode) {
    const q = state.quotes.find((x) => x.revisionId === revisionId);
    if (!q) return { ok: false };
    if (q.lifecycle === "sent_confirmed") return { ok: false, error: "immutable" };
    pushEvent(mode === "pdf" ? "quote_pdf" : "quote_copy", { revisionId, dealId: q.dealId });
    // lifecycle unchanged
    return { ok: true, lifecycle: q.lifecycle, message: mode === "pdf" ? "PDF готов" : "Скопировано" };
  }

  function confirmSent(revisionId) {
    const q = state.quotes.find((x) => x.revisionId === revisionId);
    if (!q) return { ok: false };
    if (q.lifecycle === "sent_confirmed") return { ok: false, error: "already" };
    q.lifecycle = "sent_confirmed";
    const deal = state.deals.find((d) => d.dealId === q.dealId);
    if (deal) deal.stage = "quote_sent_confirmed";
    pushEvent("confirm_sent", { revisionId, dealId: q.dealId });
    save();
    return { ok: true };
  }

  function pauseDeal(dealId, reason) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal || !deal.active) return { ok: false };
    if (!reason || !reason.trim()) return { ok: false, error: "reason" };
    deal.paused = true;
    deal.outcome = "early_paused";
    deal.lossReason = reason.trim();
    deal.stageAtOutcome = deal.stage;
    deal.closedAt = null; // pause ≠ close
    pushEvent("early_paused", { dealId, stageAtOutcome: deal.stageAtOutcome });
    save();
    return { ok: true };
  }

  /** Resume → same dealId, return to stageAtOutcome */
  function resumeDeal(dealId) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal || deal.outcome !== "early_paused") return { ok: false };
    const resumeStage = deal.stageAtOutcome || deal.stage;
    deal.paused = false;
    deal.outcome = null;
    deal.stage = resumeStage;
    deal.lossReason = null;
    // keep stageAtOutcome for audit
    pushEvent("deal_resumed", { dealId, stage: resumeStage });
    save();
    return { ok: true, stage: resumeStage, dealId };
  }

  function declineDeal(dealId, reason) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal) return { ok: false };
    if (!reason || !reason.trim()) return { ok: false, error: "reason" };
    deal.outcome = "early_declined";
    deal.active = false;
    deal.paused = false;
    deal.lossReason = reason.trim();
    deal.stageAtOutcome = deal.stage;
    deal.closedAt = new Date().toISOString();
    pushEvent("early_declined", { dealId });
    save();
    return { ok: true };
  }

  function acceptDeal(dealId) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal || deal.paused) return { ok: false };
    deal.outcome = "accepted";
    deal.stage = "accepted";
    const p = project(deal.projectId);
    p.rooms.forEach((r) => {
      if (r.preliminary || r.detailed) {
        if (!r.roomAssent) r.roomAssent = "ordered";
      }
    });
    // promote tech-ready where possible
    p.rooms.forEach((r) => {
      if (r.roomAssent === "ordered" && r.detailed && r.materialsReady && r.assigneeCrew && r.schemeOk) {
        r.techReady = true;
        r.status = "install";
      }
    });
    pushEvent("deal_accepted", { dealId });
    save();
    return { ok: true };
  }

  function assignRoom(projectId, roomId, field, userId) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    r[field] = userId;
    if (field === "assigneeCrew" && r.roomAssent === "ordered" && r.detailed && r.materialsReady && r.schemeOk) {
      r.techReady = true;
      r.status = "install";
    }
    pushEvent("assignment", { projectId, roomId, field, userId });
    save();
    return { ok: true };
  }

  function setMaterials(projectId, roomId, ready) {
    const r = room(projectId, roomId);
    if (!r) return;
    r.materialsReady = ready;
    if (ready && r.roomAssent === "ordered" && r.detailed && r.assigneeCrew && r.schemeOk) {
      r.techReady = true;
      r.status = "install";
    }
    save();
  }

  function toggleChecklist(projectId, roomId, itemId, patch) {
    const r = room(projectId, roomId);
    if (!r || !r.installChecklist) return { ok: false };
    const item = r.installChecklist.find((c) => c.id === itemId);
    if (!item) return { ok: false };
    Object.assign(item, patch);
    save();
    return { ok: true };
  }

  function setBlocker(projectId, roomId, type, note) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    r.blocker = { id: uid("blk"), type, note, open: true, at: new Date().toISOString() };
    pushEvent("blocker", { projectId, roomId, type });
    save();
    return { ok: true };
  }

  function clearBlocker(projectId, roomId) {
    const r = room(projectId, roomId);
    if (!r) return;
    if (r.blocker) r.blocker.open = false;
    save();
  }

  function tryCloseInstall(projectId, roomId) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    if (r.blocker && r.blocker.open) return { ok: false, error: "blocker" };
    const cl = r.installChecklist || [];
    const incomplete = cl.filter((c) => !c.done && !(c.na && c.reason && c.reason.trim()));
    if (incomplete.length) return { ok: false, error: "checklist", incomplete };
    r.status = "closed";
    pushEvent("room_closed", { projectId, roomId });
    save();
    return { ok: true };
  }

  function createInquiry({ client, address, roomName, areaM2 }) {
    if (state.offline) return { ok: false, error: "offline" };
    const projectId = uid("prj");
    const roomId = uid("room");
    const dealId = uid("deal");
    state.projects.unshift({
      id: projectId,
      name: `${client} · ${address.split(",")[0] || address}`,
      client,
      phone: "",
      address,
      phase: "Active",
      rooms: [
        {
          id: roomId,
          name: roomName || "Комната 1",
          areaM2: Number(areaM2) || 12,
          status: "open",
          preliminary: null,
          detailed: null,
          techReady: false,
          roomAssent: null,
          materialsReady: false,
          assigneeMeasurer: null,
          assigneeCrew: null,
          schemeOk: false,
        },
      ],
    });
    state.deals.unshift({
      dealId,
      projectId,
      stage: "inquiry",
      outcome: null,
      active: true,
      lossReason: null,
      stageAtOutcome: null,
      paused: false,
      closedAt: null,
      nextActionAt: null,
    });
    pushEvent("inquiry_created", { projectId, roomId, dealId });
    save();
    return { ok: true, projectId, roomId, dealId };
  }

  function createIntervention(partnerId, hypothesis, module) {
    const partner = state.partners.find((p) => p.id === partnerId);
    if (!partner) return { ok: false };
    const id = uid("int");
    const item = {
      id,
      partnerId,
      hypothesis,
      module,
      status: "open",
      createdAt: new Date().toISOString(),
      verified: false,
      result: null,
    };
    state.interventions.unshift(item);
    partner.intervention = id;
    partner.health = "intervention";
    pushEvent("intervention_created", { id, partnerId });
    save();
    return { ok: true, id };
  }

  function verifyIntervention(id, result) {
    const item = state.interventions.find((x) => x.id === id);
    if (!item) return { ok: false };
    item.verified = true;
    item.status = "verified";
    item.result = result;
    const partner = state.partners.find((p) => p.id === item.partnerId);
    if (partner) partner.health = result === "adopted" ? "ok" : partner.health;
    pushEvent("intervention_verified", { id, result });
    save();
    return { ok: true };
  }

  function crewInbox() {
    const items = [];
    state.projects.forEach((p) => {
      p.rooms.forEach((r) => {
        if (r.roomAssent === "ordered" && r.techReady && r.status !== "closed") {
          items.push({ project: p, room: r });
        }
      });
    });
    return items;
  }

  function measurerInbox() {
    const items = [];
    state.projects.forEach((p) => {
      p.rooms.forEach((r) => {
        if (r.assigneeMeasurer === "u_pavel" && r.status !== "closed" && !r.detailed) {
          items.push({ project: p, room: r });
        }
      });
    });
    return items;
  }

  global.MFStore = {
    ROLES,
    uid,
    get,
    save,
    setRole,
    resetAll,
    setOffline,
    project,
    room,
    activeDeal,
    quotesForDeal,
    pushEvent,
    startQuickConsultation,
    markMultiframeOffered,
    finishPmOnDraft,
    finishCalcOnDraft,
    bindDraft,
    saveCalcToRoom,
    createQuote,
    shareQuote,
    confirmSent,
    pauseDeal,
    resumeDeal,
    declineDeal,
    acceptDeal,
    assignRoom,
    setMaterials,
    toggleChecklist,
    setBlocker,
    clearBlocker,
    tryCloseInstall,
    createInquiry,
    createIntervention,
    verifyIntervention,
    crewInbox,
    measurerInbox,
  };
})(window);
