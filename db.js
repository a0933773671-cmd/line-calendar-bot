const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'calendar.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    date        TEXT NOT NULL,        -- YYYY-MM-DD
    time        TEXT,                 -- HH:MM (optional)
    note        TEXT,
    remind_time TEXT,                 -- HH:MM 提前提醒時間
    reminded    INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
