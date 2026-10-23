/**
 * Gate C Problemomer — visual/interaction mirror of the agreed StP tool.
 * Demo acoustic narrative only; not a substitute for production acoustic engine.
 */
(function () {
  const STEPS = ["start", "room", "result"];
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
    },
  ];

  const state = {
    theme: localStorage.getItem("mf_pm_theme") || "light",
    step: "start",
    sub: 0,
    answers: {},
    areaM2: 14,
  };

  const root = () => document.getElementById("app");

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme === "dark" ? "dark" : "light");
  }

  function header() {
    return `<header class="header"><div class="header-inner">
      <div class="brand">
        <img class="stp" src="../shared/logo-stp.png" alt="StP" width="28" height="28" />
        <img class="mf" src="../shared/logo-multiframe.png" alt="MultiFRAME" height="18" />
        <span class="product">Проблемомер</span>
      </div>
      <button type="button" class="theme-btn" data-act="theme">${
        state.theme === "dark" ? "Светлая тема" : "Тёмная тема"
      }</button>
    </div></header>`;
  }

  function dots() {
    if (state.step === "start") return "";
    const map = [
      ["start", "Старт"],
      ["room", "Объект"],
      ["result", "Итог"],
    ];
    return `<div class="dots">${map
      .map(([id, label]) => `<span class="${state.step === id || (id === "room" && state.step === "room") ? "on" : ""}">${label}</span>`)
      .join("<span aria-hidden>·</span>")}</div>`;
  }

  function canNext() {
    if (state.step !== "room") return true;
    const q = ROOM_SUB[state.sub];
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
    const noisy = noise === "sometimes_noisy" || noise === "often_noisy" || kind === "impact" || kind === "mixed";
    const quiet = noise === "usually_quiet";
    return {
      areaM2: Number(state.areaM2) || 14,
      roomType: state.answers.basics || "bedroom",
      clientPersona: quiet ? "quiet" : noisy ? "noise" : "mixed",
      currentRisk: quiet ? "низкий" : noisy ? "повышенный" : "неясный",
      narrative: noisy
        ? "Есть сигнал о шуме сверху. MultiFrame под натяжным — аргумент снижения ударного шума. Без обещаний «−N дБ»."
        : "Клиент не жалуется на шум — потребность формируем мягко, с запасом комфорта на будущее.",
      chain: {
        norms: "Иллюстрация по ответам · не акустическое измерение",
        current: quiet ? "Сейчас · комфорт ближе к ожидаемому" : "Сейчас · риск дискомфорта от соседей",
        withMf: "С MultiFrame под полотном · ориентир заметного запаса комфорта",
        difference: "Ориентир улучшения без гарантии дБ",
        nextStep: "Сохранить профиль · при необходимости открыть калькулятор",
      },
      answers: { ...state.answers, areaM2: Number(state.areaM2) || 14 },
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
        <p class="dim" style="margin-top:12px">Gate C snapshot · согласованный вид StP/MultiFRAME · демо-результат</p>
      </main>`;
      bind();
      return;
    }
    if (state.step === "result") {
      const r = computeResult();
      el.innerHTML = `${header()}${dots()}<main class="main">
        <div class="result-card">
          <p class="eyebrow">Итог</p>
          <h2>Ориентир комфорта для этой комнаты</h2>
          <p class="lead">${r.narrative}</p>
          <ol class="chain">
            <li><strong>Ориентир</strong><br>${r.chain.norms}</li>
            <li><strong>Сейчас</strong><br>${r.chain.current}</li>
            <li><strong>С MultiFrame</strong><br>${r.chain.withMf}</li>
            <li><strong>Разница</strong><br>${r.chain.difference}</li>
            <li><strong>Дальше</strong><br>${r.chain.nextStep}</li>
          </ol>
          <p class="dim">${r.areaM2} м² · риск «${r.currentRisk}» · не гарантия дБ</p>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="btn" data-act="save-parent">Сохранить профиль в кабинет</button>
            <button class="btn ghost" data-act="restart">Пройти снова</button>
          </div>
        </div>
      </main>`;
      bind();
      return;
    }
    // room
    const q = ROOM_SUB[state.sub];
    const total = ROOM_SUB.length;
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
          state.step = "room";
          state.sub = 0;
          render();
          return;
        }
        if (act === "pick") {
          const q = ROOM_SUB[state.sub];
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
          if (state.sub < ROOM_SUB.length - 1) state.sub += 1;
          else state.step = "result";
          render();
          return;
        }
        if (act === "restart") {
          state.step = "start";
          state.sub = 0;
          state.answers = {};
          render();
          return;
        }
        if (act === "save-parent") {
          const result = computeResult();
          try {
            window.parent.postMessage(
              { type: "mf-gate-c-pm", result },
              window.location.origin === "null" ? "*" : window.location.origin
            );
          } catch (_) {
            window.parent.postMessage({ type: "mf-gate-c-pm", result }, "*");
          }
          btn.textContent = "Отправлено в кабинет";
          btn.disabled = true;
        }
      });
    });
  }

  applyTheme();
  render();
})();
