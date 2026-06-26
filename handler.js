const pool = require('./db');

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
  let m = text.match(/(\d{1,2})[\/月](\d{1,2})[日]?/);
  if (m) return `${today.getFullYear()}-${pad(m[1])}-${pad(m[2])}`;
  m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return null;
}

function parseTime(text) {
  let m = text.match(/(\d{1,2})[:\uff1a](\d{2})/);
  if (m) return `${String(m[1]).padStart(2,'0')}:${m[2]}`;
  m = text.match(/(\d{1,2})點/);
  if (m) return `${String(m[1]).padStart(2,'0')}:00`;
  return null;
}

function calcRemindTime(timeStr, minutesBefore = 10) {
  if (!timeStr) return null;
  const [h, min] = timeStr.split(':').map(Number);
  let totalMin = h * 60 + min - minutesBefore;
  if (totalMin < 0) totalMin = 0;
  const rh = Math.floor(totalMin / 60);
  const rm = totalMin % 60;
  return `${String(rh).padStart(2,'0')}:${String(rm).padStart(2,'0')}`;
}

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
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

function formatEvents(rows) {
  if (!rows.length) return '📭 沒有找到任何行程';
  return rows.map(e =>
    `📌 ${e.title} (編號:${e.id})\n   📅 ${e.date}${e.time ? ' ' + e.time : ''}${e.note ? '\n   📝 ' + e.note : ''}`
  ).join('\n\n');
}

async function handleMessage(event, client) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const text = event.message.text.trim();
  const lower = text.toLowerCase();

  if (lower === '說明' || lower === 'help' || lower === '?') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 行事曆機器人使用說明\n\n【新增行程】\n新增 明天下午3點 開會\n新增 12/25 聖誕晚餐\n\n【查詢行程】\n今天\n本週\n查詢 12/25\n\n【刪除行程】\n刪除 [行程編號]\n\n【提醒】\n活動前10分鐘自動推播 ⏰`,
    });
  }

  // 新增行程
  if (text.startsWith('新增') || text.startsWith('加入') || text.startsWith('add')) {
    const content = text.replace(/^(新增|加入|add)\s*/i, '');
    const date = parseDate(content);
    const time = parseTime(content);

    if (!date) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請指定日期，例如：\n新增 明天下午3點 開會',
      });
    }

    let title = content
      .replace(/\d{4}-\d{2}-\d{2}/, '')
      .replace(/\d{1,2}[\/月]\d{1,2}[日]?/, '')
      .replace(/今天|明天|後天/, '')
      .replace(/上午|下午|早上|晚上/, '')
      .replace(/\d{1,2}[:\uff1a點]\d{0,2}/, '')
      .trim();

    if (!title) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請輸入行程名稱，例如：\n新增 明天下午3點 開會',
      });
    }

    const remindTime = calcRemindTime(time, 10);
    const result = await pool.query(
      `INSERT INTO events (user_id, title, date, time, remind_time) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, title, date, time, remindTime]
    );

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 行程已新增！\n📌 ${title}\n📅 ${date}${time ? ' ' + time : ''}\n${remindTime ? '⏰ 提醒：' + remindTime : '（未設定時間）'}\n🔢 編號：${result.rows[0].id}`,
    });
  }

  // 刪除行程
  if (text.startsWith('刪除') || text.startsWith('delete')) {
    const id = parseInt(text.replace(/^(刪除|delete)\s*/i, '').trim());
    if (isNaN(id)) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 請輸入行程編號，例如：刪除 3' });
    }
    const res = await pool.query('SELECT * FROM events WHERE id=$1 AND user_id=$2', [id, userId]);
    if (!res.rows.length) {
      return client.replyMessage(event.replyToken, { type: 'text', text: `❌ 找不到編號 ${id} 的行程` });
    }
    await pool.query('DELETE FROM events WHERE id=$1 AND user_id=$2', [id, userId]);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🗑️ 已刪除：${res.rows[0].title}（${res.rows[0].date}）`,
    });
  }

  // 今天
  if (text === '今天' || text === 'today') {
    const today = todayStr();
    const res = await pool.query(
      'SELECT * FROM events WHERE user_id=$1 AND date=$2 ORDER BY time',
      [userId, today]
    );
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 今天 (${today}) 的行程：\n\n${formatEvents(res.rows)}`,
    });
  }

  // 本週
  if (text === '本週' || text === '這週' || text === 'week') {
    const { start, end } = getWeekRange();
    const res = await pool.query(
      'SELECT * FROM events WHERE user_id=$1 AND date>=$2 AND date<=$3 ORDER BY date, time',
      [userId, start, end]
    );
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 本週 (${start} ~ ${end})：\n\n${formatEvents(res.rows)}`,
    });
  }

  // 查詢指定日期
  if (text.startsWith('查詢') || text.startsWith('search')) {
    const content = text.replace(/^(查詢|search)\s*/i, '');
    const date = parseDate(content);
    if (!date) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 請指定日期，例如：查詢 12/25' });
    }
    const res = await pool.query(
      'SELECT * FROM events WHERE user_id=$1 AND date=$2 ORDER BY time',
      [userId, date]
    );
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 ${date} 的行程：\n\n${formatEvents(res.rows)}`,
    });
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: '輸入「說明」查看所有指令 📋',
  });
}

module.exports = { handleMessage };
