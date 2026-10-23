/**
 * Gate C Problemomer snapshot — compact StP shell + stepped survey + rich result.
 * Demo acoustic narrative only (illustrative). One click «Начать» → first question.
 */
(function () {
  const ROOM_SUB = [
    {
      id: "houseType",
      title: "Укажите тип дома",
      factor: "Объект",
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
      factor: "Объект",
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
      factor: "Объект",
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
      factor: "Объект",
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
      id: "plannedCeiling",
      title: "Какой у вас потолок?",
      factor: "Объект",
      options: [
        { id: "stretch", label: "Натяжной" },
        { id: "gypsum", label: "Гипсокартон / подвесной" },
        { id: "plaster", label: "Штукатурка или покраска" },
        { id: "other_exists", label: "Другой потолок уже есть" },
        { id: "unknown", label: "Не знаю" },
      ],
    },
    {
      id: "noisyNeighbors",
      title: "Насколько шумно сверху?",
      factor: "Объект",
      options: [
        { id: "unknown", label: "Не знаю" },
        { id: "usually_quiet", label: "Обычно тихо" },
        { id: "sometimes_noisy", label: "Сверху бывает шумно" },
        { id: "often_noisy", label: "Сверху часто шумно" },
      ],
    },
    {
      id: "noiseKind",
      title: "Что именно слышно сверху?",
      factor: "Объект",
      lead: "Простыми примерами — так точнее подсветим, что важно именно вам.",
      options: [
        { id: "impact", label: "Топот и шаги", hint: "бег, передвижение мебели, падения" },
        { id: "airborne", label: "Голоса и музыка", hint: "разговоры, ТВ, колонки" },
        { id: "mixed", label: "И то, и другое", hint: "и шаги, и голоса сверху" },
        { id: "unknown", label: "Сложно сказать" },
      ],
      skipIfQuiet: true,
    },
  ];

  const PILLARS = [
    ["Звукоизоляция и акустический комфорт", "Снижает шум сверху и поглощает звук в комнате — меньше эха."],
    ["Безопасность", "Материалы безопасны для жилых помещений: спальня, детская, кухня."],
    ["Экологичность", "Без минеральной ваты и строительной пыли на объекте."],
    ["Быстрый монтаж", "Сначала панели, затем натяжное полотно — без долгой стройки."],
    ["Универсальность", "Подходит к перекрытию на любой стадии ремонта."],
  ];

  const ROOM_LABELS = {
    living: "Гостиная",
    bedroom: "Спальня",
    kids: "Детская",
    kitchen: "Кухня",
    office: "Кабинет",
    other: "Другое",
  };

  const state = {
    theme: localStorage.getItem("mf_pm_theme") || "light",
    step: "start",
    sub: 0,
    answers: {},
    areaM2: 14,
    audioSide: "before",
  };

  const root = () => document.getElementById("app");

  function visibleSubs() {
    return ROOM_SUB.filter((q) => {
      if (!q.skipIfQuiet) return true;
      return state.answers.noisyNeighbors !== "usually_quiet";
    });
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

  function dots() {
    if (state.step === "start") return "";
    const cur = state.step === "room" ? 1 : 2;
    const labels = ["Старт", "Объект", "Итог"];
    return `<div class="dots" aria-label="Прогресс">${labels
      .map((label, i) => {
        const cls = i === cur ? "on" : i < cur ? "done" : "";
        return `<span class="${cls}">${label}</span>`;
      })
      .join("")}</div>`;
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

  function computeResult() {
    const noise = state.answers.noisyNeighbors;
    const kind = state.answers.noiseKind;
    const noisy =
      noise === "sometimes_noisy" ||
      noise === "often_noisy" ||
      kind === "impact" ||
      kind === "mixed";
    const quiet = noise === "usually_quiet";
    const air = quiet ? 18 : noisy ? 32 : 24;
    const impact = quiet ? 22 : noisy ? 38 : 28;
    const max = Math.max(air, impact);
    return {
      areaM2: Number(state.areaM2) || 14,
      roomType: state.answers.basics || "bedroom",
      clientPersona: quiet ? "quiet" : noisy ? "noise" : "mixed",
      currentRisk: quiet ? "низкий" : noisy ? "повышенный" : "неясный",
      quieterAir: air,
      quieterImpact: impact,
      quieterMax: max,
      rwBefore: quiet ? 48 : 44,
      rwAfter: quiet ? 52 : 51,
      lnwBefore: quiet ? 68 : 74,
      lnwAfter: quiet ? 62 : 64,
      echoBefore: quiet ? 2 : 4,
      echoAfter: 1,
      narrative: noisy
        ? "Есть сигнал о шуме сверху. MultiFrame под натяжным — аргумент снижения ударного шума. Без обещаний «−N дБ»."
        : "Клиент не жалуется на шум — потребность формируем мягко, с запасом комфорта на будущее.",
      answers: { ...state.answers, areaM2: Number(state.areaM2) || 14 },
      houseType: state.answers.houseType,
      ceiling: state.answers.plannedCeiling || "stretch",
    };
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
        <p class="dim" style="margin-top:12px">Gate C · согласованный wizard · один клик «Начать» · демо-значения помечены</p>
      </main>`;
      bind();
      return;
    }
    if (state.step === "result") {
      const r = computeResult();
      const room = ROOM_LABELS[r.roomType] || r.roomType;
      el.innerHTML = `${header()}${dots()}<main class="main">
        <p class="eyebrow">Итог</p>
        <h2 class="title">Акустический профиль помещения</h2>
        <p class="disclaimer">Демо-иллюстрация по ответам · не измерение, не лабораторный протокол и не гарантия дБ. Цифры % / Rw / Lnw — ориентиры интерфейса.</p>
        <section class="params">
          <h3>Параметры объекта</h3>
          <dl>
            <dt>Комната</dt><dd>${room}</dd>
            <dt>Площадь</dt><dd>${r.areaM2} м²</dd>
            <dt>Дом</dt><dd>${r.houseType || "—"}</dd>
            <dt>Потолок</dt><dd>${r.ceiling} (пресет сегмента)</dd>
            <dt>Риск сейчас</dt><dd>${r.currentRisk}</dd>
          </dl>
        </section>
        <section class="kpi-row" aria-label="Ключевые показатели">
          <article class="kpi">
            <span class="l">Воздушный шум</span>
            <span class="n">−${r.quieterAir}<em>%</em></span>
            <div class="bars" aria-hidden><i style="height:${Math.round((r.rwBefore / 60) * 100)}%"></i><i class="after" style="height:${Math.round((r.rwAfter / 60) * 100)}%"></i></div>
            <span class="h">изоляция воздуха · demo Rw ${r.rwBefore}→${r.rwAfter}</span>
          </article>
          <article class="kpi">
            <span class="l">Ударный шум</span>
            <span class="n">−${r.quieterImpact}<em>%</em></span>
            <div class="bars" aria-hidden><i style="height:${Math.round((r.lnwBefore / 90) * 100)}%"></i><i class="after" style="height:${Math.round((r.lnwAfter / 90) * 100)}%"></i></div>
            <span class="h">удар · demo Lnw ${r.lnwBefore}→${r.lnwAfter}</span>
          </article>
          <article class="kpi">
            <span class="l">Акустический комфорт</span>
            <span class="n">${r.echoBefore}→${r.echoAfter}</span>
            <span class="h">визуальный ориентир «сейчас / после» · demo</span>
          </article>
          <article class="kpi">
            <span class="l">Снижение шума</span>
            <span class="n">−${r.quieterMax}<em>%</em></span>
            <span class="h">воздух ${r.quieterAir}% · удар ${r.quieterImpact}%</span>
          </article>
        </section>
        <section class="section">
          <h3>Рекомендации и продукт</h3>
          <p class="lead">${r.narrative}</p>
          <p class="dim">MultiFrame под натяжным полотном · без обещания «−N дБ».</p>
        </section>
        <section class="section">
          <h3>Нормы комфорта для жилья</h3>
          <table class="norms">
            <thead><tr><th>Класс</th><th>Rw</th><th>Lnw</th></tr></thead>
            <tbody>
              <tr><td>Высокий комфорт (А)</td><td>≥ 54</td><td>≤ 58</td></tr>
              <tr><td>Комфорт (Б)</td><td>≥ 52</td><td>≤ 60</td></tr>
              <tr><td>Допустимый (В)</td><td>≥ 50</td><td>≤ 63</td></tr>
              <tr><td>Ниже допустимого</td><td>&lt; 50</td><td>&gt; 63</td></tr>
            </tbody>
          </table>
          <p class="dim" style="margin-top:8px">Таблица — справочный UI-ориентир, не заключение по объекту.</p>
        </section>
        <section class="section">
          <h3>Визуальное сравнение</h3>
          <div class="compare">
            <div class="col ${state.audioSide === "before" ? "on" : ""}">
              <strong>Сейчас</strong>
              <span class="dim">Комфорт ближе к «${r.currentRisk}» · demo</span>
            </div>
            <div class="col ${state.audioSide === "after" ? "on" : ""}">
              <strong>С MultiFrame</strong>
              <span class="dim">Ориентир запаса комфорта · demo</span>
            </div>
          </div>
        </section>
        <section class="section">
          <h3>Сравнить на слух</h3>
          <div class="audio-demo">
            <button type="button" class="btn ghost ${state.audioSide === "before" ? "is-on" : ""}" data-act="audio" data-side="before">До</button>
            <button type="button" class="btn ghost ${state.audioSide === "after" ? "is-on" : ""}" data-act="audio" data-side="after">После</button>
            <span class="dim">Демо-переключатель UI · без реального аудиофайла в Gate C</span>
          </div>
        </section>
        <section class="section">
          <h3>Почему MultiFrame</h3>
          <div class="pillars">
            ${PILLARS.map(([t, s]) => `<div class="pillar"><strong>${t}</strong><span>${s}</span></div>`).join("")}
          </div>
        </section>
        <section class="section">
          <h3>Следующий шаг</h3>
          <div class="actions">
            <button class="btn" data-act="save-parent">Сохранить профиль в кабинет</button>
            <button class="btn ghost" data-act="restart">Пройти снова</button>
          </div>
        </section>
      </main>`;
      bind();
      return;
    }
    const vis = visibleSubs();
    if (state.sub >= vis.length) state.sub = vis.length - 1;
    const q = vis[state.sub];
    const total = vis.length;
    const pct = Math.round(((state.sub + 1) / total) * 100);
    const selected = state.answers[q.id];
    el.innerHTML = `${header()}${dots()}<main class="main">
      <p class="eyebrow">${q.factor}</p>
      <p class="lead">Вопрос ${state.sub + 1} из ${total} · ${q.factor}</p>
      <h2 class="title">${q.title}</h2>
      ${q.lead ? `<p class="lead">${q.lead}</p>` : ""}
      <div class="progress"><i style="width:${pct}%"></i></div>
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
          ? `<div class="field"><label for="area">Площадь, м²</label>
             <input id="area" type="number" min="1" step="0.1" value="${state.areaM2}" /></div>`
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
          // One click → first survey question (no second intro)
          state.step = "room";
          state.sub = 0;
          render();
          return;
        }
        if (act === "pick") {
          const q = visibleSubs()[state.sub];
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
        if (act === "audio") {
          state.audioSide = btn.getAttribute("data-side") || "before";
          render();
          return;
        }
        if (act === "restart") {
          state.step = "start";
          state.sub = 0;
          state.answers = {};
          state.audioSide = "before";
          render();
          return;
        }
        if (act === "save-parent") {
          const result = computeResult();
          const payload = { type: "mf-gate-c-pm", result };
          try {
            window.parent.postMessage(payload, "*");
          } catch (_) {}
          btn.textContent = "Отправлено в кабинет";
          btn.disabled = true;
        }
      });
    });
  }

  applyTheme();
  render();
})();
