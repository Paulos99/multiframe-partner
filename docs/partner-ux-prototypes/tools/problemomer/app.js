/**
 * Gate C Problemer — original chrome + stepped survey + full result composition.
 * Demo acoustic narrative only (clearly labeled). Not production acoustic engine.
 * Ceiling-company: plannedCeiling preset stretch (question omitted).
 */
(function () {
  const ROOM_SUB = [
    {
      id: "houseType",
      title: "Укажите тип дома",
      factor: "Внешние факторы",
      options: [
        { id: "panel", label: "Панельный" },
        { id: "block", label: "Блочный" },
        { id: "brick", label: "Кирпичный" },
        { id: "monolith", label: "Монолит (в т.ч. монолит-кирпич)" },
        { id: "wood", label: "Деревянный / по балкам" },
        { id: "unknown", label: "Не знаю" },
      ],
    },
    {
      id: "slabType",
      title: "Выберите тип перекрытия",
      factor: "Внешние факторы",
      lead: "Покажем варианты, которые обычно бывают в таком доме.",
      options: [
        { id: "monolith", label: "Монолит / сплошная ж/б" },
        { id: "hollow", label: "Многопустотная (ПК)" },
        { id: "wood", label: "Деревянное / по балкам" },
        { id: "unknown", label: "Не знаю" },
      ],
    },
    {
      id: "slabThickness",
      title: "Выберите толщину перекрытия",
      factor: "Внешние факторы",
      options: [
        { id: "up_to_160", label: "До ~160 мм" },
        { id: "about_160_200", label: "Около 160–200 мм" },
        { id: "about_200_250", label: "Около 200–250 мм" },
        { id: "over_250", label: "Толще ~250 мм" },
        { id: "unknown", label: "Не знаю" },
      ],
    },
    {
      id: "basics",
      title: "Укажите тип комнаты и площадь",
      factor: "Внутренние факторы",
      options: [
        { id: "living", label: "Гостиная" },
        { id: "bedroom", label: "Спальня" },
        { id: "kids", label: "Детская" },
        { id: "kitchen", label: "Кухня" },
        { id: "office", label: "Кабинет" },
        { id: "other", label: "Другое" },
      ],
      needsArea: true,
    },
    {
      id: "objectStage",
      title: "На какой стадии объект?",
      factor: "Внутренние факторы",
      options: [
        { id: "newbuild", label: "Новостройка / до заселения" },
        { id: "renovation", label: "Идёт ремонт" },
        { id: "occupied", label: "Уже живут" },
        { id: "unknown", label: "Не знаю" },
      ],
    },
    {
      id: "noisyNeighbors",
      title: "Насколько шумно сверху?",
      factor: "Внутренние факторы",
      options: [
        { id: "usually_quiet", label: "Обычно тихо" },
        { id: "sometimes_noisy", label: "Сверху бывает шумно" },
        { id: "often_noisy", label: "Сверху часто шумно" },
        { id: "unknown", label: "Не знаю" },
      ],
    },
    {
      id: "noiseKind",
      title: "Что именно слышно сверху?",
      factor: "Внутренние факторы",
      lead: "Простыми примерами — так точнее подсветим, что важно именно вам.",
      options: [
        { id: "impact", label: "Топот и шаги", hint: "бег, передвижение мебели" },
        { id: "airborne", label: "Голоса и музыка", hint: "разговоры, ТВ, колонки" },
        { id: "mixed", label: "И то, и другое", hint: "и шаги, и голоса сверху" },
        { id: "unknown", label: "Сложно сказать" },
      ],
      skipIfQuiet: true,
    },
  ];

  const ROOM_LABELS = {
    living: "Гостиная",
    bedroom: "Спальня",
    kids: "Детская",
    kitchen: "Кухня",
    office: "Кабинет",
    other: "Другое",
  };
  const HOUSE_LABELS = Object.fromEntries(
    ROOM_SUB[0].options.map((o) => [o.id, o.label])
  );
  const SLAB_LABELS = Object.fromEntries(ROOM_SUB[1].options.map((o) => [o.id, o.label]));
  const STAGE_LABELS = Object.fromEntries(ROOM_SUB[4].options.map((o) => [o.id, o.label]));
  const NOISE_LABELS = Object.fromEntries(ROOM_SUB[5].options.map((o) => [o.id, o.label]));
  const KIND_LABELS = Object.fromEntries(ROOM_SUB[6].options.map((o) => [o.id, o.label]));

  const PILLARS = [
    { t: "Звукоизоляция и акустический комфорт", d: "Снижает шум сверху и поглощает звук в комнате — меньше эха." },
    { t: "Безопасность", d: "Материалы для жилых помещений: спальня, детская, кухня." },
    { t: "Экологичность", d: "Без минеральной ваты и строительной пыли на объекте." },
    { t: "Быстрый монтаж", d: "Сначала панели, затем натяжное полотно — без долгой стройки." },
    { t: "Универсальность", d: "Подходит к разным перекрытиям на разных стадиях ремонта." },
  ];

  const state = {
    theme: localStorage.getItem("mf_pm_theme") || "light",
    step: "start",
    sub: 0,
    answers: { plannedCeiling: "stretch" },
    areaM2: 14,
    audioCtx: null,
  };

  const root = () => document.getElementById("app");

  function visibleSubs() {
    const quiet = state.answers.noisyNeighbors === "usually_quiet";
    return ROOM_SUB.filter((q) => !(q.skipIfQuiet && quiet));
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme === "dark" ? "dark" : "light");
  }

  function header() {
    return `<header class="header"><div class="header-inner">
      <div class="brand">
        <img class="stp" src="../shared/logo-stp.png" alt="StP" width="26" height="26" />
        <img class="mf" src="../shared/logo-multiframe.png" alt="MultiFRAME" height="16" />
        <span class="product">Проблемомер</span>
      </div>
      <button type="button" class="theme-btn" data-act="theme">${
        state.theme === "dark" ? "Светлая" : "Тёмная"
      }</button>
    </div></header>`;
  }

  function progressSegs() {
    if (state.step === "start") return "";
    const cur = state.step === "room" ? 1 : 2;
    const items = [
      ["start", "Старт"],
      ["room", "Объект"],
      ["result", "Итог"],
    ];
    return `<nav class="progress-wrap" aria-label="Прогресс"><ol class="progress-list">${items
      .map(
        ([id, label], i) =>
          `<li class="${i < cur ? "done" : ""} ${i === cur ? "active" : ""}"><span class="seg"></span><span class="lab">${label}</span></li>`
      )
      .join("")}</ol></nav>`;
  }

  function canNext() {
    if (state.step !== "room") return true;
    const vis = visibleSubs();
    const q = vis[state.sub];
    if (!q) return false;
    const val = state.answers[q.id];
    if (!val) return false;
    if (q.needsArea) {
      const a = Number(state.areaM2);
      return Number.isFinite(a) && a > 0;
    }
    return true;
  }

  /** Demo-only illustrative numbers — not measurements */
  function computeResult() {
    const noise = state.answers.noisyNeighbors;
    const kind = state.answers.noiseKind;
    const noisy = noise === "sometimes_noisy" || noise === "often_noisy" || kind === "impact" || kind === "mixed";
    const quiet = noise === "usually_quiet";
    const roomType = state.answers.basics || "bedroom";
    const area = Number(state.areaM2) || 14;
    const airNow = quiet ? 48 : noisy ? 42 : 45;
    const airAfter = quiet ? 54 : noisy ? 52 : 53;
    const impactNow = quiet ? 72 : noisy ? 78 : 74;
    const impactAfter = quiet ? 66 : noisy ? 68 : 67;
    const quieterAir = Math.round(((airAfter - airNow) / Math.max(airNow, 1)) * 100);
    const quieterImpact = Math.round(((impactNow - impactAfter) / Math.max(impactNow, 1)) * 100);
    return {
      areaM2: area,
      roomType,
      roomLabel: ROOM_LABELS[roomType] || roomType,
      houseLabel: HOUSE_LABELS[state.answers.houseType] || "не указано",
      slabLabel: SLAB_LABELS[state.answers.slabType] || "не указано",
      stageLabel: STAGE_LABELS[state.answers.objectStage] || "не указано",
      neighborsLabel: NOISE_LABELS[noise] || "не указано",
      kindLabel: kind ? KIND_LABELS[kind] || null : null,
      clientPersona: quiet ? "quiet" : noisy ? "noise" : "mixed",
      currentRisk: quiet ? "низкий" : noisy ? "повышенный" : "неясный",
      narrative: noisy
        ? "Есть сигнал о шуме сверху. MultiFrame под натяжным — аргумент снижения ударного шума. Без обещаний «гарантированных −N дБ»."
        : "Клиент не жалуется на шум — потребность формируем мягко, с запасом комфорта на будущее.",
      demo: {
        airNow,
        airAfter,
        impactNow,
        impactAfter,
        quieterAir: Math.max(0, quieterAir),
        quieterImpact: Math.max(0, quieterImpact),
        quieterMax: Math.max(quieterAir, quieterImpact, 0),
        classNow: quiet ? "B" : noisy ? "below" : "V",
        classMf: quiet ? "A" : "B",
        echoBefore: quiet ? 55 : 72,
        echoAfter: quiet ? 38 : 42,
      },
      chain: {
        norms: "Иллюстрация по ответам · не акустическое измерение и не нормативный класс жилья",
        current: quiet ? "Сейчас · комфорт ближе к ожидаемому" : "Сейчас · риск дискомфорта от соседей",
        withMf: "С MultiFrame под полотном · ориентир заметного запаса комфорта",
        difference: "Ориентир улучшения без гарантии дБ",
        nextStep: "Сохранить профиль · при необходимости открыть калькулятор",
      },
      answers: { ...state.answers, areaM2: area, plannedCeiling: "stretch" },
    };
  }

  function playDemoTone(mode) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!state.audioCtx) state.audioCtx = new Ctx();
      const ctx = state.audioCtx;
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      // До = louder/harsh; После = quieter/softer — clearly demo
      o.frequency.value = mode === "after" ? 180 : 220;
      g.gain.value = mode === "after" ? 0.04 : 0.12;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      o.stop(ctx.currentTime + 0.5);
    } catch (_) {
      /* ignore */
    }
  }

  function renderResult() {
    const r = computeResult();
    const d = r.demo;
    const normRows = [
      { key: "A", label: "Высокий комфорт (А)", rw: "≥ 54", lnw: "≤ 55" },
      { key: "B", label: "Комфорт (Б)", rw: "≥ 52", lnw: "≤ 58" },
      { key: "V", label: "Допустимый (В)", rw: "≥ 50", lnw: "≤ 60" },
      { key: "below", label: "Ниже допустимого", rw: "< 50", lnw: "> 60", muted: true },
    ];
    const airBarNow = Math.round((d.airNow / 60) * 100);
    const airBarAfter = Math.round((d.airAfter / 60) * 100);
    const impBarNow = Math.round((d.impactNow / 90) * 100);
    const impBarAfter = Math.round((d.impactAfter / 90) * 100);

    return `${header()}${progressSegs()}<main class="main"><div class="result-root">
      <h1>Акустический профиль помещения</h1>
      <div class="disclaimer">Демо-иллюстрация Gate C по ответам анкеты · не измерение, не лабораторный протокол и не гарантия дБ. Числа ниже помечены как DEMO.</div>

      <section class="section" aria-label="Параметры объекта">
        <h2>Параметры объекта</h2>
        <dl class="params-grid">
          <div><dt>Перекрытие</dt><dd>${r.slabLabel}</dd></div>
          <div><dt>Тип дома</dt><dd>${r.houseLabel}</dd></div>
          <div><dt>Комната</dt><dd>${r.roomLabel}</dd></div>
          <div><dt>Площадь</dt><dd>${r.areaM2} м²</dd></div>
          <div><dt>Потолок</dt><dd>Натяжной <span class="demo-tag">пресет</span></dd></div>
          <div><dt>Стадия</dt><dd>${r.stageLabel}</dd></div>
          <div><dt>Шум сверху</dt><dd>${r.neighborsLabel}</dd></div>
          ${r.kindLabel ? `<div><dt>Тип шума</dt><dd>${r.kindLabel}</dd></div>` : ""}
        </dl>
      </section>

      <section class="section" aria-label="Ключевые показатели">
        <h2>Ключевые показатели <span class="demo-tag">DEMO</span></h2>
        <div class="kpi-row">
          <article class="kpi">
            <span class="l">Воздушный шум</span>
            <span class="n">−${d.quieterAir}<em>%</em></span>
            <div class="kpi-bars" aria-hidden>
              <span><i style="height:${Math.max(18, airBarNow)}%"></i></span>
              <span><i class="after" style="height:${Math.max(18, airBarAfter)}%"></i></span>
            </div>
            <span class="hint">сейчас ~${d.airNow} · с MF ~${d.airAfter} (иллюстр.)</span>
          </article>
          <article class="kpi">
            <span class="l">Ударный шум</span>
            <span class="n">−${d.quieterImpact}<em>%</em></span>
            <div class="kpi-bars" aria-hidden>
              <span><i style="height:${Math.max(18, impBarNow)}%"></i></span>
              <span><i class="after" style="height:${Math.max(18, impBarAfter)}%"></i></span>
            </div>
            <span class="hint">сейчас ~${d.impactNow} · с MF ~${d.impactAfter} (иллюстр.)</span>
          </article>
          <article class="kpi">
            <span class="l">Акустический комфорт</span>
            <span class="n">${d.echoBefore}→${d.echoAfter}</span>
            <span class="hint">эхо в комнате · условная шкала DEMO</span>
          </article>
          <article class="kpi">
            <span class="l">Снижение шума</span>
            <span class="n">−${d.quieterMax}<em>%</em></span>
            <span class="hint">воздух ${d.quieterAir}% · удар ${d.quieterImpact}%</span>
          </article>
        </div>
      </section>

      <section class="section" aria-label="Рекомендации и продукт">
        <h2>Рекомендации и продукт</h2>
        <div class="rec-product">
          <aside>
            <h3 style="margin:0 0 8px;font-size:.95rem">Рекомендации</h3>
            <p class="lead">${r.narrative}</p>
            <p class="dim">${r.chain.current}. ${r.chain.withMf}.</p>
          </aside>
          <aside>
            <h3 style="margin:0 0 8px;font-size:.95rem">Что такое MultiFrame</h3>
            <img class="product-photo" src="../shared/multiframe-panel.png" alt="Панель MultiFrame" width="480" height="360" />
            <p class="lead">Модульная панель под натяжное полотно — аргумент комфорта, не «стройка на месяц».</p>
          </aside>
        </div>
      </section>

      <section class="section" aria-label="Нормы комфорта для жилья">
        <h2>Нормы комфорта жилья <span class="demo-tag">таблица-ориентир</span></h2>
        <p class="dim" style="margin:0 0 10px"><b>Rw</b> воздух · больше лучше · <b>Lnw</b> удар · меньше лучше · по СП 51 (справочно)</p>
        <table class="norm-table">
          <thead><tr><th>Уровень</th><th>Rw</th><th>Lnw</th></tr></thead>
          <tbody>
            ${normRows
              .map((row) => {
                const isNow = row.key === d.classNow;
                const isMf = row.key === d.classMf;
                return `<tr class="${isNow ? "mark-now" : ""} ${isMf ? "mark-mf" : ""}">
                  <td>${row.label}${isNow ? '<span class="pill pill-now">Сейчас</span>' : ""}${
                  isMf ? '<span class="pill pill-mf">MultiFrame</span>' : ""
                }</td>
                  <td>${row.rw} <em>дБ</em></td>
                  <td>${row.lnw} <em>дБ</em></td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </section>

      <section class="section" aria-label="Эффективность и сравнение на слух">
        <h2>Эффективность и сравнение на слух</h2>
        <div class="felt">
          <strong>Воздушный шум (голоса и музыка)</strong>
          <div class="felt-track"><span class="now" style="left:${Math.min(90, (d.airNow / 60) * 100)}%"></span><span class="after" style="left:${Math.min(90, (d.airAfter / 60) * 100)}%"></span></div>
          <p class="meta">станет на ≈ ${d.quieterAir}% тише <span class="demo-tag">DEMO</span> · Rw ↑ лучше</p>
        </div>
        <div class="felt">
          <strong>Ударный шум (шаги и падения)</strong>
          <div class="felt-track"><span class="now" style="left:${Math.min(90, (d.impactNow / 90) * 100)}%"></span><span class="after" style="left:${Math.min(90, (d.impactAfter / 90) * 100)}%"></span></div>
          <p class="meta">станет на ≈ ${d.quieterImpact}% тише <span class="demo-tag">DEMO</span> · Lnw ↓ лучше</p>
        </div>
        <div aria-label="Сравнить на слух" style="margin-top:14px">
          <h3 style="margin:0 0 6px;font-size:1rem;color:var(--accent)">Сравнить на слух</h3>
          <p class="lead">Эхо в комнате и звук сверху — до и после. Короткие DEMO-тона (не полевая запись).</p>
          <div class="listen">
            <div class="listen-card">
              <h4>Эхо в комнате</h4>
              <div class="listen-pair">
                <button type="button" class="btn ghost" data-act="audio" data-mode="before" data-ch="echo">До</button>
                <button type="button" class="btn secondary" data-act="audio" data-mode="after" data-ch="echo">После</button>
              </div>
            </div>
            <div class="listen-card">
              <h4>Звук сверху</h4>
              <div class="listen-pair">
                <button type="button" class="btn ghost" data-act="audio" data-mode="before" data-ch="impact">До</button>
                <button type="button" class="btn secondary" data-act="audio" data-mode="after" data-ch="impact">После</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section" aria-label="Уникальность системы MultiFrame">
        <h2>Уникальность системы MultiFrame</h2>
        <div class="pillars">
          ${PILLARS.map((p) => `<div class="pillar"><strong>${p.t}</strong><span>${p.d}</span></div>`).join("")}
        </div>
      </section>

      <section class="section" aria-label="Следующий шаг">
        <h2>Следующий шаг</h2>
        <p class="lead">${r.chain.nextStep}</p>
        <div class="actions">
          <button type="button" class="btn" data-act="save-parent">Сохранить профиль в кабинет</button>
          <button type="button" class="btn secondary" data-act="open-calc">Рассчитать количество MultiFrame</button>
          <button type="button" class="btn ghost" data-act="restart">Пройти ещё раз</button>
        </div>
      </section>
    </div></main>`;
  }

  function render() {
    applyTheme();
    const el = root();
    el.className = `shell ${state.step}`;
    if (state.step === "start") {
      el.innerHTML = `${header()}<main class="main">
        <div class="hero">
          <h1>Проверьте уровень акустического комфорта на своём объекте</h1>
          <p>Ответьте на несколько вопросов, Проблемомер оценит уровень шума.</p>
          <p>Дальше вы увидите, насколько тише станет после монтажа MultiFrame.</p>
          <button class="btn full" data-act="start">Начать</button>
        </div>
        <p class="dim" style="margin-top:12px">Gate C · согласованный вид StP/MultiFRAME · потолок: пресет натяжной</p>
      </main>`;
      bind();
      return;
    }
    if (state.step === "result") {
      el.innerHTML = renderResult();
      bind();
      return;
    }
    const vis = visibleSubs();
    if (state.sub >= vis.length) state.sub = vis.length - 1;
    const q = vis[state.sub];
    const total = vis.length;
    const pct = Math.round(((state.sub + 1) / total) * 100);
    const selected = state.answers[q.id];
    el.innerHTML = `${header()}${progressSegs()}<main class="main">
      <p class="eyebrow">${q.factor}</p>
      <p class="lead">Вопрос ${state.sub + 1} из ${total} · ${q.factor}</p>
      <h2 class="title">${q.title}</h2>
      ${q.lead ? `<p class="lead">${q.lead}</p>` : ""}
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="grid">
        ${q.options
          .map(
            (o) => `<button type="button" class="card ${selected === o.id ? "selected" : ""}" data-act="pick" data-id="${o.id}">
              <strong>${o.label}</strong>${o.hint ? `<span>${o.hint}</span>` : ""}
            </button>`
          )
          .join("")}
      </div>
      ${
        q.needsArea
          ? `<div class="field"><label for="area">Площадь потолка, м²</label>
             <input id="area" type="number" min="1" step="0.1" placeholder="Например, 18" value="${state.areaM2}" /></div>`
          : ""
      }
    </main>
    <footer class="footer"><div class="footer-inner">
      <button class="btn ghost" data-act="back">Назад</button>
      <button class="btn" data-act="next" ${canNext() ? "" : "disabled"}>Далее</button>
    </div></footer>`;
    bind();
    const area = document.getElementById("area");
    if (area) {
      area.addEventListener("input", () => {
        state.areaM2 = Number(area.value) || 0;
        const next = el.querySelector('[data-act="next"]');
        if (next) next.disabled = !canNext();
      });
    }
  }

  function postToParent(type, payload) {
    const msg = { type, ...payload };
    try {
      window.parent.postMessage(msg, window.location.origin === "null" ? "*" : window.location.origin);
    } catch (_) {
      window.parent.postMessage(msg, "*");
    }
  }

  function bind() {
    root().querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        if (act === "theme") {
          state.theme = state.theme === "dark" ? "light" : "dark";
          localStorage.setItem("mf_pm_theme", state.theme);
          render();
          return;
        }
        if (act === "start") {
          // One click → Q1
          state.step = "room";
          state.sub = 0;
          state.answers = { plannedCeiling: "stretch" };
          render();
          return;
        }
        if (act === "pick") {
          const vis = visibleSubs();
          const q = vis[state.sub];
          state.answers[q.id] = btn.getAttribute("data-id");
          render();
          return;
        }
        if (act === "back") {
          if (state.sub > 0) state.sub -= 1;
          else state.step = "start";
          render();
          return;
        }
        if (act === "next") {
          if (!canNext()) return;
          const vis = visibleSubs();
          if (state.sub < vis.length - 1) state.sub += 1;
          else state.step = "result";
          render();
          return;
        }
        if (act === "restart") {
          state.step = "start";
          state.sub = 0;
          state.answers = { plannedCeiling: "stretch" };
          render();
          return;
        }
        if (act === "audio") {
          playDemoTone(btn.getAttribute("data-mode") === "after" ? "after" : "before");
          return;
        }
        if (act === "open-calc") {
          postToParent("mf-gate-c-nav", { hash: "#/tools/calc" });
          return;
        }
        if (act === "save-parent") {
          const result = computeResult();
          postToParent("mf-gate-c-pm", { result });
          btn.textContent = "Отправлено в кабинет";
          btn.disabled = true;
        }
      });
    });
  }

  applyTheme();
  render();
})();
