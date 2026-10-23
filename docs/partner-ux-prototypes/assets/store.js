/**
 * Gate C draft-9 store — demo fixtures only. NOT production proof.
 * KEY v9: GC9 calc→host bind via mf-cabinet-calc (partner=1).
 */
(function (global) {
  const KEY = "mf_gate_c_proto_v9";
  const CREW_SELF = "u_denis";
  const MEASURER_SELF = "u_pavel";

  const ROLES = {
    sales: { id: "sales", label: "Продажи", person: "Мария Ковалёва", org: "Неболайн" },
    owner: { id: "owner", label: "Владелец", person: "Игорь Неболин", org: "Неболайн" },
    measurer: { id: "measurer", label: "Замерщик", person: "Павел Рыжов", org: "Неболайн" },
    crew: { id: "crew", label: "Монтаж", person: "Денис Орлов", org: "Неболайн", userId: CREW_SELF },
    admin: { id: "admin", label: "StP Admin", person: "Елена Степанова", org: "MultiFrame StP" },
  };

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
  }

  function emptyRoom(extra) {
    return Object.assign(
      {
        id: uid("room"),
        name: "Комната",
        areaM2: 12,
        lengthM: 4,
        widthM: 3,
        status: "open",
        acousticProfile: null,
        preliminary: null,
        detailed: null,
        scheme: null,
        bom: null,
        geometry: null,
        techReady: false,
        roomAssent: null,
        materialsReady: false,
        assigneeMeasurer: null,
        assigneeCrew: null,
        schemeOk: false,
        installChecklist: null,
        blocker: null,
      },
      extra
    );
  }

  function defaultChecklist() {
    return [
      { id: "c1", label: "Схема раскроя сверена", done: false, na: false, reason: "" },
      { id: "c2", label: "Профиль и крепёж на объекте", done: false, na: false, reason: "" },
      { id: "c3", label: "Полотно принято без брака", done: false, na: false, reason: "" },
      { id: "c4", label: "Электрика под точки согласована", done: false, na: false, reason: "" },
      { id: "c5", label: "Клиент подтвердил доступ", done: false, na: false, reason: "" },
    ];
  }

  /** Fixture PM results — never promise certified dB */
  function computePmResult(answers) {
    const noise = answers.noiseAwareness || "unknown";
    const neighbors = answers.neighbors || "unknown";
    const area = Number(answers.areaM2) || 14;
    const quietClient = noise === "none" && (neighbors === "none" || neighbors === "unknown");
    const noiseClient = noise === "bothered" || neighbors === "above";

    // GC2-P1-01: verbal risk/comfort levels — not normative А/Б/В classes
    let currentRisk = "средний";
    let withMfComfort = "осторожный ориентир комфорта";
    let narrative;
    let deltaLabel;
    if (quietClient) {
      currentRisk = "низкий";
      withMfComfort = "мягкий запас комфорта (иллюстрация)";
      deltaLabel = "умеренный запас комфорта — без обещания дБ";
      narrative =
        "Клиент не жалуется на шум — потребность в ЗИ формируем мягко: под полотном можно заложить каркас на будущее и для ударного шума соседей.";
    } else if (noiseClient) {
      currentRisk = "повышенный";
      withMfComfort = "заметный ориентир комфорта (иллюстрация)";
      deltaLabel = "ориентир улучшения комфорта — не гарантия дБ и не измерение";
      narrative =
        "Есть сигнал о шуме/соседях. MultiFrame под натяжным — аргумент снижения ударного шума. Без обещаний «−N дБ» и lab-гарантий.";
    } else {
      currentRisk = "неясный";
      withMfComfort = "осторожный ориентир";
      deltaLabel = "данных мало — уточнить на объекте";
      narrative =
        "Недостаточно данных о шуме — показываем сравнение «сейчас / с MultiFrame» и предлагаем уточнить на объекте или в calc.";
    }

    return {
      plannedCeiling: "stretch",
      areaM2: area,
      roomType: answers.roomType || "bedroom",
      noiseAwareness: noise,
      neighbors,
      purpose: answers.purpose || "living",
      chain: {
        norms:
          "Иллюстрация по ответам анкеты · не акустическое измерение и не нормативный класс жилья",
        current: `Сейчас · словесный риск «${currentRisk}»`,
        withMf: `С MultiFrame под полотном · ${withMfComfort}`,
        difference: deltaLabel,
        nextStep: quietClient
          ? "Сохранить профиль · мягко предложить ориентир calc"
          : "Сохранить профиль · открыть preliminary calc / КП",
      },
      narrative,
      claimsQualified: true,
      guaranteedDb: false,
      illustrativeOnly: true,
      currentRisk,
      withMfComfort,
      clientPersona: quietClient ? "quiet" : noiseClient ? "noise" : "mixed",
    };
  }

  /** GC2-P0-01: area lives on answers / pmResult, never a stale top-level default */
  function draftAreaM2(d) {
    if (!d) return 14;
    const fromAnswers = Number(d.answers?.areaM2);
    if (Number.isFinite(fromAnswers) && fromAnswers > 0) return fromAnswers;
    const fromPm = Number(d.pmResult?.areaM2);
    if (Number.isFinite(fromPm) && fromPm > 0) return fromPm;
    return 14;
  }

  /**
   * Anna path scoring (D9 §4.2.1)
   * S: P0b→P1a→P2a → 88
   * P: P0c→PTfix→P1c→P2b_fix→P2a → 71
   * F: …P1b → 11 (false promise)
   */
  function scoreAnnaPath(choices) {
    const ids = choices.map((c) => c.id);
    const joined = ids.join(">");
    if (ids.includes("P1b")) {
      return {
        path: "F",
        score: 11,
        title: "Стоп: ложное обещание",
        nextJob: "На объекте говорите честно: каркас снижает ударный шум, точную цифру без замера не обещаем.",
        falsePromise: true,
        rubric: {
          need_discovery: 80,
          tech_accuracy: 20,
          non_pushy_offer: 60,
          clarity: 40,
          objection_handling: 30,
          next_step: 20,
          no_false_promises: 0,
        },
        feedback: [
          "«Гарантируем −35 дБ и полную тишину» — так нельзя: таких гарантий нет, клиент потом разочаруется.",
          "Комнату вы спросили, но сорвали доверие выдуманной цифрой.",
        ],
        matched: ids.includes("P0b") ? "N0→P0b→N1→P1b→FailFast" : joined,
      };
    }
    const isS = joined === "P0b>P1a>P2a" || (ids[0] === "P0b" && ids.includes("P1a") && ids.includes("P2a") && !ids.includes("P0c") && !ids.includes("P1c"));
    const isP =
      ids.includes("P0c") &&
      ids.includes("PTfix") &&
      ids.includes("P1c") &&
      ids.includes("P2b_fix") &&
      ids.includes("P2a");
    if (isS && !ids.includes("P0c")) {
      return {
        path: "S",
        score: 88,
        title: "Клиент с вами",
        nextJob: "Можете спокойно открыть проблемомер и дать ориентир по площади — без давления купить сейчас.",
        falsePromise: false,
        rubric: {
          need_discovery: 90,
          tech_accuracy: 85,
          non_pushy_offer: 90,
          clarity: 85,
          objection_handling: 70,
          next_step: 95,
          no_false_promises: 100,
        },
        feedback: [
          "Сначала разобрались с комнатой — и только потом предложили MultiFrame.",
          "Без давления объяснили каркас и дали конкретный шаг: проблемомер и ориентир по площади.",
        ],
        matched: "Path S",
      };
    }
    if (isP) {
      return {
        path: "P",
        score: 71,
        title: "Почти — язык попроще",
        nextJob: "На следующем визите: сначала задача комнаты, потом состав. Термины — только если клиент сам спрашивает.",
        falsePromise: false,
        rubric: {
          need_discovery: 70,
          tech_accuracy: 45,
          non_pushy_offer: 75,
          clarity: 55,
          objection_handling: 65,
          next_step: 90,
          no_false_promises: 100,
        },
        feedback: [
          "Начали с цены — Анна закрылась; потом вернули разговор к задаче комнаты.",
          "ISO и Rw её отпугнули; когда сказали «каркас снижает шум соседей» — снова пошла.",
        ],
        matched: "Path P",
      };
    }
    // Heuristic for other endings
    const pushy = ids.some((x) => ["P0a", "PTbad", "PPu_bad", "P2b"].includes(x));
    const score = pushy ? 36 : 45;
    return {
      path: "other",
      score,
      title: pushy ? "Жёстко надавили" : "Нет следующего шага",
      nextJob: pushy
        ? "Сбавьте напор: сначала комната и ожидания, оффер — мягко и по делу."
        : "Всегда закрывайте разговор измеримым шагом: замер, КП или пауза с датой.",
      falsePromise: false,
      rubric: {},
      feedback: [
        "Этот маршрут не из эталонных. Посмотрите, где надавили или ушли от следующего шага.",
        ...choices.map((c) => `Реплика: ${c.text || c.id}`),
      ],
      matched: joined,
    };
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
      acceptedAmount: null,
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
      acceptedAmount: null,
      nextActionAt: "2026-10-28",
    };
    // GC-P0-03: 3-room partial sale fixture
    const dealPartial = {
      dealId: "deal_nv_055",
      projectId: "prj_nv_volkova",
      stage: "quote_sent_confirmed",
      outcome: null,
      active: true,
      lossReason: null,
      stageAtOutcome: null,
      paused: false,
      closedAt: null,
      acceptedAmount: null,
      nextActionAt: "2026-10-25",
    };

    return {
      version: 2,
      revision: "rev-gate-c-draft-11",
      role: null,
      offline: false,
      syncState: "online",
      outbox: [],
      consultationSessionId: null,
      sessionDraft: null,
      pendingConflicts: {},
      personalResults: [],
      ui: {
        projectTab: "rooms",
        dealSheet: null,
        academyNode: "N0",
        academyPath: [],
        academyChoices: [],
        academyDone: null,
        academyScore: null,
        adminStep: "signals",
        installMode: "checklist",
        loadingDemo: false,
        bindMode: "pick",
        pmStep: "survey",
        /** GC6-P0-03: intro | survey | result */
        pmPhase: "intro",
        pmQ: 0,
        toolTheme: "light",
        calcUi: {
          entry: null,
          lengthM: 5,
          widthM: 4,
          heightM: 2.7,
          areaOnly: 20,
          ceiling: true,
          walls: false,
          mounting: "ceiling_frameless",
          showResults: false,
          expanded: false,
        },
        showAnswerKey: false,
        conflictDemo: null,
        quotePreview: null,
        oneTimeCred: null,
        bindAreaPrompt: null,
        bindSaveType: null,
        bindPickPair: null,
        bindCreateFields: null,
      },
      org: {
        id: "org_neboline",
        name: "Неболайн",
        city: "Санкт-Петербург",
        segment: "Натяжные потолки · жилой сегмент",
      },
      staff: [
        { id: "u_maria", name: "Мария Ковалёва", role: "sales", credentialsShown: false },
        { id: "u_pavel", name: "Павел Рыжов", role: "measurer", credentialsShown: false },
        { id: "u_denis", name: "Денис Орлов", role: "crew", credentialsShown: false },
        { id: "u_sergey", name: "Сергей Ким", role: "crew", credentialsShown: false },
        { id: "u_igor", name: "Игорь Неболин", role: "owner", credentialsShown: false },
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
              lengthM: 4.1,
              widthM: 3.5,
              status: "open",
              acousticProfile: null,
              preliminary: { revisionId: "crev_p1", amount: 48600, segment: "comfort" },
              detailed: null,
              scheme: null,
              bom: null,
              geometry: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: null,
              schemeOk: false,
              installChecklist: null,
              blocker: null,
            },
            {
              id: "room_sor_living",
              name: "Гостиная",
              areaM2: 22.5,
              lengthM: 5.5,
              widthM: 4.1,
              status: "open",
              acousticProfile: null,
              preliminary: null,
              detailed: null,
              scheme: null,
              bom: null,
              geometry: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: null,
              assigneeCrew: null,
              schemeOk: false,
              installChecklist: null,
              blocker: null,
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
              lengthM: 4,
              widthM: 3,
              status: "open",
              acousticProfile: { persona: "noise", savedAt: "2026-10-18" },
              preliminary: { revisionId: "crev_pk1", amount: 39200, segment: "standard" },
              detailed: null,
              scheme: null,
              bom: null,
              geometry: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: null,
              schemeOk: false,
              installChecklist: null,
              blocker: null,
            },
          ],
        },
        {
          // GC-P0-03 fixture: 3 rooms on one sent quote — partial assent demo
          id: "prj_nv_volkova",
          name: "Волкова · Комсомола 9",
          client: "Ирина Волкова",
          phone: "+7 921 ···· 8801",
          address: "СПб, ул. Комсомола 9",
          phase: "Active",
          rooms: [
            {
              id: "room_vol_bed",
              name: "Спальня",
              areaM2: 16,
              lengthM: 4.5,
              widthM: 3.6,
              status: "open",
              acousticProfile: null,
              preliminary: { revisionId: "crev_vb", amount: 52000, segment: "comfort" },
              detailed: { revisionId: "crev_vb_d", amount: 54800, segment: "comfort" },
              scheme: { id: "sch_vb", label: "Схема спальни v1", panels: 4 },
              bom: [
                { sku: "MF-PROF-3", name: "Профиль MultiFrame 3м", qty: 8, unit: "шт" },
                { sku: "CANVAS-W", name: "Полотно белое", qty: 18, unit: "м²" },
              ],
              geometry: { lengthM: 4.5, widthM: 3.6, cutouts: 1 },
              techReady: false,
              roomAssent: null,
              materialsReady: true,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: null,
              schemeOk: true,
              installChecklist: null,
              blocker: null,
            },
            {
              id: "room_vol_liv",
              name: "Гостиная",
              areaM2: 24,
              lengthM: 6,
              widthM: 4,
              status: "open",
              acousticProfile: null,
              preliminary: { revisionId: "crev_vl", amount: 71000, segment: "comfort" },
              detailed: null,
              scheme: null,
              bom: null,
              geometry: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: null,
              schemeOk: false,
              installChecklist: null,
              blocker: null,
            },
            {
              id: "room_vol_kit",
              name: "Кухня",
              areaM2: 10,
              lengthM: 3.2,
              widthM: 3.1,
              status: "open",
              acousticProfile: null,
              preliminary: { revisionId: "crev_vk2", amount: 31000, segment: "standard" },
              detailed: null,
              scheme: null,
              bom: null,
              geometry: null,
              techReady: false,
              roomAssent: null,
              materialsReady: false,
              assigneeMeasurer: null,
              assigneeCrew: null,
              schemeOk: false,
              installChecklist: null,
              blocker: null,
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
              lengthM: 5.2,
              widthM: 3.5,
              status: "install",
              acousticProfile: null,
              preliminary: { revisionId: "crev_v1", amount: 61000, segment: "comfort" },
              detailed: { revisionId: "crev_v2", amount: 62800, segment: "comfort" },
              scheme: { id: "sch_vas", label: "зал_васильев_v2", panels: 6 },
              bom: [
                { sku: "MF-PROF-3", name: "Профиль MultiFrame 3м", qty: 12, unit: "шт" },
                { sku: "CANVAS-W", name: "Полотно", qty: 20, unit: "м²" },
              ],
              geometry: { lengthM: 5.2, widthM: 3.5, cutouts: 2 },
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
              lengthM: 3,
              widthM: 3,
              status: "open",
              acousticProfile: null,
              preliminary: { revisionId: "crev_vk", amount: 28400, segment: "standard" },
              detailed: null,
              scheme: null,
              bom: null,
              geometry: null,
              techReady: false,
              roomAssent: "deferred",
              materialsReady: false,
              assigneeMeasurer: null,
              assigneeCrew: null,
              schemeOk: false,
              installChecklist: null,
              blocker: null,
            },
            // GC-P0-05: tech-ready but assigned to another crew — must NOT appear for Denis
            {
              id: "room_vas_bath",
              name: "Санузел",
              areaM2: 4.2,
              lengthM: 2.1,
              widthM: 2,
              status: "install",
              acousticProfile: null,
              preliminary: { revisionId: "crev_vbath", amount: 18000, segment: "standard" },
              detailed: { revisionId: "crev_vbath_d", amount: 19200, segment: "standard" },
              scheme: { id: "sch_bath", label: "bath_v1", panels: 2 },
              bom: [{ sku: "CANVAS-W", name: "Полотно", qty: 5, unit: "м²" }],
              geometry: { lengthM: 2.1, widthM: 2, cutouts: 0 },
              techReady: true,
              roomAssent: "ordered",
              materialsReady: true,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: "u_sergey",
              schemeOk: true,
              installChecklist: defaultChecklist().map((c, i) => ({ ...c, done: i < 3 })),
              blocker: null,
            },
            // GC-P0-05: ordered+tech-ready for Denis but checklist missing → close forbidden
            {
              id: "room_vas_corridor",
              name: "Коридор",
              areaM2: 6,
              lengthM: 3,
              widthM: 2,
              status: "install",
              acousticProfile: null,
              preliminary: { revisionId: "crev_vc", amount: 21000, segment: "standard" },
              detailed: { revisionId: "crev_vc_d", amount: 22000, segment: "standard" },
              scheme: { id: "sch_cor", label: "cor_v1", panels: 2 },
              bom: [{ sku: "CANVAS-W", name: "Полотно", qty: 7, unit: "м²" }],
              geometry: { lengthM: 3, widthM: 2, cutouts: 0 },
              techReady: true,
              roomAssent: "ordered",
              materialsReady: true,
              assigneeMeasurer: "u_pavel",
              assigneeCrew: "u_denis",
              schemeOk: true,
              installChecklist: null,
              blocker: null,
            },
          ],
        },
      ],
      deals: [dealActive, dealPaused, dealPartial],
      quotes: [
        {
          revisionId: "qrev_041_1",
          dealId: "deal_nv_041",
          lifecycle: "draft",
          amount: 48600,
          rooms: ["room_sor_bedroom"],
          label: "КП v1 · Спальня предварительный",
        },
        {
          revisionId: "qrev_055_1",
          dealId: "deal_nv_055",
          lifecycle: "sent_confirmed",
          amount: 156800,
          rooms: ["room_vol_bed", "room_vol_liv", "room_vol_kit"],
          label: "КП v1 · Волкова 3 комнаты (sent)",
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
          adoptionBefore: { offerRate: 0.28, followupDone: 0.2 },
          adoptionAfter: null,
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
          adoptionBefore: { offerRate: 0.55, followupDone: 0.6 },
          adoptionAfter: { offerRate: 0.62, followupDone: 0.7 },
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
          adoptionBefore: { offerRate: 0.13, followupDone: 0.1 },
          adoptionAfter: null,
          intervention: null,
        },
      ],
      interventions: [],
      ownerInbox: [
        { id: "oi1", kind: "assign", title: "Нет замерщика на гостиную", projectId: "prj_nv_soroka", roomId: "room_sor_living", severity: "warn" },
        { id: "oi2", kind: "blocker", title: "Монтаж: открытый blocker", projectId: "prj_nv_install", roomId: "room_vas_hall", severity: "danger" },
        { id: "oi3", kind: "paused", title: "Сделка на паузе — Парк Хаус", projectId: "prj_nv_park", dealId: "deal_nv_038", severity: "info" },
        { id: "oi4", kind: "assent", title: "Partial assent — Волкова 3 комнаты", projectId: "prj_nv_volkova", dealId: "deal_nv_055", severity: "warn" },
      ],
      events: [],
      trainingAttempts: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const data = JSON.parse(raw);
      if (!data || data.version !== 2) return seed();
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
    if (!v && state.outbox.length) {
      // flush simulated
      state.outbox.forEach((item) => {
        item.status = "flushed";
      });
      state.syncState = "synced";
    }
    save();
  }

  function setLoadingDemo(v) {
    state.ui.loadingDemo = !!v;
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
    if (type.startsWith("training_") || payload?.context === "training") {
      // never touches sales funnel counters
    }
    save();
  }

  function startQuickConsultation(personaHint) {
    state.consultationSessionId = uid("csess");
    state.ui.pmStep = "survey";
    state.ui.pmPhase = "intro";
    state.ui.pmQ = 0;
    state.sessionDraft = {
      kind: "quick",
      consultationSessionId: state.consultationSessionId,
      saveType: null,
      // GC-P0-01: no pre-filled noise complaint
      answers: {
        roomType: "bedroom",
        areaM2: 14,
        neighbors: "unknown",
        noiseAwareness: "unknown",
        purpose: "living",
        personaHint: personaHint || null,
        // GC6-P0-03 stepped survey (ceiling preset: stretch — no plannedCeiling Q)
        houseType: null,
        slabType: null,
        slabThickness: null,
        objectStage: null,
        noisyNeighbors: "unknown",
        noiseKind: "unknown",
        plannedCeiling: "stretch",
      },
      segment: "comfort",
      pmDone: false,
      pmResult: null,
      calcDone: false,
      amount: null,
      multiframeOffered: false,
      bound: false,
      projectId: null,
      roomId: null,
    };
    // apply contrasting demo presets if chosen
    if (personaHint === "quiet") {
      state.sessionDraft.answers.noiseAwareness = "none";
      state.sessionDraft.answers.neighbors = "none";
      state.sessionDraft.answers.noisyNeighbors = "no";
    } else if (personaHint === "noise") {
      state.sessionDraft.answers.noiseAwareness = "bothered";
      state.sessionDraft.answers.neighbors = "above";
      state.sessionDraft.answers.noisyNeighbors = "yes";
    }
    save();
    return state.sessionDraft;
  }

  function defaultCalcUi() {
    return {
      entry: null,
      lengthM: 5,
      widthM: 4,
      heightM: 2.7,
      areaOnly: 20,
      ceiling: true,
      walls: false,
      mounting: "ceiling_frameless",
      showResults: false,
      expanded: false,
    };
  }

  function ensureCalcUi() {
    if (!state.ui.calcUi) state.ui.calcUi = defaultCalcUi();
    return state.ui.calcUi;
  }

  /** Demo BOM / estimate from L×W or area-only (illustrative, not production algorithm) */
  function calcEstimateFromUi() {
    const c = ensureCalcUi();
    let area =
      c.entry === "area"
        ? Number(c.areaOnly) || 0
        : (Number(c.lengthM) || 0) * (Number(c.widthM) || 0);
    if (!(area > 0)) area = 0;
    const panels = Math.max(0, Math.ceil(area / 0.48));
    const panelRub = 890;
    const clipRub = 12;
    const clips = panels * 4;
    const mountFactor = c.mounting === "ceiling_framed" ? 1.12 : 1;
    const materials = Math.round(panels * panelRub * mountFactor + clips * clipRub);
    const work = Math.round(area * 450);
    const total = materials + work;
    return {
      areaM2: Math.round(area * 100) / 100,
      panels,
      clips,
      materials,
      work,
      total,
      mounting: c.mounting,
      ceiling: !!c.ceiling,
      walls: !!c.walls,
    };
  }

  /** Owner clarification: Calc may start without PM / project */
  function ensureCalcDraft(areaM2) {
    ensureCalcUi();
    if (state.sessionDraft && !state.sessionDraft.bound) {
      if (areaM2 != null) {
        state.sessionDraft.answers = state.sessionDraft.answers || {};
        state.sessionDraft.answers.areaM2 = Number(areaM2) || draftAreaM2(state.sessionDraft);
      }
      save();
      return state.sessionDraft;
    }
    state.consultationSessionId = uid("csess");
    state.sessionDraft = {
      kind: "calc_only",
      consultationSessionId: state.consultationSessionId,
      saveType: null,
      answers: {
        roomType: "bedroom",
        areaM2: Number(areaM2) || 14,
        neighbors: "unknown",
        noiseAwareness: "unknown",
        purpose: "living",
        personaHint: null,
        plannedCeiling: "stretch",
      },
      segment: "comfort",
      pmDone: false,
      pmResult: null,
      calcDone: false,
      amount: null,
      multiframeOffered: false,
      bound: false,
      projectId: null,
      roomId: null,
    };
    save();
    return state.sessionDraft;
  }

  /** Owner clarification: PM may start without calc / project */
  function ensurePmDraft(personaHint) {
    if (state.sessionDraft && !state.sessionDraft.bound && !state.sessionDraft.pmDone) {
      return state.sessionDraft;
    }
    if (state.sessionDraft && !state.sessionDraft.bound && state.sessionDraft.pmDone) {
      // reopen survey on existing unbound draft
      return state.sessionDraft;
    }
    return startQuickConsultation(personaHint || "");
  }

  function updatePmAnswers(patch) {
    if (!state.sessionDraft) return;
    Object.assign(state.sessionDraft.answers, patch);
    save();
  }

  function runPmOnDraft() {
    const d = state.sessionDraft;
    if (!d) return { ok: false };
    d.pmResult = computePmResult(d.answers);
    d.pmDone = true;
    state.ui.pmStep = "result";
    const deal = d.projectId ? activeDeal(d.projectId) : null;
    if (deal && !deal.paused && ["inquiry", "contact", "new", "offered"].includes(deal.stage)) {
      deal.stage = "assessed";
    }
    save();
    return { ok: true, result: d.pmResult };
  }

  function markMultiframeOffered() {
    const d = state.sessionDraft;
    if (!d) return { ok: false, error: "no_draft" };
    d.multiframeOffered = true;
    pushEvent("multiframe_offered", {
      consultationSessionId: d.consultationSessionId,
      dealId: null,
      unbound: true,
    });
    save();
    return { ok: true, consultationSessionId: d.consultationSessionId };
  }

  function buildCalcIframeQuery(draft) {
    const d = draft || state.sessionDraft;
    const parts = ["partner=1", "gateC=1", "walls=0", "surfaces=ceiling"];
    if (d?.pmDone && !d?.calcDone) {
      const area = draftAreaM2(d);
      if (area > 0) {
        parts.push(`area=${encodeURIComponent(String(area))}`);
        parts.push("source=problemomer");
      }
    }
    return parts.join("&");
  }

  function calcToolIframePath(draft) {
    return `tools/calculator/index.html?${buildCalcIframeQuery(draft)}`;
  }

  function ingestCalcToolResult(payload) {
    const area = Number(payload?.areaM2);
    const amount = Number(payload?.panelsCost ?? payload?.amount);
    if (!(area > 0) || !(amount > 0)) {
      return { ok: false, error: "invalid_calc_payload" };
    }
    ensureCalcDraft(area);
    const d = state.sessionDraft;
    d.kind = d.pmDone ? "tool_pm_calc" : "tool_calc";
    d.segment = payload?.segment || d.segment || "comfort";
    d.calcPanels = payload?.panels ?? d.calcPanels ?? null;
    d.calcInputMode = payload?.inputMode || d.calcInputMode || null;
    finishCalcOnDraft(amount, area);
    d.fromOriginalShell = true;
    d.fromLiveCalc = true;
    save();
    return { ok: true, amount, areaM2: area, panelsCost: amount };
  }

  /** Result from tools/problemomer iframe → sessionDraft for bind */
  function ingestPmToolResult(payload) {
    const r = payload?.result || payload || {};
    const area = Number(r.areaM2) || Number(r.answers?.areaM2) || 14;
    ensurePmDraft("");
    const d = state.sessionDraft;
    const answers = {
      ...(d.answers || {}),
      ...(r.answers || {}),
      areaM2: area,
      roomType: r.roomType || r.answers?.basics || d.answers?.roomType || "bedroom",
      plannedCeiling: "stretch",
      neighbors:
        r.answers?.noisyNeighbors === "usually_quiet"
          ? "none"
          : r.answers?.noisyNeighbors === "sometimes_noisy" || r.answers?.noisyNeighbors === "often_noisy"
            ? "above"
            : d.answers?.neighbors || "unknown",
      noiseAwareness:
        r.answers?.noisyNeighbors === "usually_quiet"
          ? "none"
          : r.answers?.noisyNeighbors === "sometimes_noisy" || r.answers?.noisyNeighbors === "often_noisy"
            ? "bothered"
            : d.answers?.noiseAwareness || "unknown",
    };
    d.answers = answers;
    d.pmResult = {
      plannedCeiling: "stretch",
      areaM2: area,
      roomType: answers.roomType,
      noiseAwareness: answers.noiseAwareness,
      neighbors: answers.neighbors,
      purpose: answers.purpose || "living",
      chain: r.chain || {
        norms: "Иллюстрация · не измерение",
        current: "Сейчас · ориентир",
        withMf: "С MultiFrame · ориентир",
        difference: "без гарантии дБ",
        nextStep: "Сохранить профиль",
      },
      narrative: r.narrative || "",
      claimsQualified: true,
      guaranteedDb: false,
      illustrativeOnly: true,
      currentRisk: r.currentRisk || "неясный",
      withMfComfort: "ориентир комфорта (иллюстрация)",
      clientPersona: r.clientPersona || "mixed",
      demo: r.demo || null,
      fromOriginalShell: true,
    };
    d.pmDone = true;
    d.kind = d.calcDone ? "tool_pm_calc" : "tool_pm";
    d.fromOriginalShell = true;
    state.ui.pmPhase = "result";
    state.ui.pmStep = "result";
    save();
    return { ok: true, result: d.pmResult };
  }

  function finishCalcOnDraft(amount, areaM2) {
    if (!state.sessionDraft) return;
    state.sessionDraft.calcDone = true;
    state.sessionDraft.amount = amount;
    state.sessionDraft.saveType = "preliminary";
    if (areaM2 != null) {
      state.sessionDraft.answers = state.sessionDraft.answers || {};
      state.sessionDraft.answers.areaM2 = Number(areaM2) || draftAreaM2(state.sessionDraft);
    }
    save();
  }

  /** D5 §1.7: crew/admin cannot CRUD org projects; tools still open */
  function canWriteProjects(role) {
    return role === "sales" || role === "owner" || role === "measurer";
  }

  function canCreateProjects(role) {
    return role === "sales" || role === "owner" || role === "measurer";
  }

  /** Personal tool result — no Project/Room/Deal mutation (crew/admin) */
  function savePersonalResult() {
    const d = state.sessionDraft;
    if (!d) return { ok: false, error: "no_draft" };
    if (!d.pmDone && !d.calcDone) return { ok: false, error: "need_result" };
    const entry = {
      id: uid("pres"),
      role: state.role,
      at: new Date().toISOString(),
      consultationSessionId: d.consultationSessionId,
      pmDone: !!d.pmDone,
      pmResult: d.pmDone ? d.pmResult : null,
      calcDone: !!d.calcDone,
      amount: d.amount,
      areaM2: draftAreaM2(d),
      segment: d.segment,
    };
    state.personalResults = state.personalResults || [];
    state.personalResults.unshift(entry);
    d.personalSaved = true;
    d.personalResultId = entry.id;
    pushEvent("personal_tool_saved", {
      role: state.role,
      consultationSessionId: d.consultationSessionId,
      personalResultId: entry.id,
    });
    save();
    return { ok: true, personal: true, id: entry.id };
  }

  /** GC-P0-02 / GC6-P0-01: PM-only OR calc may bind; RBAC on write */
  function bindDraft(opts) {
    const d = state.sessionDraft;
    if (!d) return { ok: false, error: "no_draft" };
    if (!d.pmDone && !d.calcDone) return { ok: false, error: "need_result" };
    if (!canWriteProjects(state.role)) {
      return { ok: false, error: "forbidden_role", role: state.role };
    }
    if (state.offline) {
      state.outbox.push({ id: uid("ob"), type: "bind", draftId: d.consultationSessionId, status: "pending" });
      save();
      return { ok: false, error: "offline_queued" };
    }

    const saveType = opts.saveType || (d.calcDone ? "preliminary" : "profile");
    let projectId;
    let roomId;
    let dealId;
    let created = false;
    const draftArea = draftAreaM2(d);
    const willSaveCalc = (saveType === "preliminary" || saveType === "both") && d.calcDone;

    if (opts.mode === "pick") {
      projectId = opts.projectId;
      roomId = opts.roomId;
      if (!projectId || !roomId) return { ok: false, error: "pick_required" };
      const r = room(projectId, roomId);
      if (!r) return { ok: false, error: "room_missing" };

      // GC3-P0-01: if consultation area ≠ room area, require conscious resolution
      if (willSaveCalc) {
        const roomArea = Number(r.areaM2) || 0;
        const mismatch = Math.abs(roomArea - draftArea) > 0.05;
        if (mismatch && !opts.areaResolution) {
          state.ui.bindAreaPrompt = {
            projectId,
            roomId,
            roomName: r.name,
            roomArea,
            draftArea,
            draftAmount: d.amount,
            saveType,
            mode: "pick",
          };
          save();
          return {
            ok: false,
            error: "area_mismatch",
            roomArea,
            draftArea,
            draftAmount: d.amount,
          };
        }
        if (mismatch && opts.areaResolution === "keep_room_recalc") {
          const rate = d.segment === "premium" ? 4200 : d.segment === "comfort" ? 3400 : 2800;
          d.amount = Math.round(roomArea * rate);
          d.answers = d.answers || {};
          d.answers.areaM2 = roomArea;
          if (d.pmResult) d.pmResult.areaM2 = roomArea;
        } else if (mismatch && opts.areaResolution === "adopt_consultation") {
          r.areaM2 = draftArea;
          r.lengthM = +(Math.sqrt(draftArea * 1.2).toFixed(2));
          r.widthM = +(Math.sqrt(draftArea / 1.2).toFixed(2));
        }
      }

      const deal = activeDeal(projectId);
      dealId = deal ? deal.dealId : null;
      applySaveToRoom(r, d, saveType);
      state.ui.bindAreaPrompt = null;
      if (deal && d.pmDone && ["inquiry", "contact", "new", "offered"].includes(deal.stage)) deal.stage = "assessed";
      if (deal && d.calcDone && !deal.paused) deal.stage = "calculated";
    } else {
      // create — room area = consultation area
      if (!canCreateProjects(state.role)) {
        return { ok: false, error: "forbidden_create", role: state.role };
      }
      if (!opts.projectName || !opts.roomName) return { ok: false, error: "names_required" };
      projectId = uid("prj");
      roomId = uid("room");
      dealId = uid("deal");
      created = true;
      const r = emptyRoom({
        id: roomId,
        name: opts.roomName,
        areaM2: draftArea,
        lengthM: +(Math.sqrt(draftArea * 1.2).toFixed(2)),
        widthM: +(Math.sqrt(draftArea / 1.2).toFixed(2)),
      });
      applySaveToRoom(r, d, saveType);
      state.projects.unshift({
        id: projectId,
        name: opts.projectName,
        client: opts.client || opts.projectName,
        phone: opts.phone || "",
        address: opts.address || "",
        phase: "Active",
        rooms: [r],
      });
      state.deals.unshift({
        dealId,
        projectId,
        stage: d.calcDone ? "calculated" : "assessed",
        outcome: null,
        active: true,
        lossReason: null,
        stageAtOutcome: null,
        paused: false,
        closedAt: null,
        acceptedAmount: null,
        nextActionAt: null,
      });
    }

    pushEvent("quick_bind", {
      projectId,
      roomId,
      dealId,
      saveType,
      created,
      consultationSessionId: d.consultationSessionId,
      multiframeOffered: d.multiframeOffered,
      areaM2: willSaveCalc ? draftAreaM2(d) : null,
      amount: willSaveCalc ? d.amount : null,
    });
    state.sessionDraft = { ...d, bound: true, projectId, roomId, dealId, saveType };
    save();
    return {
      ok: true,
      projectId,
      roomId,
      dealId,
      saveType,
      created,
      amount: d.amount,
      areaM2: draftAreaM2(d),
    };
  }

  function applySaveToRoom(r, d, saveType) {
    // GC2-P0-04: PM+Calc bind keeps profile when saving preliminary (not calc-only wipe)
    const persistProfile =
      d.pmDone &&
      d.pmResult &&
      (saveType === "profile" || saveType === "preliminary" || saveType === "both");
    if (persistProfile) {
      r.acousticProfile = {
        ...d.pmResult,
        consultationSessionId: d.consultationSessionId,
        savedAt: new Date().toISOString(),
      };
    }
    if ((saveType === "preliminary" || saveType === "both") && d.calcDone) {
      const revisionId = uid("crev");
      const areaM2 = draftAreaM2(d);
      // GC3-P0-01: room header area stays aligned with saved prelim identity
      r.areaM2 = areaM2;
      r.preliminary = {
        revisionId,
        amount: d.amount,
        segment: d.segment || "comfort",
        areaM2,
      };
      state.calcHistory.push({
        revisionId,
        roomId: r.id,
        kind: "preliminary",
        amount: d.amount,
        areaM2,
        segment: d.segment || "comfort",
        at: new Date().toISOString(),
        consultationSessionId: d.consultationSessionId,
      });
    }
  }

  /** Direct save when project/room known */
  function savePmToRoom(projectId, roomId, answers) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    const result = computePmResult(answers || {});
    r.acousticProfile = { ...result, savedAt: new Date().toISOString() };
    const deal = activeDeal(projectId);
    if (deal && !deal.paused && ["inquiry", "contact", "new", "offered"].includes(deal.stage)) {
      deal.stage = "assessed";
    }
    pushEvent("pm_saved", { projectId, roomId });
    save();
    return { ok: true, result };
  }

  function saveCalcToRoom(projectId, roomId, kind, amount, meta) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    const revisionId = uid("crev");
    const areaM2 =
      meta?.areaM2 != null
        ? Number(meta.areaM2)
        : kind === "preliminary" && r.preliminary?.areaM2 != null
        ? Number(r.preliminary.areaM2)
        : Number(r.areaM2) || 0;
    const segment = meta?.segment || r.preliminary?.segment || "comfort";
    const entry = { revisionId, amount, segment, areaM2 };
    if (kind === "detailed") {
      r.detailed = entry;
    } else {
      // GC3-P0-01: preserve area identity; keep room header in sync
      r.areaM2 = areaM2;
      r.preliminary = entry;
    }
    state.calcHistory.push({
      revisionId,
      roomId,
      kind,
      amount,
      areaM2,
      segment,
      at: new Date().toISOString(),
    });
    const deal = activeDeal(projectId);
    if (deal && !deal.paused && ["assessed", "inquiry", "new", "offered"].includes(deal.stage)) {
      deal.stage = "calculated";
    }
    // GC-P0-03: never auto-set roomAssent from calc
    save();
    return { ok: true, revisionId, areaM2, amount };
  }

  /** GC-P0-04 detailed with geometry + scheme + BOM · GC2-P1-02: no overwrite before 409 */
  function saveDetailedCalc(projectId, roomId, payload) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    const lengthM = Number(payload.lengthM) || r.lengthM || 4;
    const widthM = Number(payload.widthM) || r.widthM || 3;
    const cutouts = Number(payload.cutouts) || 0;
    const area = +(lengthM * widthM).toFixed(2);
    const rate = 3550;
    const amount = Math.round(area * rate + cutouts * 1200);
    const revisionId = uid("crev");
    const bom = (payload.bom || []).map((b) => ({
      sku: b.sku,
      name: b.name,
      qty: Number(b.qty) || 0,
      unit: b.unit || "шт",
    }));
    const scheme = {
      id: uid("sch"),
      label: payload.schemeLabel || `Схема ${r.name}`,
      panels: Math.max(2, Math.ceil(area / 3) + cutouts),
      lengthM,
      widthM,
      cutouts,
      savedAt: new Date().toISOString(),
    };
    const currentRev = r.detailed?.revisionId || null;
    const expected = payload.expectedRevision;
    const stale =
      payload.forceConflict ||
      (expected != null && currentRev != null && expected !== currentRev);

    // GC2-P1-02 / GC3-P1-02: conflict — keep current; persist full incoming for compare/restore
    if (stale) {
      const other = uid("crev");
      const incomingFull = {
        revisionId,
        amount,
        scheme: JSON.parse(JSON.stringify(scheme)),
        bom: JSON.parse(JSON.stringify(bom)),
        geometry: { lengthM, widthM, cutouts, areaM2: area },
        lengthM,
        widthM,
      };
      const currentSnap = {
        revisionId: currentRev,
        amount: r.detailed?.amount,
        scheme: r.scheme ? JSON.parse(JSON.stringify(r.scheme)) : null,
        bom: r.bom ? JSON.parse(JSON.stringify(r.bom)) : null,
        geometry: r.geometry ? JSON.parse(JSON.stringify(r.geometry)) : null,
        lengthM: r.lengthM,
        widthM: r.widthM,
      };
      state.calcHistory.push({
        revisionId: other,
        roomId,
        kind: "detailed",
        amount: amount - 500,
        at: new Date().toISOString(),
        note: "device_B_parallel",
      });
      state.calcHistory.push({
        revisionId,
        roomId,
        kind: "detailed",
        amount,
        at: new Date().toISOString(),
        note: "incoming_pending_resolution",
        schemeId: scheme.id,
        snapshot: incomingFull,
      });
      const conflict = {
        projectId,
        roomId,
        current: currentRev,
        incoming: revisionId,
        alternate: other,
        keptA: currentRev,
        keptB: other,
        message:
          "409 Conflict — current не перезаписан. Сравните варианты и выберите: оставить current / восстановить мой / повторить.",
        incomingPreview: incomingFull,
        currentSnapshot: currentSnap,
        dismissed: false,
      };
      state.pendingConflicts[roomId] = conflict;
      state.ui.conflictDemo = conflict;
      save();
      return { ok: false, error: "conflict_409", revisionId, other, amount, current: currentRev };
    }

    r.lengthM = lengthM;
    r.widthM = widthM;
    r.areaM2 = area;
    r.geometry = { lengthM, widthM, cutouts, areaM2: area };
    r.scheme = scheme;
    r.bom = bom;
    r.schemeOk = true;
    r.detailed = { revisionId, amount, segment: "comfort", schemeId: scheme.id };
    state.calcHistory.push({
      revisionId,
      roomId,
      kind: "detailed",
      amount,
      at: new Date().toISOString(),
      schemeId: scheme.id,
    });
    const deal = activeDeal(projectId);
    if (deal && !deal.paused) deal.stage = "calculated";
    // successful save clears pending 409 for this room
    if (state.pendingConflicts[roomId]) delete state.pendingConflicts[roomId];
    if (state.ui.conflictDemo?.roomId === roomId) state.ui.conflictDemo = null;
    pushEvent("detailed_saved", { projectId, roomId, revisionId, schemeId: scheme.id });
    save();
    return { ok: true, revisionId, amount, scheme, bom, area };
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

  function shareQuote(revisionId, mode) {
    const q = state.quotes.find((x) => x.revisionId === revisionId);
    if (!q) return { ok: false };
    const deal = state.deals.find((d) => d.dealId === q.dealId);
    const p = deal && project(deal.projectId);
    const lines = [
      `MultiFrame · демо-КП (НЕ отправлено)`,
      `Проект: ${p ? p.name : "—"}`,
      `Deal: ${q.dealId}`,
      `Revision: ${q.revisionId}`,
      `Сумма: ${q.amount} ₽`,
      `Комнаты: ${(q.rooms || []).join(", ")}`,
      `lifecycle: ${q.lifecycle}`,
      ``,
      `Copy/PDF ≠ confirm_sent.`,
    ];
    const text = lines.join("\n");
    pushEvent(mode === "pdf" ? "quote_pdf" : "quote_copy", { revisionId, dealId: q.dealId });
    state.ui.quotePreview = { mode, text, revisionId, lifecycle: q.lifecycle };
    save();
    return {
      ok: true,
      lifecycle: q.lifecycle,
      text,
      message: mode === "pdf" ? "PDF-макет готов (скачать)" : "Текст КП для буфера",
    };
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
    deal.closedAt = null;
    pushEvent("early_paused", { dealId, stageAtOutcome: deal.stageAtOutcome });
    save();
    return { ok: true };
  }

  function resumeDeal(dealId) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal || deal.outcome !== "early_paused") return { ok: false };
    const resumeStage = deal.stageAtOutcome || deal.stage;
    deal.paused = false;
    deal.outcome = null;
    deal.stage = resumeStage;
    deal.lossReason = null;
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

  /**
   * GC-P0-03 / GC2-P0-03: accept with explicit per-room assent map.
   * assentMap: { roomId: 'ordered'|'deferred'|'out_of_scope' }
   * Validate all scoped rooms first; mutate atomically only on success.
   */
  /** GC3-P0-02: assent scope = rooms of applicable sent Quote only (not «any calculated») */
  function quoteForAssent(dealId) {
    const list = quotesForDeal(dealId);
    return list.find((x) => x.lifecycle === "sent_confirmed") || list.find((x) => x.lifecycle === "sent") || null;
  }

  function scopedRoomsForDeal(dealId) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal) return [];
    const p = project(deal.projectId);
    if (!p) return [];
    const q = quoteForAssent(dealId);
    if (!q) return [];
    const ids = new Set(q.rooms || []);
    return p.rooms.filter((r) => ids.has(r.id));
  }

  function outOfQuoteCalculatedRooms(dealId) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal) return [];
    const p = project(deal.projectId);
    if (!p) return [];
    const q = quoteForAssent(dealId);
    if (!q) return p.rooms.filter((r) => r.preliminary || r.detailed);
    const ids = new Set(q.rooms || []);
    return p.rooms.filter((r) => (r.preliminary || r.detailed) && !ids.has(r.id));
  }

  function dismissConflictBanner(roomId) {
    // GC3-P1-02: dismissing UI must NOT destroy the only full incoming copy
    if (state.pendingConflicts[roomId]) {
      state.pendingConflicts[roomId].dismissed = true;
    }
    if (state.ui.conflictDemo?.roomId === roomId) {
      state.ui.conflictDemo = state.pendingConflicts[roomId]
        ? { ...state.pendingConflicts[roomId], dismissed: true }
        : null;
    }
    save();
  }

  function resolveConflict(projectId, roomId, choice) {
    const conflict = state.pendingConflicts[roomId] || state.ui.conflictDemo;
    if (!conflict || conflict.roomId !== roomId) return { ok: false, error: "no_conflict" };
    const r = room(projectId, roomId);
    if (!r) return { ok: false, error: "room_missing" };

    if (choice === "keep_current") {
      delete state.pendingConflicts[roomId];
      state.ui.conflictDemo = null;
      pushEvent("conflict_resolved", { roomId, choice: "keep_current", kept: conflict.current });
      save();
      return { ok: true, choice, revisionId: conflict.current };
    }

    if (choice === "apply_incoming") {
      const inc = conflict.incomingPreview;
      if (!inc) return { ok: false, error: "no_incoming" };
      r.lengthM = inc.lengthM;
      r.widthM = inc.widthM;
      r.areaM2 = inc.geometry?.areaM2 ?? inc.lengthM * inc.widthM;
      r.geometry = inc.geometry;
      r.scheme = inc.scheme;
      r.bom = inc.bom;
      r.schemeOk = true;
      r.detailed = {
        revisionId: inc.revisionId || conflict.incoming,
        amount: inc.amount,
        segment: "comfort",
        schemeId: inc.scheme?.id,
      };
      delete state.pendingConflicts[roomId];
      state.ui.conflictDemo = null;
      pushEvent("conflict_resolved", { roomId, choice: "apply_incoming", kept: r.detailed.revisionId });
      save();
      return { ok: true, choice, revisionId: r.detailed.revisionId, amount: inc.amount };
    }

    if (choice === "retry") {
      // GC3-P1-02 remainder: write retryPrefill onto pendingConflicts (view reads that first)
      const inc = conflict.incomingPreview;
      const retryPrefill = inc
        ? {
            lengthM: inc.lengthM,
            widthM: inc.widthM,
            cutouts: inc.geometry?.cutouts || 0,
            schemeLabel: inc.scheme?.label,
            bom: JSON.parse(JSON.stringify(inc.bom || [])),
          }
        : null;
      const next = {
        ...conflict,
        dismissed: false,
        retryPrefill,
        message:
          "Retry: поля заполнены вашим входящим вариантом. Снимите «Симулировать 409» и сохраните — expectedRevision = current.",
      };
      state.pendingConflicts[roomId] = next;
      state.ui.conflictDemo = next;
      save();
      return { ok: true, choice: "retry", prefill: retryPrefill, current: conflict.current };
    }

    return { ok: false, error: "bad_choice" };
  }

  function acceptDeal(dealId, assentMap) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal || deal.paused) return { ok: false, error: "deal" };
    const p = project(deal.projectId);
    if (!assentMap || typeof assentMap !== "object") return { ok: false, error: "assent_required" };

    const scoped = scopedRoomsForDeal(dealId);
    if (!scoped.length) return { ok: false, error: "no_scoped_rooms" };

    // Phase 1 — validate only (no room mutations)
    const planned = [];
    for (const r of scoped) {
      const a = assentMap[r.id];
      if (a == null || a === "") {
        return { ok: false, error: "assent_incomplete", roomId: r.id, roomName: r.name };
      }
      if (!["ordered", "deferred", "out_of_scope"].includes(a)) {
        return { ok: false, error: "bad_assent", roomId: r.id };
      }
      planned.push({ room: r, assent: a });
    }
    const ordered = planned.filter((x) => x.assent === "ordered").map((x) => x.room.id);
    if (!ordered.length) return { ok: false, error: "need_one_ordered" };

    let acceptedAmount = 0;
    for (const { room: r, assent } of planned) {
      if (assent === "ordered") {
        acceptedAmount += r.detailed?.amount || r.preliminary?.amount || 0;
      }
    }

    // Phase 2 — atomic mutate
    for (const { room: r, assent } of planned) {
      r.roomAssent = assent;
    }
    deal.outcome = "accepted";
    deal.stage = "accepted";
    deal.acceptedAmount = acceptedAmount;
    // tech-ready only for ordered + detailed + materials + crew + scheme
    p.rooms.forEach((r) => {
      if (
        r.roomAssent === "ordered" &&
        r.detailed &&
        r.materialsReady &&
        r.assigneeCrew &&
        r.schemeOk
      ) {
        r.techReady = true;
        r.status = "install";
        if (!r.installChecklist) r.installChecklist = defaultChecklist();
      }
    });
    pushEvent("deal_accepted", { dealId, ordered, acceptedAmount, assentMap: { ...assentMap } });
    save();
    return { ok: true, ordered, acceptedAmount };
  }

  /** GC2-P0-02 / A-06: close only when every ordered room is status=closed */
  function closeAcceptedDeal(dealId) {
    const deal = state.deals.find((d) => d.dealId === dealId);
    if (!deal || deal.outcome !== "accepted") return { ok: false, error: "not_accepted" };
    const p = project(deal.projectId);
    const unfinished = (p?.rooms || []).filter(
      (r) => r.roomAssent === "ordered" && r.status !== "closed"
    );
    if (unfinished.length) {
      return {
        ok: false,
        error: "install_incomplete",
        unfinished: unfinished.map((r) => ({ id: r.id, name: r.name, status: r.status || "open" })),
      };
    }
    deal.active = false;
    deal.closedAt = new Date().toISOString();
    pushEvent("deal_closed", { dealId });
    save();
    return { ok: true };
  }

  /** Sequential new Deal after closed — new dealId, old quotes immutable */
  function createSequentialDeal(projectId) {
    const old = state.deals.find((d) => d.projectId === projectId && d.active);
    if (old) return { ok: false, error: "active_exists" };
    const closed = state.deals.filter((d) => d.projectId === projectId && !d.active);
    if (!closed.length) return { ok: false, error: "need_closed" };
    const dealId = uid("deal");
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
      acceptedAmount: null,
      nextActionAt: null,
      sequentialOf: closed[0].dealId,
    });
    pushEvent("sequential_deal", { dealId, previous: closed[0].dealId });
    save();
    return { ok: true, dealId };
  }

  function assignRoom(projectId, roomId, field, userId) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    r[field] = userId || null;
    if (
      field === "assigneeCrew" &&
      r.roomAssent === "ordered" &&
      r.detailed &&
      r.materialsReady &&
      r.schemeOk &&
      userId
    ) {
      r.techReady = true;
      r.status = "install";
      if (!r.installChecklist) r.installChecklist = defaultChecklist();
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
      if (!r.installChecklist) r.installChecklist = defaultChecklist();
    }
    save();
  }

  function toggleChecklist(projectId, roomId, itemId, patch) {
    const r = room(projectId, roomId);
    if (!r || !r.installChecklist || !r.installChecklist.length) return { ok: false, error: "no_checklist" };
    const item = r.installChecklist.find((c) => c.id === itemId);
    if (!item) return { ok: false };
    Object.assign(item, patch);
    save();
    return { ok: true };
  }

  function ensureChecklist(projectId, roomId) {
    const r = room(projectId, roomId);
    if (!r) return { ok: false };
    if (!r.installChecklist || !r.installChecklist.length) {
      r.installChecklist = defaultChecklist();
      save();
    }
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
    // GC-P0-05: missing/empty checklist forbids close
    if (!r.installChecklist || !r.installChecklist.length) {
      return { ok: false, error: "checklist_missing" };
    }
    const incomplete = r.installChecklist.filter((c) => !c.done && !(c.na && c.reason && c.reason.trim()));
    if (incomplete.length) return { ok: false, error: "checklist", incomplete };
    r.status = "closed";
    pushEvent("room_closed", { projectId, roomId });
    save();
    return { ok: true };
  }

  function createInquiry({ client, address, roomName, areaM2 }) {
    if (state.offline) {
      state.outbox.push({ id: uid("ob"), type: "inquiry", status: "pending" });
      save();
      return { ok: false, error: "offline_queued" };
    }
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
        emptyRoom({
          id: roomId,
          name: roomName || "Комната 1",
          areaM2: Number(areaM2) || 12,
        }),
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
      acceptedAmount: null,
      nextActionAt: null,
    });
    pushEvent("inquiry_created", { projectId, roomId, dealId });
    save();
    return { ok: true, projectId, roomId, dealId };
  }

  function createStaff({ name, role }) {
    const id = uid("u");
    const oneTime = `NB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    state.staff.push({ id, name, role, credentialsShown: true, oneTimePassword: oneTime });
    state.ui.oneTimeCred = { id, name, password: oneTime };
    pushEvent("staff_created", { id, role });
    save();
    return { ok: true, id, oneTimePassword: oneTime };
  }

  function resetStaffCredentials(userId) {
    const u = state.staff.find((x) => x.id === userId);
    if (!u) return { ok: false };
    const oneTime = `NB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    u.oneTimePassword = oneTime;
    u.credentialsShown = true;
    state.ui.oneTimeCred = { id: userId, name: u.name, password: oneTime };
    // cannot show old password again after dismiss
    pushEvent("staff_reset", { userId });
    save();
    return { ok: true, oneTimePassword: oneTime };
  }

  function dismissOneTimeCred() {
    if (state.ui.oneTimeCred) {
      const u = state.staff.find((x) => x.id === state.ui.oneTimeCred.id);
      if (u) {
        u.credentialsShown = false;
        delete u.oneTimePassword;
      }
      state.ui.oneTimeCred = null;
      save();
    }
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
      baseline: { ...partner.adoptionBefore },
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
    const partner = state.partners.find((p) => p.id === item.partnerId);
    item.verified = true;
    item.status = "verified";
    item.result = result;
    if (partner) {
      if (result === "adopted") {
        partner.adoptionAfter = {
          offerRate: Math.min(0.95, (partner.adoptionBefore?.offerRate || 0.2) + 0.15),
          followupDone: Math.min(0.95, (partner.adoptionBefore?.followupDone || 0.2) + 0.25),
        };
        partner.health = "ok";
      } else {
        partner.adoptionAfter = { ...partner.adoptionBefore };
      }
      item.after = { ...partner.adoptionAfter };
    }
    // adoption ≠ conversion funnel mutation
    pushEvent("intervention_verified", { id, result, context: "support" });
    save();
    return { ok: true, before: item.baseline, after: item.after };
  }

  /** GC-P0-05: only my assignments */
  function crewInbox() {
    const items = [];
    state.projects.forEach((p) => {
      p.rooms.forEach((r) => {
        if (
          r.roomAssent === "ordered" &&
          r.techReady &&
          r.status !== "closed" &&
          r.assigneeCrew === CREW_SELF
        ) {
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
        if (r.assigneeMeasurer === MEASURER_SELF && r.status !== "closed" && !r.detailed) {
          items.push({ project: p, room: r });
        }
      });
    });
    return items;
  }

  function completeAcademy(choices) {
    const scored = scoreAnnaPath(choices);
    state.ui.academyScore = scored;
    state.ui.academyDone = true;
    state.trainingAttempts.push({
      id: uid("att"),
      scenarioId: "sell_multiframe",
      context: "training",
      score: scored.score,
      path: scored.path,
      choices: choices.map((c) => c.id),
      at: new Date().toISOString(),
    });
    pushEvent("training_completed", {
      context: "training",
      score: scored.score,
      path: scored.path,
    });
    // funnel untouched
    save();
    return scored;
  }

  function resetAcademy() {
    state.ui.academyNode = "N0";
    state.ui.academyPath = [];
    state.ui.academyChoices = [];
    state.ui.academyDone = null;
    state.ui.academyScore = null;
    save();
  }

  global.MFStore = {
    ROLES,
    CREW_SELF,
    MEASURER_SELF,
    uid,
    get,
    save,
    setRole,
    resetAll,
    setOffline,
    setLoadingDemo,
    project,
    room,
    activeDeal,
    quotesForDeal,
    pushEvent,
    computePmResult,
    draftAreaM2,
    scoreAnnaPath,
    quoteForAssent,
    scopedRoomsForDeal,
    outOfQuoteCalculatedRooms,
    dismissConflictBanner,
    resolveConflict,
    startQuickConsultation,
    ensureCalcDraft,
    buildCalcIframeQuery,
    calcToolIframePath,
    ingestCalcToolResult,
    ingestPmToolResult,
    ensureCalcUi,
    defaultCalcUi,
    calcEstimateFromUi,
    ensurePmDraft,
    canWriteProjects,
    canCreateProjects,
    savePersonalResult,
    updatePmAnswers,
    runPmOnDraft,
    markMultiframeOffered,
    finishCalcOnDraft,
    bindDraft,
    savePmToRoom,
    saveCalcToRoom,
    saveDetailedCalc,
    createQuote,
    shareQuote,
    confirmSent,
    pauseDeal,
    resumeDeal,
    declineDeal,
    acceptDeal,
    closeAcceptedDeal,
    createSequentialDeal,
    assignRoom,
    setMaterials,
    toggleChecklist,
    ensureChecklist,
    setBlocker,
    clearBlocker,
    tryCloseInstall,
    createInquiry,
    createStaff,
    resetStaffCredentials,
    dismissOneTimeCred,
    createIntervention,
    verifyIntervention,
    crewInbox,
    measurerInbox,
    completeAcademy,
    resetAcademy,
  };
})(window);
