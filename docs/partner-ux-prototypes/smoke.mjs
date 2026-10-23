#!/usr/bin/env node
/**
 * Executable Gate C store smoke — rev-gate-c-draft-4
 *
 * Usage (from this directory):
 *   node smoke.mjs
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

const failed = results.filter((r) => !r.ok);
console.log("\n===" , `${results.filter((r) => r.ok).length}/${results.length}`, failed.length ? "FAILED" : "PASS", "===");
if (failed.length) {
  failed.forEach((f) => console.error(" -", f.name, f.detail));
  process.exit(1);
}
