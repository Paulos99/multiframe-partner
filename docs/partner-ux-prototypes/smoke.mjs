#!/usr/bin/env node
/**
 * Executable Gate C store smoke — rev-gate-c-draft-12
 *
 * Usage (from this directory or repo root):
 *   node docs/partner-ux-prototypes/smoke.mjs
 *   cd docs/partner-ux-prototypes && node smoke.mjs
 *
 * Exit 0 = all PASS. Not human UX testing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(__dirname, "assets/store.js");

const local = {};
const sandbox = {
  window: {},
  localStorage: {
    getItem: (k) => (k in local ? local[k] : null),
    setItem: (k, v) => {
      local[k] = String(v);
    },
    removeItem: (k) => {
      delete local[k];
    },
  },
  console,
};
sandbox.window = sandbox;
sandbox.global = sandbox;

vm.runInNewContext(fs.readFileSync(storePath, "utf8"), sandbox, { filename: "store.js" });
const MFStore = sandbox.MFStore || sandbox.window.MFStore;

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(cond ? "PASS" : "FAIL", name, detail || "");
}

MFStore.resetAll();
MFStore.setRole("sales");

// --- GC3-P0-01: bind adopt keeps 21 / 71400 on reopen path ---
MFStore.startQuickConsultation("noise");
MFStore.updatePmAnswers({ areaM2: 21 });
MFStore.runPmOnDraft();
MFStore.finishCalcOnDraft(71400, 21);
let bind = MFStore.bindDraft({
  mode: "pick",
  saveType: "both",
  projectId: "prj_nv_soroka",
  roomId: "room_sor_bedroom",
});
check("P0-01 mismatch prompts", !bind.ok && bind.error === "area_mismatch", bind.error);
bind = MFStore.bindDraft({
  mode: "pick",
  saveType: "both",
  projectId: "prj_nv_soroka",
  roomId: "room_sor_bedroom",
  areaResolution: "adopt_consultation",
});
check("P0-01 adopt bind ok", bind.ok, JSON.stringify(bind));
let room = MFStore.room("prj_nv_soroka", "room_sor_bedroom");
check("P0-01 room.areaM2=21", room.areaM2 === 21, String(room.areaM2));
check("P0-01 prelim 71400/21", room.preliminary?.amount === 71400 && room.preliminary?.areaM2 === 21, JSON.stringify(room.preliminary));
check("P0-01 profile kept", !!room.acousticProfile, room.acousticProfile?.clientPersona);
const reopenSave = MFStore.saveCalcToRoom("prj_nv_soroka", "room_sor_bedroom", "preliminary", room.preliminary.amount, {
  areaM2: room.preliminary.areaM2,
});
room = MFStore.room("prj_nv_soroka", "room_sor_bedroom");
check(
  "P0-01 reopen save keeps identity",
  room.preliminary.amount === 71400 && room.preliminary.areaM2 === 21 && room.areaM2 === 21,
  JSON.stringify(room.preliminary)
);

// create path
MFStore.resetAll();
MFStore.setRole("sales");
MFStore.startQuickConsultation("quiet");
MFStore.updatePmAnswers({ areaM2: 21 });
MFStore.runPmOnDraft();
MFStore.finishCalcOnDraft(71400, 21);
const created = MFStore.bindDraft({
  mode: "create",
  saveType: "both",
  projectName: "Smoke Create",
  roomName: "Спальня",
  client: "Тест",
});
check("P0-01 create ok", created.ok, created.roomId);
room = MFStore.room(created.projectId, created.roomId);
check("P0-01 create area 21 / 71400", room.areaM2 === 21 && room.preliminary?.amount === 71400, JSON.stringify(room.preliminary));

// --- GC3-P0-02: quote scope only ---
MFStore.resetAll();
const q = MFStore.get().quotes.find((x) => x.dealId === "deal_nv_055" && x.lifecycle === "sent_confirmed");
q.rooms = ["room_vol_bed"]; // negative fixture — do not mutate in product UI
const scoped = MFStore.scopedRoomsForDeal("deal_nv_055").map((r) => r.id);
check("P0-02 scope bed only", scoped.length === 1 && scoped[0] === "room_vol_bed", scoped.join(","));
const ooo = MFStore.outOfQuoteCalculatedRooms("deal_nv_055").map((r) => r.id);
check("P0-02 out-of-quote liv+kit", ooo.includes("room_vol_liv") && ooo.includes("room_vol_kit"), ooo.join(","));

// --- GC3-P1-01: profile present after bind ---
MFStore.resetAll();
MFStore.setRole("sales");
MFStore.startQuickConsultation("noise");
MFStore.updatePmAnswers({ areaM2: 18 });
MFStore.runPmOnDraft();
MFStore.bindDraft({
  mode: "pick",
  saveType: "profile",
  projectId: "prj_nv_soroka",
  roomId: "room_sor_living",
});
room = MFStore.room("prj_nv_soroka", "room_sor_living");
check("P1-01 profile-only has acousticProfile", !!room.acousticProfile?.chain?.norms, room.acousticProfile?.clientPersona);
check("P1-01 profile-only no prelim forced", !room.preliminary || room.preliminary.revisionId === "crev_sl", "ok");

// --- GC3-P1-02: 409 keep + restore ---
MFStore.resetAll();
const before = JSON.parse(JSON.stringify(MFStore.room("prj_nv_volkova", "room_vol_bed")));
const conf = MFStore.saveDetailedCalc("prj_nv_volkova", "room_vol_bed", {
  lengthM: 7,
  widthM: 4,
  cutouts: 1,
  forceConflict: true,
  expectedRevision: "stale",
  bom: [{ sku: "X", name: "Incoming", qty: 9, unit: "шт" }],
});
check("P1-02 conflict", !conf.ok && conf.error === "conflict_409", conf.error);
let after = MFStore.room("prj_nv_volkova", "room_vol_bed");
check("P1-02 current unchanged", after.detailed.revisionId === before.detailed.revisionId && after.lengthM === before.lengthM);
check("P1-02 pendingConflicts kept", !!MFStore.get().pendingConflicts.room_vol_bed?.incomingPreview, "present");
MFStore.dismissConflictBanner("room_vol_bed");
check(
  "P1-02 dismiss keeps pending",
  !!MFStore.get().pendingConflicts.room_vol_bed?.incomingPreview &&
    MFStore.get().pendingConflicts.room_vol_bed.dismissed === true
);
const applied = MFStore.resolveConflict("prj_nv_volkova", "room_vol_bed", "apply_incoming");
check("P1-02 apply incoming", applied.ok && MFStore.room("prj_nv_volkova", "room_vol_bed").lengthM === 7, JSON.stringify(applied));
check("P1-02 pending cleared", !MFStore.get().pendingConflicts.room_vol_bed);

// GC3-P1-02 retry → pendingConflicts.retryPrefill (view source)
MFStore.resetAll();
MFStore.saveDetailedCalc("prj_nv_volkova", "room_vol_bed", {
  lengthM: 7,
  widthM: 4,
  cutouts: 2,
  forceConflict: true,
  expectedRevision: "stale",
  bom: [{ sku: "R", name: "RetryBOM", qty: 3, unit: "шт" }],
  schemeLabel: "retry-scheme",
});
const retry = MFStore.resolveConflict("prj_nv_volkova", "room_vol_bed", "retry");
const pref = MFStore.get().pendingConflicts.room_vol_bed?.retryPrefill;
check("P1-02 retry ok", retry.ok && retry.choice === "retry", JSON.stringify(retry));
check("P1-02 retryPrefill on pending", pref && pref.lengthM === 7 && pref.cutouts === 2, JSON.stringify(pref));
check("P1-02 current still untouched after retry", MFStore.room("prj_nv_volkova", "room_vol_bed").lengthM !== 7);
// save without 409 after retry prefill
const savedRetry = MFStore.saveDetailedCalc("prj_nv_volkova", "room_vol_bed", {
  lengthM: pref.lengthM,
  widthM: pref.widthM,
  cutouts: pref.cutouts,
  schemeLabel: pref.schemeLabel,
  bom: pref.bom,
  forceConflict: false,
  expectedRevision: MFStore.room("prj_nv_volkova", "room_vol_bed").detailed.revisionId,
});
check("P1-02 retry save ok", savedRetry.ok && savedRetry.scheme, savedRetry.error);
check("P1-02 pending cleared after save", !MFStore.get().pendingConflicts.room_vol_bed);
check("P1-02 room length=7 after retry save", MFStore.room("prj_nv_volkova", "room_vol_bed").lengthM === 7);

// Shared tools: calc-only draft without PM
MFStore.resetAll();
MFStore.setRole("sales");
MFStore.ensureCalcDraft(19);
MFStore.get().sessionDraft.segment = "comfort";
MFStore.finishCalcOnDraft(19 * 3400, 19);
check("tools calc-only draft", MFStore.get().sessionDraft.calcDone && !MFStore.get().sessionDraft.pmDone, "ok");
const calcBind = MFStore.bindDraft({
  mode: "create",
  saveType: "preliminary",
  projectName: "Calc Only",
  roomName: "Комната",
  client: "X",
});
check("tools calc-only bind", calcBind.ok && MFStore.room(calcBind.projectId, calcBind.roomId).preliminary?.areaM2 === 19);

// GC6-P0-01: crew cannot mutate projects
MFStore.resetAll();
MFStore.setRole("crew");
MFStore.ensureCalcDraft(21);
MFStore.finishCalcOnDraft(71400, 21);
const beforeBed = JSON.parse(JSON.stringify(MFStore.room("prj_nv_soroka", "room_sor_bedroom")));
const crewBind = MFStore.bindDraft({
  mode: "pick",
  saveType: "preliminary",
  projectId: "prj_nv_soroka",
  roomId: "room_sor_bedroom",
  areaResolution: "adopt_consultation",
});
check("GC6-P0-01 crew forbidden", !crewBind.ok && crewBind.error === "forbidden_role", JSON.stringify(crewBind));
const afterBed = MFStore.room("prj_nv_soroka", "room_sor_bedroom");
check(
  "GC6-P0-01 crew no mutate",
  afterBed.areaM2 === beforeBed.areaM2 &&
    JSON.stringify(afterBed.preliminary) === JSON.stringify(beforeBed.preliminary) &&
    afterBed.acousticProfile === beforeBed.acousticProfile
);
const personal = MFStore.savePersonalResult();
check("GC6-P0-01 crew personal ok", personal.ok && personal.personal, personal.id);
check(
  "GC6-P0-01 personal leaves room",
  MFStore.room("prj_nv_soroka", "room_sor_bedroom").areaM2 === beforeBed.areaM2
);

// admin also forbidden
MFStore.resetAll();
MFStore.setRole("admin");
MFStore.ensureCalcDraft(16);
MFStore.finishCalcOnDraft(54400, 16);
const adminBind = MFStore.bindDraft({
  mode: "create",
  saveType: "preliminary",
  projectName: "Hack",
  roomName: "X",
  client: "Y",
});
check("GC6-P0-01 admin forbidden", !adminBind.ok && adminBind.error === "forbidden_role", JSON.stringify(adminBind));
check("GC6-P0-01 admin no new project", !MFStore.get().projects.some((p) => p.name === "Hack"));

// GC6-P0-02: bindPickPair persists across saveType (store-level contract)
MFStore.resetAll();
MFStore.setRole("sales");
MFStore.startQuickConsultation("noise");
MFStore.updatePmAnswers({ areaM2: 18 });
MFStore.runPmOnDraft();
MFStore.finishCalcOnDraft(61200, 18);
MFStore.get().ui.bindPickPair = "prj_nv_soroka::room_sor_living";
MFStore.get().ui.bindSaveType = "both";
MFStore.save();
MFStore.get().ui.bindSaveType = "profile";
MFStore.save();
check(
  "GC6-P0-02 pair retained after saveType flip",
  MFStore.get().ui.bindPickPair === "prj_nv_soroka::room_sor_living"
);
const livingBind = MFStore.bindDraft({
  mode: "pick",
  saveType: "profile",
  projectId: "prj_nv_soroka",
  roomId: "room_sor_living",
});
check("GC6-P0-02 binds living", livingBind.ok && livingBind.roomId === "room_sor_living", JSON.stringify(livingBind));
check(
  "GC6-P0-02 bedroom untouched",
  !MFStore.room("prj_nv_soroka", "room_sor_bedroom").acousticProfile
);
check(
  "GC6-P0-02 living has profile",
  !!MFStore.room("prj_nv_soroka", "room_sor_living").acousticProfile
);

MFStore.resetAll();
MFStore.setRole("sales");
const ingC = MFStore.ingestCalcToolResult({ areaM2: 20, panelsCost: 68000, inputMode: "area" });
check("GC6-P0-03 ingest calc snapshot", ingC.ok && MFStore.get().sessionDraft.calcDone && MFStore.get().sessionDraft.amount === 68000);
check("GC6-P0-03 calc draft area 20", MFStore.draftAreaM2(MFStore.get().sessionDraft) === 20);
MFStore.resetAll();
MFStore.setRole("sales");
const badCalc = MFStore.ingestCalcToolResult({});
check("GC9-P0-01 reject fake calc payload", !badCalc.ok && badCalc.error === "invalid_calc_payload");
const bad14 = MFStore.ingestCalcToolResult({ areaM2: 14 });
check("GC9-P0-01 reject amount-only 14m²", !bad14.ok);
MFStore.resetAll();
MFStore.setRole("sales");
const ingP = MFStore.ingestPmToolResult({
  result: {
    areaM2: 21,
    roomType: "bedroom",
    clientPersona: "noise",
    currentRisk: "повышенный",
    narrative: "demo",
    answers: { basics: "bedroom", noisyNeighbors: "often_noisy", plannedCeiling: "stretch", areaM2: 21 },
    chain: { norms: "n", current: "c", withMf: "m", difference: "d", nextStep: "s" },
  },
});
check("GC6-P0-03 ingest pm snapshot", ingP.ok && MFStore.get().sessionDraft.pmDone && MFStore.get().sessionDraft.pmResult.areaM2 === 21);
check("GC6-P0-03 PM area 21", MFStore.draftAreaM2(MFStore.get().sessionDraft) === 21);
check("GC6-P0-03 pm stretch preset", MFStore.get().sessionDraft.answers.plannedCeiling === "stretch");

const qs = MFStore.buildCalcIframeQuery(null);
check("GC9-P0-01 partner=1", qs.includes("partner=1"));
check("GC9-P0-01 gateC=1", qs.includes("gateC=1"));
check("GC9-P0-01 walls=0", qs.includes("walls=0"));
MFStore.resetAll();
MFStore.setRole("sales");
MFStore.ensurePmDraft("");
const dPm = MFStore.get().sessionDraft;
dPm.pmDone = true;
dPm.answers = { ...(dPm.answers || {}), areaM2: 21 };
const qsHandoff = MFStore.buildCalcIframeQuery(dPm);
check("GC9-P0-01 PM area handoff", qsHandoff.includes("area=21"));

const calcApp = fs.readFileSync(path.join(__dirname, "tools/calculator/src/ui/app.js"), "utf8");
check("GC10-P0-01 walls unset helper", calcApp.includes("defaultWallSurfaceIdsWhenUnset"));
check("GC10-P0-01 ceiling bind totals", calcApp.includes("bomTotalsForPartnerBind"));
const bomJs = fs.readFileSync(path.join(__dirname, "tools/calculator/src/calculators/materials-bom.js"), "utf8");
check("GC11-P1-01 finalizePartnerBomTotals", bomJs.includes("finalizePartnerBomTotals"));
check("GC11 quick area finalize", calcApp.includes("finalizePartnerBomTotals(state.bom)"));
check("rev-gate-c-draft-12", MFStore.get().revision === "rev-gate-c-draft-12");

const failed = results.filter((r) => !r.ok);
console.log("\n===" , `${results.filter((r) => r.ok).length}/${results.length}`, failed.length ? "FAILED" : "PASS", "===");
if (failed.length) {
  failed.forEach((f) => console.error(" -", f.name, f.detail));
  process.exit(1);
}
