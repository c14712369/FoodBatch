// Deploy as: Execute as = Me, Who has access = Anyone
// Set APPS_SCRIPT_SECRET and SHEET_ID in Script Properties

const SECRET = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET');
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const MY_MAPS_FILE_ID = PropertiesService.getScriptProperties().getProperty('MY_MAPS_FILE_ID');
const TAB_NAME = 'places';

const LAYER_COLORS = {
  '餐廳': 'red',
  '咖啡廳': 'orange',
  '景點': 'blue',
  '夜市': 'yellow',
};

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.token !== SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const syncedCol = headers.indexOf('synced');
  const placeIdCol = headers.indexOf('place_id');
  const nameCol = headers.indexOf('name');
  const typeCol = headers.indexOf('type');
  const cuisineCol = headers.indexOf('cuisine');
  const ratingCol = headers.indexOf('rating');
  const reviewsCol = headers.indexOf('reviews');
  const latCol = headers.indexOf('lat');
  const lngCol = headers.indexOf('lng');
  const urlCol = headers.indexOf('url');

  const unsyncedRows = rows
    .map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row[syncedCol] !== true && row[syncedCol] !== 'TRUE');

  if (unsyncedRows.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ synced: 0 }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Read My Maps KML file
  const file = DriveApp.getFileById(MY_MAPS_FILE_ID);
  let kml = file.getBlob().getDataAsString();

  for (const { row, rowNum } of unsyncedRows) {
    const type = row[typeCol];
    const name = row[nameCol];
    const lat = row[latCol];
    const lng = row[lngCol];
    const rating = row[ratingCol];
    const reviews = row[reviewsCol];
    const cuisine = row[cuisineCol];
    const url = row[urlCol];

    const description = [
      cuisine ? `料理類型：${cuisine}` : '',
      `評分：${rating} ⭐ (${reviews} 則評論)`,
      `來源：<a href="${url}">查看地點</a>`,
    ].filter(Boolean).join('\n');

    const placemark = `
    <Placemark>
      <name>${escapeXml(name)}</name>
      <description>${escapeXml(description)}</description>
      <Point><coordinates>${lng},${lat},0</coordinates></Point>
    </Placemark>`;

    // Insert into the correct folder by type
    const folderTag = `<Folder><name>${type}</name>`;
    if (kml.includes(folderTag)) {
      kml = kml.replace(folderTag, folderTag + placemark);
    }
  }

  // Write back to Drive
  file.setContent(kml);

  // Mark rows as synced
  for (const { rowNum } of unsyncedRows) {
    sheet.getRange(rowNum, syncedCol + 1).setValue(true);
  }

  return ContentService.createTextOutput(JSON.stringify({ synced: unsyncedRows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
