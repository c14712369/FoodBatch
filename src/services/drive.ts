import { google } from 'googleapis';
import { config } from '../config.js';
import { Readable } from 'stream';

function getAuth() {
  const credentials = JSON.parse(config.google.serviceAccountJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

export async function uploadKmlToDrive(kmlContent: string, fileName: string = 'FoodBatch_Places.kml'): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  console.log(`[Drive] 準備上傳 \${fileName} ...`);

  // 1. 搜尋是否已有同名檔案 (為了覆蓋更新)
  const listRes = await drive.files.list({
    q: `name = '\${fileName}' and trashed = false`,
    fields: 'files(id)',
  });

  const existingFile = listRes.data.files?.[0];
  const media = {
    mimeType: 'application/vnd.google-earth.kml+xml',
    body: Readable.from([kmlContent]),
  };

  if (existingFile?.id) {
    // 2. 覆蓋現有檔案
    console.log(`[Drive] 找到現有檔案 (ID: \${existingFile.id})，執行更新...`);
    await drive.files.update({
      fileId: existingFile.id,
      media: media,
    });
    return existingFile.id;
  } else {
    // 3. 建立新檔案
    console.log(`[Drive] 建立全新檔案...`);
    const createRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/vnd.google-earth.kml+xml',
      },
      media: media,
      fields: 'id',
    });
    return createRes.data.id!;
  }
}
