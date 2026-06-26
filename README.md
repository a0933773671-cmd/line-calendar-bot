# 📅 LINE 行事曆機器人

## 功能
- ✅ 新增行程（支援自然語言：今天、明天、12/25...）
- 📋 查詢今天 / 本週 / 指定日期行程
- 🗑️ 刪除行程
- ⏰ 活動前 10 分鐘自動推播提醒

---

## 快速部署指南

### 1️⃣ 建立 LINE Bot

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立 **Provider** → **Messaging API Channel**
3. 取得：
   - `Channel Secret`（Basic settings）
   - `Channel access token`（Messaging API → Issue）
4. 關閉「自動回覆訊息」和「問候訊息」

---

### 2️⃣ 部署到 Railway（免費）

```bash
# 1. 安裝依賴
npm install

# 2. 上傳到 GitHub

# 3. 到 Railway.app 連接 GitHub repo
# 4. 在 Variables 設定：
#    LINE_CHANNEL_ACCESS_TOKEN = 你的 token
#    LINE_CHANNEL_SECRET = 你的 secret

# Railway 會自動設定 PORT 環境變數
```

### 或本機測試（使用 ngrok）

```bash
npm install
cp .env.example .env
# 填入 .env 的 token 和 secret

npm start

# 另開終端
ngrok http 3000
# 複製 https://xxxx.ngrok.io/webhook 設定到 LINE Developers
```

---

### 3️⃣ 設定 Webhook

1. 在 LINE Developers → Messaging API
2. Webhook URL 填入：`https://你的網域/webhook`
3. 開啟「Use webhook」

---

## 使用方式

| 指令 | 說明 |
|------|------|
| `新增 明天下午3點 開會` | 新增行程 |
| `新增 12/25 聖誕晚餐` | 新增特定日期行程 |
| `今天` | 查詢今天行程 |
| `本週` | 查詢本週行程 |
| `查詢 12/25` | 查詢特定日期 |
| `刪除 3` | 刪除編號3的行程 |
| `說明` | 顯示所有指令 |

---

## 技術架構

- **Runtime**: Node.js
- **Framework**: Express
- **LINE SDK**: @line/bot-sdk
- **Database**: SQLite (better-sqlite3)
- **排程**: node-cron（每分鐘檢查提醒）
- **部署**: Railway / Render / 任何 Node.js 主機
