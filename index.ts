// Dependecy imports
import { getRandomValues } from "crypto";
import { TextChannel, Message } from "discord.js";
import { config } from "dotenv";
const axios = require('axios');
const schedule = require('node-schedule');
import TelegramBot from 'node-telegram-bot-api';

// Load environment variables from .env file
config();

// Discord Client
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

// Set time interval for autamatic bot updates
const TIME_INTERVAL = 1000*210;

// Discord bot token
client.login(process.env.DISCORD_TOKEN_ORIGINAL!);

// Telegram bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN!, { polling: true });

// Define initial variables
let lastReportedMax: number = 0;
let lastReportedMin: number = Infinity;
let telegramChats: { [key: number]: boolean } = {};
let discordChannels: { [key: string]: TextChannel } = {}; 

// Define function that fetches the Bitcoin price using Binance API
const getBitcoinPrice = async (): Promise<number> => {
  const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
  return parseInt(data.lastPrice);
};

// Define function that fetches the current max and min price of the day
const getMaxMinPriceOfDay = async (): Promise<{ max: number, min: number, volume: number }> => {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    return {
      max: parseInt(response.data.highPrice),
      min: parseInt(response.data.lowPrice),
      volume: parseInt(response.data.Volume),
    };
  } catch (error) {
    console.error('Error al obtener los máximos/mínimos diarios:', error);
    return { max: 0, min: Infinity, volume: 0 };
  }
};

// Define function that tracks the Bitcoin price at regular intervals and report the max and min only if values surpass old reported values
const trackBitcoinPrice = async () => {
  setInterval(async () => {
    const { max, min } = await getMaxMinPriceOfDay();
    
    // If price is higher than reported max...
    if (100*(max / lastReportedMax) > 101) {
      lastReportedMax = max;
      console.log(`Nuevo máximo diario: $${lastReportedMax}`);
      // Send to all Telegram chats...
      for (const chatId in telegramChats) {
        if (telegramChats[chatId]) {
          bot.sendMessage(Number(chatId), `nuevo máximo diario de ฿: $${lastReportedMax}`);
        }
      }
      // and to all Discord channels
      for (const channelId in discordChannels) {
        await discordChannels[channelId].send(`nuevo máximo diario de ฿: $${lastReportedMax}`);
      }
    }

    // If price is lower than reported min...
    if (100*(min / lastReportedMin) < 99) {
      lastReportedMin = min;
      // Send to all Telegram chats...
      for (const chatId in telegramChats) {
        if (telegramChats[chatId]) {
          bot.sendMessage(Number(chatId), `🐻 nuevo mínimo diario de ฿: $${lastReportedMin}`);
        }
      }
      // and to all Discord channels
      for (const channelId in discordChannels) {
        await discordChannels[channelId].send(`🐻 nuevo mínimo diario de ฿: $${lastReportedMin}`);
      }
    }
  }, TIME_INTERVAL);
};

// Sends SE VIENE message at random intervals to all channels and chats where bot is
(function seViene() {
  const msgs = [
    { msg: "SE VIENE", weight: 6 },
    { msg: "🔥 SE RECONTRA VIENE", weight: 3 },
    { msg: "🫂 ABRACEN A SUS FAMILIAS! ", weight: 1 }
  ];
  
  const totalWeight = msgs.reduce((sum, m) => sum + m.weight, 0);
  const randomValue = Math.random() * totalWeight;
  let weightSum = 0;
  const selectedMsg = msgs.find(m => (weightSum += m.weight) >= randomValue)?.msg;
  
  // Sends message to all Telegram and Discord chats
  Object.keys(telegramChats).forEach(chatId => bot.sendMessage(Number(chatId),selectedMsg!));
  Object.values(discordChannels).forEach(channel => channel.send(selectedMsg!));
  setTimeout(seViene, Math.random() * ((21 - 1)*3600*1000) + 1 * 3600*1000); // Interval between 1 and 21 hours
})();

