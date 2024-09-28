// Dependecy imports
import { TextChannel, Message } from "discord.js";
import { config } from "dotenv";
const axios = require('axios');
import express from 'express';
import bodyParser from 'body-parser';
const schedule = require('node-schedule');

// Load environment variables from .env file
config();

// Discord Client
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });

// Discord bot token
client.login(process.env.DISCORD_TOKEN);

// Set interval for Bitcoin price tracking
const TIME_INTERVAL = Number(process.env.BOT_TIME_INTERVAL);

// Telegram bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

// Define initial variables
let lastReportedMax: number | null = null;
let lastReportedMin: number | null = null;
let currentDiscordChannel: TextChannel | null = null;
let currentTelegramChannel: string | null = null;

// Define function that fetches the Bitcoin price using CriptoYa API
const getBitcoinPrice = async (): Promise<number | undefined> => {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'); 
    return parseInt(response.data.lastPrice);
  } catch (error) {
    console.error('Error al obtener el precio de Bitcoin:', error);
  }
};

// Define function that fetches the max and min price of the day
const getMaxMinPriceOfDay = async (): Promise<{ max: number, min: number }> => {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    return {
      max: parseInt(response.data.highPrice),
      min: parseInt(response.data.lowPrice),
    };
  } catch (error) {
    console.error('Error al obtener los máximos/mínimos diarios:', error);
    return { max: 0, min: Infinity };
  }
};

// Report new max/min prices and reset messages to Discord and Telegram
const reportPrice = async (channel: TextChannel | null, price: number | null, type: 'max' | 'min' | 'reset' | 'welcome') => {
  const message = type === 'max' ? `nuevo maximo diario de ฿: $${price}` 
  : type === 'min' ? `🐻 nuevo minimo diario de ฿: $${price}` 
  : `🔄 reiniciando máximos y mínimos diarios...`;

  // Discord report
  if (currentDiscordChannel && channel) {
    await channel.send(message);
  }

  // Telegram report
  if (currentTelegramChannel) {
    try {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: currentTelegramChannel,
        text: message,
      });
    } catch (error) {
      console.error('Error sending message to Telegram:', error);
    }
  }
};

// Define function that tracks the Bitcoin price at regular intervals and report the max and min only if values surpass old reported values
const trackBitcoinPrice = async () => {
  setInterval(async () => {
    const price = await getBitcoinPrice();

    if (price) {
      // Report if price is higher than reported max
      if (price > (lastReportedMax || 0)) {
        lastReportedMax = price;
        await reportPrice(currentDiscordChannel, price, 'max');
      }
      // Report if price is lower than reported min
      if (price < (lastReportedMin || Infinity)) {
        lastReportedMin = price;
        await reportPrice(currentDiscordChannel, price, 'min');
      }
    }
  }, TIME_INTERVAL);
};

// Function to reset daily highs and lows
const resetDailyHighsAndLows = () => {
  schedule.scheduleJob('0 0 * * *', async () => { // Se ejecuta a medianoche
    lastReportedMax = 0;
    lastReportedMin = Infinity;
    await reportPrice(null, null, 'reset');
  });
};

// Discord event listener for messages
client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  currentDiscordChannel = message.channel as TextChannel;

  const { max, min } = await getMaxMinPriceOfDay();
  lastReportedMax = max;
  lastReportedMin = min;
  await currentDiscordChannel.send(`¡Hola mundillo! , el maximo diario de ฿ es: $${max} y el minimo: $${min}`);

  trackBitcoinPrice();
  resetDailyHighsAndLows();
});

// Telegram webhook listener
const app = express();
app.use(bodyParser.json());

app.post(`/telegram/${TELEGRAM_BOT_TOKEN}`, async (req: { body: { message: any; }; }, res: { sendStatus: (arg0: number) => void; }) => {
  const { message } = req.body;
  if (!message || message.from.is_bot) return res.sendStatus(200);

  currentTelegramChannel = message.chat.id;
  const { max, min } = await getMaxMinPriceOfDay();
  lastReportedMax = max;
  lastReportedMin = min;

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: currentTelegramChannel,
    text: `¡Hola mundillo!, el maximo diario de ฿ es: $${max} y el minimo: $${min}`,
  });

  trackBitcoinPrice();
  resetDailyHighsAndLows();
  res.sendStatus(200);
});

// Start Express server for Telegram webhook
app.listen(3000, () => {
  console.log('Listening for Telegram updates...');
});


