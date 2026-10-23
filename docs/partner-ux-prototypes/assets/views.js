/**
 * Gate C view renderers — one active workspace panel (ADR-003).
 */
(function (global) {
  const S = () => MFStore.get();

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    if (n == null) return "—";
    return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
  }

  function staffName(id) {
    const u = S().staff.find((x) => x.id === id);
    return u ? u.name : "не назначен";
  }

  function stageLabel(stage) {
    const map = {
      inquiry: "Заявка",
      assessed: "Оценка PM",
      calculated: "Есть расчёт",
      quote_sent_confirmed: "КП подтверждено",
      accepted: "Принято",
      new: "Новая",
    };
    return map[stage] || stage || "—";
  }

  /* ---------- LOGIN ---------- */
  function login() {
    return `
      <div class="login-wrap">
        <div class="login-card">
          <div class="pill info" style="margin-bottom:12px">Gate C · HTML-прототип · не production</div>
          <h1><span style="color:var(--accent)">MultiFrame</span> Партнёр</h1>
          <p class="muted">Демо-орг «Неболайн» — натяжные потолки, СПб. Выберите роль и попробуйте сценарий — без долгого инструктажа.</p>
          <div class="role-grid">
            ${Object.values(MFStore.ROLES)
              .map(
                (r) => `
              <button class="role-card" data-action="login" data-role="${r.id}">
                <strong>${esc(r.label)}</strong>
                <span>${esc(r.person)} · ${esc(r.org)}</span>
              </button>`
              )
              .join("")}
          </div>
          <p class="footnote">Состояние сохраняется в localStorage браузера. Сброс — в меню профиля.</p>
        </div>
      </div>`;
  }

  /* ---------- SHELL ---------- */
  function chrome() {
    const st = S();
    const role = MFStore.ROLES[st.role];
    return `
      <header class="chrome">
        <div class="brand">Multi<span>Frame</span></div>
        <span class="pill">${esc(role.org)}</span>
        <div class="chrome-meta">
          <span class="pill ${st.offline ? "warn" : "ok"}">${st.offline ? "Офлайн" : "Синхр. ок"}</span>
          <span class="hide-sm muted">${esc(role.person)} · ${esc(role.label)}</span>
          <button class="btn sm ghost" data-action="toggle-offline">${st.offline ? "Вернуться онлайн" : "Симуляция офлайн"}</button>
          <button class="btn sm ghost" data-action="logout">Сменить роль</button>
        </div>
      </header>`;
  }

  function nav(active) {
    const role = S().role;
    // Owner clarification: Проблемомер + Калькулятор — самостоятельные инструменты для всех сотрудников
    const toolLinks = [
      ["#/tools/pm", "Проблемомер"],
      ["#/tools/calc", "Калькулятор"],
    ];
    const items = {
      sales: [
        ["#/sales/home", "Сегодня", "①"],
        ["#/sales/projects", "Проекты", "②"],
        ["#/tools/hub", "Инстр.", "③"],
        ["#/sales/academy-hub", "Академия", "④"],
      ],
      owner: [
        ["#/owner/home", "Сегодня", "①"],
        ["#/owner/projects", "Проекты", "②"],
        ["#/tools/hub", "Инстр.", "③"],
        ["#/owner/staff", "Сотрудн.", "④"],
      ],
      measurer: [
        ["#/measurer/home", "Замеры", "①"],
        ["#/measurer/projects", "Проекты", "②"],
        ["#/tools/hub", "Инстр.", "③"],
      ],
      crew: [
        ["#/crew/home", "Задания", "①"],
        ["#/tools/hub", "Инстр.", "②"],
      ],
      admin: [
        ["#/admin/home", "Сигналы", "①"],
        ["#/admin/partners", "Партнёры", "②"],
        ["#/tools/hub", "Инстр.", "③"],
        ["#/admin/training", "Тренинг", "④"],
      ],
    }[role] || [];

    const desktopExtra = {
      sales: [["#/sales/analytics", "Аналитика"], ["#/sales/quick", "Сессия PM→Calc"]],
      admin: [["#/admin/analytics", "Сеть"]],
    }[role] || [];

    const allDesktop = items.concat(desktopExtra);
    const toolsActive = active && String(active).startsWith("tools");

    return `
      <nav class="nav desktop-nav" aria-label="Основная навигация">
        <div class="nav-section">Навигация</div>
        ${allDesktop
          .map(([href, label]) => {
            const isActive = active && href.includes(active);
            return `<a href="${href}" class="${isActive ? "active" : ""}">${label}</a>`;
          })
          .join("")}
        <div class="nav-section">Инструменты</div>
        ${toolLinks
          .map(([href, label]) => {
            const isActive = toolsActive && href.includes(active);
            return `<a href="${href}" class="${isActive ? "active" : ""}">${label}</a>`;
          })
          .join("")}
        <p class="dim" style="padding:4px 12px;font-size:.72rem">Открываются сами · привязка к проекту — при сохранении</p>
        <div class="nav-section">Прототип</div>
        <button class="nav-link" data-action="reset">Сбросить демо-данные</button>
        <button class="nav-link" data-action="toggle-loading">Показать загрузку</button>
      </nav>
      <nav class="bottom-nav" aria-label="Мобильная навигация">
        ${items
          .map(([href, label, ico]) => {
            const isActive = active && href.includes(active);
            return `<a href="${href}" class="${isActive ? "active" : ""}"><span class="ico">${ico}</span>${label}</a>`;
          })
          .join("")}
      </nav>`;
  }

  /** Shared tools hub — one tap each to PM or Calc (all roles) */
  function toolsHub() {
    return shell(
      "tools/hub",
      `
      <div class="page-head">
        <div>
          <h1>Инструменты</h1>
          <p class="sub">Проблемомер и калькулятор — для всей команды. Можно открыть по отдельности.</p>
        </div>
      </div>
      <div class="grid-2">
        <a class="panel" style="text-align:left;display:block;text-decoration:none;color:inherit" href="#/tools/pm">
          <h3>Проблемомер</h3>
          <p class="muted">Анкета и результат. Без проекта и без обязательного калькулятора.</p>
          <span class="btn primary sm" style="margin-top:8px">Открыть</span>
        </a>
        <a class="panel" style="text-align:left;display:block;text-decoration:none;color:inherit" href="#/tools/calc">
          <h3>Калькулятор</h3>
          <p class="muted">Предварительный ориентир. Без обязательного проблемомера; проект — только при сохранении.</p>
          <span class="btn primary sm" style="margin-top:8px">Открыть</span>
        </a>
      </div>
      <p class="muted" style="margin-top:14px">К проекту и комнате привязываем только когда сохраняете результат.</p>
      ${
        S().role === "sales"
          ? `<p class="dim">Можно подряд: <a href="#/sales/quick">проблемомер → калькулятор с переносом ответов</a>.</p>`
          : ""
      }`
    );
  }

  /* ---- GC6-P0-03: original-looking PM / Calc shells ---- */
  const PM_QS = [
    {
      id: "houseType",
      title: "Укажите тип дома",
      lead: "Вопрос 1 из 7 · Внешние факторы",
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
      lead: "Вопрос 2 из 7 · Внешние факторы",
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
      lead: "Вопрос 3 из 7 · Внешние факторы",
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
      lead: "Вопрос 4 из 7 · Внутренние факторы",
      roomTypes: [
        { id: "living", label: "Гостиная" },
        { id: "bedroom", label: "Спальня" },
        { id: "kids", label: "Детская" },
        { id: "kitchen", label: "Кухня" },
        { id: "office", label: "Кабинет" },
        { id: "other", label: "Другое" },
      ],
    },
    {
      id: "objectStage",
      title: "На какой стадии объект?",
      lead: "Вопрос 5 из 7 · Внутренние факторы",
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
      lead: "Вопрос 6 из 7 · Внутренние факторы",
      options: [
        { id: "no", label: "Тихо / не беспокоит", hint: "Соседей почти не слышно" },
        { id: "yes", label: "Шумно / слышны соседи", hint: "Есть жалобы или заметный шум" },
        { id: "unknown", label: "Не знаю / не спрашивали" },
      ],
    },
    {
      id: "noiseKind",
      title: "Что именно слышно сверху?",
      lead: "Вопрос 7 из 7 · Внутренние факторы",
      options: [
        { id: "steps", label: "Шаги / топот" },
        { id: "voices", label: "Голоса / ТВ" },
        { id: "both", label: "И шаги, и голоса" },
        { id: "unknown", label: "Не знаю" },
      ],
      skipIfQuiet: true,
    },
  ];

  function origToolHeader(kind, theme) {
    const title = kind === "calc" ? "КАЛЬКУЛЯТОР" : "ПРОБЛЕМОМЕР";
    const logo = kind === "calc" ? "logo-stp-calc.png" : "logo-stp.png";
    const brand = kind === "calc" ? "logo-multiframe-calc.png" : "logo-multiframe.png";
    return `
      <header class="orig-header">
        <img class="orig-header__logo" src="./assets/img/${logo}" alt="StP" />
        <h1 class="orig-header__title">${title}</h1>
        <img class="orig-header__brand" src="./assets/img/${brand}" alt="MultiFRAME" />
        <div class="orig-header__actions">
          <button type="button" class="orig-icon-btn" data-action="tool-theme-toggle" title="Тема">${
            theme === "dark" ? "☀" : "☾"
          }</button>
          <a class="orig-icon-btn" href="#/tools/hub" title="К инструментам">✕</a>
        </div>
      </header>`;
  }

  function pmProgress(phase) {
    const steps = [
      ["start", "Старт"],
      ["room", "Объект"],
      ["result", "Итог"],
    ];
    const cur = phase === "intro" ? 0 : phase === "survey" ? 1 : 2;
    return `<ol class="orig-progress" aria-label="Прогресс">${steps
      .map(
        ([, label], i) =>
          `<li class="${i < cur ? "is-done" : ""} ${i === cur ? "is-active" : ""}"><span class="dot"></span><span>${label}</span></li>`
      )
      .join("")}</ol>`;
  }

  /**
   * GC6-P0-03 remainder: host agreed Problemer snapshot full-bleed
   * (compact logo row + segment progress + full result) — not redrawn cabinet shell.
   */
  function toolsPm() {
    const role = S().role || "—";
    const d = S().sessionDraft;
    const ready = d && d.pmDone && !d.bound;
    return `
      <div class="tool-host" data-tool="pm">
        <header class="tool-chrome">
          <a class="tool-chrome__back" href="#/tools/hub">← Инстр.</a>
          <div class="tool-chrome__title">
            <strong>Проблемомер</strong>
            <span class="muted hide-narrow">роль ${esc(role)} · снимок UI</span>
          </div>
          <div class="tool-chrome__actions">
            <a class="btn sm ghost" href="#/tools/calc">Калькулятор</a>
            <a class="btn sm ${ready ? "primary" : "ghost"}" href="#/tools/bind">${
              ready ? "Сохранить…" : "Bind"
            }</a>
          </div>
        </header>
        <iframe class="tool-frame" title="Проблемомер MultiFRAME" src="${pmToolIframeSrc()}" allow="autoplay"></iframe>
      </div>`;
  }

  /** GC9-P0-01: partner=1 enables mf-cabinet-calc; optional PM area handoff once. */
  function calcToolIframeSrc() {
    return MFStore.calcToolIframePath(S().sessionDraft);
  }

  function pmToolIframeSrc() {
    return "tools/problemomer/index.html";
  }

  /**
   * GC6-P0-03: host the agreed calculator snapshot (draw / scheme / panels).
   * Thin chrome for hub/bind; tool UI is the original shell.
   */
  function toolsCalc() {
    const role = S().role || "—";
    const d = S().sessionDraft;
    const ready = d && (d.pmDone || d.calcDone) && !d.bound;
    const src = calcToolIframeSrc();
    return `
      <div class="tool-host" data-tool="calc" data-iframe-src="${esc(src)}">
        <header class="tool-chrome">
          <a class="tool-chrome__back" href="#/tools/hub">← Инстр.</a>
          <div class="tool-chrome__title">
            <strong>Калькулятор</strong>
            <span class="muted hide-narrow">роль ${esc(role)} · partner=1 · потолок</span>
          </div>
          <div class="tool-chrome__actions">
            <a class="btn sm ghost" href="#/tools/pm">PM</a>
            <a class="btn sm ${ready ? "primary" : "ghost"}" href="#/tools/bind" ${
              ready ? "" : 'aria-disabled="true"'
            }>${ready ? "Сохранить…" : "Bind после расчёта"}</a>
          </div>
        </header>
        <iframe class="tool-frame" title="Калькулятор MultiFRAME" src="${esc(src)}" allow="clipboard-write"></iframe>
      </div>`;
  }

  function bindFormFields(d, shellActive) {
    const role = S().role;
    const canWrite = MFStore.canWriteProjects(role);
    const canCreate = MFStore.canCreateProjects(role);
    if (d.personalSaved && !d.bound) {
      return shell(
        shellActive,
        `<div class="banner ok">Личный результат сохранён (${esc(d.personalResultId)}) · Project/Room не изменены (D5 §1.7)</div>
         <a class="btn primary" href="#/${role}/home">На home</a>
         <a class="btn" href="#/tools/hub">Инструменты</a>`
      );
    }
    if (d.bound) {
      return shell(
        shellActive,
        `<div class="banner ok">Сохранено (${esc(d.saveType || "—")}) → ${esc(d.projectId)} / ${esc(d.roomId)}</div>
         <a class="btn primary" href="#/${role === "sales" ? "sales/room/" + d.projectId + "/" + d.roomId : role + "/home"}">${
           role === "sales" ? "Открыть комнату" : "На home"
         }</a>`
      );
    }
    if (!canWrite) {
      return shell(
        shellActive,
        `
      <div class="page-head"><div><h1>Сохранение результата</h1>
        <p class="sub">Роль «${esc(role)}» · инструмент доступен · запись в Project/Room запрещена (D5 §1.7)</p></div></div>
      <div class="banner warn">
        GC6-P0-01: <strong>crew</strong> и <strong>admin</strong> могут пользоваться проблемомером/калькулятором, но не менять клиентские проекты и комнаты.
        Выберите личное сохранение — данные организации останутся неизменными.
      </div>
      <div class="panel">
        <p>В черновике: ${d.pmDone ? "профиль PM" : "—"} ${d.calcDone ? "· " + money(d.amount) + " · " + MFStore.draftAreaM2(d) + " м²" : ""}</p>
        <button class="btn primary" data-action="save-personal">Сохранить личный результат (не в проект)</button>
      </div>`
      );
    }
    const mode = S().ui.bindMode || "pick";
    const projects = S().projects.filter((p) => p.rooms && p.rooms.length);
    const saveTypeDefault = d.pmDone && d.calcDone ? "both" : d.calcDone ? "preliminary" : "profile";
    const selected = S().ui.bindSaveType || saveTypeDefault;
    const areaPrompt = S().ui.bindAreaPrompt;
    const pickPair = S().ui.bindPickPair || (projects[0] ? `${projects[0].id}::${projects[0].rooms[0].id}` : "");
    const cf = S().ui.bindCreateFields || {
      projectName: "Новый клиент · консультация",
      roomName: "Спальня",
      client: "",
    };
    const targetLabel = (() => {
      if (mode === "create") return `новый: ${cf.projectName} / ${cf.roomName}`;
      const [pid, rid] = (pickPair || "").split("::");
      const p = projects.find((x) => x.id === pid);
      const r = p?.rooms.find((x) => x.id === rid);
      return p && r ? `${p.name} → ${r.name}` : pickPair || "—";
    })();
    const previewFor = (st) => {
      if (st === "profile") return d.pmDone ? "только профиль PM (без preliminary)" : "—";
      if (st === "preliminary")
        return `${d.pmDone ? "профиль PM + " : ""}preliminary ${money(d.amount)} · ${MFStore.draftAreaM2(d)} м²`;
      if (st === "both") return `профиль PM + preliminary ${money(d.amount)} · ${MFStore.draftAreaM2(d)} м²`;
      return "—";
    };
    return shell(
      shellActive,
      `
      <div class="page-head"><div><h1>Куда сохранить?</h1><p class="sub">Bind при Save · роль ${esc(role)} · цель: <strong>${esc(
        targetLabel
      )}</strong></p></div></div>
      ${
        areaPrompt
          ? `<div class="banner warn"><strong>Площадь не совпадает</strong>: комната ${areaPrompt.roomArea} vs консультация ${areaPrompt.draftArea} м²
              <div class="row" style="margin-top:10px">
                <button class="btn primary" data-action="bind-resolve-area" data-resolution="adopt_consultation">Площадь консультации</button>
                <button class="btn" data-action="bind-resolve-area" data-resolution="keep_room_recalc">Площадь комнаты + пересчёт</button>
                <button class="btn ghost" data-action="bind-cancel-area">Отмена</button>
              </div></div>`
          : ""
      }
      <div class="tabs">
        <button class="tab ${mode==="pick"?"active":""}" data-action="bind-mode" data-mode="pick">Существующие</button>
        <button class="tab ${mode==="create"?"active":""}" data-action="bind-mode" data-mode="create" ${
          canCreate ? "" : "disabled"
        }>Создать</button>
      </div>
      <div class="panel">
        <div class="field"><label>Тип сохранения</label>
          <select id="bind-savetype" data-action="bind-savetype-change">
            <option value="profile" ${selected==="profile"?"selected":""} ${d.pmDone?"":"disabled"}>Только профиль PM</option>
            <option value="preliminary" ${selected==="preliminary"?"selected":""} ${d.calcDone?"":"disabled"}>Preliminary${d.pmDone?" (+профиль)":""}</option>
            <option value="both" ${selected==="both"?"selected":""} ${d.pmDone && d.calcDone?"":"disabled"}>Профиль + preliminary</option>
          </select>
        </div>
        ${
          mode === "pick"
            ? `<div class="field"><label>Проект + комната</label>
                <select id="bind-pair" data-action="bind-pair-change">${projects
                  .flatMap((p) =>
                    p.rooms.map(
                      (r) =>
                        `<option value="${p.id}::${r.id}" ${
                          pickPair === `${p.id}::${r.id}` ? "selected" : ""
                        }>${esc(p.name)} → ${esc(r.name)} (${r.areaM2} м²)</option>`
                    )
                  )
                  .join("")}</select></div>`
            : `<div class="field"><label>Проект</label><input id="bind-proj" data-action="bind-create-change" value="${esc(
                cf.projectName
              )}"></div>
               <div class="field"><label>Комната</label><input id="bind-room" data-action="bind-create-change" value="${esc(
                 cf.roomName
               )}"></div>
               <div class="field"><label>Клиент</label><input id="bind-client" data-action="bind-create-change" value="${esc(
                 cf.client
               )}"></div>`
        }
        <div class="banner info">Будет сохранено («${esc(selected)}») <strong>в ${esc(targetLabel)}</strong>: ${esc(
          previewFor(selected)
        )}</div>
        <button class="btn primary" data-action="do-bind" ${areaPrompt ? "disabled" : ""}>Сохранить в комнату</button>
      </div>`
    );
  }

  function toolsBind() {
    const d = S().sessionDraft;
    if (!d) return shell("tools/bind", `<div class="banner warn">Нет черновика</div>`);
    if (!d.pmDone && !d.calcDone) {
      return shell(
        "tools/bind",
        `<div class="banner warn">Нужен Result PM <em>или</em> calc.</div>
         <a class="btn" href="#/tools/pm">Проблемомер</a> <a class="btn" href="#/tools/calc">Калькулятор</a>`
      );
    }
    return bindFormFields(d, "tools/bind");
  }

  function shell(activeNav, body) {
    const loading = S().ui.loadingDemo
      ? `<div class="banner info">Demo loading…</div><div class="panel"><div class="skeleton"></div><div class="skeleton"></div></div>`
      : body;
    const preview = S().ui.quotePreview
      ? `<div class="modal-back" data-action="close-quote-preview"><div class="modal" onclick="event.stopPropagation()">
          <h3>${S().ui.quotePreview.mode === "pdf" ? "Макет PDF КП" : "Текст для копирования"}</h3>
          <p class="muted">lifecycle: ${esc(S().ui.quotePreview.lifecycle)} · это ≠ sent</p>
          <pre class="mono" style="white-space:pre-wrap;background:var(--bg1);padding:10px;border-radius:8px;max-height:240px;overflow:auto">${esc(
            S().ui.quotePreview.text
          )}</pre>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" data-action="clipboard-quote">Копировать в буфер</button>
            <button class="btn" data-action="download-quote-pdf">Скачать .txt макет</button>
            <button class="btn ghost" data-action="close-quote-preview">Закрыть</button>
          </div>
        </div></div>`
      : "";
    const cred = S().ui.oneTimeCred
      ? `<div class="modal-back"><div class="modal">
          <h3>Одноразовый пароль</h3>
          <p>Покажется <strong>один раз</strong>.</p>
          <p class="mono">${esc(S().ui.oneTimeCred.name)} · <strong>${esc(S().ui.oneTimeCred.password)}</strong></p>
          <button class="btn primary" data-action="dismiss-cred">Скопировал — скрыть</button>
        </div></div>`
      : "";
    return `${chrome()}<div class="shell">${nav(activeNav)}<main class="workspace">${loading}</main></div>
      ${preview}${cred}
      <div class="toast-host" id="toasts"></div>`;
  }

  /* ---------- SALES ---------- */
  function salesHome() {
    const st = S();
    const paused = st.deals.filter((d) => d.outcome === "early_paused");
    const active = st.deals.filter((d) => d.active && !d.paused);
    return shell(
      "sales/home",
      `
      <div class="page-head">
        <div>
          <h1>Сегодня</h1>
          <p class="sub">Что сделать по сделкам сегодня. Один фокус — без кучи панелей.</p>
        </div>
        <div class="page-actions">
          <a class="btn" href="#/sales/inquiry">Новый проект</a>
          <a class="btn primary" href="#/sales/quick">Быстрый расчёт</a>
        </div>
      </div>
      <div class="tabs" role="tablist">
        <button class="tab active" data-tab="inbox">Входящие</button>
        <button class="tab" data-action="goto" data-href="#/sales/projects">Все проекты</button>
      </div>
      <div class="panel">
        <h2>Требуют действия</h2>
        <ul class="list">
          ${active
            .map((d) => {
              const p = MFStore.project(d.projectId);
              return `<li class="list-item" data-action="goto" data-href="#/sales/project/${d.projectId}?tab=deal">
                <div>
                  <div class="title">${esc(p.name)}</div>
                  <div class="meta">Сделка ${esc(d.dealId)} · этап «${esc(stageLabel(d.stage))}»</div>
                </div>
                <div class="aside">Открыть сделку</div>
              </li>`;
            })
            .join("")}
          ${paused
            .map((d) => {
              const p = MFStore.project(d.projectId);
              return `<li class="list-item" data-action="goto" data-href="#/sales/project/${d.projectId}?tab=deal">
                <div>
                  <div class="title">⏸ Пауза · ${esc(p.name)}</div>
                  <div class="meta">${esc(d.lossReason)} · возобновить на этапе «${esc(stageLabel(d.stageAtOutcome))}»</div>
                </div>
                <div class="aside"><span class="pill warn">early_paused</span></div>
              </li>`;
            })
            .join("")}
        </ul>
      </div>`
    );
  }

  function salesInquiry() {
    return shell(
      "sales/home",
      `
      <div class="page-head">
        <div>
          <h1>Новый проект</h1>
          <p class="sub">Сразу: проект, первая комната и активная сделка (Deal). Полную карточку клиента не заполняем.</p>
        </div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/home">Назад</a></div>
      </div>
      <div class="panel" style="max-width:480px">
        <div class="field"><label>Клиент</label><input id="inq-client" placeholder="ФИО или название" value="Елена Крылова"></div>
        <div class="field"><label>Адрес / ориентир</label><input id="inq-addr" placeholder="Улица, дом" value="ул. Лесная 5"></div>
        <div class="field"><label>Первая комната</label><input id="inq-room" value="Кухня"></div>
        <div class="field"><label>Площадь, м²</label><input id="inq-area" type="number" value="11.5"></div>
        <button class="btn primary" data-action="create-inquiry">Создать проект</button>
        <p class="muted" style="margin-top:10px;font-size:.85rem">При офлайне создание блокируется (анти-дубликат).</p>
      </div>`
    );
  }

  function salesQuick() {
    const d = S().sessionDraft;
    if (!d) {
      return shell(
        "sales/quick",
        `
      <div class="page-head">
        <div>
          <h1>Быстрая консультация</h1>
          <p class="sub">Выберите тип клиента, затем анкета проблемомера. Жалобу на шум не подставляем заранее.</p>
        </div>
      </div>
      <div class="grid-2">
        <button class="panel" style="text-align:left;cursor:pointer" data-action="start-quick" data-persona="quiet">
          <h3>Клиент A · без жалобы на шум</h3>
          <p class="muted">Пришёл за натяжным «побыстрее». Про звукоизоляцию ещё не думал.</p>
        </button>
        <button class="panel" style="text-align:left;cursor:pointer" data-action="start-quick" data-persona="noise">
          <h3>Клиент B · слышит соседей</h3>
          <p class="muted">Есть сигнал о шуме — результат анкеты будет другим.</p>
        </button>
      </div>
      <button class="btn" style="margin-top:12px" data-action="start-quick" data-persona="">Нейтральный старт</button>`
      );
    }
    return shell(
      "sales/quick",
      `
      <div class="page-head">
        <div>
          <h1>Консультация</h1>
          <p class="sub mono">consultationSessionId: ${esc(d.consultationSessionId)}</p>
        </div>
        <div class="page-actions">
          ${d.bound ? `<a class="btn primary" href="#/sales/project/${d.projectId}">К проекту</a>` : ""}
          <button class="btn ghost" data-action="abandon-quick">Сбросить черновик</button>
        </div>
      </div>
      <div class="seg-bar">
        <button class="active">Сессия</button>
        <button data-action="goto" data-href="#/sales/pm-quick">Проблемомер</button>
        <button data-action="goto" data-href="#/sales/calc-quick">Калькулятор</button>
        <button data-action="goto" data-href="#/sales/bind">Сохранить</button>
      </div>
      <div class="panel">
        <div class="row">
          <span class="pill ${d.pmDone ? "ok" : ""}">PM ${d.pmDone ? "готов · " + esc(d.pmResult?.clientPersona || "") : "не пройден"}</span>
          <span class="pill ${d.calcDone ? "ok" : ""}">Calc ${d.calcDone ? money(d.amount) : "опционально"}</span>
          <span class="pill ${d.bound ? "ok" : "warn"}">${d.bound ? "Привязан" : "Не сохранён"}</span>
        </div>
        <p class="muted" style="margin-top:10px">Можно сохранить <strong>только профиль PM</strong> без calc (GC-P0-02).</p>
        ${
          d.multiframeOffered
            ? `<div class="banner ok">multiframe_offered → <span class="mono">${esc(
                d.consultationSessionId
              )}</span> · без dealId</div>`
            : `<button class="btn" data-action="offer-mf">Зафиксировать: предложили MultiFrame</button>`
        }
      </div>`
    );
  }

  function salesPmQuick() {
    const d = S().sessionDraft;
    if (!d) return salesQuick();
    const a = d.answers || {};
    if (d.pmDone && d.pmResult && S().ui.pmStep === "result") {
      const r = d.pmResult;
      const ch = r.chain;
      return shell(
        "sales/quick",
        `
      <div class="page-head">
        <div><h1>Result · проблемомер</h1><p class="sub">Цепочка: нормы → сейчас → MultiFrame → разница → next step. Без гарантии дБ.</p></div>
        <div class="page-actions"><button class="btn ghost" data-action="pm-resuvey">Изменить ответы</button></div>
      </div>
      <div class="panel stack-gap">
        <div class="banner info"><strong>Пресет:</strong> натяжной потолок (stretch) · площадь ${r.areaM2} м² · persona «${esc(r.clientPersona)}»</div>
        <ol class="list">
          <li class="list-item"><div><div class="title">1. Нормы / ориентир</div><div class="meta">${esc(ch.norms)}</div></div></li>
          <li class="list-item"><div><div class="title">2. Сейчас</div><div class="meta">${esc(ch.current)}</div></div></li>
          <li class="list-item"><div><div class="title">3. С MultiFrame</div><div class="meta">${esc(ch.withMf)}</div></div></li>
          <li class="list-item"><div><div class="title">4. Разница</div><div class="meta">${esc(ch.difference)}</div></div></li>
          <li class="list-item"><div><div class="title">5. Следующий шаг</div><div class="meta">${esc(ch.nextStep)}</div></div></li>
        </ol>
        <p>${esc(r.narrative)}</p>
        <p class="dim">Иллюстрация по анкете · не измерение · guaranteedDb=${r.guaranteedDb} · риск «${esc(
          r.currentRisk || "—"
        )}»</p>
        <div class="row">
          <a class="btn primary" href="#/sales/bind">Сохранить профиль (PM-only OK)</a>
          <a class="btn" href="#/sales/calc-quick">К калькулятору</a>
        </div>
      </div>`
      );
    }
    return shell(
      "sales/quick",
      `
      <div class="page-head">
        <div><h1>Анкета комнаты</h1><p class="sub">Короткий опрос. Жалоба на шум необязательна (P1 D6).</p></div>
      </div>
      <div class="panel" style="max-width:520px">
        <div class="field"><label>Тип комнаты</label>
          <select id="pm-room">
            <option value="bedroom" ${a.roomType==="bedroom"?"selected":""}>Спальня</option>
            <option value="living" ${a.roomType==="living"?"selected":""}>Гостиная</option>
            <option value="kids" ${a.roomType==="kids"?"selected":""}>Детская</option>
            <option value="kitchen" ${a.roomType==="kitchen"?"selected":""}>Кухня</option>
          </select>
        </div>
        <div class="field"><label>Площадь, м²</label><input id="pm-area" type="number" value="${a.areaM2 ?? 14}"></div>
        <div class="field"><label>Соседи сверху</label>
          <select id="pm-neighbors">
            <option value="unknown" ${a.neighbors==="unknown"?"selected":""}>Не знаю / не спрашивали</option>
            <option value="none" ${a.neighbors==="none"?"selected":""}>Нет / не беспокоят</option>
            <option value="above" ${a.neighbors==="above"?"selected":""}>Есть, слышны</option>
          </select>
        </div>
        <div class="field"><label>Осведомлённость о шуме</label>
          <select id="pm-noise">
            <option value="unknown" ${a.noiseAwareness==="unknown"?"selected":""}>Не поднимали тему</option>
            <option value="none" ${a.noiseAwareness==="none"?"selected":""}>Клиент не жалуется</option>
            <option value="bothered" ${a.noiseAwareness==="bothered"?"selected":""}>Беспокоит шум</option>
          </select>
        </div>
        <div class="field"><label>Цель использования</label>
          <select id="pm-purpose">
            <option value="living" ${a.purpose==="living"?"selected":""}>Жилая</option>
            <option value="sleep" ${a.purpose==="sleep"?"selected":""}>Сон / тишина</option>
            <option value="work" ${a.purpose==="work"?"selected":""}>Кабинет</option>
          </select>
        </div>
        <button class="btn primary" data-action="pm-run">Показать Result</button>
      </div>`
    );
  }

  function salesCalcQuick() {
    const d = S().sessionDraft;
    if (!d) return salesQuick();
    // GC2-P0-01: area from answers/pmResult (not stale d.areaM2)
    const area = MFStore.draftAreaM2(d);
    const estimate = Math.round(
      area * (d.segment === "premium" ? 4200 : d.segment === "comfort" ? 3400 : 2800)
    );
    return shell(
      "sales/quick",
      `
      <div class="page-head">
        <div><h1>Калькулятор · предварительный</h1><p class="sub">Ориентир, не смета монтажа. Save без bind запрещён. Площадь из анкеты PM.</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/quick">К консультации</a></div>
      </div>
      <div class="panel">
        <div class="stat"><div class="n">${money(estimate)}</div><div class="l">Ориентир по ${area} м² · ${esc(d.segment)}</div></div>
        <p class="muted" style="margin-top:12px">Включает полотно, профиль, каркас MultiFrame (пресет). Источник площади: answers.areaM2=${esc(
          String(d.answers?.areaM2 ?? "—")
        )}.</p>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-action="calc-done" data-amount="${estimate}" data-area="${area}">Сохранить ориентир в черновик</button>
          <a class="btn" href="#/sales/bind">К привязке →</a>
        </div>
      </div>`
    );
  }

  function salesBind() {
    const d = S().sessionDraft;
    if (!d) return salesQuick();
    if (!d.pmDone && !d.calcDone) {
      return shell(
        "sales/quick",
        `<div class="banner warn">Нужен хотя бы Result PM <em>или</em> calc — сохранять нечего.</div>
         <a class="btn primary" href="#/sales/pm-quick">К проблемомеру</a>`
      );
    }
    return bindFormFields(d, "sales/quick");
  }

  function salesProjects() {
    const projects = S().projects.filter((p) => !p.emptyDemo || p.rooms.length);
    return shell(
      "sales/projects",
      `
      <div class="page-head">
        <div><h1>Проекты</h1><p class="sub">Каталог · не ObjectsPanel + Commercial на одном экране.</p></div>
        <div class="page-actions"><a class="btn primary" href="#/sales/inquiry">Новый</a></div>
      </div>
      <ul class="list panel">
        ${projects
          .map((p) => {
            const d = MFStore.activeDeal(p.id);
            return `<li class="list-item" data-action="goto" data-href="#/sales/project/${p.id}">
              <div>
                <div class="title">${esc(p.name)}</div>
                <div class="meta">${esc(p.client)} · ${p.rooms.length} комн. · ${esc(p.phase)}</div>
              </div>
              <div class="aside">${d ? stageLabel(d.stage) : "нет Deal"}${d && d.paused ? " · пауза" : ""}</div>
            </li>`;
          })
          .join("")}
      </ul>`
    );
  }

  function salesProject(projectId, tab) {
    const p = MFStore.project(projectId);
    if (!p) return shell("sales/projects", `<div class="empty"><strong>Проект не найден</strong></div>`);
    const deal = MFStore.activeDeal(projectId);
    const t = tab || S().ui.projectTab || "rooms";
    let body = "";
    if (t === "rooms") {
      body = `
        <ul class="list">
          ${p.rooms
            .map(
              (r) => `<li class="list-item" data-action="goto" data-href="#/sales/room/${p.id}/${r.id}">
              <div>
                <div class="title">${esc(r.name)} · ${r.areaM2} м²</div>
                <div class="meta">
                  ${r.preliminary ? `Prelim ${money(r.preliminary.amount)}` : "нет prelim"}
                  ${r.detailed ? ` · Detailed ${money(r.detailed.amount)}` : ""}
                  ${r.techReady ? " · tech-ready" : ""}
                </div>
              </div>
              <div class="aside">${esc(r.status)}</div>
            </li>`
            )
            .join("")}
          ${!p.rooms.length ? `<li class="empty">Нет комнат</li>` : ""}
        </ul>`;
    } else if (t === "deal") {
      body = renderDealPanel(deal, p);
    } else {
      body = `<p class="muted">Итог проекта (анти-двойной учёт): сумма по комнатам без дублирования quote+room.</p>
        <div class="stat"><div class="n">${money(
          p.rooms.reduce((s, r) => s + (r.detailed?.amount || r.preliminary?.amount || 0), 0)
        )}</div><div class="l">Ориентир по открытым комнатам</div></div>`;
    }
    return shell(
      "sales/projects",
      `
      <div class="page-head">
        <div>
          <h1>${esc(p.name)}</h1>
          <p class="sub">${esc(p.client)} · ${esc(p.address || "адрес уточняется")}</p>
        </div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/projects">К списку</a></div>
      </div>
      <div class="tabs">
        <a class="tab ${t === "rooms" ? "active" : ""}" href="#/sales/project/${p.id}?tab=rooms">Комнаты</a>
        <a class="tab ${t === "deal" ? "active" : ""}" href="#/sales/project/${p.id}?tab=deal">Сделка / КП</a>
        <a class="tab ${t === "summary" ? "active" : ""}" href="#/sales/project/${p.id}?tab=summary">Итог</a>
      </div>
      <div class="panel">${body}</div>`
    );
  }

  function renderDealPanel(deal, p) {
    if (!deal) return `<div class="empty"><strong>Нет активной Deal</strong></div>`;
    const quotes = MFStore.quotesForDeal(deal.dealId);
    const sheet = S().ui.dealSheet;
    const closedDeals = S().deals.filter((d) => d.projectId === p.id && !d.active);
    const assentQ = MFStore.quoteForAssent(deal.dealId);
    const outOfQuote = MFStore.outOfQuoteCalculatedRooms(deal.dealId);
    return `
      <div class="row" style="margin-bottom:12px">
        <span class="pill info">dealId ${esc(deal.dealId)}</span>
        <span class="pill">этап «${esc(stageLabel(deal.stage))}»</span>
        ${deal.paused ? `<span class="pill warn">Пауза · resume → ${esc(stageLabel(deal.stageAtOutcome))}</span>` : ""}
        ${deal.outcome && !deal.paused ? `<span class="pill">${esc(deal.outcome)}</span>` : ""}
        ${deal.acceptedAmount != null ? `<span class="pill ok">accepted ${money(deal.acceptedAmount)}</span>` : ""}
      </div>
      ${
        assentQ
          ? `<div class="banner info">Assent scope = Quote ${esc(assentQ.revisionId)} (${esc(
              assentQ.lifecycle
            )}): ${(assentQ.rooms || []).map((id) => esc(id)).join(", ") || "—"}. GC3-P0-02: рассчитанные вне КП не в sheet.</div>`
          : `<div class="banner warn">Нет sent/sent_confirmed Quote — согласие по комнатам недоступно.</div>`
      }
      ${
        outOfQuote.length
          ? `<div class="banner warn">Вне scope КП (не в assent): ${outOfQuote
              .map((r) => esc(r.name))
              .join(", ")}</div>`
          : ""
      }
      ${
        deal.paused
          ? `<div class="banner warn">Сделка на паузе. <button class="btn primary sm" data-action="resume-deal" data-deal="${deal.dealId}">Возобновить на «${esc(
              stageLabel(deal.stageAtOutcome)
            )}»</button></div>`
          : ""
      }
      <h3>КП этой Deal</h3>
      ${
        !quotes.length
          ? `<div class="empty"><button class="btn primary" data-action="create-quote" data-deal="${deal.dealId}" ${
              deal.paused ? "disabled" : ""
            }>Создать КП</button></div>`
          : quotes
              .map(
                (q) => `
            <div class="panel" style="margin-top:8px;background:var(--bg1)">
              <div class="row">
                <strong>${esc(q.label)}</strong>
                <span class="pill ${q.lifecycle === "sent_confirmed" ? "ok" : ""}">${esc(q.lifecycle)}</span>
                <span class="muted">${money(q.amount)}</span>
              </div>
              <div class="row" style="margin-top:10px">
                <button class="btn sm" data-action="quote-copy" data-qid="${q.revisionId}">Копировать</button>
                <button class="btn sm" data-action="quote-pdf" data-qid="${q.revisionId}">PDF макет</button>
                <button class="btn sm primary" data-action="quote-confirm" data-qid="${q.revisionId}" ${
                  q.lifecycle === "sent_confirmed" || deal.paused ? "disabled" : ""
                }>Подтвердить отправку</button>
              </div>
              <p class="dim" style="margin:8px 0 0;font-size:.8rem">Copy/PDF открывают превью · ≠ sent_confirmed</p>
            </div>`
              )
              .join("")
      }
      <h3 style="margin-top:18px">Согласие по комнатам (roomAssent)</h3>
      <ul class="list">
        ${p.rooms
          .map(
            (r) => `<li class="list-item"><div class="title">${esc(r.name)}</div>
            <div class="aside"><span class="pill">${esc(r.roomAssent || "—")}</span>
            ${money(r.detailed?.amount || r.preliminary?.amount)}</div></li>`
          )
          .join("")}
      </ul>
      ${
        !deal.paused && deal.active && deal.outcome !== "accepted"
          ? `<h3 style="margin-top:18px">Исход</h3>
        <div class="row">
          <button class="btn ok" data-action="open-accept" data-deal="${deal.dealId}">Принято (sheet assent)</button>
          <button class="btn" data-action="open-pause" data-deal="${deal.dealId}">Пауза</button>
          <button class="btn danger" data-action="open-decline" data-deal="${deal.dealId}">Отказ</button>
        </div>
        <p class="dim" style="font-size:.8rem">GC-P0-03: не auto-order из calc. Нужен sheet ordered/deferred/out_of_scope.</p>`
          : ""
      }
      ${
        (() => {
          if (!(deal.outcome === "accepted" && deal.active)) return "";
          const unfinished = p.rooms.filter(
            (r) => r.roomAssent === "ordered" && r.status !== "closed"
          );
          // GC2-P0-02 / A-06
          return `<div class="banner ok">Accepted · сумма по ordered: ${money(deal.acceptedAmount)}
             ${
               unfinished.length
                 ? `<p style="margin:8px 0 0">Закрытие Deal запрещено (A-06), пока не закрыт монтаж ordered:
                    ${unfinished.map((r) => `<span class="pill warn">${esc(r.name)} · ${esc(r.status || "open")}</span>`).join(" ")}</p>
                    <div class="row" style="margin-top:8px">
                      <button class="btn" disabled title="Сначала закройте монтаж ordered комнат">Закрыть Deal (blocked)</button>
                    </div>`
                 : `<div class="row" style="margin-top:8px">
                      <button class="btn" data-action="close-accepted" data-deal="${deal.dealId}">Закрыть Deal (все ordered closed)</button>
                    </div>`
             }</div>`;
        })()
      }
      ${
        !deal.active
          ? ""
          : ""
      }
      ${
        closedDeals.length && !S().deals.some((d) => d.projectId === p.id && d.active)
          ? `<button class="btn primary" data-action="sequential-deal" data-pid="${p.id}">Создать следующую Deal (новый dealId)</button>`
          : !MFStore.activeDeal(p.id) && closedDeals.length
          ? `<button class="btn primary" data-action="sequential-deal" data-pid="${p.id}">Создать следующую Deal</button>`
          : ""
      }
      <div id="deal-sheet">${sheet === "accept" ? "" : ""}</div>`;
  }

  function salesRoom(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    if (!p || !r) return shell("sales/projects", `<div class="empty">Комната не найдена</div>`);
    const ap = r.acousticProfile;
    const prelimArea = r.preliminary?.areaM2 ?? r.areaM2;
    return shell(
      "sales/projects",
      `
      <div class="page-head">
        <div>
          <h1>${esc(r.name)}</h1>
          <p class="sub">${esc(p.name)} · ${r.areaM2} м²${
            r.preliminary?.areaM2 != null && Math.abs(r.preliminary.areaM2 - r.areaM2) > 0.05
              ? ` · prelim ${r.preliminary.areaM2} м²`
              : ""
          }</p>
        </div>
        <div class="page-actions">
          <a class="btn ghost" href="#/sales/project/${p.id}">К проекту</a>
          <a class="btn" href="#/sales/calc/${p.id}/${r.id}?kind=preliminary">Preliminary</a>
          <a class="btn primary" href="#/sales/project/${p.id}?tab=deal">К сделке</a>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <h3>Расчёты</h3>
          <p>Prelim: <strong>${
            r.preliminary
              ? money(r.preliminary.amount) +
                " · " +
                (r.preliminary.areaM2 ?? prelimArea) +
                " м² · " +
                esc(r.preliminary.segment || "—")
              : "—"
          }</strong></p>
          <p>Detailed: <strong>${r.detailed ? money(r.detailed.amount) : "—"}</strong></p>
        </div>
        <div class="panel">
          <h3>Готовность</h3>
          <p>Assent: ${esc(r.roomAssent || "—")}</p>
          <p>Tech-ready: ${r.techReady ? "да" : "нет"}</p>
        </div>
      </div>
      <div class="panel" style="margin-top:12px">
        <h3>Акустический профиль PM ${ap ? `<span class="pill ok">сохранён</span>` : `<span class="pill">нет</span>`}</h3>
        ${
          ap
            ? `<p class="muted">persona «${esc(ap.clientPersona || "—")}» · риск «${esc(
                ap.currentRisk || "—"
              )}» · ${ap.areaM2 ?? "—"} м² · ${esc(ap.savedAt || "")}</p>
               <p>${esc(ap.narrative || "")}</p>
               <details open>
                 <summary>Открыть Result (без нового опроса)</summary>
                 <ol class="list" style="margin-top:8px">
                   <li class="list-item"><div class="meta">${esc(ap.chain?.norms || "")}</div></li>
                   <li class="list-item"><div class="meta">${esc(ap.chain?.current || "")}</div></li>
                   <li class="list-item"><div class="meta">${esc(ap.chain?.withMf || "")}</div></li>
                   <li class="list-item"><div class="meta">${esc(ap.chain?.difference || "")}</div></li>
                   <li class="list-item"><div class="meta">${esc(ap.chain?.nextStep || "")}</div></li>
                 </ol>
               </details>`
            : `<p class="muted">Профиль ещё не сохраняли в эту комнату.</p>`
        }
      </div>`
    );
  }

  function salesCalc(projectId, roomId, kind) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    const k = kind || "preliminary";
    // GC3-P0-01: reopen uses saved prelim identity, not a silent recompute from stale room.areaM2
    const saved = k === "preliminary" ? r.preliminary : r.detailed;
    const area =
      saved?.areaM2 != null
        ? Number(saved.areaM2)
        : Number(r.areaM2) || 0;
    const amount =
      saved?.amount != null
        ? Number(saved.amount)
        : Math.round(area * (k === "detailed" ? 3600 : 3400));
    const recomputed = Math.round(area * (k === "detailed" ? 3600 : 3400));
    return shell(
      "sales/projects",
      `
      <div class="page-head">
        <div><h1>Калькулятор · ${k}</h1><p class="sub">${esc(p.name)} / ${esc(r.name)}</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/room/${p.id}/${r.id}">Назад</a></div>
      </div>
      ${
        saved
          ? `<div class="banner ok">Сохранённый ${k}: <strong>${money(saved.amount)}</strong> · ${
              saved.areaM2 ?? area
            } м² · ${esc(saved.segment || "comfort")} · ${esc(saved.revisionId || "")}. Повторное сохранение не меняет площадь/сумму молча.</div>`
          : ""
      }
      <div class="panel">
        <div class="stat"><div class="n">${money(amount)}</div><div class="l">${k} · ${area} м²</div></div>
        <p class="muted" style="margin-top:8px">Ориентир пересчёта по той же площади: ${money(recomputed)} (не подменяет сохранённое без явного Save).</p>
        <button class="btn primary" style="margin-top:14px" data-action="save-room-calc"
          data-pid="${p.id}" data-rid="${r.id}" data-kind="${k}" data-amount="${amount}" data-area="${area}">
          Сохранить в комнату (сохранить ${area} м² / ${money(amount)})
        </button>
      </div>`
    );
  }

  function salesAnalytics() {
    return shell(
      "sales/analytics",
      `
      <div class="page-head"><div><h1>Аналитика продаж</h1><p class="sub">Только воронка сделок (Deal). Тренировки — в Академии, сюда не попадают.</p></div></div>
      <div class="grid-3">
        <div class="stat"><div class="n">7</div><div class="l">accepted (месяц)</div></div>
        <div class="stat"><div class="n">5</div><div class="l">early_declined</div></div>
        <div class="stat"><div class="n">3</div><div class="l">early_paused (не lost)</div></div>
      </div>
      <div class="banner info" style="margin-top:14px">Попытки из Академии здесь не считаются — они отдельно от воронки.</div>`
    );
  }

  /* ---------- ACADEMY Anna ---------- */
  const ANNA = {
    N0: {
      npc: "Здравствуйте, нужен натяжной в спальню, хочется побыстрее.",
      choices: [
        { id: "P0a", text: "Отлично — сразу MultiFrame, без него у вас будет шумно.", next: "PushyN1" },
        { id: "P0b", text: "Расскажите про комнату: соседи сверху есть? Что беспокоит кроме вида?", next: "N1" },
        { id: "P0c", text: "Полотно от 400 ₽/м². Что ещё интересует по цене?", next: "PriceTrap" },
      ],
    },
    PriceTrap: {
      npc: "Цену полотна поняла. А зачем вы про что-то ещё?",
      choices: [
        { id: "PTfix", text: "Сначала про комнату: шум, соседи, что важно. Потом соберу состав и цены.", next: "N1" },
        { id: "PTbad", text: "Берите сразу пакет с MultiFrame — иначе потом переплатите.", next: "PushyN1" },
      ],
    },
    N1: {
      npc: "Соседи иногда слышны, но я за красотой пришла.",
      choices: [
        { id: "P1a", text: "Под полотном можно поставить каркас MultiFrame. Коротко покажу, зачем он вам — без покупки сейчас.", next: "N2" },
        { id: "P1b", text: "Гарантируем −35 дБ и полную тишину.", next: "FailFast" },
        { id: "P1c", text: "Это Rw/DnT,w по ISO, демпфер, развязка по периметру…", next: "N2b" },
      ],
    },
    N2b: {
      npc: "Я ничего не поняла. Это мне точно нужно?",
      choices: [
        { id: "P2b_fix", text: "Проще: каркас под полотном снижает ударный шум соседей. Могу показать профиль и дать ориентир по площади.", next: "N2" },
        { id: "P2b_bad", text: "Если не разберётесь в терминах — не наш клиент.", next: "PoorEnd" },
      ],
    },
    PushyN1: {
      npc: "Вы сразу продаёте допы. Мне просто потолок.",
      choices: [
        { id: "PPu_fix", text: "Извините за напор. Давайте сначала про комнату и ваши ожидания.", next: "N1" },
        { id: "PPu_bad", text: "Без MultiFrame смысла нет — решайте сегодня.", next: "PoorEnd" },
      ],
    },
    N2: {
      npc: "И что дальше, если мне это подойдёт?",
      choices: [
        { id: "P2a", text: "Могу открыть проблемомер и дать ориентир по площади — без обязательства покупать.", next: "OfferOk" },
        { id: "P2b", text: "Решать надо сегодня, иначе цена вырастет.", next: "PressureEnd" },
        { id: "P2c", text: "Ну ок, думайте сами.", next: "IncompleteEnd" },
      ],
    },
    OfferOk: { end: true },
    FailFast: { end: true },
    PoorEnd: { end: true },
    PressureEnd: { end: true },
    IncompleteEnd: { end: true },
  };

  function salesAcademy() {
    const ui = S().ui;
    if (ui.academyDone && ui.academyScore) {
      const e = ui.academyScore;
      return shell(
        "sales/academy-hub",
        `
        <div class="page-head"><div><h1>Разбор</h1><p class="sub">Тренировка · на воронку сделок (Deal) не влияет</p></div></div>
        <div class="panel">
          <div class="stat"><div class="n">${e.score}</div><div class="l">${esc(e.title)} · ветка ${esc(e.path)}</div></div>
          <ul>${(e.feedback || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
          ${e.nextJob ? `<div class="banner ok" style="margin-top:12px"><strong>На объекте дальше:</strong> ${esc(e.nextJob)}</div>` : ""}
          <div class="row" style="margin-top:14px">
            <button class="btn primary" data-action="academy-reset">Ещё раз</button>
            <a class="btn" href="#/sales/academy-hub">К тренажёрам</a>
            <a class="btn ghost" href="#/sales/analytics">К аналитике сделок</a>
          </div>
        </div>`
      );
    }
    const nodeId = ui.academyNode || "N0";
    const node = ANNA[nodeId];
    if (node.end) {
      // scoring happens in action handler
      return shell("sales/academy-hub", `<div class="skeleton"></div>`);
    }
    const path = ui.academyPath || [];
    return shell(
      "sales/academy-hub",
      `
      <div class="page-head">
        <div>
          <h1>Анна · спальня</h1>
          <p class="sub">Цель: понять задачу комнаты и предложить MultiFrame без давления. Тренировка — на сделки не влияет.</p>
        </div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/academy-hub">К списку</a></div>
      </div>
      <div class="panel">
        <div class="chat">
          ${path
            .map(
              (step) => `
            <div class="bubble npc">${esc(ANNA[step.node].npc)}</div>
            <div class="bubble me">${esc(step.text)}</div>`
            )
            .join("")}
          <div class="bubble npc">${esc(node.npc)}</div>
        </div>
        <div class="choices">
          ${node.choices
            .map(
              (c) =>
                `<button class="btn" data-action="academy-choice" data-next="${c.next}" data-cid="${c.id}" data-text="${esc(
                  c.text
                )}" data-node="${nodeId}">${esc(c.text)}</button>`
            )
            .join("")}
        </div>
      </div>`
    );
  }

  function salesAcademyHub() {
    return shell(
      "sales/academy-hub",
      `
      <div class="page-head"><div><h1>Академия</h1><p class="sub">Тренировки для смены — на воронку сделок не влияют</p></div></div>
      <div class="grid-2">
        <button class="panel" style="text-align:left;cursor:pointer" data-action="goto" data-href="#/sales/academy">
          <h3>Предложить MultiFrame</h3>
          <p class="muted">Диалог с Анной · как завести разговор про каркас</p>
          <span class="pill info">Начать</span>
        </button>
        <div class="panel">
          <h3>Возражения</h3>
          <p class="muted">Диалог · скоро в прототипе</p>
          <span class="pill">Скоро</span>
        </div>
        <div class="panel">
          <h3>Практика расчёта</h3>
          <p class="muted">Песочница калькулятора · скоро</p>
          <span class="pill">Скоро</span>
        </div>
        <div class="panel">
          <h3>Узлы монтажа</h3>
          <p class="muted">Чек-лист на объекте · скоро</p>
          <span class="pill">Скоро</span>
        </div>
      </div>`
    );
  }

  /* ---------- MEASURER ---------- */
  function measurerHome() {
    const items = MFStore.measurerInbox();
    return shell(
      "measurer/home",
      `
      <div class="page-head">
        <div><h1>Мои замеры</h1><p class="sub">Назначенные комнаты без detailed — ≤2 перехода до комнаты.</p></div>
      </div>
      <ul class="list panel">
        ${
          items.length
            ? items
                .map(
                  ({ project: p, room: r }) => `
          <li class="list-item" data-action="goto" data-href="#/measurer/room/${p.id}/${r.id}">
            <div>
              <div class="title">${esc(r.name)}</div>
              <div class="meta">${esc(p.name)} · ${r.areaM2} м² · ${
                    r.preliminary ? "есть prelim" : "без prelim"
                  }</div>
            </div>
            <div class="aside">Открыть</div>
          </li>`
                )
                .join("")
            : `<li class="empty"><strong>Пусто</strong><p>Нет назначенных замеров.</p></li>`
        }
      </ul>`
    );
  }

  function measurerProjects() {
    return shell(
      "measurer/projects",
      `<div class="page-head"><div><h1>Проекты</h1><p class="sub">Только свои назначения</p></div></div>
       <p class="muted">Используйте «Мои замеры» — это короткий путь.</p>
       <a class="btn primary" href="#/measurer/home">К замерам</a>`
    );
  }

  function measurerRoom(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    return shell(
      "measurer/home",
      `
      <div class="page-head">
        <div><h1>${esc(r.name)}</h1><p class="sub">${esc(p.name)}</p></div>
        <div class="page-actions">
          <a class="btn ghost" href="#/measurer/home">Назад</a>
          <a class="btn primary" href="#/measurer/calc/${p.id}/${r.id}">Detailed calc</a>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <h3>Расчёты</h3>
          <p>Prelim: <strong>${r.preliminary ? money(r.preliminary.amount) : "—"}</strong></p>
          <p>Detailed: <strong>${r.detailed ? money(r.detailed.amount) + " · " + r.detailed.revisionId : "нет"}</strong></p>
          ${
            r.preliminary && r.detailed
              ? `<div class="banner info">prelim ≠ detailed · в сумме coalesce берёт detailed</div>`
              : ""
          }
        </div>
        <div class="panel">
          <h3>Схема / BOM</h3>
          ${
            r.scheme
              ? `<p>Схема: <strong>${esc(r.scheme.label)}</strong> · ${r.scheme.panels} панелей</p>
                 <div class="scheme-box" style="height:100px"><div class="panel-rect" style="left:12%;top:20%;width:65%;height:55%">saved</div></div>
                 <ul>${(r.bom || [])
                   .map((b) => `<li class="muted">${esc(b.name)}: ${b.qty} ${esc(b.unit)}</li>`)
                   .join("")}</ul>`
              : `<p class="muted">Схема ещё не сохранена</p>`
          }
        </div>
      </div>`
    );
  }

  function measurerCalc(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    const L = r.lengthM || 4;
    const W = r.widthM || 3;
    const cut = r.geometry?.cutouts || 0;
    const bom =
      r.bom ||
      [
        { sku: "MF-PROF-3", name: "Профиль MultiFrame 3м", qty: 8, unit: "шт" },
        { sku: "CANVAS-W", name: "Полотно белое", qty: Math.ceil(L * W), unit: "м²" },
        { sku: "CLIP-50", name: "Клипсы", qty: 40, unit: "шт" },
      ];
    const conflict =
      S().pendingConflicts?.[roomId] ||
      (S().ui.conflictDemo?.roomId === roomId ? S().ui.conflictDemo : null);
    const prefill = conflict?.retryPrefill;
    const showL = prefill?.lengthM ?? L;
    const showW = prefill?.widthM ?? W;
    const showCut = prefill?.cutouts ?? cut;
    const showSch = prefill?.schemeLabel || `Схема ${r.name}`;
    const showBom = prefill?.bom || bom;
    return shell(
      "measurer/home",
      `
      <div class="page-head">
        <div><h1>Detailed расчёт</h1><p class="sub">${esc(p.name)} / ${esc(r.name)} · геометрия + схема + BOM</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/measurer/room/${p.id}/${r.id}">Назад</a></div>
      </div>
      ${
        conflict
          ? `<div class="banner warn">
              <p>${esc(conflict.message)}</p>
              <div class="grid-2" style="margin-top:10px">
                <div class="panel" style="background:var(--bg1)">
                  <h3>Current (на комнате)</h3>
                  <p>rev ${esc(conflict.current || "—")}</p>
                  <p>L×W ${conflict.currentSnapshot?.lengthM ?? r.lengthM} × ${
                    conflict.currentSnapshot?.widthM ?? r.widthM
                  }</p>
                  <p>Сумма ${money(conflict.currentSnapshot?.amount ?? r.detailed?.amount)}</p>
                  <p>BOM: ${(conflict.currentSnapshot?.bom || r.bom || [])
                    .map((b) => `${esc(b.name)}:${b.qty}`)
                    .join(", ") || "—"}</p>
                </div>
                <div class="panel" style="background:var(--bg1)">
                  <h3>Incoming (ваш вариант)</h3>
                  <p>rev ${esc(conflict.incoming || "—")}</p>
                  <p>L×W ${conflict.incomingPreview?.lengthM} × ${conflict.incomingPreview?.widthM}</p>
                  <p>Сумма ${money(conflict.incomingPreview?.amount)}</p>
                  <p>BOM: ${(conflict.incomingPreview?.bom || [])
                    .map((b) => `${esc(b.name)}:${b.qty}`)
                    .join(", ") || "—"}</p>
                </div>
              </div>
              <div class="row" style="margin-top:10px">
                <button class="btn primary" data-action="conflict-keep" data-pid="${p.id}" data-rid="${r.id}">Оставить current</button>
                <button class="btn ok" data-action="conflict-apply" data-pid="${p.id}" data-rid="${r.id}">Восстановить мой вариант</button>
                <button class="btn" data-action="conflict-retry" data-pid="${p.id}" data-rid="${r.id}">Повторить с актуальной revision</button>
                <button class="btn ghost sm" data-action="clear-conflict" data-rid="${r.id}">Скрыть баннер</button>
              </div>
              <p class="dim" style="margin-top:6px">«Скрыть баннер» не удаляет incoming — он в pendingConflicts.</p>
            </div>`
          : ""
      }
      <div class="grid-2">
        <div class="panel">
          <h3>Геометрия</h3>
          <div class="field"><label>Длина, м</label><input id="det-L" type="number" step="0.1" value="${showL}"></div>
          <div class="field"><label>Ширина, м</label><input id="det-W" type="number" step="0.1" value="${showW}"></div>
          <div class="field"><label>Вырезы / препятствия</label><input id="det-cut" type="number" value="${showCut}"></div>
          <div class="field"><label>Подпись схемы</label><input id="det-sch" value="${esc(showSch)}"></div>
          <label class="row"><input type="checkbox" id="det-409"> Симулировать 409 (две device revision)</label>
        </div>
        <div class="panel">
          <h3>Макет схемы</h3>
          <div class="scheme-box" id="scheme-preview" style="height:160px">
            <div class="panel-rect" style="left:10%;top:15%;width:70%;height:60%">полотно</div>
            <div class="panel-rect" style="left:72%;top:20%;width:18%;height:25%;border-color:var(--warn)">вырез</div>
          </div>
          <p class="muted">Площадь ≈ <span id="det-area">${(showL * showW).toFixed(1)}</span> м² · prelim ${
        r.preliminary ? money(r.preliminary.amount) : "—"
      }</p>
        </div>
      </div>
      <div class="panel" style="margin-top:12px">
        <h3>BOM (редактируемо)</h3>
        <table class="bom-table" id="bom-table">
          <thead><tr><th>SKU</th><th>Название</th><th>Кол-во</th><th>Ед.</th></tr></thead>
          <tbody>
            ${showBom
              .map(
                (b, i) => `<tr>
              <td class="mono">${esc(b.sku)}</td>
              <td>${esc(b.name)}</td>
              <td><input data-bom-qty="${i}" type="number" value="${b.qty}"></td>
              <td>${esc(b.unit)}</td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <script type="application/json" id="bom-json">${JSON.stringify(showBom).replace(/</g, "\\u003c")}</script>
        <button class="btn primary" style="margin-top:12px" data-action="save-detailed"
          data-pid="${p.id}" data-rid="${r.id}">Сохранить detailed + схему</button>
      </div>`
    );
  }

  /* ---------- CREW ---------- */
  function crewHome() {
    const items = MFStore.crewInbox();
    const allTech = [];
    S().projects.forEach((p) =>
      p.rooms.forEach((r) => {
        if (r.roomAssent === "ordered" && r.techReady && r.status !== "closed") allTech.push({ p, r });
      })
    );
    const hidden = allTech.filter((x) => x.r.assigneeCrew !== MFStore.CREW_SELF);
    return shell(
      "crew/home",
      `
      <div class="page-head">
        <div><h1>Мои задания</h1><p class="sub">Только ordered + tech-ready + <strong>assignee = Денис</strong>. Суммы КП скрыты.</p></div>
      </div>
      <ul class="list panel">
        ${
          items.length
            ? items
                .map(
                  ({ project: p, room: r }) => `
          <li class="list-item" data-action="goto" data-href="#/crew/install/${p.id}/${r.id}">
            <div>
              <div class="title">${esc(r.name)}</div>
              <div class="meta">${esc(p.address)} · checklist ${
                    r.installChecklist?.length ? r.installChecklist.length + " п." : "ОТСУТСТВУЕТ"
                  }</div>
            </div>
            <div class="aside">${r.blocker && r.blocker.open ? "blocker" : "открыть"}</div>
          </li>`
                )
                .join("")
            : `<li class="empty"><strong>Нет ваших заданий</strong></li>`
        }
      </ul>
      ${
        hidden.length
          ? `<div class="banner info">Скрыто чужих tech-ready: ${hidden
              .map((x) => esc(x.r.name) + "→" + esc(staffName(x.r.assigneeCrew)))
              .join(", ")} (GC-P0-05)</div>`
          : ""
      }
      <p class="footnote">Кухня deferred и чужой санузел (Сергей) не в inbox Дениса.</p>`
    );
  }

  function crewInstall(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    if (r.assigneeCrew && r.assigneeCrew !== MFStore.CREW_SELF) {
      return shell(
        "crew/home",
        `<div class="banner danger">Комната назначена другому монтажнику (${esc(
          staffName(r.assigneeCrew)
        )}). Не ваше задание.</div>
         <a class="btn" href="#/crew/home">К inbox</a>`
      );
    }
    const mode = S().ui.installMode || "checklist";
    const cl = r.installChecklist;
    const missing = !cl || !cl.length;
    return shell(
      "crew/home",
      `
      <div class="page-head">
        <div><h1>Монтаж · ${esc(r.name)}</h1><p class="sub">${esc(p.name)} · без суммы КП</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/crew/home">К заданиям</a></div>
      </div>
      <div class="tabs">
        <button class="tab ${mode === "checklist" ? "active" : ""}" data-action="install-tab" data-tab="checklist">Чек-лист</button>
        <button class="tab ${mode === "blocker" ? "active" : ""}" data-action="install-tab" data-tab="blocker">Препятствие</button>
        <button class="tab ${mode === "scheme" ? "active" : ""}" data-action="install-tab" data-tab="scheme">Схема</button>
      </div>
      <div class="panel">
        ${
          mode === "scheme"
            ? `<div class="banner info">${r.scheme ? esc(r.scheme.label) : "Схема не приложена"}</div>
               <div class="scheme-box" style="height:120px"><div class="panel-rect" style="left:15%;top:20%;width:60%;height:50%">view</div></div>`
            : mode === "blocker"
            ? (
                r.blocker && r.blocker.open
                  ? `<div class="banner danger">Blocker: <strong>${esc(r.blocker.type)}</strong> — ${esc(r.blocker.note)}
                       <button class="btn sm" data-action="clear-blocker" data-pid="${p.id}" data-rid="${r.id}">Снять</button></div>`
                  : `<div class="field"><label>Тип</label>
                      <select id="blk-type">
                        <option value="no_scheme">Нет схемы</option>
                        <option value="no_materials">Нет материалов</option>
                        <option value="install_question">Вопрос по монтажу</option>
                        <option value="contact_responsible">Связаться с ответственным</option>
                      </select></div>
                     <div class="field"><label>Комментарий</label><textarea id="blk-note" rows="2">Не хватает закладных</textarea></div>
                     <button class="btn danger" data-action="set-blocker" data-pid="${p.id}" data-rid="${r.id}">Зафиксировать</button>`
              )
            : missing
            ? `<div class="banner danger">Чек-лист отсутствует — закрытие комнаты запрещено (GC-P0-05).
                 <div style="margin-top:8px"><button class="btn primary" data-action="ensure-checklist" data-pid="${p.id}" data-rid="${r.id}">Инициализировать чек-лист</button></div>
               </div>`
            : `${cl
                .map(
                  (c) => `
                <div class="check-item">
                  <div>
                    <label><input type="checkbox" data-action="toggle-check" data-pid="${p.id}" data-rid="${r.id}" data-cid="${c.id}" ${
                    c.done ? "checked" : ""
                  }> ${esc(c.label)}</label>
                    ${
                      !c.done
                        ? `<div class="field" style="margin:6px 0 0"><label>N/A + причина</label>
                           <input data-action="na-reason" data-pid="${p.id}" data-rid="${r.id}" data-cid="${c.id}" value="${esc(
                            c.reason || ""
                          )}" placeholder="Почему N/A"></div>`
                        : ""
                    }
                  </div>
                  <button class="btn sm ghost" data-action="mark-na" data-pid="${p.id}" data-rid="${r.id}" data-cid="${c.id}">N/A</button>
                </div>`
                )
                .join("")}
              <div class="row" style="margin-top:14px">
                <button class="btn primary" data-action="close-install" data-pid="${p.id}" data-rid="${r.id}">Закрыть комнату</button>
              </div>
              <p class="dim" style="font-size:.8rem;margin-top:8px">Блок при open blocker / неполном чек-листе / пустом чек-листе.</p>`
        }
      </div>`
    );
  }

  /* ---------- OWNER ---------- */
  function ownerHome() {
    const inbox = S().ownerInbox;
    // refresh blocker presence
    const live = inbox.map((i) => {
      if (i.kind === "blocker") {
        const r = MFStore.room(i.projectId, i.roomId);
        if (!r || !r.blocker || !r.blocker.open) return null;
      }
      return i;
    }).filter(Boolean);
    return shell(
      "owner/home",
      `
      <div class="page-head">
        <div><h1>Сегодня · владелец</h1><p class="sub">Inbox вмешательств — не дашборд всего бизнеса.</p></div>
      </div>
      <ul class="list panel">
        ${live
          .map((i) => {
            const href =
              i.kind === "assign"
                ? `#/owner/assign/${i.projectId}/${i.roomId}`
                : i.kind === "blocker"
                ? `#/owner/project/${i.projectId}`
                : `#/owner/project/${i.projectId}`;
            return `<li class="list-item" data-action="goto" data-href="${href}">
              <div>
                <div class="title">${esc(i.title)}</div>
                <div class="meta">${esc(i.kind)}</div>
              </div>
              <div class="aside"><span class="pill ${i.severity}">${esc(i.severity)}</span></div>
            </li>`;
          })
          .join("")}
      </ul>`
    );
  }

  function ownerProjects() {
    return shell(
      "owner/projects",
      `
      <div class="page-head"><div><h1>Проекты компании</h1></div></div>
      <ul class="list panel">
        ${S()
          .projects.filter((p) => !p.emptyDemo)
          .map(
            (p) => `<li class="list-item" data-action="goto" data-href="#/owner/project/${p.id}">
            <div class="title">${esc(p.name)}</div>
            <div class="aside">${esc(p.phase)}</div>
          </li>`
          )
          .join("")}
      </ul>`
    );
  }

  function ownerProject(projectId) {
    const p = MFStore.project(projectId);
    return shell(
      "owner/projects",
      `
      <div class="page-head">
        <div><h1>${esc(p.name)}</h1><p class="sub">Назначения и контроль</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/owner/home">Inbox</a></div>
      </div>
      <ul class="list panel">
        ${p.rooms
          .map(
            (r) => `<li class="list-item" data-action="goto" data-href="#/owner/assign/${p.id}/${r.id}">
            <div>
              <div class="title">${esc(r.name)}</div>
              <div class="meta">Замер: ${esc(staffName(r.assigneeMeasurer))} · Монтаж: ${esc(
              staffName(r.assigneeCrew)
            )}</div>
            </div>
            <div class="aside">Назначить</div>
          </li>`
          )
          .join("")}
      </ul>`
    );
  }

  function ownerAssign(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    const measurers = S().staff.filter((u) => u.role === "measurer");
    const crews = S().staff.filter((u) => u.role === "crew");
    return shell(
      "owner/home",
      `
      <div class="page-head">
        <div><h1>Назначение · ${esc(r.name)}</h1><p class="sub">${esc(p.name)}</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/owner/home">Inbox</a></div>
      </div>
      <div class="panel" style="max-width:480px">
        <div class="field"><label>Замерщик</label>
          <select id="asg-m">
            <option value="">—</option>
            ${measurers
              .map((u) => `<option value="${u.id}" ${r.assigneeMeasurer === u.id ? "selected" : ""}>${esc(u.name)}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field"><label>Монтажник</label>
          <select id="asg-c">
            <option value="">—</option>
            ${crews
              .map((u) => `<option value="${u.id}" ${r.assigneeCrew === u.id ? "selected" : ""}>${esc(u.name)}</option>`)
              .join("")}
          </select>
        </div>
        <label class="row" style="margin-bottom:12px"><input type="checkbox" id="asg-mat" ${
          r.materialsReady ? "checked" : ""
        }> Материалы на объекте</label>
        <button class="btn primary" data-action="save-assign" data-pid="${p.id}" data-rid="${r.id}">Сохранить назначение</button>
      </div>`
    );
  }

  function ownerStaff() {
    const cred = S().ui.oneTimeCred;
    return shell(
      "owner/staff",
      `
      <div class="page-head"><div><h1>Сотрудники</h1><p class="sub">Создание / reset · one-time credentials</p></div></div>
      <div class="panel" style="max-width:480px;margin-bottom:12px">
        <h3>Добавить</h3>
        <div class="field"><label>Имя</label><input id="st-name" placeholder="ФИО"></div>
        <div class="field"><label>Роль</label>
          <select id="st-role">
            <option value="sales">sales</option>
            <option value="measurer">measurer</option>
            <option value="crew">crew</option>
          </select>
        </div>
        <button class="btn primary" data-action="create-staff">Создать + показать пароль</button>
      </div>
      <ul class="list panel">
        ${S()
          .staff.map(
            (u) => `<li class="list-item">
            <div><div class="title">${esc(u.name)}</div><div class="meta">${esc(u.role)}</div></div>
            <div class="aside"><button class="btn sm" data-action="reset-staff" data-uid="${u.id}">Сброс пароля</button></div>
          </li>`
          )
          .join("")}
      </ul>
      <p class="footnote">После «Скрыть» plaintext пароль в карточке не показывается повторно.</p>`
    );
  }

  /* ---------- ADMIN StP ---------- */
  function adminHome() {
    const signals = S().partners.filter((p) => p.signal);
    return shell(
      "admin/home",
      `
      <div class="page-head">
        <div><h1>Сигналы сети</h1><p class="sub">StP контур: сигнал → диагностика → intervention → verify. Не CRM партнёра.</p></div>
      </div>
      <ul class="list panel">
        ${signals
          .map(
            (p) => `<li class="list-item" data-action="goto" data-href="#/admin/partner/${p.id}">
            <div>
              <div class="title">${esc(p.name)} · ${esc(p.city)}</div>
              <div class="meta">${esc(p.signal.code)} · этап «${esc(p.signal.stage)}» · ${p.signal.days} дн.</div>
            </div>
            <div class="aside"><span class="pill warn">${esc(p.health)}</span></div>
          </li>`
          )
          .join("")}
      </ul>`
    );
  }

  function adminPartners() {
    return shell(
      "admin/partners",
      `
      <div class="page-head"><div><h1>Партнёры</h1></div></div>
      <ul class="list panel">
        ${S()
          .partners.map(
            (p) => `<li class="list-item" data-action="goto" data-href="#/admin/partner/${p.id}">
            <div class="title">${esc(p.name)}</div>
            <div class="aside">${esc(p.health)}</div>
          </li>`
          )
          .join("")}
      </ul>`
    );
  }

  function adminPartner(partnerId) {
    const p = S().partners.find((x) => x.id === partnerId);
    if (!p) return shell("admin/partners", `<div class="empty">Не найден</div>`);
    const step = S().ui.adminStep || "signals";
    const intervention = p.intervention && S().interventions.find((i) => i.id === p.intervention);
    let body = "";
    if (step === "signals") {
      body = p.signal
        ? `<div class="banner warn">
            <strong>${esc(p.signal.code)}</strong><br>
            Фактический stalled stage: <strong>${esc(p.signal.stage)}</strong>
            · N=${p.signal.n} · coverage ${(p.signal.coverage * 100).toFixed(0)}%
            ${p.signal.coverage < 0.5 ? "<br>⚠ недостаточно покрытия для жёсткого вывода" : ""}
           </div>
           <button class="btn primary" data-action="admin-step" data-step="diagnose">К диагностике →</button>`
        : `<div class="banner ok">Активных сигналов нет</div>`;
    } else if (step === "diagnose") {
      body = `
        <p>Гипотеза: партнёр застревает на этапе <strong>${esc(p.signal?.stage || "—")}</strong> — слабый next step после КП / низкий offer rate.</p>
        <p class="muted">Что потренировать: follow-up после КП · диалог с Анной</p>
        <div class="field"><label>Гипотеза (правка)</label>
          <input id="hyp" value="Stall после quote_sent_confirmed: нет follow-up ритуала">
        </div>
        <button class="btn primary" data-action="create-intervention" data-partner="${p.id}">Создать intervention →</button>`;
    } else if (step === "intervene") {
      if (intervention) {
        body = `<div class="banner info">Intervention ${esc(intervention.id)} · ${esc(intervention.status)}
          <br>${esc(intervention.hypothesis)}</div>
          <button class="btn primary" data-action="admin-step" data-step="verify">К verify →</button>`;
      } else {
        body = `<button class="btn primary" data-action="create-intervention" data-partner="${p.id}">Создать intervention</button>`;
      }
    } else {
      const before = intervention?.baseline || p.adoptionBefore || {};
      const after = intervention?.after || p.adoptionAfter;
      body = intervention
        ? `<p>Verify adoption — <strong>не</strong> conversion widget.</p>
           <div class="grid-2">
             <div class="stat"><div class="n">${Math.round((before.offerRate||0)*100)}%</div><div class="l">Before offer rate</div></div>
             <div class="stat"><div class="n">${Math.round((before.followupDone||0)*100)}%</div><div class="l">Before follow-up</div></div>
           </div>
           <div class="row" style="margin-top:12px">
             <button class="btn ok" data-action="verify-int" data-iid="${intervention.id}" data-result="adopted">Adopted (симулировать прирост)</button>
             <button class="btn" data-action="verify-int" data-iid="${intervention.id}" data-result="no_change">Без изменений</button>
           </div>
           ${
             intervention.verified
               ? `<div class="banner ok" style="margin-top:12px">Verified: ${esc(intervention.result)}
                    · After offer ${Math.round((after?.offerRate||0)*100)}% / follow-up ${Math.round((after?.followupDone||0)*100)}%</div>`
               : ""
           }`
        : `<p class="muted">Сначала intervention.</p>`;
    }
    return shell(
      "admin/partners",
      `
      <div class="page-head">
        <div><h1>${esc(p.name)}</h1><p class="sub">Partner card · агрегаты, без чужого ObjectsPanel</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/admin/home">Сигналы</a></div>
      </div>
      <div class="tabs">
        <button class="tab ${step === "signals" ? "active" : ""}" data-action="admin-step" data-step="signals">Сигнал</button>
        <button class="tab ${step === "diagnose" ? "active" : ""}" data-action="admin-step" data-step="diagnose">Диагностика</button>
        <button class="tab ${step === "intervene" ? "active" : ""}" data-action="admin-step" data-step="intervene">Intervention</button>
        <button class="tab ${step === "verify" ? "active" : ""}" data-action="admin-step" data-step="verify">Verify</button>
        <button class="tab ${step === "outcomes" ? "active" : ""}" data-action="admin-step" data-step="outcomes">Outcomes</button>
      </div>
      <div class="panel">
        ${
          step === "outcomes"
            ? `<div class="grid-3">
                <div class="stat"><div class="n">${p.funnel.accepted}</div><div class="l">accepted</div></div>
                <div class="stat"><div class="n">${p.funnel.early_declined}</div><div class="l">early_declined</div></div>
                <div class="stat"><div class="n">${p.funnel.early_paused}</div><div class="l">paused (не lost)</div></div>
              </div>
              <div class="banner info" style="margin-top:12px">Академия: ${p.training.attempts} попыток, сдали ${(
                p.training.passRate * 100
              ).toFixed(0)}% — <strong>отдельный блок</strong>, не в конверсии сделок.</div>`
            : body
        }
      </div>
      <p class="footnote">RBAC demo: нет кнопки delete чужого project.</p>`
    );
  }

  function adminAnalytics() {
    return shell(
      "admin/analytics",
      `
      <div class="page-head"><div><h1>Сеть · продажи</h1><p class="sub">Сводка по сделкам (Deal). Тренировки — вкладка «Обучение».</p></div></div>
      <div class="grid-3">
        <div class="stat"><div class="n">17</div><div class="l">accepted / сеть</div></div>
        <div class="stat"><div class="n">8</div><div class="l">early_declined</div></div>
        <div class="stat"><div class="n">4</div><div class="l">early_paused</div></div>
      </div>`
    );
  }

  function adminTraining() {
    return shell(
      "admin/training",
      `
      <div class="page-head"><div><h1>Тренировки сети</h1><p class="sub">Отдельно от воронки продаж — сюда не смешан Deal KPI</p></div></div>
      <div class="grid-2">
        <div class="stat"><div class="n">21</div><div class="l">Попыток в Академии</div></div>
        <div class="stat"><div class="n">71</div><div class="l">Средний балл · Анна</div></div>
      </div>
      <div class="banner ok" style="margin-top:12px">В KPI сделок эти цифры не входят.</div>`
    );
  }

  function loadingView() {
    return shell(
      "sales/home",
      `<div class="panel"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><p class="muted">Загрузка…</p></div>`
    );
  }

  function errorView(msg) {
    return shell(
      "sales/home",
      `<div class="banner danger"><strong>Ошибка</strong><br>${esc(msg)}</div>
       <a class="btn" href="#/sales/home">На домашнюю</a>`
    );
  }

  global.MFViews = {
    login,
    toolsHub,
    toolsPm,
    toolsCalc,
    calcToolIframeSrc,
    pmToolIframeSrc,
    toolsBind,
    salesHome,
    salesInquiry,
    salesQuick,
    salesPmQuick,
    salesCalcQuick,
    salesBind,
    salesProjects,
    salesProject,
    salesRoom,
    salesCalc,
    salesAnalytics,
    salesAcademy,
    salesAcademyHub,
    measurerHome,
    measurerProjects,
    measurerRoom,
    measurerCalc,
    crewHome,
    crewInstall,
    ownerHome,
    ownerProjects,
    ownerProject,
    ownerAssign,
    ownerStaff,
    adminHome,
    adminPartners,
    adminPartner,
    adminAnalytics,
    adminTraining,
    loadingView,
    errorView,
    ANNA,
  };
})(window);