// Define cron job to reset daily highs and lows at midnight (UTC = 00:00)
schedule.scheduleJob('0 21 * * *', () => { // 21:00 at local time (UTC-3) = 00:00 UTC
  lastReportedMax = 0;
  lastReportedMin = Infinity;
  for (const channelId in discordChannels) {
    discordChannels[channelId].send(`¡GN!\n🔄 reiniciando máximos y mínimos diarios...`);
  }
  for (const chatId in telegramChats) {
      bot.sendMessage(chatId, `¡GN!\n🔄 reiniciando máximos y mínimos diarios...`);
  }
});

// Detects automatically the Discord server where the bot is, detects the first text-based channel, store it and send a message to it
client.on('ready', () => {
  console.log(`${client.user?.tag} listo en Discord!`);
  client.guilds.cache.forEach((guild: { channels: { cache: any[]; }; name: any; }) => {
    guild.channels.cache.forEach(async (channel) => {
      if (channel.isTextBased() && channel instanceof TextChannel) {
        discordChannels[channel.id] = channel;
        console.log(`Discord channel: ${guild.name} [${channel.id}]`);
        const { max, min } = await getMaxMinPriceOfDay();
        lastReportedMax = max;  
        lastReportedMin = min;
        channel.send(`¡Hola mundillo!\nmáximo diario de ฿: $${lastReportedMax}\n🐻 mínimo: $${lastReportedMin}`);
      }
    });
  });

  // Start tracking Bitcoin price
  trackBitcoinPrice();
});

// Send Bitcoin price when user writes /precio
client.on('messageCreate', async (message: { content: string; channel: TextChannel; }) => {
  if (message.content === '/precio') {
    const price = await getBitcoinPrice();
    (message.channel as TextChannel).send(`precio de ฿: $${price}`);
  } else if (message.content === '/hilo') {
    const { max, min } = await getMaxMinPriceOfDay();
    (message.channel as TextChannel).send(`máximo diario de ฿: $${max}\n🐻 mínimo: $${min}`);
}});

// TELEGRAM

// Stores the chats where the bot is
bot.on('message', async (msg) => {
  const chatTitle = msg.chat.title || msg.chat.first_name;
  console.log(`Telegram chat: ${chatTitle} [${msg.chat.id}]`);
  telegramChats[msg.chat.id] = true;
  console.log(telegramChats)
});

// Send Bitcoin price when user writes /precio
bot.onText(/\/precio/, async (msg) => {
  const price = await getBitcoinPrice();
  bot.sendMessage(msg.chat.id, `precio actual de ฿: $${price}`);
});

// Send High and Low prices when user writes /hilo
bot.onText(/\/hilo/, async (msg) => {
  const { max, min } = await getMaxMinPriceOfDay();
  bot.sendMessage(msg.chat.id, `máximo diario de ฿: $${max}\n🐻 mínimo: $${min}`);
});

// Send welcome message when user writes /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `¡GM ${msg.chat.title || msg.chat.first_name}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automaticamente el maximo o minimo mas reciente de Bitcoin\n/precio - Muestra el precio actual de Bitcoin\n/hilo - Muestra el máximo y mínimo del dia\n/start - Muestra este mensaje\n\nPuedes mirar mi codigo en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`, {disable_web_page_preview: true});
});

// Send welcome message when bot joins new group
bot.on('new_chat_members', async (msg) => {
  const botID = await bot.getMe();
  msg.new_chat_members?.forEach((member) => {
    if (member.id === botID.id) {
      bot.sendMessage(msg.chat.id, `¡GM ${msg.chat.title}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automaticamente el maximo o minimo mas reciente de Bitcoin\n/precio - Muestra el precio actual de Bitcoin\n/hilo - Muestra el máximo y mínimo del dia\n/start - Muestra este mensaje\n\nPuedes mirar mi codigo en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`, {disable_web_page_preview: true});
    }
  })
});

// Bot says GM all days at 8am (UTC-3)
schedule.scheduleJob('0 8 * * *', () => { 
  bot.once('ready', (msg) => {
    bot.sendMessage(msg.chat.id, `GM humanos 🧉`);
  })
});