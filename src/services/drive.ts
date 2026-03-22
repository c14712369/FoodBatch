import { google } from 'googleapis';
import { config } from '../config.js';
import { PassThrough } from 'stream';

function getAuth() {
  const credentials = JSON.parse(config.google.serviceAccountJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'], // 使用廣泛權限
  });
}

export async function uploadKmlToDrive(kmlContent: string, fileName: string = 'FoodBatch_Places.kml'): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const folderId = config.google.driveFolderId;

  console.log(`[Drive] 準備同步 ${fileName} 到資料夾 ${folderId}...`);

  // 1. 搜尋現有檔案
  const listRes = await drive.files.list({
    q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
    fields: 'files(id)',
  });

  const existingFile = listRes.data.files?.[0];
  
  // 建立資料流
  const bufferStream = new PassThrough();
  bufferStream.end(Buffer.from(kmlContent, 'utf-8'));

  const media = {
    mimeType: 'application/vnd.google-earth.kml+xml',
    body: bufferStream,
  };

  if (existingFile?.id) {
    console.log(`[Drive] 執行覆蓋更新 (ID: ${existingFile.id})`);
    await drive.files.update({
      fileId: existingFile.id,
      media: media,
    });
    return existingFile.id;
  } else {
    console.log(`[Drive] 執行全新建立`);
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
