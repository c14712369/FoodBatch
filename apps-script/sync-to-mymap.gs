// Google Apps Script: 為 FoodMap PWA 提供 JSON 數據與 KML 同步服務
const SECRET = "YOUR_APPS_SCRIPT_SECRET"; // 請確保與 FoodBatch .env 中的一致

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("places");
    if (!sheet) throw new Error("Sheet 'places' not found");

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);

    const jsonData = rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    return ContentService.createTextOutput(JSON.stringify(jsonData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    let data;
    if (e.postData.type === "application/json") {
      data = JSON.parse(e.postData.contents);
    } else {
      data = JSON.parse(e.postData.contents);
    }

    const receivedToken = data.token || data.secret;
    if (receivedToken !== SECRET) {
      console.error("Unauthorized! Received: " + receivedToken);
      return ContentService.createTextOutput("Error: Unauthorized").setMimeType(ContentService.MimeType.TEXT);
    }

    if (data.action === "updateKML") {
      return handleKMLUpdate(data.fileName, data.content);
    } else if (data.action === "sync") {
      return ContentService.createTextOutput("Sync Success").setMimeType(ContentService.MimeType.TEXT);
    }

    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function handleKMLUpdate(fileName, content) {
  const files = DriveApp.getFilesByName(fileName);
  let file;
  if (files.hasNext()) {
    file = files.next();
    file.setContent(content);
  } else {
    file = DriveApp.createFile(fileName, content, "application/vnd.google-earth.kml+xml");
  }
  return ContentService.createTextOutput(file.getId()).setMimeType(ContentService.MimeType.TEXT);
}
