/* Gate C isolated prototype — NOT production. localStorage only. */
(() => {
  const STORAGE = 'mf-gate-c-proto-v1';

  const defaultState = () => ({
    role: null,
    route: 'home',
    sync: 'online',
    toast: '',
    projects: [
      {
        id: 'p1', name: 'Спальня · Ивановы', client: 'Анна',
        rooms: [
          { id: 'r1', name: 'Спальня', status: 'measured', prelim: 48000, detailed: null, revision: 1, history: [] },
          { id: 'r2', name: 'Гостиная', status: 'draft', prelim: null, detailed: null, revision: 0, history: [] },
        ],
        deal: {
          id: 'd1', stage: 'calculated', outcome: null, paused: false, stageAtOutcome: null,
          quotes: [{ id: 'q1', version: 1, lifecycle: 'created', amount: 48000 }],
          assent: { r1: null, r2: null },
        },
      },
      {
        id: 'p2', name: 'Дозаказ · Петровы', client: 'Игорь',
        rooms: [{ id: 'r3', name: 'Кабинет', status: 'tech_ready', prelim: 22000, detailed: 26500, revision: 2, history: [] }],
        deal: {
          id: 'd2', stage: 'quote_sent_confirmed', outcome: 'accepted', paused: false,
          quotes: [{ id: 'q2', version: 1, lifecycle: 'sent_confirmed', amount: 26500 }],
          assent: { r3: 'ordered' },
        },
      },
    ],
    sessionDraft: null,
    consultationSessionId: null,
    toolOpensInSession: 0,
    calcConflict: null,
    academy: { node: 'N0', path: [], score: null, ended: false },
    checklist: { scheme: false, materials: false, hangers: false, finish: false },
    blocker: null,
    signals: [
      { id: 's1', type: 'funnel_stall', org: 'Потолки Север', stage: 'quote_sent_confirmed', n: 8 },
      { id: 's2', type: 'paused_followup', org: 'Акустика Плюс', count: 3 },
    ],
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE);
      return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
    } catch {
      return defaultState();
    }
  }
  function save() {
    localStorage.setItem(STORAGE, JSON.stringify(state));
  }
  function toast(msg) {
    state.toast = msg;
    render();
    setTimeout(() => { if (state.toast === msg) { state.toast = ''; renderToastOnly(); } }, 3200);
  }
  function uid(p) { return p + Math.random().toString(36).slice(2, 8); }

  function setRole(role) {
    state.role = role;
    state.route = 'home';
    save(); render();
  }
  function go(route, params = {}) {
    state.route = route;
    state.params = params;
    save(); render();
  }

  function activeProject() {
    const id = state.params?.projectId || 'p1';
    return state.projects.find((p) => p.id === id) || state.projects[0];
  }

  function startConsultSession() {
    if (!state.consultationSessionId) {
      state.consultationSessionId = uid('cs_');
      state.toolOpensInSession = 0;
    }
    state.toolOpensInSession += 1;
  }

  /* ---------- Views ---------- */
  function viewLogin() {
    return `
      <div class="demo-banner">GATE C PROTOTYPE · не production · localStorage</div>
      <div class="login-hero">
        <div class="login-card">
          <p class="badge">MultiFrame Партнёр</p>
          <h1 class="brand-hero">MultiFrame</h1>
          <p class="lede">Кабинет потолочной компании: проект → комнаты, сделка отдельно, расчёт с сохранением.</p>
          <p class="muted">Выберите роль для демо (D11 §7):</p>
          <div class="role-grid">
            ${[['sales','Продажи — inquiry, КП, пауза'],['owner','Владелец — вмешательство, назначения'],['measurer','Замерщик — detailed save'],['crew','Бригада — монтаж и blocker'],['admin','StP admin — сигналы партнёра']].map(([id,label]) =>
              `<button data-role="${id}"><strong>${label.split('—')[0]}</strong><br><span class="muted">${label.split('—')[1]||''}</span></button>`
            ).join('')}
          </div>
        </div>
      </div>`;
  }

  function chrome() {
    return `
      <div class="demo-banner">GATE C PROTOTYPE · роль: ${state.role} · sync: ${state.sync}</div>
      <header class="chrome">
        <div class="brand">MultiFrame</div>
        <div class="meta">${labelRole(state.role)}</div>
        <div class="spacer"></div>
        <select id="syncSelect">
          <option value="online" ${state.sync==='online'?'selected':''}>Online</option>
          <option value="offline" ${state.sync==='offline'?'selected':''}>Offline</option>
        </select>
        <button type="button" id="btnReset">Сброс демо</button>
        <button type="button" id="btnLogout">Сменить роль</button>
      </header>`;
  }

  function nav() {
    const items = navForRole(state.role);
    return `<nav class="nav">${items.map(([r,t]) =>
      `<button type="button" data-nav="${r}" class="${state.route===r?'active':''}">${t}</button>`
    ).join('')}</nav>`;
  }

  function navForRole(role) {
    const common = [['home','Сегодня'],['projects','Проекты'],['tools','Инструменты'],['academy','Академия']];
    if (role === 'crew') return [['home','Задания'],['install','Монтаж']];
    if (role === 'admin') return [['home','Сигналы'],['partner','PartnerCard'],['analytics','Аналитика'],['academy','Академия']];
    if (role === 'owner') return [...common, ['staff','Сотрудники'], ['deal','Сделка']];
    return [...common, ['deal','Сделка']];
  }

  function labelRole(r) {
    return ({sales:'Продажи',owner:'Владелец',measurer:'Замерщик',crew:'Бригада',admin:'StP admin'})[r] || r;
  }

  function viewHome() {
    if (state.role === 'sales') return homeSales();
    if (state.role === 'owner') return homeOwner();
    if (state.role === 'measurer') return homeMeasurer();
    if (state.role === 'crew') return homeCrew();
    return homeAdmin();
  }

  function homeSales() {
    const p = state.projects[0];
    const paused = p.deal.paused;
    return `
      <h1>Сегодня · Продажи</h1>
      <p class="lede">Inbox next actions — без стека модулей. Пауза ≠ новая сделка.</p>
      <div class="cta-row">
        <button class="btn" data-go="inquiry">Новый проект</button>
        <button class="btn secondary" data-go="tools" data-intent="consult">Быстрая консультация</button>
        <button class="btn secondary" data-go="tools" data-intent="calc">Быстрый расчёт</button>
      </div>
      <div class="panel">
        <div class="inbox-item">
          <div>
            <div class="title">${paused ? 'Возобновить сделку' : 'Подтвердить отправку КП'} · ${p.name}</div>
            <div class="sub">${paused ? 'early_paused · тот же dealId '+p.deal.id : 'Quote v'+p.deal.quotes[0].version+' · '+p.deal.quotes[0].lifecycle}</div>
          </div>
          <button class="btn ghost" data-go="deal" data-project="${p.id}">Открыть</button>
        </div>
        <div class="inbox-item">
          <div>
            <div class="title">Зафиксировать исход · ${state.projects[1].name}</div>
            <div class="sub">sent_confirmed · roomAssent ordered</div>
          </div>
          <button class="btn ghost" data-go="deal" data-project="p2">Открыть</button>
        </div>
      </div>`;
  }

  function homeOwner() {
    return `
      <h1>Сегодня · Компания</h1>
      <p class="lede">Что требует вмешательства: blockers, без assignee, паузы.</p>
      <div class="cta-row"><button class="btn" data-go="inquiry">Новый проект</button></div>
      <div class="panel">
        <div class="inbox-item">
          <div><div class="title">Нет crew на accepted · ${state.projects[1].name}</div><div class="sub">Назначить ответственность</div></div>
          <button class="btn ghost" data-go="deal" data-project="p2">Назначить</button>
        </div>
        ${state.blocker ? `<div class="inbox-item"><div><div class="title">Blocker от бригады</div><div class="sub">${state.blocker}</div></div><button class="btn ghost" data-go="install">Открыть</button></div>` : ''}
      </div>`;
  }

  function homeMeasurer() {
    const room = state.projects[0].rooms[0];
    return `
      <h1>Мои замеры</h1>
      <p class="lede">Назначенная комната → detailed → сохранить → назад.</p>
      <div class="cta-row"><button class="btn" data-go="room" data-project="p1" data-room="r1">Продолжить «${room.name}»</button></div>
      <div class="panel">
        <div class="inbox-item">
          <div><div class="title">${room.name} · ${state.projects[0].name}</div>
          <div class="sub">status ${room.status} · revision ${room.revision} ${room.detailed?'· detailed есть':'· нужен detailed'}</div></div>
          <button class="btn ghost" data-go="calc" data-project="p1" data-room="r1">Расчёт</button>
        </div>
      </div>`;
  }

  function homeCrew() {
    const ok = state.projects[1];
    return `
      <h1>Мои задания</h1>
      <p class="lede">Только ordered + tech-ready. Без сумм КП и deferred.</p>
      <div class="panel">
        <div class="inbox-item">
          <div><div class="title">${ok.rooms[0].name} · ${ok.name}</div>
          <div class="sub"><span class="badge ok">ordered</span> <span class="badge ok">tech-ready</span></div></div>
          <button class="btn" data-go="install">Открыть монтаж</button>
        </div>
      </div>
      <p class="muted">Спальня Ивановых (только preliminary / не ordered) скрыта из inbox.</p>`;
  }

  function homeAdmin() {
    return `
      <h1>Сеть · Сигналы</h1>
      <p class="lede">Агрегаты и контур помощи — не полевой CRM.</p>
      <div class="panel">
        ${state.signals.map(s => `
          <div class="inbox-item">
            <div>
              <div class="title">${s.org}</div>
              <div class="sub">${s.type}${s.stage?' · stage '+s.stage:''}${s.n?' · N='+s.n:''}${s.count?' · paused '+s.count:''}</div>
            </div>
            <button class="btn ghost" data-go="partner" data-org="${s.org}">PartnerCard</button>
          </div>`).join('')}
      </div>`;
  }

  function viewProjects() {
    return `
      <h1>Проекты</h1>
      <p class="lede">Иерархия Project → Rooms. Не плоский ObjectsPanel.</p>
      <div class="panel">
        ${state.projects.map(p => `
          <div class="row-card">
            <div>
              <div class="title">${p.name}</div>
              <div class="sub">${p.rooms.length} комн. · Deal ${p.deal.id} · ${p.deal.paused?'<span class="badge pause">пауза</span>':p.deal.outcome||p.deal.stage}</div>
            </div>
            <button class="btn ghost" data-go="project" data-project="${p.id}">Открыть</button>
          </div>`).join('')}
      </div>`;
  }

  function viewProject() {
    const p = activeProject();
    const total = p.rooms.reduce((s,r) => s + (r.detailed ?? r.prelim ?? 0), 0);
    return `
      <h1>${p.name}</h1>
      <p class="lede">Клиент: ${p.client}. Итог ориентир: ${money(total)} <span class="muted">(coalesce, не prelim+detailed)</span></p>
      <div class="cta-row">
        <button class="btn secondary" data-go="deal" data-project="${p.id}">Сделка</button>
        <button class="btn ghost" data-go="projects">← К списку</button>
      </div>
      <div class="panel">
        ${p.rooms.map(r => `
          <div class="row-card">
            <div>
              <div class="title">${r.name}</div>
              <div class="sub">${r.status}
                ${r.prelim!=null?` · <span class="badge warn">предварительно ${money(r.prelim)}</span>`:''}
                ${r.detailed!=null?` · <span class="badge ok">со схемой ${money(r.detailed)}</span>`:''}
              </div>
            </div>
            <button class="btn ghost" data-go="room" data-project="${p.id}" data-room="${r.id}">Комната</button>
          </div>`).join('')}
      </div>`;
  }

  function viewRoom() {
    const p = activeProject();
    const r = p.rooms.find(x => x.id === (state.params?.roomId || p.rooms[0].id));
    return `
      <h1>${r.name}</h1>
      <p class="lede">${p.name} · status ${r.status} · calc revision ${r.revision}</p>
      <div class="cta-row">
        ${(state.role!=='crew')?`<button class="btn" data-go="calc" data-project="${p.id}" data-room="${r.id}">Рассчитать</button>`:''}
        <button class="btn ghost" data-go="project" data-project="${p.id}">← Проект</button>
      </div>
      <div class="panel">
        <p>Preliminary: ${r.prelim!=null?money(r.prelim):'—'}</p>
        <p>Detailed: ${r.detailed!=null?money(r.detailed):'—'}</p>
        <p class="muted">История save: ${r.history.length ? r.history.map(h=>`#${h.rev} ${h.type} ${money(h.amount)}`).join(' · ') : 'пусто'}</p>
      </div>`;
  }

  function viewTools() {
    return `
      <h1>Инструменты</h1>
      <p class="lede">Quick-entry: результат → Save → bind. Session: <code>${state.consultationSessionId || '—'}</code> · opens: ${state.toolOpensInSession}</p>
      <div class="cta-row">
        <button class="btn" id="btnOpenPm">Проблемомер (consult)</button>
        <button class="btn secondary" id="btnOpenCalcQuick">Калькулятор площади</button>
      </div>
      <div class="panel muted">Повторное открытие tool в той же consultationSessionId не увеличивает знаменатель аналитики (C4).</div>`;
  }

  function viewCalc() {
    const p = activeProject();
    const r = p.rooms.find(x => x.id === (state.params?.roomId || 'r1')) || null;
    const bound = !!r;
    const draft = state.sessionDraft;
    return `
      <h1>Калькулятор</h1>
      <p class="lede">${bound ? `Комната «${r.name}»` : 'Нет комнаты — после Save откроется bind'} · ${state.sync==='offline'?'<span class="badge warn">offline</span>':'<span class="badge ok">online</span>'}</p>
      <div class="panel">
        <div class="field"><label>Площадь, м²</label><input id="areaInput" type="number" min="1" value="${draft?.area || 18}"></div>
        <div class="field"><label>Тип сохранения</label>
          <select id="calcType"><option value="preliminary">Предварительный ориентир</option><option value="detailed">Со схемой (detailed)</option></select>
        </div>
        <div class="scheme-box" id="schemePreview">Превью ${draft?.type==='detailed'?'схемы':'площади'}</div>
        <div class="cta-row">
          <button class="btn" id="btnSaveCalc">Сохранить</button>
          <button class="btn ghost" data-go="${bound?'room':'tools'}" data-project="${p.id}" data-room="${r?.id||''}">Назад</button>
        </div>
        <p class="muted" id="saveHint">Тексты: «Сохранено локально» vs «на сервере» различаются.</p>
      </div>
      ${state.calcConflict ? conflictPanel() : ''}`;
  }

  function conflictPanel() {
    const c = state.calcConflict;
    return `
      <div class="panel">
        <h2>Конфликт 409</h2>
        <p>На сервере revision ${c.remote.rev}, локально пытались записать от ${c.expected}. Обе ветки recoverable — не LWW.</p>
        <div class="cta-row">
          <button class="btn" id="keepRemote">Оставить сервер</button>
          <button class="btn secondary" id="keepLocal">Оставить локальный как новую revision</button>
        </div>
      </div>`;
  }

  function viewBind() {
    const d = state.sessionDraft;
    if (!d) return `<p>Нет draft. <button class="btn" data-go="tools">К инструментам</button></p>`;
    return `
      <h1>Куда сохранить?</h1>
      <p class="lede">Тип: ${d.type} · оценка ${money(d.amount)} · draft ${d.id}</p>
      <div class="panel">
        <h2>Выбрать существующие</h2>
        ${state.projects.map(p => p.rooms.map(r => `
          <div class="row-card">
            <div><div class="title">${p.name} / ${r.name}</div><div class="sub">rev ${r.revision}</div></div>
            <button class="btn ghost" data-bind-existing="${p.id}:${r.id}">Сохранить сюда</button>
          </div>`).join('')).join('')}
      </div>
      <div class="panel">
        <h2>Создать проект + комнату + Deal</h2>
        <div class="field"><label>Ярлык проекта</label><input id="newProjectName" placeholder="Напр. Кухня · Сидоровы"></div>
        <div class="field"><label>Комната</label><input id="newRoomName" value="Основная"></div>
        <button class="btn" id="btnCreateBind">Создать и сохранить</button>
        <button class="btn ghost" id="btnCancelBind">Отмена (draft жив)</button>
      </div>`;
  }

  function viewInquiry() {
    return `
      <h1>Новый проект</h1>
      <p class="lede">Atomic Project+Room+Deal (A-11). Idempotency-Key демо.</p>
      <div class="panel">
        <div class="field"><label>Название / ярлык</label><input id="inqName" placeholder="Объект клиента"></div>
        <div class="field"><label>Комната</label><input id="inqRoom" value="Комната 1"></div>
        <div class="field"><label>Телефон (опц.)</label><input id="inqPhone" placeholder="+7…"></div>
        <div class="cta-row">
          <button class="btn" id="btnCreateInquiry">Создать</button>
          <button class="btn ghost" data-go="home">Отмена</button>
        </div>
      </div>`;
  }

  function viewDeal() {
    const p = activeProject();
    const d = p.deal;
    const q = d.quotes[d.quotes.length - 1];
    return `
      <h1>Сделка · ${p.name}</h1>
      <p class="lede">dealId <code>${d.id}</code> · stage <strong>${d.stage}</strong>
        ${d.paused?' · <span class="badge pause">early_paused</span>':''}
        ${d.outcome?` · outcome ${d.outcome}`:''}
      </p>
      <div class="panel">
        <h2>КП</h2>
        <p>v${q.version} · lifecycle <strong>${q.lifecycle}</strong> · ${money(q.amount)}</p>
        <div class="cta-row">
          <button class="btn ghost" id="btnCopyQuote">Copy / PDF</button>
          <button class="btn" id="btnConfirmSent" ${q.lifecycle==='sent_confirmed'?'disabled':''}>Подтвердить отправку</button>
          <button class="btn secondary" id="btnQuoteN1">Новая версия N+1</button>
        </div>
        <p class="muted">Copy ≠ sent. После sent revision immutable.</p>
      </div>
      <div class="panel">
        <h2>Исход / пауза</h2>
        <div class="cta-row">
          <button class="btn secondary" id="btnPause" ${d.paused||d.outcome?'disabled':''}>Пауза</button>
          <button class="btn" id="btnResume" ${d.paused?'':'disabled'}>Возобновить (тот же dealId)</button>
          <button class="btn danger" id="btnDecline" ${d.outcome?'disabled':''}>Отказ (closed)</button>
          <button class="btn" id="btnAccept" ${q.lifecycle!=='sent_confirmed'||d.outcome?'disabled':''}>Согласился</button>
        </div>
        <p class="muted">Пауза не пишет closedAt. Отказ → commercial close. После монтажа ordered — отдельный A-06 close.</p>
      </div>
      <div class="panel">
        <h2>roomAssent</h2>
        ${p.rooms.map(r => `<p>${r.name}: <strong>${d.assent[r.id] ?? '—'}</strong></p>`).join('')}
      </div>
      <button class="btn ghost" data-go="project" data-project="${p.id}">← Проект</button>`;
  }

  function viewInstall() {
    const c = state.checklist;
    return `
      <h1>Монтаж · Кабинет</h1>
      <p class="lede">Петровы · ordered + tech-ready. Суммы КП скрыты.</p>
      <div class="scheme-box">Схема раскладки (help)</div>
      <div class="panel">
        <h2>Чек-лист</h2>
        ${[['scheme','Схема сверена'],['materials','Материалы на объекте'],['hangers','Крепления'],['finish','Финиш / уборка']].map(([k,l]) =>
          `<label class="row-card"><span>${l}</span><input type="checkbox" data-check="${k}" ${c[k]?'checked':''}></label>`
        ).join('')}
        <div class="cta-row">
          <button class="btn" id="btnCloseRoom">Закрыть комнату</button>
          <button class="btn danger" id="btnBlocker">Зафиксировать препятствие</button>
        </div>
        ${state.blocker?`<p class="badge danger">Blocker: ${state.blocker}</p>`:''}
      </div>`;
  }

  function viewAcademy() {
    const a = state.academy;
    const lines = academyLines(a);
    return `
      <h1>Академия · Предложить MultiFrame</h1>
      <p class="lede">context: training · не пишет Deal. Эталон Anna (D9 §4.2.1).</p>
      <div class="chat">${lines}</div>
      ${a.ended ? `<div class="panel"><h2>Score: ${a.score}</h2><p>${a.feedback}</p>
        <button class="btn" id="btnAcademyRetry">Пройти снова</button></div>` :
        `<div class="choices panel">${academyChoices(a.node).map((c,i)=>
          `<button class="btn secondary" data-academy="${c.id}">${c.text}</button>`).join('')}</div>`}`;
  }

  function academyLines(a) {
    const map = {
      N0: ['Anna: Здравствуйте, нужен натяжной в спальню, хочется побыстрее.'],
      N1: ['Anna: Соседи иногда слышны, но я за красотой пришла.'],
      N2: ['Anna: И что дальше, если мне это подойдёт?'],
      FailFast: ['Anna: −35 дБ гарантированно? Звучит как реклама.'],
      OfferOk: ['Система: OfferOk — мягкий next step зафиксирован.'],
    };
    let html = '';
    const path = a.path;
    // reconstruct simple
    html += `<div class="bubble npc">${map.N0[0]}</div>`;
    path.forEach((step) => {
      html += `<div class="bubble me">${step.player}</div>`;
      if (map[step.to]) html += `<div class="bubble npc">${map[step.to][0]}</div>`;
    });
    return html;
  }

  function academyChoices(node) {
    const tree = {
      N0: [
        { id: 'P0b', text: 'Расскажите про комнату: соседи сверху, что беспокоит?', to: 'N1', player: 'Расскажите про комнату…' },
        { id: 'P1b_early', text: 'Гарантируем −35 дБ и полную тишину.', to: 'FailFast', player: 'Гарантируем −35 дБ…', fail: true },
      ],
      N1: [
        { id: 'P1a', text: 'Под натяжным — каркас MultiFrame. Разберём зачем, без покупки сейчас.', to: 'N2', player: 'Под натяжным можно поставить каркас…' },
        { id: 'P1b', text: 'Гарантируем −35 дБ и полную тишину.', to: 'FailFast', player: 'Гарантируем −35 дБ…', fail: true },
      ],
      N2: [
        { id: 'P2a', text: 'Могу открыть проблемомер и дать ориентир по площади — без обязательства.', to: 'OfferOk', player: 'Могу открыть проблемомер…', win: true },
      ],
    };
    return tree[node] || [];
  }

  function viewPartner() {
    const org = state.params?.org || 'Потолки Север';
    return `
      <h1>PartnerCard · ${org}</h1>
      <p class="lede">Сигнал → диагностика → intervention. Без списка ФИО клиентов.</p>
      <div class="panel">
        <p><span class="badge warn">funnel_stall</span> stop на quote_sent_confirmed · N=8 · confidence reliable</p>
        <p><span class="badge pause">paused_followup</span> отдельно от lost count</p>
        <p class="muted">Offer rate: 3/8 = 38% · «среди консультаций в приложении; офлайн не входят»</p>
      </div>
      <div class="cta-row">
        <button class="btn" id="btnIntervention">Создать intervention</button>
        <button class="btn ghost" data-go="home">← Сигналы</button>
      </div>`;
  }

  function viewAnalytics() {
    return `
      <h1>Аналитика</h1>
      <div class="panel">
        <p>Конверсия = accepted по dealId</p>
        <p>Early loss = только early_declined / declined</p>
        <p>Consultation N = distinct consultationSessionId (сейчас демо: ${state.consultationSessionId?1:0}, tool opens в session: ${state.toolOpensInSession})</p>
        <p class="badge warn">Coverage warning активен</p>
      </div>
      <p class="muted">Обучение — отдельный срез, не на этом виджете.</p>`;
  }

  function viewStaff() {
    return `
      <h1>Сотрудники</h1>
      <div class="panel">
        <div class="row-card"><div><div class="title">Мария · sales</div><div class="sub">active</div></div></div>
        <div class="row-card"><div><div class="title">Олег · measurer</div><div class="sub">active</div></div></div>
      </div>
      <p class="muted">${state.role==='sales'?'Sales: только assign, без create.':'Owner: create/reset credentials.'}</p>
      ${state.role==='owner'?`<button class="btn secondary" id="btnFakeStaff">Добавить (демо)</button>`:
        `<button class="btn secondary" disabled title="403">Добавить (403)</button>`}`;
  }

  function money(n) {
    if (n == null) return '—';
    return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
  }

  /* ---------- Actions ---------- */
  function saveCalc() {
    const type = document.getElementById('calcType').value;
    const area = Number(document.getElementById('areaInput').value || 0);
    if (area <= 0) { toast('Укажите площадь > 0'); return; }
    const amount = type === 'detailed' ? Math.round(area * 3200) : Math.round(area * 2600);
    const p = activeProject();
    const roomId = state.params?.roomId;
    const room = p.rooms.find(r => r.id === roomId);

    if (!room) {
      state.sessionDraft = { id: uid('dr_'), type, area, amount, expectedRevision: 0 };
      startConsultSession();
      save();
      toast(state.sync === 'offline' ? 'Сохранено локально — нужен bind' : 'Черновик готов — привяжите комнату');
      go('bind');
      return;
    }

    // optimistic concurrency demo: if offline then online with stale expected
    const expected = room.revision;
    if (state.params?.forceConflict || (room.revision >= 1 && state.sync === 'online' && state.params?.simulateConflict)) {
      state.calcConflict = {
        roomId: room.id, projectId: p.id, expected,
        local: { type, amount, area },
        remote: { rev: room.revision, type: room.detailed ? 'detailed' : 'preliminary', amount: room.detailed ?? room.prelim },
      };
      save(); toast('409 Conflict — сравните версии'); render(); return;
    }

    applyCalcSave(p, room, type, amount, area, expected);
  }

  function applyCalcSave(p, room, type, amount, area, expected) {
    if (expected !== room.revision) {
      state.calcConflict = {
        roomId: room.id, projectId: p.id, expected,
        local: { type, amount, area },
        remote: { rev: room.revision, amount: room.detailed ?? room.prelim },
      };
      save(); toast('409 Conflict'); render(); return;
    }
    room.revision += 1;
    room.history.push({ rev: room.revision, type, amount, at: Date.now() });
    if (type === 'detailed') { room.detailed = amount; room.status = 'tech_ready'; }
    else { room.prelim = amount; if (room.status === 'draft') room.status = 'measured'; }
    // A-09 hybrid stage
    if (!p.deal.paused && !p.deal.outcome && ['contact','offered','assessed'].includes(p.deal.stage)) {
      p.deal.stage = 'calculated';
    }
    state.sessionDraft = null;
    state.calcConflict = null;
    save();
    toast(state.sync === 'offline' ? 'Сохранено локально — отправим при связи' : 'Сохранено на сервере');
    go('room', { projectId: p.id, roomId: room.id });
  }

  function bindExisting(projectId, roomId) {
    const p = state.projects.find(x => x.id === projectId);
    const r = p.rooms.find(x => x.id === roomId);
    const d = state.sessionDraft;
    applyCalcSave(p, r, d.type, d.amount, d.area, r.revision);
  }

  function bindCreate() {
    const name = document.getElementById('newProjectName').value.trim();
    const roomName = document.getElementById('newRoomName').value.trim();
    if (!name || !roomName) { toast('Нужны ярлык проекта и комната'); return; }
    const d = state.sessionDraft;
    const p = {
      id: uid('p'), name, client: 'Быстрый клиент',
      rooms: [{ id: uid('r'), name: roomName, status: 'draft', prelim: null, detailed: null, revision: 0, history: [] }],
      deal: { id: uid('d'), stage: 'contact', outcome: null, paused: false, quotes: [], assent: {} },
    };
    state.projects.unshift(p);
    applyCalcSave(p, p.rooms[0], d.type, d.amount, d.area, 0);
    toast('Созданы проект, комната и сделка (atomic)');
  }

  function createInquiry() {
    const name = document.getElementById('inqName').value.trim();
    const room = document.getElementById('inqRoom').value.trim() || 'Комната 1';
    if (!name) { toast('Укажите название'); return; }
    const key = 'inq_' + name;
    if (state._lastInqKey === key) { toast('Idempotent: тот же triple ids'); go('project', { projectId: state._lastInqId }); return; }
    const p = {
      id: uid('p'), name, client: name,
      rooms: [{ id: uid('r'), name: room, status: 'draft', prelim: null, detailed: null, revision: 0, history: [] }],
      deal: { id: uid('d'), stage: 'contact', outcome: null, paused: false, quotes: [{ id: uid('q'), version: 1, lifecycle: 'created', amount: 0 }], assent: {} },
    };
    p.deal.assent[p.rooms[0].id] = null;
    state.projects.unshift(p);
    state._lastInqKey = key;
    state._lastInqId = p.id;
    save(); toast('Проект + комната + Deal созданы');
    go('project', { projectId: p.id });
  }

  /* ---------- Render ---------- */
  function render() {
    const root = document.getElementById('app');
    if (!state.role) {
      root.innerHTML = viewLogin();
      root.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => setRole(b.dataset.role)));
      renderToastOnly();
      return;
    }

    const body = ({
      home: viewHome,
      projects: viewProjects,
      project: viewProject,
      room: viewRoom,
      tools: viewTools,
      calc: viewCalc,
      bind: viewBind,
      inquiry: viewInquiry,
      deal: viewDeal,
      install: viewInstall,
      academy: viewAcademy,
      partner: viewPartner,
      analytics: viewAnalytics,
      staff: viewStaff,
    }[state.route] || viewHome)();

    root.innerHTML = `
      <div class="app-shell">
        ${chrome()}
        <div class="layout">${nav()}<main class="workspace">${body}</main></div>
      </div>
      <div class="toast ${state.toast?'show':''}" id="toast">${state.toast||''}</div>`;

    wire();
  }

  function renderToastOnly() {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = state.toast || '';
    t.classList.toggle('show', !!state.toast);
  }

  function wire() {
    document.getElementById('btnLogout')?.addEventListener('click', () => { state.role = null; save(); render(); });
    document.getElementById('btnReset')?.addEventListener('click', () => { localStorage.removeItem(STORAGE); state = defaultState(); render(); toast('Демо сброшено'); });
    document.getElementById('syncSelect')?.addEventListener('change', (e) => { state.sync = e.target.value; save(); toast('Sync: '+state.sync); });

    document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => go(b.dataset.nav)));
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const params = {};
      if (b.dataset.project) params.projectId = b.dataset.project;
      if (b.dataset.room) params.roomId = b.dataset.room;
      if (b.dataset.org) params.org = b.dataset.org;
      if (b.dataset.intent) { startConsultSession(); }
      go(b.dataset.go, params);
    }));

    document.getElementById('btnOpenPm')?.addEventListener('click', () => {
      startConsultSession();
      state.sessionDraft = { id: uid('dr_'), type: 'preliminary', area: 16, amount: 41600, expectedRevision: 0, from: 'pm' };
      save(); toast('PM result в draft · opens='+state.toolOpensInSession); go('bind');
    });
    document.getElementById('btnOpenCalcQuick')?.addEventListener('click', () => {
      startConsultSession();
      go('calc', {});
    });
    document.getElementById('btnSaveCalc')?.addEventListener('click', saveCalc);
    document.getElementById('btnCancelBind')?.addEventListener('click', () => { toast('Draft сохранён локально'); go('tools'); });
    document.getElementById('btnCreateBind')?.addEventListener('click', bindCreate);
    document.querySelectorAll('[data-bind-existing]').forEach((b) => b.addEventListener('click', () => {
      const [p,r] = b.dataset.bindExisting.split(':'); bindExisting(p,r);
    }));
    document.getElementById('btnCreateInquiry')?.addEventListener('click', createInquiry);

    document.getElementById('btnCopyQuote')?.addEventListener('click', () => toast('Скопировано / PDF готов — это ещё не «КП отправлено»'));
    document.getElementById('btnConfirmSent')?.addEventListener('click', () => {
      const d = activeProject().deal; const q = d.quotes.at(-1);
      q.lifecycle = 'sent_confirmed'; d.stage = 'quote_sent_confirmed'; save(); toast('Отправка подтверждена'); render();
    });
    document.getElementById('btnQuoteN1')?.addEventListener('click', () => {
      const d = activeProject().deal; const prev = d.quotes.at(-1);
      d.quotes.push({ id: uid('q'), version: prev.version+1, lifecycle: 'created', amount: prev.amount });
      save(); toast('Новая версия КП на том же dealId'); render();
    });
    document.getElementById('btnPause')?.addEventListener('click', () => {
      const d = activeProject().deal;
      d.paused = true; d.stageAtOutcome = d.stage; d.outcome = 'early_paused';
      save(); toast('Сделка на паузе — можно возобновить · dealId '+d.id); render();
    });
    document.getElementById('btnResume')?.addEventListener('click', () => {
      const d = activeProject().deal; const id = d.id;
      d.paused = false; d.outcome = null; d.stage = d.stageAtOutcome || 'calculated';
      save(); toast('Возобновлено · тот же dealId '+id); render();
    });
    document.getElementById('btnDecline')?.addEventListener('click', () => {
      const d = activeProject().deal;
      d.paused = false; d.outcome = 'early_declined'; d.stage = 'closed'; d.closedAt = Date.now();
      save(); toast('Сделка закрыта отказом (commercial close)'); render();
    });
    document.getElementById('btnAccept')?.addEventListener('click', () => {
      const p = activeProject(); const d = p.deal;
      d.outcome = 'accepted';
      p.rooms.forEach((r,i) => { d.assent[r.id] = i===0 ? 'ordered' : 'deferred'; });
      save(); toast('accepted + roomAssent'); render();
    });

    document.querySelectorAll('[data-check]').forEach((c) => c.addEventListener('change', () => {
      state.checklist[c.dataset.check] = c.checked; save();
    }));
    document.getElementById('btnCloseRoom')?.addEventListener('click', () => {
      const vals = Object.values(state.checklist);
      if (state.blocker) { toast('Open blocker блокирует closed'); return; }
      if (vals.some(v => !v)) { toast('Чек-лист неполный'); return; }
      toast('Комната closed · Deal не авто-closed (A-06)');
    });
    document.getElementById('btnBlocker')?.addEventListener('click', () => {
      state.blocker = 'no_materials'; save(); toast('Blocker зафиксирован'); render();
    });

    document.querySelectorAll('[data-academy]').forEach((b) => b.addEventListener('click', () => {
      const node = state.academy.node;
      const choice = academyChoices(node).find(c => c.id === b.dataset.academy);
      if (!choice) return;
      state.academy.path.push({ player: choice.player, to: choice.to, id: choice.id });
      state.academy.node = choice.to;
      if (choice.fail) {
        state.academy.ended = true; state.academy.score = 11;
        state.academy.feedback = 'Ложное обещание «гарантированной тишины / −35 дБ» недопустимо (Path F).';
      } else if (choice.win) {
        state.academy.ended = true; state.academy.score = 88;
        state.academy.feedback = 'Выяснили контекст до оффера; мягкий next step (Path S). context:training ∉ KPI.';
      }
      save(); render();
    }));
    document.getElementById('btnAcademyRetry')?.addEventListener('click', () => {
      state.academy = { node: 'N0', path: [], score: null, ended: false }; save(); render();
    });

    document.getElementById('btnIntervention')?.addEventListener('click', () => toast('Intervention создан · reviewAt +14д'));
    document.getElementById('btnFakeStaff')?.addEventListener('click', () => toast('One-time password показан один раз (демо)'));

    document.getElementById('keepRemote')?.addEventListener('click', () => {
      state.calcConflict = null; save(); toast('Оставили серверную revision'); go('room', { projectId: activeProject().id, roomId: state.params?.roomId || 'r1' });
    });
    document.getElementById('keepLocal')?.addEventListener('click', () => {
      const c = state.calcConflict; const p = state.projects.find(x => x.id === c.projectId);
      const r = p.rooms.find(x => x.id === c.roomId);
      // append as new rev on top of remote
      applyCalcSave(p, r, c.local.type, c.local.amount, c.local.area, r.revision);
    });

    // Dirty leave confirm for calc
    document.querySelectorAll('[data-go]').forEach((b) => {
      if (state.route !== 'calc') return;
      b.addEventListener('click', (e) => {
        if (b.id === 'btnSaveCalc') return;
        if (!confirm('Есть несохранённый черновик. Уйти?')) e.stopImmediatePropagation();
      }, true);
    });
  }

  document.addEventListener('DOMContentLoaded', render);
})();
