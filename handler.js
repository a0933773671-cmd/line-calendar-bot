const db = require('./db');

// 解析日期關鍵字
function parseDate(text) {
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (text.includes('今天') || text.includes('today')) return fmt(today);

  if (text.includes('明天') || text.includes('tomorrow')) {
    const d = new Date(today); d.setDate(d.getDate()+1); return fmt(d);
  }
  if (text.includes('後天')) {
    const d = new Date(today); d.setDate(d.getDate()+2); return fmt(d);
  }

  // 支援 MM/DD 或 M月D日
  let m = text.match(/(\d{1,2})[\/月](\d{1,2})[日]?/);
  if (m) {
    const year = today.getFullYear();
    return `${year}-${pad(m[1])}-${pad(m[2])}`;
  }
  // YYYY-MM-DD
  m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];

  return null;
}

// 解析時間 HH:MM
function parseTime(text) {
  let m = text.match(/(\d{1,2})[:\uff1a點](\d{2})/);
  if (m) return `${String(m[1]).padStart(2,'0')}:${m[2]}`;
  m = text.match(/(\d{1,2})點/);
  if (m) return `${String(m[1]).padStart(2,'0')}:00`;
  return null;
}

// 解析提醒時間（幾分鐘前）
function calcRemindTime(dateStr, timeStr, minutesBefore = 10) {
  if (!timeStr) return null;
  const [h, min] = timeStr.split(':').map(Number);
  let totalMin = h * 60 + min - minutesBefore;
  if (totalMin < 0) totalMin = 0;
  const rh = Math.floor(totalMin / 60);
  const rm = totalMin % 60;
  return `${String(rh).padStart(2,'0')}:${String(rm).padStart(2,'0')}`;
}

// 取得本週日期範圍
function getWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 格式化行程列表
function formatEvents(events) {
  if (!events.length) return '📭 沒有找到任何行程';
  return events.map(e =>
    `📌 ${e.title}\n   📅 ${e.date}${e.time ? ' ' + e.time : ''}${e.note ? '\n   📝 ' + e.note : ''}`
  ).join('\n\n');
}

// 主訊息處理
async function handleMessage(event, client) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const lower = text.toLowerCase();

  // ── 說明 ──
  if (lower === '說明' || lower === 'help' || lower === '?') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 行事曆機器人使用說明

【新增行程】
新增 明天下午3點 開會
新增 12/25 聖誕晚餐

【查詢行程】
今天
本週
查詢 12/25

【刪除行程】
刪除 [行程編號]
（查詢後會顯示編號）

【提醒】
預設活動前10分鐘自動推播提醒 ⏰`,
    });
  }

  // ── 新增行程 ──
  if (text.startsWith('新增') || text.startsWith('加入') || text.startsWith('add')) {
    const content = text.replace(/^(新增|加入|add)\s*/i, '');
    const date = parseDate(content);
    const time = parseTime(content);

    if (!date) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請指定日期，例如：\n新增 明天下午3點 開會\n新增 12/25 聖誕晚餐',
      });
    }

    // 擷取標題（移除日期/時間關鍵字）
    let title = content
      .replace(/\d{4}-\d{2}-\d{2}/, '')
      .replace(/\d{1,2}[\/月]\d{1,2}[日]?/, '')
      .replace(/今天|明天|後天/, '')
      .replace(/\d{1,2}[:\uff1a點]\d{0,2}/, '')
      .replace(/上午|下午|早上|晚上/, '')
      .trim();

    if (!title) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請輸入行程名稱，例如：\n新增 明天下午3點 開會',
      });
    }

    const remindTime = calcRemindTime(date, time, 10);

    const info = db.prepare(`
      INSERT INTO events (user_id, title, date, time, remind_time)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, title, date, time, remindTime);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 行程已新增！
📌 ${title}
📅 ${date}${time ? ' ' + time : ''}
${remindTime ? '⏰ 提醒時間：' + remindTime : '（未設定時間，不會提醒）'}
🔢 編號：${info.lastInsertRowid}`,
    });
  }

  // ── 刪除行程 ──
  if (text.startsWith('刪除') || text.startsWith('delete')) {
    const idStr = text.replace(/^(刪除|delete)\s*/i, '').trim();
    const id = parseInt(idStr);
    if (isNaN(id)) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請輸入行程編號，例如：刪除 3',
      });
    }

    const event_ = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(id, userId);
    if (!event_) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `❌ 找不到編號 ${id} 的行程`,
      });
    }

    db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(id, userId);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🗑️ 已刪除行程：${event_.title}（${event_.date}）`,
    });
  }

  // ── 查詢今天 ──
  if (text === '今天' || text === 'today') {
    const today = todayStr();
    const events = db.prepare('SELECT * FROM events WHERE user_id = ? AND date = ? ORDER BY time').all(userId, today);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 今天 (${today}) 的行程：\n\n${formatEvents(events)}`,
    });
  }

  // ── 查詢本週 ──
  if (text === '本週' || text === '這週' || text === 'week') {
    const { start, end } = getWeekRange();
    const events = db.prepare(`
      SELECT * FROM events WHERE user_id = ? AND date BETWEEN ? AND ?
      ORDER BY date, time
    `).all(userId, start, end);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 本週 (${start} ~ ${end}) 行程：\n\n${formatEvents(events)}`,
    });
  }

  // ── 查詢指定日期 ──
  if (text.startsWith('查詢') || text.startsWith('search')) {
    const content = text.replace(/^(查詢|search)\s*/i, '');
    const date = parseDate(content);
    if (!date) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請指定日期，例如：查詢 12/25',
      });
    }
    const events = db.prepare('SELECT * FROM events WHERE user_id = ? AND date = ? ORDER BY time').all(userId, date);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 ${date} 的行程：\n\n${formatEvents(events)}`,
    });
  }

  // ── 預設回覆 ──
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: '輸入「說明」查看所有指令 📋',
  });
}

module.exports = { handleMessage };
