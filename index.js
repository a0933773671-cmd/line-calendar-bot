const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const pool = require('./db');
const { handleMessage } = require('./handler');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(event => handleMessage(event, client)))
    .then(() => res.json({ status: 'ok' }))
    .catch(err => {
      console.error(err);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('LINE Calendar Bot is running!'));

// 每分鐘檢查提醒
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const today = now.toISOString().slice(0, 10);

  try {
    const res = await pool.query(
      `SELECT * FROM events WHERE date=$1 AND remind_time=$2 AND reminded=0`,
      [today, hhmm]
    );
    for (const event of res.rows) {
      await client.pushMessage(event.user_id, {
        type: 'text',
        text: `⏰ 提醒：${event.title}\n📅 ${event.date} ${event.time || ''}\n📝 ${event.note || ''}`,
      });
      await pool.query('UPDATE events SET reminded=1 WHERE id=$1', [event.id]);
    }
  } catch (err) {
    console.error('Cron error:', err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
