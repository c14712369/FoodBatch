// Google Apps Script: 負責處理 FoodBatch 試算表同步與 KML 雲端上傳
const SECRET = "YOUR_APPS_SCRIPT_SECRET"; // 👈 請確保此處與 .env 一致

function doPost(e) {
  try {
    let data;
    // 強化 JSON 解析，適應不同類型的請求
    if (e.postData.type === "application/json") {
      data = JSON.parse(e.postData.contents);
    } else {
      // 容錯處理
      data = JSON.parse(e.postData.contents);
    }
    
    // 優先從 token 欄位讀取，若無則嘗試從 secret 欄位 (舊版)
    const receivedToken = data.token || data.secret;

    // 驗證安全性 Token
    if (receivedToken !== SECRET) {
      console.error("Unauthorized! Received: " + receivedToken);
      return ContentService.createTextOutput("Error: Unauthorized").setMimeType(ContentService.MimeType.TEXT);
    }

    // 路由分發
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
