# 使用輕量級 Node.js 20 映像檔
FROM node:20-alpine

# 設定工作目錄
WORKDIR /app

# 先複製 package 檔案以利用快取
COPY package*.json ./

# 1. 安裝所有依賴 (包含 TypeScript) 以進行編譯
RUN npm install

# 2. 複製原始碼
COPY . .

# 3. 執行編譯 (tsc)
RUN npm run build

# 4. 移除開發依賴，只保留生產環境需要的套件以節省空間
RUN npm prune --omit=dev

# 設定啟動指令 (執行編譯後的 JS)
CMD ["node", "dist/index.js"]
