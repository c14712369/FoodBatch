// Google Apps Script: 負責處理試算表同步與 KML 雲端上傳
const SECRET = "YOUR_APPS_SCRIPT_SECRET"; // 請與 .env 保持一致

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // 驗證 Token
    if (data.secret !== SECRET) {
      return ContentService.createTextOutput("Unauthorized").setMimeType(ContentService.MimeType.TEXT);
    }

    if (data.action === "updateKML") {
      return handleKMLUpdate(data.fileName, data.content);
    }

    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function handleKMLUpdate(fileName, content) {
  // 1. 搜尋同名檔案
  const files = DriveApp.getFilesByName(fileName);
  let file;
  
  if (files.hasNext()) {
    // 2. 找到舊檔，直接更新內容
    file = files.next();
    file.setContent(content);
    console.log("Updated existing file: " + file.getId());
  } else {
    // 3. 建立新檔
    file = DriveApp.createFile(fileName, content, "application/vnd.google-earth.kml+xml");
    console.log("Created new file: " + file.getId());
  }
  
  return ContentService.createTextOutput(file.getId()).setMimeType(ContentService.MimeType.TEXT);
}
