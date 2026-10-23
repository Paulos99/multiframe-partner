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
          <p class="muted">Демо-орг «Неболайн» — натяжные потолки, СПб. Выберите роль и пройдите сценарий без инструктажа.</p>
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
    const items = {
      sales: [
        ["#/sales/home", "Сегодня"],
        ["#/sales/projects", "Проекты"],
        ["#/sales/quick", "Быстрый расчёт"],
        ["#/sales/academy", "Академия"],
        ["#/sales/analytics", "Аналитика"],
      ],
      owner: [
        ["#/owner/home", "Сегодня"],
        ["#/owner/projects", "Проекты"],
        ["#/owner/staff", "Сотрудники"],
      ],
      measurer: [
        ["#/measurer/home", "Мои замеры"],
        ["#/measurer/projects", "Проекты"],
      ],
      crew: [
        ["#/crew/home", "Мои задания"],
      ],
      admin: [
        ["#/admin/home", "Сигналы"],
        ["#/admin/partners", "Партнёры"],
        ["#/admin/analytics", "Сеть"],
        ["#/admin/training", "Обучение"],
      ],
    }[role] || [];

    return `
      <nav class="nav" aria-label="Основная навигация">
        <div class="nav-section">Навигация</div>
        ${items
          .map(([href, label]) => {
            const isActive = active && href.includes(active);
            return `<a href="${href}" class="${isActive ? "active" : ""}">${label}</a>`;
          })
          .join("")}
        <div class="nav-section">Прототип</div>
        <button class="nav-link" data-action="reset">Сбросить демо-данные</button>
      </nav>`;
  }

  function shell(activeNav, body) {
    return `${chrome()}<div class="shell">${nav(activeNav)}<main class="workspace">${body}</main></div>
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
          <p class="sub">Inbox продаж: что требует действия. Один фокус — не стек панелей.</p>
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
          <p class="sub">Атомарно: Project + Room + active Deal. Без полной карточки клиента.</p>
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
            <h1>Быстрый расчёт</h1>
            <p class="sub">Консультация без Deal. Save потребует bind. <span class="mono">multiframe_offered</span> → consultationSessionId.</p>
          </div>
        </div>
        <div class="panel">
          <p class="muted">Начните консультацию — появится session id, затем PM и Calc.</p>
          <button class="btn primary" data-action="start-quick">Начать консультацию</button>
        </div>`
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
        </div>
      </div>
      <div class="seg-bar" role="tablist">
        <button class="active">Контекст</button>
        <button data-action="goto" data-href="#/sales/pm-quick">Проблемомер</button>
        <button data-action="goto" data-href="#/sales/calc-quick">Калькулятор</button>
        <button data-action="goto" data-href="#/sales/bind">Сохранить</button>
      </div>
      <div class="panel">
        <div class="grid-2">
          <div class="field"><label>Площадь, м²</label><input id="q-area" type="number" value="${d.areaM2}"></div>
          <div class="field"><label>Сегмент</label>
            <select id="q-seg">
              <option value="standard" ${d.segment === "standard" ? "selected" : ""}>Standard</option>
              <option value="comfort" ${d.segment === "comfort" ? "selected" : ""}>Comfort</option>
              <option value="premium" ${d.segment === "premium" ? "selected" : ""}>Premium</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Что беспокоит</label><input id="q-noise" value="${esc(d.noise)}"></div>
        <div class="row">
          <button class="btn" data-action="save-quick-fields">Обновить черновик</button>
          <button class="btn ${d.multiframeOffered ? "ok" : "primary"}" data-action="offer-mf">
            ${d.multiframeOffered ? "MultiFrame предложен ✓" : "Зафиксировать: предложили MultiFrame"}
          </button>
        </div>
        ${
          d.multiframeOffered
            ? `<div class="banner ok">Событие <span class="mono">multiframe_offered</span> привязано к <span class="mono">${esc(
                d.consultationSessionId
              )}</span> — <strong>без dealId</strong> (unsaved quick-entry).</div>`
            : ""
        }
        <div class="row" style="margin-top:14px">
          <span class="pill ${d.pmDone ? "ok" : ""}">PM ${d.pmDone ? "готов" : "не пройден"}</span>
          <span class="pill ${d.calcDone ? "ok" : ""}">Calc ${d.calcDone ? money(d.amount) : "нет"}</span>
          <span class="pill ${d.bound ? "ok" : "warn"}">${d.bound ? "Привязан" : "Не сохранён в проект"}</span>
        </div>
      </div>`
    );
  }

  function salesPmQuick() {
    const d = S().sessionDraft;
    if (!d) return salesQuick();
    return shell(
      "sales/quick",
      `
      <div class="page-head">
        <div><h1>Проблемомер</h1><p class="sub">Сегментный пресет для потолков · результат → next steps.</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/quick">К консультации</a></div>
      </div>
      <div class="panel">
        <h2>Диагностика · ${esc(d.segment)}</h2>
        <ul class="list">
          <li class="list-item"><div><div class="title">Ударный шум</div><div class="meta">${esc(d.noise)}</div></div><div class="aside">релевантно</div></li>
          <li class="list-item"><div><div class="title">Рекомендация</div><div class="meta">Каркас MultiFrame под полотном · сегмент Comfort</div></div></li>
        </ul>
        <button class="btn primary" data-action="pm-done">Зафиксировать оценку PM</button>
      </div>`
    );
  }

  function salesCalcQuick() {
    const d = S().sessionDraft;
    if (!d) return salesQuick();
    const estimate = Math.round((d.areaM2 || 12) * (d.segment === "premium" ? 4200 : d.segment === "comfort" ? 3400 : 2800));
    return shell(
      "sales/quick",
      `
      <div class="page-head">
        <div><h1>Калькулятор · предварительный</h1><p class="sub">Ориентир, не смета монтажа. Save без bind запрещён.</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/quick">К консультации</a></div>
      </div>
      <div class="panel">
        <div class="stat"><div class="n">${money(estimate)}</div><div class="l">Ориентир по ${d.areaM2} м² · ${esc(d.segment)}</div></div>
        <p class="muted" style="margin-top:12px">Включает полотно, профиль, каркас MultiFrame (пресет).</p>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-action="calc-done" data-amount="${estimate}">Сохранить ориентир в черновик</button>
          <a class="btn" href="#/sales/bind">К привязке →</a>
        </div>
      </div>`
    );
  }

  function salesBind() {
    const d = S().sessionDraft;
    if (!d) return salesQuick();
    if (!d.calcDone) {
      return shell(
        "sales/quick",
        `<div class="banner warn">Сначала получите ориентир в калькуляторе — Save без результата запрещён (anti-loss).</div>
         <a class="btn primary" href="#/sales/calc-quick">К калькулятору</a>`
      );
    }
    if (d.bound) {
      return shell(
        "sales/quick",
        `<div class="banner ok">Уже привязано к проекту. Deal ${esc(d.dealId)}.</div>
         <a class="btn primary" href="#/sales/project/${d.projectId}">Открыть проект</a>`
      );
    }
    return shell(
      "sales/quick",
      `
      <div class="page-head">
        <div><h1>Сохранить и привязать</h1><p class="sub">Имена обязательны. Повтор с тем же ключом не создаёт дубликат (в прототипе — явный bind один раз).</p></div>
      </div>
      <div class="panel" style="max-width:480px">
        <div class="banner info">Сумма черновика: <strong>${money(d.amount)}</strong> · session ${esc(d.consultationSessionId)}</div>
        <div class="field"><label>Название проекта</label><input id="bind-proj" value="Крылова · Лесная 5"></div>
        <div class="field"><label>Комната</label><input id="bind-room" value="Спальня"></div>
        <div class="field"><label>Клиент</label><input id="bind-client" value="Елена Крылова"></div>
        <button class="btn primary" data-action="do-bind">Привязать и создать Deal</button>
      </div>`
    );
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
    if (!deal) return `<div class="empty"><strong>Нет активной Deal</strong><p>Создайте inquiry или bind.</p></div>`;
    const quotes = MFStore.quotesForDeal(deal.dealId);
    return `
      <div class="row" style="margin-bottom:12px">
        <span class="pill info">dealId ${esc(deal.dealId)}</span>
        <span class="pill">этап «${esc(stageLabel(deal.stage))}»</span>
        ${deal.paused ? `<span class="pill warn">Пауза · resume → ${esc(stageLabel(deal.stageAtOutcome))}</span>` : ""}
        ${deal.outcome && !deal.paused ? `<span class="pill">${esc(deal.outcome)}</span>` : ""}
      </div>
      ${
        deal.paused
          ? `<div class="banner warn">
              Сделка на паузе (не закрыта). Причина: ${esc(deal.lossReason)}.
              <div class="row" style="margin-top:8px">
                <button class="btn primary" data-action="resume-deal" data-deal="${deal.dealId}">Возобновить на «${esc(
                stageLabel(deal.stageAtOutcome)
              )}»</button>
              </div>
            </div>`
          : ""
      }
      <h3>КП этой Deal</h3>
      ${
        !quotes.length
          ? `<div class="empty"><strong>Пока нет КП</strong><p>Это нормально до отправки.</p>
              <button class="btn primary" data-action="create-quote" data-deal="${deal.dealId}" ${
                deal.paused ? "disabled" : ""
              }>Создать КП</button></div>`
          : quotes
              .map(
                (q) => `
            <div class="panel" style="margin-top:8px;background:var(--bg1)">
              <div class="row">
                <strong>${esc(q.label)}</strong>
                <span class="pill ${q.lifecycle === "sent_confirmed" ? "ok" : ""}">${esc(q.lifecycle)}</span>
                <span class="aside muted">${money(q.amount)}</span>
              </div>
              <div class="row" style="margin-top:10px">
                <button class="btn sm" data-action="quote-copy" data-qid="${q.revisionId}" ${
                  q.lifecycle === "sent_confirmed" ? "disabled" : ""
                }>Копировать</button>
                <button class="btn sm" data-action="quote-pdf" data-qid="${q.revisionId}">PDF</button>
                <button class="btn sm primary" data-action="quote-confirm" data-qid="${q.revisionId}" ${
                  q.lifecycle === "sent_confirmed" || deal.paused ? "disabled" : ""
                }>Подтвердить отправку</button>
              </div>
              <p class="dim" style="margin:8px 0 0;font-size:.8rem">Copy/PDF ≠ sent. Только «Подтвердить отправку» → sent_confirmed.</p>
            </div>`
              )
              .join("") +
            (deal.paused
              ? ""
              : `<button class="btn sm" style="margin-top:8px" data-action="create-quote" data-deal="${deal.dealId}">Ещё версия КП (N+1)</button>`)
      }
      <h3 style="margin-top:18px">Согласие по комнатам</h3>
      <ul class="list">
        ${p.rooms
          .map(
            (r) => `<li class="list-item">
            <div class="title">${esc(r.name)}</div>
            <div class="aside"><span class="pill">${esc(r.roomAssent || "—")}</span></div>
          </li>`
          )
          .join("")}
      </ul>
      ${
        !deal.paused && deal.active
          ? `<h3 style="margin-top:18px">Исход</h3>
        <div class="row">
          <button class="btn ok" data-action="accept-deal" data-deal="${deal.dealId}">Принято</button>
          <button class="btn" data-action="open-pause" data-deal="${deal.dealId}">Пауза</button>
          <button class="btn danger" data-action="open-decline" data-deal="${deal.dealId}">Отказ</button>
        </div>
        <p class="dim" style="font-size:.8rem;margin-top:8px">Пауза ≠ отказ ≠ закрытие. Resume сохраняет dealId.</p>`
          : ""
      }
      <div id="deal-sheet"></div>`;
  }

  function salesRoom(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    if (!p || !r) return shell("sales/projects", `<div class="empty">Комната не найдена</div>`);
    return shell(
      "sales/projects",
      `
      <div class="page-head">
        <div>
          <h1>${esc(r.name)}</h1>
          <p class="sub">${esc(p.name)} · ${r.areaM2} м²</p>
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
          <p>Prelim: <strong>${r.preliminary ? money(r.preliminary.amount) : "—"}</strong></p>
          <p>Detailed: <strong>${r.detailed ? money(r.detailed.amount) : "—"}</strong></p>
        </div>
        <div class="panel">
          <h3>Готовность</h3>
          <p>Assent: ${esc(r.roomAssent || "—")}</p>
          <p>Tech-ready: ${r.techReady ? "да" : "нет"}</p>
        </div>
      </div>`
    );
  }

  function salesCalc(projectId, roomId, kind) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    const k = kind || "preliminary";
    const amount = Math.round(r.areaM2 * (k === "detailed" ? 3600 : 3400));
    return shell(
      "sales/projects",
      `
      <div class="page-head">
        <div><h1>Калькулятор · ${k}</h1><p class="sub">${esc(p.name)} / ${esc(r.name)}</p></div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/room/${p.id}/${r.id}">Назад</a></div>
      </div>
      <div class="panel">
        <div class="stat"><div class="n">${money(amount)}</div><div class="l">${k} · ${r.areaM2} м²</div></div>
        <button class="btn primary" style="margin-top:14px" data-action="save-room-calc"
          data-pid="${p.id}" data-rid="${r.id}" data-kind="${k}" data-amount="${amount}">
          Сохранить в комнату
        </button>
      </div>`
    );
  }

  function salesAnalytics() {
    return shell(
      "sales/analytics",
      `
      <div class="page-head"><div><h1>Аналитика продаж</h1><p class="sub">Только воронка Deal. Обучение — отдельно в Академии / training.</p></div></div>
      <div class="grid-3">
        <div class="stat"><div class="n">7</div><div class="l">accepted (месяц)</div></div>
        <div class="stat"><div class="n">5</div><div class="l">early_declined</div></div>
        <div class="stat"><div class="n">3</div><div class="l">early_paused (не lost)</div></div>
      </div>
      <div class="banner info" style="margin-top:14px">Training attempts здесь не показываются — см. Академию. Isolation AC-TI-*.</div>`
    );
  }

  /* ---------- ACADEMY Anna ---------- */
  const ANNA = {
    N0: {
      npc: "Здравствуйте, нужен натяжной в спальню, хочется побыстрее.",
      choices: [
        { id: "P0a", text: "Отлично, сразу MultiFrame — без него у вас будет шумно.", next: "PushyN1" },
        { id: "P0b", text: "Расскажите про комнату: соседи сверху есть, что беспокоит кроме вида?", next: "N1" },
        { id: "P0c", text: "Полотно от 400 ₽/м². Что ещё интересует по цене?", next: "PriceTrap" },
      ],
    },
    PriceTrap: {
      npc: "Цену полотна поняла. А зачем вы про что-то ещё?",
      choices: [
        { id: "PTfix", text: "Сначала пойму задачу комнаты — шум, соседи, ожидания — потом сориентирую по составу.", next: "N1" },
        { id: "PTbad", text: "Берите сразу пакет с MultiFrame, иначе переплатите потом.", next: "PushyN1" },
      ],
    },
    N1: {
      npc: "Соседи иногда слышны, но я за красотой пришла.",
      choices: [
        { id: "P1a", text: "Под натяжным можно поставить каркас MultiFrame. Давайте коротко разберём, зачем он вам — без покупки сейчас.", next: "N2" },
        { id: "P1b", text: "Гарантируем −35 дБ и полную тишину.", next: "FailFast" },
        { id: "P1c", text: "Это Rw/DnT,w по ISO, демпфер, развязка по периметру…", next: "N2b" },
      ],
    },
    N2b: {
      npc: "Я ничего не поняла. Это мне точно нужно?",
      choices: [
        { id: "P2b_fix", text: "Простыми словами: каркас под полотном снижает ударный шум соседей. Могу показать профиль и дать ориентир по площади.", next: "N2" },
        { id: "P2b_bad", text: "Если не разберётесь в терминах — не наш клиент.", next: "PoorEnd" },
      ],
    },
    PushyN1: {
      npc: "Вы сразу продаёте допы. Мне просто потолок.",
      choices: [
        { id: "PPu_fix", text: "Извините за напор. Давайте сначала про комнату и ваши ожидания.", next: "N1" },
        { id: "PPu_bad", text: "Без MultiFrame смысла нет, решайте сегодня.", next: "PoorEnd" },
      ],
    },
    N2: {
      npc: "И что дальше, если мне это подойдёт?",
      choices: [
        { id: "P2a", text: "Могу открыть проблемомер и дать предварительный ориентир по площади — без обязательства покупать.", next: "OfferOk" },
        { id: "P2b", text: "Решать надо сегодня, иначе цена вырастет.", next: "PressureEnd" },
        { id: "P2c", text: "Ну ок, думайте сами.", next: "IncompleteEnd" },
      ],
    },
    OfferOk: { end: true, score: 88, title: "Успех", feedback: "Выяснили контекст до оффера; мягкий next step — проблемомер." },
    FailFast: { end: true, score: 11, title: "Провал", feedback: "Ложное обещание «−35 дБ / полная тишина» — FailFast. context: training, 0 Deal." },
    PoorEnd: { end: true, score: 36, title: "Слабо", feedback: "Давление / отталкивание клиента." },
    PressureEnd: { end: true, score: 40, title: "Давление", feedback: "Ультиматум по сроку снижает доверие." },
    IncompleteEnd: { end: true, score: 45, title: "Нет next step", feedback: "Нет конкретного следующего шага." },
  };

  function salesAcademy() {
    const ui = S().ui;
    if (ui.academyDone) {
      const e = ANNA[ui.academyDone];
      return shell(
        "sales/academy",
        `
        <div class="page-head"><div><h1>Академия · разбор</h1><p class="sub">context: training · не влияет на sales KPI</p></div></div>
        <div class="panel">
          <div class="stat"><div class="n">${e.score}</div><div class="l">${esc(e.title)} · sell_multiframe / Anna</div></div>
          <p style="margin-top:12px">${esc(e.feedback)}</p>
          <div class="row" style="margin-top:14px">
            <button class="btn primary" data-action="academy-reset">Пройти снова</button>
            <a class="btn" href="#/sales/academy-hub">К хабу</a>
          </div>
        </div>`
      );
    }
    const nodeId = ui.academyNode || "N0";
    const node = ANNA[nodeId];
    if (node.end) {
      S().ui.academyDone = nodeId;
      MFStore.save();
      return salesAcademy();
    }
    const path = ui.academyPath || [];
    return shell(
      "sales/academy",
      `
      <div class="page-head">
        <div>
          <h1>Тренажёр · Анна</h1>
          <p class="sub">sell_multiframe / client_anna · Path S ориентир: P0b → P1a → P2a</p>
        </div>
        <div class="page-actions"><a class="btn ghost" href="#/sales/academy-hub">Хабу</a></div>
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
                `<button class="btn" data-action="academy-choice" data-next="${c.next}" data-text="${esc(
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
      "sales/academy",
      `
      <div class="page-head"><div><h1>Академия</h1><p class="sub">Хаб механик · отдельно от аналитики продаж</p></div></div>
      <div class="grid-2">
        <button class="panel" style="text-align:left;cursor:pointer" data-action="goto" data-href="#/sales/academy">
          <h3>Продажи MultiFrame</h3>
          <p class="muted">Чат · sell_multiframe · Anna</p>
          <span class="pill info">P0</span>
        </button>
        <div class="panel">
          <h3>Возражения</h3>
          <p class="muted">Чат · coming soon в прототипе</p>
          <span class="pill">P0 slot</span>
        </div>
        <div class="panel">
          <h3>Расчёты / практика</h3>
          <p class="muted">Не-чат · calc_sandbox</p>
          <span class="pill">слот</span>
        </div>
        <div class="panel">
          <h3>Монтаж / узлы</h3>
          <p class="muted">Не-чат · install_nodes</p>
          <span class="pill">слот</span>
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
      <div class="panel">
        <p>Площадь: <strong>${r.areaM2} м²</strong></p>
        <p>Prelim: ${r.preliminary ? money(r.preliminary.amount) : "—"}</p>
        <p>Detailed: ${r.detailed ? money(r.detailed.amount) + " · " + r.detailed.revisionId : "нет"}</p>
        ${r.detailed ? `<div class="banner ok">Detailed сохранён. Вернитесь в ту же комнату — данные на месте (anti re-entry).</div>` : ""}
      </div>`
    );
  }

  function measurerCalc(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    const amount = Math.round(r.areaM2 * 3550);
    return shell(
      "measurer/home",
      `
      <div class="page-head">
        <div><h1>Detailed расчёт</h1><p class="sub">${esc(p.name)} / ${esc(r.name)}</p></div>
      </div>
      <div class="panel">
        <div class="stat"><div class="n">${money(amount)}</div><div class="l">Detailed · схема + узлы</div></div>
        <button class="btn primary" style="margin-top:12px" data-action="save-room-calc"
          data-pid="${p.id}" data-rid="${r.id}" data-kind="detailed" data-amount="${amount}"
          data-back="#/measurer/room/${p.id}/${r.id}">
          Сохранить detailed
        </button>
      </div>`
    );
  }

  /* ---------- CREW ---------- */
  function crewHome() {
    const items = MFStore.crewInbox();
    return shell(
      "crew/home",
      `
      <div class="page-head">
        <div><h1>Мои задания</h1><p class="sub">Только ordered + tech-ready. Коммерческие суммы скрыты.</p></div>
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
              <div class="meta">${esc(p.address)} · схема ${r.schemeOk ? "есть" : "нет"}</div>
            </div>
            <div class="aside">${r.blocker && r.blocker.open ? "blocker" : "в работе"}</div>
          </li>`
                )
                .join("")
            : `<li class="empty"><strong>Нет заданий</strong><p>Deferred / без detailed не попадают сюда.</p></li>`
        }
      </ul>
      <p class="footnote">Кухня Васильева (deferred) намеренно отсутствует в inbox.</p>`
    );
  }

  function crewInstall(projectId, roomId) {
    const p = MFStore.project(projectId);
    const r = MFStore.room(projectId, roomId);
    const mode = S().ui.installMode || "checklist";
    const cl = r.installChecklist || [];
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
            ? `<div class="banner info">Схема раскроя · демо-файл «зал_васильев_v2.pdf»</div>
               <p class="muted">Просмотр help. Persist сметы для crew нет.</p>`
            : mode === "blocker"
            ? `
              ${
                r.blocker && r.blocker.open
                  ? `<div class="banner danger">Открыт blocker: <strong>${esc(r.blocker.type)}</strong> — ${esc(
                      r.blocker.note
                    )}
                    <div style="margin-top:8px"><button class="btn sm" data-action="clear-blocker" data-pid="${p.id}" data-rid="${r.id}">Снять</button></div>
                   </div>`
                  : `<div class="field"><label>Тип</label>
                      <select id="blk-type">
                        <option value="no_scheme">Нет схемы</option>
                        <option value="no_materials">Нет материалов</option>
                        <option value="install_question">Вопрос по монтажу</option>
                        <option value="contact_responsible">Связаться с ответственным</option>
                      </select></div>
                     <div class="field"><label>Комментарий</label><textarea id="blk-note" rows="2">Не хватает закладных под люстру</textarea></div>
                     <button class="btn danger" data-action="set-blocker" data-pid="${p.id}" data-rid="${r.id}">Зафиксировать препятствие</button>`
              }`
            : `
              ${cl
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
              <p class="dim" style="font-size:.8rem;margin-top:8px">Закрытие без полного чек-листа или при open blocker — блок.</p>`
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
    return shell(
      "owner/staff",
      `
      <div class="page-head"><div><h1>Сотрудники</h1><p class="sub">Неболайн</p></div></div>
      <ul class="list panel">
        ${S()
          .staff.map(
            (u) => `<li class="list-item"><div class="title">${esc(u.name)}</div><div class="aside">${esc(u.role)}</div></li>`
          )
          .join("")}
      </ul>`
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
        <p class="muted">Модуль: quote follow-up · Academy Anna</p>
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
      body = intervention
        ? `<p>Проверка adoption (отдельно от conversion widget).</p>
           <div class="row">
             <button class="btn ok" data-action="verify-int" data-iid="${intervention.id}" data-result="adopted">Adopted</button>
             <button class="btn" data-action="verify-int" data-iid="${intervention.id}" data-result="no_change">Без изменений</button>
           </div>
           ${
             intervention.verified
               ? `<div class="banner ok" style="margin-top:12px">Verified: ${esc(intervention.result)}</div>`
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
              <div class="banner info" style="margin-top:12px">Training: attempts ${p.training.attempts}, pass ${(
                p.training.passRate * 100
              ).toFixed(0)}% — <strong>отдельный блок</strong>, не в conversion.</div>`
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
      <div class="page-head"><div><h1>Сеть · продажи</h1><p class="sub">Агрегаты Deal. Обучение — вкладка «Обучение».</p></div></div>
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
      <div class="page-head"><div><h1>Обучение сети</h1><p class="sub">E-analytics-training · изолировано от sales funnel</p></div></div>
      <div class="grid-2">
        <div class="stat"><div class="n">21</div><div class="l">LearningAttempt (training)</div></div>
        <div class="stat"><div class="n">71</div><div class="l">Anna avg score</div></div>
      </div>
      <div class="banner ok" style="margin-top:12px">Эти цифры не входят в countsTowardSalesKpi.</div>`
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
