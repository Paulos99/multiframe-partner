/**
 * Gate C router + interactions
 */
(function () {
  const root = () => document.getElementById("app");

  function toast(title, detail, kind) {
    const host = document.getElementById("toasts");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<strong>${title}</strong>${detail ? `<span class="muted">${detail}</span>` : ""}`;
    if (kind === "warn") el.style.borderColor = "rgba(212,163,92,.5)";
    if (kind === "danger") el.style.borderColor = "rgba(208,107,92,.5)";
    if (kind === "ok") el.style.borderColor = "rgba(92,184,138,.5)";
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "") || "";
    const [pathPart, query = ""] = raw.split("?");
    const parts = pathPart.split("/").filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(query));
    return { parts, params };
  }

  function requireRole(role) {
    const st = MFStore.get();
    if (!st.role) {
      location.hash = "#/login";
      return false;
    }
    if (role && st.role !== role) {
      location.hash = `#/${st.role}/home`;
      return false;
    }
    return true;
  }

  function render() {
    const { parts, params } = parseHash();
    const st = MFStore.get();
    let html = "";

    try {
      if (!parts.length || parts[0] === "login") {
        html = MFViews.login();
      } else if (!st.role) {
        location.hash = "#/login";
        return;
      } else {
        const [zone, screen, a, b] = parts;
        if (zone === "sales") {
          if (!requireRole("sales")) return;
          if (screen === "home") html = MFViews.salesHome();
          else if (screen === "inquiry") html = MFViews.salesInquiry();
          else if (screen === "quick") html = MFViews.salesQuick();
          else if (screen === "pm-quick") html = MFViews.salesPmQuick();
          else if (screen === "calc-quick") html = MFViews.salesCalcQuick();
          else if (screen === "bind") html = MFViews.salesBind();
          else if (screen === "projects") html = MFViews.salesProjects();
          else if (screen === "project") html = MFViews.salesProject(a, params.tab);
          else if (screen === "room") html = MFViews.salesRoom(a, b);
          else if (screen === "calc") html = MFViews.salesCalc(a, b, params.kind);
          else if (screen === "analytics") html = MFViews.salesAnalytics();
          else if (screen === "academy-hub") html = MFViews.salesAcademyHub();
          else if (screen === "academy") html = MFViews.salesAcademy();
          else html = MFViews.salesHome();
        } else if (zone === "measurer") {
          if (!requireRole("measurer")) return;
          if (screen === "home") html = MFViews.measurerHome();
          else if (screen === "projects") html = MFViews.measurerProjects();
          else if (screen === "room") html = MFViews.measurerRoom(a, b);
          else if (screen === "calc") html = MFViews.measurerCalc(a, b);
          else html = MFViews.measurerHome();
        } else if (zone === "crew") {
          if (!requireRole("crew")) return;
          if (screen === "install") html = MFViews.crewInstall(a, b);
          else html = MFViews.crewHome();
        } else if (zone === "owner") {
          if (!requireRole("owner")) return;
          if (screen === "home") html = MFViews.ownerHome();
          else if (screen === "projects") html = MFViews.ownerProjects();
          else if (screen === "project") html = MFViews.ownerProject(a);
          else if (screen === "assign") html = MFViews.ownerAssign(a, b);
          else if (screen === "staff") html = MFViews.ownerStaff();
          else html = MFViews.ownerHome();
        } else if (zone === "admin") {
          if (!requireRole("admin")) return;
          if (screen === "home") html = MFViews.adminHome();
          else if (screen === "partners") html = MFViews.adminPartners();
          else if (screen === "partner") html = MFViews.adminPartner(a);
          else if (screen === "analytics") html = MFViews.adminAnalytics();
          else if (screen === "training") html = MFViews.adminTraining();
          else html = MFViews.adminHome();
        } else {
          html = MFViews.errorView("Неизвестный маршрут");
        }
      }
    } catch (e) {
      console.error(e);
      html = MFViews.errorView(e.message || "render failed");
    }

    root().innerHTML = html;
    bindGlobal();
  }

  function openAcceptSheet(dealId) {
    const host = document.getElementById("deal-sheet");
    if (!host) return;
    const rooms = MFStore.scopedRoomsForDeal(dealId);
    host.innerHTML = `
      <div class="modal-back" data-action="close-sheet">
        <div class="modal" style="width:min(560px,100%)" onclick="event.stopPropagation()">
          <h3>Принято — согласие по комнатам</h3>
          <p class="muted">GC3-P0-02 / GC2-P0-03: scope = rooms sent Quote. «Не выбрано» по умолчанию. ≥1 ordered.</p>
          ${
            rooms.length
              ? ""
              : `<div class="banner warn">Нет применимого sent Quote / пустой scope — accept недоступен.</div>`
          }
          ${rooms
            .map((r) => {
              const amt = r.detailed?.amount || r.preliminary?.amount || 0;
              return `<div class="field"><label>${r.name} · ${amt} ₽</label>
                <select data-assent-room="${r.id}" required>
                  <option value="" selected>Не выбрано</option>
                  <option value="ordered">ordered</option>
                  <option value="deferred">deferred</option>
                  <option value="out_of_scope">out_of_scope</option>
                </select></div>`;
            })
            .join("")}
          <div class="row">
            <button class="btn ghost" data-action="close-sheet">Отмена</button>
            <button class="btn ok" data-action="confirm-accept" data-deal="${dealId}" ${
              rooms.length ? "" : "disabled"
            }>Подтвердить accepted</button>
          </div>
        </div>
      </div>`;
    bindGlobal();
  }

  function openSheet(dealId, mode) {
    const host = document.getElementById("deal-sheet");
    if (!host) return;
    const title = mode === "pause" ? "Пауза сделки" : "Отказ (early decline)";
    host.innerHTML = `
      <div class="modal-back" data-action="close-sheet">
        <div class="modal" onclick="event.stopPropagation()">
          <h3>${title}</h3>
          <p class="muted">${
            mode === "pause"
              ? "Нетерминально: Deal остаётся active, resume на тот же этап."
              : "Терминально: Deal закрывается, reopen запрещён."
          }</p>
          <div class="field"><label>Причина (обязательно)</label>
            <input id="sheet-reason" placeholder="Почему…" value="${
              mode === "pause" ? "Клиент уехал на 2 недели" : "Выбрали другого подрядчика"
            }">
          </div>
          <div class="row">
            <button class="btn ghost" data-action="close-sheet">Отмена</button>
            <button class="btn ${mode === "pause" ? "primary" : "danger"}" data-action="confirm-sheet" data-mode="${mode}" data-deal="${dealId}">
              ${mode === "pause" ? "Поставить на паузу" : "Зафиксировать отказ"}
            </button>
          </div>
        </div>
      </div>`;
    bindGlobal();
  }

  function bindGlobal() {
    document.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", onAction);
    });
    // checkbox change
    document.querySelectorAll('input[data-action="toggle-check"]').forEach((el) => {
      el.addEventListener("change", onAction);
    });
    document.querySelectorAll('input[data-action="na-reason"]').forEach((el) => {
      el.addEventListener("change", onAction);
    });
  }

  function onAction(ev) {
    const el = ev.currentTarget;
    const action = el.getAttribute("data-action");
    if (!action) return;

    if (action === "login") {
      MFStore.setRole(el.getAttribute("data-role"));
      location.hash = `#/${el.getAttribute("data-role")}/home`;
      return;
    }
    if (action === "logout") {
      MFStore.setRole(null);
      location.hash = "#/login";
      return;
    }
    if (action === "reset") {
      if (confirm("Сбросить все демо-данные прототипа?")) {
        MFStore.resetAll();
        location.hash = "#/login";
        toast("Сброшено", "Демо-данные восстановлены", "ok");
      }
      return;
    }
    if (action === "toggle-offline") {
      MFStore.setOffline(!MFStore.get().offline);
      toast(MFStore.get().offline ? "Офлайн" : "Онлайн", MFStore.get().offline ? "Создание/bind блокируются" : "Синхронизация ок", "warn");
      render();
      return;
    }
    if (action === "goto") {
      location.hash = el.getAttribute("data-href");
      return;
    }
    if (action === "create-inquiry") {
      const res = MFStore.createInquiry({
        client: document.getElementById("inq-client").value,
        address: document.getElementById("inq-addr").value,
        roomName: document.getElementById("inq-room").value,
        areaM2: document.getElementById("inq-area").value,
      });
      if (!res.ok) {
        toast("Не создано", res.error === "offline_queued" ? "В outbox (офлайн)" : "Ошибка", "danger");
        return;
      }
      toast("Проект создан", `Deal ${res.dealId}`, "ok");
      location.hash = `#/sales/project/${res.projectId}`;
      return;
    }
    if (action === "start-quick") {
      MFStore.startQuickConsultation(el.getAttribute("data-persona") || "");
      toast("Консультация", "session + анкета (шум не pre-filled)", "ok");
      location.hash = "#/sales/pm-quick";
      return;
    }
    if (action === "abandon-quick") {
      MFStore.get().sessionDraft = null;
      MFStore.save();
      location.hash = "#/sales/quick";
      return;
    }
    if (action === "pm-run") {
      MFStore.updatePmAnswers({
        roomType: document.getElementById("pm-room").value,
        areaM2: Number(document.getElementById("pm-area").value),
        neighbors: document.getElementById("pm-neighbors").value,
        noiseAwareness: document.getElementById("pm-noise").value,
        purpose: document.getElementById("pm-purpose").value,
      });
      const res = MFStore.runPmOnDraft();
      toast("Result", `persona ${res.result.clientPersona}`, "ok");
      render();
      return;
    }
    if (action === "pm-resuvey") {
      MFStore.get().ui.pmStep = "survey";
      MFStore.get().sessionDraft.pmDone = false;
      MFStore.save();
      render();
      return;
    }
    if (action === "bind-mode") {
      MFStore.get().ui.bindMode = el.getAttribute("data-mode");
      MFStore.save();
      render();
      return;
    }
    if (action === "save-quick-fields") {
      const d = MFStore.get().sessionDraft;
      d.areaM2 = Number(document.getElementById("q-area").value) || d.areaM2;
      d.segment = document.getElementById("q-seg").value;
      d.noise = document.getElementById("q-noise").value;
      MFStore.save();
      toast("Черновик", "Обновлён", "ok");
      render();
      return;
    }
    if (action === "offer-mf") {
      const res = MFStore.markMultiframeOffered();
      toast("multiframe_offered", `session ${res.consultationSessionId} · без dealId`, "ok");
      render();
      return;
    }
    if (action === "pm-done") {
      MFStore.finishPmOnDraft();
      toast("PM", "Оценка зафиксирована", "ok");
      location.hash = "#/sales/calc-quick";
      return;
    }
    if (action === "calc-done") {
      MFStore.finishCalcOnDraft(
        Number(el.getAttribute("data-amount")),
        Number(el.getAttribute("data-area"))
      );
      toast("Ориентир в черновике", "Теперь привяжите к проекту", "ok");
      location.hash = "#/sales/bind";
      return;
    }
    if (action === "do-bind") {
      const mode = MFStore.get().ui.bindMode || "pick";
      const saveType = document.getElementById("bind-savetype")?.value || "profile";
      let opts = { mode, saveType };
      if (mode === "create") {
        opts.projectName = document.getElementById("bind-proj").value;
        opts.roomName = document.getElementById("bind-room").value;
        opts.client = document.getElementById("bind-client").value;
      } else {
        const pair = (document.getElementById("bind-pair")?.value || "").split("::");
        opts.projectId = pair[0];
        opts.roomId = pair[1];
      }
      const res = MFStore.bindDraft(opts);
      if (!res.ok) {
        if (res.error === "area_mismatch") {
          toast("Площади отличаются", `${res.draftArea} vs ${res.roomArea} м² — выберите явно`, "warn");
          render();
          return;
        }
        toast("Save не выполнен", res.error === "offline_queued" ? "В outbox (офлайн)" : res.error, "danger");
        render();
        return;
      }
      toast("Сохранено", `${res.saveType} → ${res.roomId}${res.amount != null ? " · " + res.amount + " ₽" : ""}`, "ok");
      location.hash = `#/sales/room/${res.projectId}/${res.roomId}`;
      return;
    }
    if (action === "bind-resolve-area") {
      const prompt = MFStore.get().ui.bindAreaPrompt;
      if (!prompt) return;
      const resolution = el.getAttribute("data-resolution");
      const res = MFStore.bindDraft({
        mode: "pick",
        saveType: prompt.saveType,
        projectId: prompt.projectId,
        roomId: prompt.roomId,
        areaResolution: resolution,
      });
      if (!res.ok) {
        toast("Save не выполнен", res.error, "danger");
        render();
        return;
      }
      toast("Сохранено", `${res.areaM2} м² · ${res.amount} ₽`, "ok");
      location.hash = `#/sales/room/${res.projectId}/${res.roomId}`;
      return;
    }
    if (action === "bind-cancel-area") {
      MFStore.get().ui.bindAreaPrompt = null;
      MFStore.save();
      render();
      return;
    }
    if (action === "save-room-calc") {
      const pid = el.getAttribute("data-pid");
      const rid = el.getAttribute("data-rid");
      const kind = el.getAttribute("data-kind");
      const amount = Number(el.getAttribute("data-amount"));
      const area = Number(el.getAttribute("data-area"));
      const res = MFStore.saveCalcToRoom(pid, rid, kind, amount, { areaM2: area });
      toast("Сохранено", `${kind} · ${res.areaM2} м² · ${res.revisionId}`, "ok");
      const back = el.getAttribute("data-back");
      location.hash = back || `#/sales/room/${pid}/${rid}`;
      return;
    }
    if (action === "create-quote") {
      const res = MFStore.createQuote(el.getAttribute("data-deal"));
      if (!res.ok) toast("КП", "Не создано", "danger");
      else toast("КП создано", res.revisionId, "ok");
      render();
      return;
    }
    if (action === "quote-copy" || action === "quote-pdf") {
      const mode = action === "quote-pdf" ? "pdf" : "copy";
      const res = MFStore.shareQuote(el.getAttribute("data-qid"), mode);
      toast(res.message || "Готово", "lifecycle не изменился (≠ sent)", "ok");
      render();
      return;
    }
    if (action === "close-quote-preview") {
      MFStore.get().ui.quotePreview = null;
      MFStore.save();
      render();
      return;
    }
    if (action === "clipboard-quote") {
      const t = MFStore.get().ui.quotePreview?.text || "";
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t);
      toast("В буфере", "Всё ещё ≠ sent", "ok");
      return;
    }
    if (action === "download-quote-pdf") {
      const t = MFStore.get().ui.quotePreview?.text || "";
      const blob = new Blob([t], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `quote-mock-${MFStore.get().ui.quotePreview?.revisionId || "demo"}.txt`;
      a.click();
      toast("Скачан макет", "Не confirm_sent", "ok");
      return;
    }
    if (action === "quote-confirm") {
      const res = MFStore.confirmSent(el.getAttribute("data-qid"));
      if (!res.ok) toast("Уже подтверждено", "", "warn");
      else toast("Отправка подтверждена", "lifecycle → sent_confirmed", "ok");
      render();
      return;
    }
    if (action === "open-pause") {
      openSheet(el.getAttribute("data-deal"), "pause");
      return;
    }
    if (action === "open-decline") {
      openSheet(el.getAttribute("data-deal"), "decline");
      return;
    }
    if (action === "close-sheet") {
      const host = document.getElementById("deal-sheet");
      if (host) host.innerHTML = "";
      return;
    }
    if (action === "confirm-sheet") {
      const mode = el.getAttribute("data-mode");
      const dealId = el.getAttribute("data-deal");
      const reason = document.getElementById("sheet-reason").value;
      const res = mode === "pause" ? MFStore.pauseDeal(dealId, reason) : MFStore.declineDeal(dealId, reason);
      if (!res.ok) {
        toast("Нужна причина", "", "danger");
        return;
      }
      toast(mode === "pause" ? "На паузе" : "Отказ зафиксирован", dealId, "ok");
      render();
      return;
    }
    if (action === "resume-deal") {
      const res = MFStore.resumeDeal(el.getAttribute("data-deal"));
      toast("Возобновлено", `Тот же dealId · этап «${res.stage}»`, "ok");
      render();
      return;
    }
    if (action === "open-accept") {
      openAcceptSheet(el.getAttribute("data-deal"));
      return;
    }
    if (action === "confirm-accept") {
      const dealId = el.getAttribute("data-deal");
      const map = {};
      document.querySelectorAll("[data-assent-room]").forEach((sel) => {
        map[sel.getAttribute("data-assent-room")] = sel.value;
      });
      const res = MFStore.acceptDeal(dealId, map);
      if (!res.ok) {
        const msg =
          res.error === "need_one_ordered"
            ? "Нужна ≥1 ordered"
            : res.error === "assent_incomplete"
            ? `Выберите согласие: ${res.roomName || res.roomId}`
            : res.error;
        toast("Не принято · state не изменён", msg, "danger");
        return;
      }
      toast("Accepted", `ordered ${res.ordered.length} · ${res.acceptedAmount} ₽`, "ok");
      render();
      return;
    }
    if (action === "close-accepted") {
      const res = MFStore.closeAcceptedDeal(el.getAttribute("data-deal"));
      if (!res.ok) {
        const names = (res.unfinished || []).map((u) => u.name).join(", ");
        toast("A-06: закрытие запрещено", names ? `Не закрыт монтаж: ${names}` : res.error, "danger");
        render();
        return;
      }
      toast("Deal закрыта", "Можно sequential", "ok");
      render();
      return;
    }
    if (action === "sequential-deal") {
      const res = MFStore.createSequentialDeal(el.getAttribute("data-pid"));
      if (!res.ok) toast("Нет", res.error, "danger");
      else toast("Новая Deal", res.dealId, "ok");
      render();
      return;
    }
    if (action === "academy-choice") {
      const st = MFStore.get();
      const node = el.getAttribute("data-node");
      const text = el.getAttribute("data-text");
      const next = el.getAttribute("data-next");
      const cid = el.getAttribute("data-cid");
      st.ui.academyPath = st.ui.academyPath || [];
      st.ui.academyChoices = st.ui.academyChoices || [];
      st.ui.academyPath.push({ node, text });
      st.ui.academyChoices.push({ id: cid, text });
      st.ui.academyNode = next;
      MFStore.save();
      if (MFViews.ANNA[next]?.end) {
        MFStore.completeAcademy(st.ui.academyChoices);
      }
      render();
      return;
    }
    if (action === "academy-reset") {
      MFStore.resetAcademy();
      render();
      return;
    }
    if (action === "install-tab") {
      MFStore.get().ui.installMode = el.getAttribute("data-tab");
      MFStore.save();
      render();
      return;
    }
    if (action === "toggle-check") {
      MFStore.toggleChecklist(el.getAttribute("data-pid"), el.getAttribute("data-rid"), el.getAttribute("data-cid"), {
        done: el.checked,
        na: false,
      });
      return;
    }
    if (action === "mark-na") {
      const reason = prompt("Причина N/A", "Не применимо на объекте") || "";
      MFStore.toggleChecklist(el.getAttribute("data-pid"), el.getAttribute("data-rid"), el.getAttribute("data-cid"), {
        done: false,
        na: true,
        reason,
      });
      render();
      return;
    }
    if (action === "na-reason") {
      MFStore.toggleChecklist(el.getAttribute("data-pid"), el.getAttribute("data-rid"), el.getAttribute("data-cid"), {
        reason: el.value,
        na: !!el.value.trim(),
      });
      return;
    }
    if (action === "set-blocker") {
      MFStore.setBlocker(
        el.getAttribute("data-pid"),
        el.getAttribute("data-rid"),
        document.getElementById("blk-type").value,
        document.getElementById("blk-note").value
      );
      toast("Blocker", "Закрытие комнаты заблокировано", "warn");
      MFStore.get().ui.installMode = "checklist";
      MFStore.save();
      render();
      return;
    }
    if (action === "clear-blocker") {
      MFStore.clearBlocker(el.getAttribute("data-pid"), el.getAttribute("data-rid"));
      toast("Blocker снят", "", "ok");
      render();
      return;
    }
    if (action === "close-install") {
      const res = MFStore.tryCloseInstall(el.getAttribute("data-pid"), el.getAttribute("data-rid"));
      if (!res.ok) {
        toast(
          "Нельзя закрыть",
          res.error === "blocker"
            ? "Открыт blocker"
            : res.error === "checklist_missing"
            ? "Чек-лист отсутствует"
            : "Чек-лист неполный",
          "danger"
        );
        return;
      }
      toast("Комната закрыта", "Checklist выполнен", "ok");
      location.hash = "#/crew/home";
      return;
    }
    if (action === "save-assign") {
      const pid = el.getAttribute("data-pid");
      const rid = el.getAttribute("data-rid");
      MFStore.assignRoom(pid, rid, "assigneeMeasurer", document.getElementById("asg-m").value || null);
      MFStore.assignRoom(pid, rid, "assigneeCrew", document.getElementById("asg-c").value || null);
      MFStore.setMaterials(pid, rid, document.getElementById("asg-mat").checked);
      // clear assign inbox item
      MFStore.get().ownerInbox = MFStore.get().ownerInbox.filter(
        (i) => !(i.kind === "assign" && i.roomId === rid)
      );
      MFStore.save();
      toast("Назначение сохранено", "", "ok");
      location.hash = "#/owner/home";
      return;
    }
    if (action === "admin-step") {
      MFStore.get().ui.adminStep = el.getAttribute("data-step");
      MFStore.save();
      render();
      return;
    }
    if (action === "create-intervention") {
      const partnerId = el.getAttribute("data-partner");
      const existing = MFStore.get().partners.find((p) => p.id === partnerId)?.intervention;
      if (existing) {
        MFStore.get().ui.adminStep = "intervene";
        MFStore.save();
        render();
        return;
      }
      const hyp = document.getElementById("hyp")?.value || "Stall follow-up";
      const res = MFStore.createIntervention(partnerId, hyp, "quote_followup");
      toast("Intervention", res.id, "ok");
      MFStore.get().ui.adminStep = "intervene";
      MFStore.save();
      render();
      return;
    }
    if (action === "verify-int") {
      const res = MFStore.verifyIntervention(el.getAttribute("data-iid"), el.getAttribute("data-result"));
      toast("Verify", `${el.getAttribute("data-result")} · before/after adoption`, "ok");
      render();
      return;
    }

    if (action === "save-detailed") {
      const pid = el.getAttribute("data-pid");
      const rid = el.getAttribute("data-rid");
      const bomMeta = JSON.parse(document.getElementById("bom-json").textContent);
      bomMeta.forEach((b, i) => {
        const inp = document.querySelector(`[data-bom-qty="${i}"]`);
        if (inp) b.qty = Number(inp.value);
      });
      const forceConflict = !!document.getElementById("det-409")?.checked;
      const currentRev = MFStore.room(pid, rid)?.detailed?.revisionId || null;
      const res = MFStore.saveDetailedCalc(pid, rid, {
        lengthM: document.getElementById("det-L").value,
        widthM: document.getElementById("det-W").value,
        cutouts: document.getElementById("det-cut").value,
        schemeLabel: document.getElementById("det-sch").value,
        bom: bomMeta,
        forceConflict,
        // GC2-P1-02: optimistic expected = current; stale only when demo checkbox on
        expectedRevision: forceConflict ? "stale_other_device" : currentRev,
      });
      if (!res.ok && res.error === "conflict_409") {
        toast("409 Conflict", "current не перезаписан · обе revision в истории", "warn");
        render();
        return;
      }
      toast("Detailed сохранён", `${res.revisionId} · схема ${res.scheme.id}`, "ok");
      location.hash = `#/measurer/room/${pid}/${rid}`;
      return;
    }
    if (action === "clear-conflict") {
      const rid = el.getAttribute("data-rid") || MFStore.get().ui.conflictDemo?.roomId;
      if (rid) MFStore.dismissConflictBanner(rid);
      else {
        MFStore.get().ui.conflictDemo = null;
        MFStore.save();
      }
      toast("Баннер скрыт", "incoming сохранён в pendingConflicts", "ok");
      render();
      return;
    }
    if (action === "conflict-keep" || action === "conflict-apply" || action === "conflict-retry") {
      const pid = el.getAttribute("data-pid");
      const rid = el.getAttribute("data-rid");
      const choice =
        action === "conflict-keep" ? "keep_current" : action === "conflict-apply" ? "apply_incoming" : "retry";
      const res = MFStore.resolveConflict(pid, rid, choice);
      if (!res.ok) {
        toast("Conflict", res.error, "danger");
        render();
        return;
      }
      toast(
        choice === "keep_current"
          ? "Оставлен current"
          : choice === "apply_incoming"
          ? "Восстановлен ваш вариант"
          : "Retry prefills",
        res.revisionId || "",
        "ok"
      );
      render();
      return;
    }
    if (action === "ensure-checklist") {
      MFStore.ensureChecklist(el.getAttribute("data-pid"), el.getAttribute("data-rid"));
      toast("Чек-лист создан", "Заполните пункты", "ok");
      render();
      return;
    }
    if (action === "create-staff") {
      const name = document.getElementById("st-name").value.trim();
      if (!name) { toast("Имя обязательно", "", "danger"); return; }
      MFStore.createStaff({ name, role: document.getElementById("st-role").value });
      toast("Сотрудник", "one-time пароль на экране", "ok");
      render();
      return;
    }
    if (action === "reset-staff") {
      MFStore.resetStaffCredentials(el.getAttribute("data-uid"));
      toast("Пароль сброшен", "показан один раз", "ok");
      render();
      return;
    }
    if (action === "dismiss-cred") {
      MFStore.dismissOneTimeCred();
      render();
      return;
    }
    if (action === "toggle-loading") {
      MFStore.setLoadingDemo(!MFStore.get().ui.loadingDemo);
      render();
      return;
    }

  }

  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", () => {
    if (!location.hash) location.hash = "#/login";
    render();
  });
})();
