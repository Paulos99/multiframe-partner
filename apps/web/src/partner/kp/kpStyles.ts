/** Стили КП: образец handover/kp-demo, с выровненной сеткой и без пустоты внизу страницы. */
export const KP_CSS = `* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #e8eeeb; color: #152018;
  font-family: Inter, "Segoe UI", system-ui, Roboto, Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page {
  width: 794px; height: 1123px; margin: 0 auto 24px; background: #f4f7f6;
  padding: 22px 28px 28px; position: relative; overflow: hidden;
  page-break-after: always;
}
.page::before {
  content:''; position:absolute; left:0; top:0; right:0; height:4px;
  background: linear-gradient(90deg, #0c332c 0%, #01644f 45%, #2ab38b 100%);
}
.top { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding-bottom:8px; border-bottom:1px solid #dce6e1; }
.lockup { display:flex; align-items:center; gap:9px; min-width:0; }
.lockup img.stp { height:26px; width:auto; display:block; }
.lockup img.mf { height:19px; width:auto; display:block; }
.doc-title { font-size:12.5px; font-weight:650; color:#5f6b73;
  padding-left:9px; border-left:1px solid #dce6e1; white-space:nowrap; }
.badges { display:flex; gap:7px; align-items:center; }
.pill { display:inline-flex; align-items:center; justify-content:center;
  height:24px; padding:0 12px; border-radius:999px; font-size:11px; font-weight:750; }
.pill.kind { background:#dceee8; color:#01644f; }
.meta { display:flex; justify-content:space-between; gap:16px;
  padding:8px 0 0; font-size:11.5px; color:#5f6b73; }
.meta b { color:#152018; font-weight:700; }
.hero {
  margin-top:10px; padding:12px 16px; border-radius:12px;
  background: linear-gradient(135deg, #0c332c 0%, #01644f 55%, #0f463c 100%);
  color:#e8f2ef; box-shadow:0 8px 20px rgba(1,100,79,.15);
}
.hero h1 { margin:0 0 3px; font-size:18px; font-weight:800; color:#fff; letter-spacing:-.01em; }
.hero .sub { margin:0; font-size:12px; color:#c7ddd5; line-height:1.35; }
.hero .sub b { color:#fff; font-weight:750; }
h2 { margin:12px 0 6px; font-size:13px; font-weight:800; color:#0f1c16;
  display:flex; align-items:center; gap:7px; }
.h2-idx { display:inline-flex; align-items:center; justify-content:center;
  width:20px; height:20px; border-radius:6px; background:#dceee8; color:#01644f;
  font-size:10px; font-weight:800; }
.summary { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; }
.summary .cell { background:#fff; border:1px solid #dce6e1; border-radius:9px; padding:8px 9px; }
.summary .k { display:block; font-size:9.5px; font-weight:650; color:#5f6b73; margin-bottom:2px; }
.summary .v { display:block; font-size:12.5px; font-weight:750; color:#0f1c16; }
.effect { display:grid; grid-template-columns:minmax(0,0.95fr) minmax(0,1.7fr) 136px; gap:8px; align-items:stretch; }
.effect-card { background:#fff; border:1px solid #dce6e1; border-radius:11px; padding:14px 12px 11px; overflow:visible; }
.effect-card.before { background:#f7faf8; }
.effect-card.after {
  background:linear-gradient(155deg,#01644f,#0c332c); border-color:#01644f; color:#fff;
}
.effect-card .label {
  display:inline-flex; align-items:center; height:18px; padding:0 8px; border-radius:999px;
  font-size:9px; font-weight:750; letter-spacing:.03em; text-transform:uppercase; margin-bottom:6px;
}
.effect-card.before .label { background:#68757e; color:#fff; }
.effect-card.after .label { background:rgba(255,255,255,.18); color:#fff; }
.effect-card .cls { margin:0 0 5px; font-size:15px; font-weight:800; }
.effect-card.before .cls { color:#0f1c16; }
.effect-card .note { margin:0; font-size:11px; line-height:1.35; color:#5f6b73; }
.effect-card.after .note { color:#c7ddd5; }
.pct-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-top:8px; }
.pct {
  background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.16);
  border-radius:8px; padding:7px 7px 6px; min-width:0;
}
.pct .pk { display:block; font-size:8.5px; font-weight:650; color:#9fc4b7; margin-bottom:3px; line-height:1.2; }
.pct .pv {
  display:block; font-size:10.5px; font-weight:800; color:#fff; line-height:1.2;
  letter-spacing:-0.015em; white-space:nowrap;
}
.pct .po { display:block; margin-top:3px; font-size:7.5px; font-weight:600; color:#9fc4b7; }
.qr-effect {
  background:#fff; border:1px solid #dce6e1; border-radius:11px; padding:10px 8px;
  display:flex; flex-direction:column; align-items:center; text-align:center; justify-content:center;
  min-height:100%;
}
.qr-effect img { width:100px; height:100px; display:block; image-rendering:pixelated; }
.qr-effect .k { margin-top:6px; font-size:9.5px; font-weight:750; color:#01644f; text-transform:uppercase; letter-spacing:.04em; }
.qr-effect .t { margin:3px 0 0; font-size:10.5px; font-weight:700; color:#0f1c16; line-height:1.25; }
.rooms { display:grid; gap:6px; width:100%; }
.rooms[data-count="1"] { grid-template-columns:1fr; }
.rooms[data-count="2"] { grid-template-columns:1fr 1fr; }
.rooms[data-count="3"] { grid-template-columns:1fr 1fr 1fr; }
.rooms[data-count="4"],
.rooms[data-count="5"],
.rooms[data-count="6"] { grid-template-columns:1fr 1fr; }
.room { background:#fff; border:1px solid #dce6e1; border-radius:10px; padding:9px 11px; width:100%; min-width:0; }
.rooms[data-count="1"] .room { padding:11px 14px; }
.rooms[data-count="1"] .room-grid { grid-template-columns:1fr 1fr; column-gap:24px; row-gap:4px; }
.room-head { display:flex; justify-content:space-between; align-items:baseline;
  margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid #e4ebe7; }
.room-head strong { font-size:12px; font-weight:800; color:#0f1c16; }
.room-head span { font-size:11px; font-weight:700; color:#01644f; }
.room-grid { display:grid; gap:3px; }
.room-grid > div { display:flex; justify-content:space-between; gap:8px; font-size:10.5px; }
.room-grid .k { color:#5f6b73; }
.room-grid .v { font-weight:700; color:#0f1c16; font-variant-numeric:tabular-nums; white-space:nowrap; }
.room-grid .v.accent { color:#01644f; font-weight:800; }
.hint { margin:6px 0 0; font-size:9.5px; color:#7a8790; line-height:1.35; }
.table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #dce6e1;
  border-radius:10px; overflow:hidden; font-size:11px; }
.table th, .table td { padding:6px 10px; text-align:left; border-bottom:1px solid #e4ebe7;
  font-variant-numeric:tabular-nums; }
.table th { background:#f7faf8; font-size:9.5px; font-weight:750; color:#5f6b73;
  text-transform:uppercase; letter-spacing:.03em; }
.table td.num, .table th.num { text-align:right; }
.table tr:last-child td { border-bottom:none; }
.table .group { background:#fafcfb; font-weight:700; color:#0f1c16; }
.table .muted { color:#5f6b73; font-weight:500; }
.total-bar {
  margin-top:6px; display:flex; justify-content:space-between; align-items:center;
  padding:10px 14px; border-radius:10px;
  background:linear-gradient(135deg,#0c332c 0%,#01644f 100%); color:#fff;
}
.total-bar .k { font-size:11.5px; font-weight:650; color:#c7ddd5; }
.total-bar .v { font-size:18px; font-weight:800; letter-spacing:-.01em; }
.footer {
  position:absolute; left:28px; right:28px; bottom:14px;
  display:flex; justify-content:space-between; align-items:center;
  padding-top:7px; border-top:1px solid #dce6e1; font-size:9.5px; color:#7a8790;
}
.about {
  display:grid; grid-template-columns:118px 1fr; gap:14px;
  background:#fff; border:1px solid #dce6e1; border-radius:12px; padding:13px 15px; align-items:start;
}
.about img { width:118px; height:auto; display:block; margin-top:2px; }
.about h3 { margin:0 0 6px; font-size:14px; font-weight:800; color:#0f1c16; }
.about p { margin:0 0 7px; font-size:12px; line-height:1.45; color:#3a4740; }
.about p:last-child { margin-bottom:0; }
.pillars { display:grid; grid-template-columns:1fr 1fr; gap:7px; list-style:none; margin:0; padding:0; }
.pillars li {
  background:#fff; border:1px solid #dce6e1; border-radius:10px;
  padding:9px 11px 9px 12px; border-left:3px solid #01644f;
}
.pillars .t { display:block; font-size:11.5px; font-weight:800; color:#0f1c16; margin-bottom:2px; }
.pillars .d { display:block; font-size:11px; line-height:1.35; color:#5f6b73; }
.pillars li:last-child:nth-child(odd) { grid-column:1 / -1; }
.next { display:grid; grid-template-columns:1.35fr 1fr 1fr; gap:8px; }
.next-card { background:#fff; border:1px solid #dce6e1; border-radius:12px; padding:13px; }
.next-card h3 { margin:0 0 6px; font-size:12.5px; font-weight:800; color:#0f1c16; }
.next-card p, .next-card li { margin:0; font-size:11.5px; line-height:1.4; color:#5f6b73; }
.next-card ol { margin:0; padding-left:16px; }
.next-card ol li { margin-bottom:3px; }
.next-card .contact-line { margin-top:8px; font-size:12px; font-weight:700; color:#0f1c16; }
.next-card .phone-line { margin-top:4px; font-size:11.5px; color:#5f6b73; }
.qr-mini { display:flex; gap:10px; align-items:center; }
.qr-mini img { width:72px; height:72px; flex:0 0 auto; }
.qr-mini .k { font-size:10px; font-weight:750; color:#01644f; text-transform:uppercase; letter-spacing:.04em; }
.qr-mini .t { font-size:12px; font-weight:800; color:#0f1c16; margin-top:2px; }
.qr-mini .u { font-size:9.5px; color:#7a8790; margin-top:2px; line-height:1.25; }
.disclaimer {
  margin-top:14px; padding:11px 13px; border-radius:10px;
  background:#f7faf8; border:1px solid #dce6e1; font-size:11px; line-height:1.4; color:#5f6b73;
}
.disclaimer b { color:#0f1c16; }

.page[data-density="comfortable"] h2 { margin:14px 0 7px; }
.page[data-density="comfortable"] .hero { margin-top:12px; padding:13px 16px; }
.page[data-density="comfortable"] .summary .cell { padding:10px 9px; }
.page[data-density="comfortable"] .effect-card { padding:13px 13px 11px; }
.page[data-density="comfortable"] .room { padding:11px 12px; }
.page[data-density="comfortable"] .table th, .page[data-density="comfortable"] .table td { padding:7px 10px; }
.page[data-density="comfortable"] .total-bar { padding:11px 14px; margin-top:8px; }
.page[data-density="balanced"] .about { margin-top:2px; }
.page[data-density="airy"] .next { margin-top:4px; }
.page[data-density="airy"] .next-card { padding:16px 14px; min-height:148px; }
.page[data-density="airy"] .disclaimer { margin-top:18px; padding:14px 14px; }
.page[data-density="airy"] h2 { margin:16px 0 8px; }
.page[data-density="airy"] .qr-mini img { width:78px; height:78px; }
.page[data-density="comfortable"] .about { margin-top:4px; }
.page[data-density="comfortable"] .pillars { gap:8px; }
.page[data-density="comfortable"] .pillars li { padding:10px 12px; }
.page[data-density="comfortable"] .next-card { padding:14px; }
.page[data-density="comfortable"] .disclaimer { margin-top:16px; }
@media print { body { background:#fff; } .page { margin:0; } }
`;
