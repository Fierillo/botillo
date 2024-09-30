// Dependecy imports
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

// Discord bot token
client.login(process.env.DISCORD_TOKEN_ORIGINAL!);

// Set interval for Bitcoin price tracking
const TIME_INTERVAL = Number(process.env.BOT_TIME_INTERVAL);

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
    const price = await getBitcoinPrice();
    
    // If price is higher than reported max...
    if (price > lastReportedMax) {
      lastReportedMax = price;
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
    if (price < lastReportedMin) {
      lastReportedMin = price;
      console.log(`Nuevo mínimo diario: $${lastReportedMin}`);
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

// Define cron job to reset daily highs and lows at midnight (UTC-3)
schedule.scheduleJob('0 0 * * *', () => { 
  lastReportedMax = 0;
  lastReportedMin = Infinity;
  for (const channelId in discordChannels) {
    discordChannels[channelId].send(`🔄 reiniciando máximos y mínimos diarios...`);
  }
  for (const chatId in telegramChats) {
      bot.sendMessage(chatId, `🔄 reiniciando máximos y mínimos diarios...`);
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
        channel.send(`¡Hola mundillo!\nMaximo diario de ฿: $${lastReportedMax}\n🐻 Minimo: $${lastReportedMin}`);
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
    (message.channel as TextChannel).send(`Precio de ฿: $${price}`);
  } else if (message.content === '/hilo') {
    const { max, min } = await getMaxMinPriceOfDay();
    (message.channel as TextChannel).send(`Máximo diario de ฿: $${max}\n🐻 Mínimo: $${min}`);
}});

// TELEGRAM

// Initialize bot in Telegram fetching automatically the servers where the bot is and sending welcome messages
bot.once('message', async (msg) => {
  const chatTitle = msg.chat.title || msg.chat.first_name; // Dependiendo si es un grupo o un usuario
  console.log(`Telegram chat: ${chatTitle} [${msg.chat.id}]`);
  bot.sendMessage(msg.chat.id, `¡Hola mundillo!\nMaximo diario de ฿: $${lastReportedMax}\n🐻 Minimo: $${lastReportedMin}`);
});

bot.on('message', async (msg) => {
  const chatTitle = msg.chat.title || msg.chat.first_name;
  console.log(`Telegram chat: ${chatTitle} [${msg.chat.id}]`);
  telegramChats[msg.chat.id] = true;
  console.log(telegramChats)
});

// Send Bitcoin price when user writes /precio
bot.onText(/\/precio/, async (msg) => {
  const price = await getBitcoinPrice();
  bot.sendMessage(msg.chat.id, `Precio actual de ฿: $${price}`);
});

// Send High and Low prices when user writes /hilo
bot.onText(/\/hilo/, async (msg) => {
  const { max, min } = await getMaxMinPriceOfDay();
  bot.sendMessage(msg.chat.id, `Máximo diario de ฿: $${max}\n🐻 Mínimo: $${min}`);
});