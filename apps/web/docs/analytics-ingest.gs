/**
 * Google Apps Script web app — append anonymous Problemer analytics rows.
 * Deploy: Execute as me · Who has access: Anyone
 */
function doPost(e) {
  try {
    var body = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(body);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheets()[0];
    var room = data.room || {};
    var sim = data.sim || {};
    var before = sim.before || {};
    var after = sim.after || {};
    var delta = sim.delta || {};

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.sessionId || '',
      data.channelLabel || '',
      room.houseType || '',
      room.roomType || '',
      room.ceilingAreaM2 != null ? room.ceilingAreaM2 : '',
      room.objectStage || '',
      before.hybrid || '',
      after.hybrid || '',
      delta.Rw != null ? delta.Rw : '',
      delta.Lnw != null ? delta.Lnw : '',
      body,
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('problemomer analytics ingest ok');
}
