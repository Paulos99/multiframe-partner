/** Стили КП: один в один с утверждённым образцом (handover/kp-demo/kp-demo.html). */
export const KP_CSS = `* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #e8eeeb; color: #152018;
  font-family: Inter, "Segoe UI", system-ui, Roboto, Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page {
  width: 794px; height: 1123px; margin: 0 auto 24px; background: #f4f7f6;
  padding: 20px 26px 22px; position: relative; overflow: hidden;
  page-break-after: always;
}
.page::before {
  content:''; position:absolute; left:0; top:0; right:0; height:4px;
  background: linear-gradient(90deg, #0c332c 0%, #01644f 45%, #2ab38b 100%);
}
.top { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding-bottom:7px; border-bottom:1px solid #dce6e1; }
.lockup { display:flex; align-items:center; gap:9px; min-width:0; }
.lockup img.stp { height:24px; width:auto; display:block; }
.lockup img.mf { height:18px; width:auto; display:block; }
.doc-title { font-size:12px; font-weight:650; color:#5f6b73;
  padding-left:9px; border-left:1px solid #dce6e1; white-space:nowrap; }
.badges { display:flex; gap:7px; align-items:center; }
.pill { display:inline-flex; align-items:center; justify-content:center;
  height:22px; padding:0 10px; border-radius:999px; font-size:10px; font-weight:750; }
.pill.demo { background:#fff3cd; color:#7a5b00; border:1px solid #f0d98a; }
.pill.kind { background:#dceee8; color:#01644f; }
.meta { display:flex; justify-content:space-between; gap:16px;
  padding:6px 0 0; font-size:10.5px; color:#5f6b73; }
.meta b { color:#152018; font-weight:700; }
.hero {
  margin-top:9px; padding:10px 14px; border-radius:11px;
  background: linear-gradient(135deg, #0c332c 0%, #01644f 55%, #0f463c 100%);
  color:#e8f2ef; box-shadow:0 8px 20px rgba(1,100,79,.15);
}
.hero h1 { margin:0 0 2px; font-size:17px; font-weight:800; color:#fff; letter-spacing:-.01em; }
.hero .sub { margin:0; font-size:11.5px; color:#c7ddd5; line-height:1.35; }
.hero .sub b { color:#fff; font-weight:750; }
h2 { margin:9px 0 5px; font-size:12.5px; font-weight:800; color:#0f1c16;
  display:flex; align-items:center; gap:6px; }
.h2-idx { display:inline-flex; align-items:center; justify-content:center;
  width:18px; height:18px; border-radius:5px; background:#dceee8; color:#01644f;
  font-size:10px; font-weight:800; }
.summary { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; }
.summary .cell { background:#fff; border:1px solid #dce6e1; border-radius:8px; padding:7px 8px; }
.summary .k { display:block; font-size:9px; font-weight:650; color:#5f6b73; margin-bottom:1px; }
.summary .v { display:block; font-size:12px; font-weight:750; color:#0f1c16; }
.effect { display:grid; grid-template-columns:1fr 1.35fr 112px; gap:7px; align-items:stretch; }
.effect-card { background:#fff; border:1px solid #dce6e1; border-radius:10px; padding:9px 11px; }
.effect-card.before { background:#f7faf8; }
.effect-card.after {
  background:linear-gradient(155deg,#01644f,#0c332c); border-color:#01644f; color:#fff;
}
.effect-card .label {
  display:inline-flex; align-items:center; height:17px; padding:0 7px; border-radius:999px;
  font-size:8px; font-weight:750; letter-spacing:.04em; text-transform:uppercase; margin-bottom:5px;
}
.effect-card.before .label { background:#68757e; color:#fff; }
.effect-card.after .label { background:rgba(255,255,255,.18); color:#fff; }
.effect-card .cls { margin:0 0 4px; font-size:15px; font-weight:800; }
.effect-card.before .cls { color:#0f1c16; }
.effect-card .note { margin:0; font-size:10.5px; line-height:1.3; color:#5f6b73; }
.effect-card.after .note { color:#c7ddd5; }
.pct-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; margin-top:7px; }
.pct {
  background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.16);
  border-radius:7px; padding:5px 6px;
}
.pct .pk { display:block; font-size:8px; font-weight:650; color:#9fc4b7; margin-bottom:1px; }
.pct .pv { display:block; font-size:11px; font-weight:800; color:#fff; line-height:1.2; }
.pct .po { display:block; margin-top:1px; font-size:7.5px; font-weight:600; color:#9fc4b7; }
.qr-effect {
  background:#fff; border:1px solid #dce6e1; border-radius:10px; padding:7px;
  display:flex; flex-direction:column; align-items:center; text-align:center; justify-content:center;
}
.qr-effect img { width:92px; height:92px; display:block; image-rendering:pixelated; }
.qr-effect .k { margin-top:4px; font-size:9px; font-weight:750; color:#01644f; text-transform:uppercase; letter-spacing:.04em; }
.qr-effect .t { margin:2px 0 0; font-size:10px; font-weight:700; color:#0f1c16; line-height:1.2; }
.rooms { display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; }
.room { background:#fff; border:1px solid #dce6e1; border-radius:9px; padding:7px 9px; }
.room-head { display:flex; justify-content:space-between; align-items:baseline;
  margin-bottom:5px; padding-bottom:4px; border-bottom:1px solid #e4ebe7; }
.room-head strong { font-size:11.5px; font-weight:800; color:#0f1c16; }
.room-head span { font-size:10px; font-weight:700; color:#01644f; }
.room-grid { display:grid; gap:2px; }
.room-grid > div { display:flex; justify-content:space-between; gap:6px; font-size:10px; }
.room-grid .k { color:#5f6b73; }
.room-grid .v { font-weight:700; color:#0f1c16; font-variant-numeric:tabular-nums; white-space:nowrap; }
.room-grid .v.accent { color:#01644f; font-weight:800; }
.hint { margin:5px 0 0; font-size:9px; color:#7a8790; line-height:1.3; }
.table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #dce6e1;
  border-radius:9px; overflow:hidden; font-size:10.5px; }
.table th, .table td { padding:5px 9px; text-align:left; border-bottom:1px solid #e4ebe7;
  font-variant-numeric:tabular-nums; }
.table th { background:#f7faf8; font-size:9px; font-weight:750; color:#5f6b73;
  text-transform:uppercase; letter-spacing:.03em; }
.table td.num, .table th.num { text-align:right; }
.table tr:last-child td { border-bottom:none; }
.table .group { background:#fafcfb; font-weight:700; color:#0f1c16; }
.table .muted { color:#5f6b73; font-weight:500; }
.total-bar {
  margin-top:5px; display:flex; justify-content:space-between; align-items:center;
  padding:8px 12px; border-radius:9px;
  background:linear-gradient(135deg,#0c332c 0%,#01644f 100%); color:#fff;
}
.total-bar .k { font-size:11px; font-weight:650; color:#c7ddd5; }
.total-bar .v { font-size:17px; font-weight:800; letter-spacing:-.01em; }
.footer {
  position:absolute; left:26px; right:26px; bottom:12px;
  display:flex; justify-content:space-between; align-items:center;
  padding-top:6px; border-top:1px solid #dce6e1; font-size:9px; color:#7a8790;
}
.about {
  display:grid; grid-template-columns:110px 1fr; gap:12px;
  background:#fff; border:1px solid #dce6e1; border-radius:11px; padding:12px 14px; align-items:start;
}
.about img { width:110px; height:auto; display:block; margin-top:2px; }
.about h3 { margin:0 0 6px; font-size:13.5px; font-weight:800; color:#0f1c16; }
.about p { margin:0 0 7px; font-size:12px; line-height:1.45; color:#3a4740; }
.about p:last-child { margin-bottom:0; }
.pillars { display:grid; grid-template-columns:1fr 1fr; gap:6px; list-style:none; margin:0; padding:0; }
.pillars li {
  background:#fff; border:1px solid #dce6e1; border-radius:9px;
  padding:7px 9px 7px 11px; border-left:3px solid #01644f;
}
.pillars .t { display:block; font-size:11px; font-weight:800; color:#0f1c16; margin-bottom:2px; }
.pillars .d { display:block; font-size:10.5px; line-height:1.3; color:#5f6b73; }
.pillars li:last-child:nth-child(odd) { grid-column:1 / -1; }
.next { display:grid; grid-template-columns:1.35fr 1fr 1fr; gap:7px; }
.next-card { background:#fff; border:1px solid #dce6e1; border-radius:11px; padding:11px; }
.next-card h3 { margin:0 0 5px; font-size:12px; font-weight:800; color:#0f1c16; }
.next-card p, .next-card li { margin:0; font-size:11px; line-height:1.35; color:#5f6b73; }
.next-card ol { margin:0; padding-left:15px; }
.next-card ol li { margin-bottom:2px; }
.next-card .contact-line { margin-top:7px; font-size:11.5px; font-weight:700; color:#0f1c16; }
.qr-mini { display:flex; gap:9px; align-items:center; }
.qr-mini img { width:68px; height:68px; flex:0 0 auto; }
.qr-mini .k { font-size:9.5px; font-weight:750; color:#01644f; text-transform:uppercase; letter-spacing:.04em; }
.qr-mini .t { font-size:11.5px; font-weight:800; color:#0f1c16; margin-top:1px; }
.qr-mini .u { font-size:9px; color:#7a8790; margin-top:1px; }
.disclaimer {
  margin-top:12px; padding:9px 11px; border-radius:9px;
  background:#f7faf8; border:1px solid #dce6e1; font-size:10.5px; line-height:1.35; color:#5f6b73;
}
.disclaimer b { color:#0f1c16; }
@media print { body { background:#fff; } .page { margin:0; } }
`;
