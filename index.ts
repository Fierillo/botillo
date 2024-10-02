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
    if (max > lastReportedMax) {
      lastReportedMax = max;
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
    if (min < lastReportedMin) {
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
    discordChannels[channelId].send(`¡GN humanos!\n🔄 reiniciando máximos y mínimos diarios...`);
  }
  for (const chatId in telegramChats) {
      bot.sendMessage(chatId, `¡GN humanos!\n🔄 reiniciando máximos y mínimos diarios...`);
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
        channel.send(`¡Hola mundillo!\nmáximo diario de ฿: $${max}\n🐻 mínimo diario de ฿: $${min}`);
      }
    });
  });

  // Start tracking Bitcoin price
  trackBitcoinPrice();
});

// Send Bitcoin price when user writes /precio, and max/min BTC price when user writes /hilo
client.on('messageCreate', async (message: { content: string; channel: TextChannel; }) => {
  if (message.content === '/precio') {
    const price = await getBitcoinPrice();
    (message.channel as TextChannel).send(`precio de ฿: $${price}`);
  } else if (message.content === '/hilo') {
    const { max, min } = await getMaxMinPriceOfDay();
    (message.channel as TextChannel).send(`máximo diario de ฿: $${max}\n🐻 mínimo diario de ฿: $${min}`);
}});

// Bot says GM every day at 8am (UTC-3)
schedule.scheduleJob('0 8 * * *', () => { 
  for (const channelId in discordChannels) {
    discordChannels[channelId].send(`GM humanos 🧉`);
  }
  for (const chatId in telegramChats) {
    bot.sendMessage(chatId, `GM humanos 🧉`);
  }
});

// TELEGRAM

// Stores the chats where the bot is
bot.on('message', (msg) => {
  if (!telegramChats.hasOwnProperty(msg.chat.id)) {
    telegramChats[msg.chat.id] = true;
    console.log(`Telegram chat: ${msg.chat.title || msg.chat.first_name} [${msg.chat.id}]`);
    console.log(telegramChats)
  }
});

// Send Bitcoin price when user writes /precio
bot.onText(/\/precio/, async (msg) => {
  const price = await getBitcoinPrice();
  bot.sendMessage(msg.chat.id, `precio actual de ฿: $${price}`);
});

// Send High and Low prices when user writes /hilo
bot.onText(/\/hilo/, async (msg) => {
  const { max, min } = await getMaxMinPriceOfDay();
  bot.sendMessage(msg.chat.id, `máximo diario de ฿: $${max}\n🐻 mínimo diario de ฿: $${min}`);
});

// Welcome message constant
const welcome = (id: number, name: string | undefined) => bot.sendMessage(id, `¡GM ${name}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automaticamente el maximo o minimo mas reciente de Bitcoin\n/precio - Muestro el precio actual de Bitcoin\n/hilo - Muestro el máximo y mínimo en lo que va del dia\n/start - Muestro este mensaje\n\nPuedes mirar mi codigo en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`, {disable_web_page_preview: true});

// Sends welcome message when user writes /start
bot.onText(/\/start/, (msg) => welcome(msg.chat.id, msg.chat.title || msg.chat.first_name));

// Sends welcome message when bot joins new group
bot.on('new_chat_members', async (msg) => {
  const botId = (await bot.getMe()).id;
  msg.new_chat_members?.forEach(member => member.id === botId && welcome(msg.chat.id, msg.chat.title || msg.chat.first_name));
});

// Bot replies VERDADERO or FALSO when user asks it directly or tag it, finishing with a "?"
bot.on('message', async (msg) => {
  if (msg.text && (msg.text.includes(`@${(await bot.getMe()).id}`) || msg.reply_to_message?.from?.id === (await bot.getMe()).id) && msg.text.endsWith('?')) {
    bot.sendMessage(msg.chat.id, Math.random() < 0.5 ? '✅ VERDADERO' : '❌ FALSO');
  }
});

// Bot replies ME CHUPA LA PIJA LA OPINION DE LAS KUKAS when users write "peron*", "kuka*", "kirchner*", "zurdo*"
bot.onText(/(?<=\s|^)(peron|kuka|kirchner|zurdo)\w*/, (msg) => {
  bot.sendMessage(msg.chat.id, 'ME CHUPA LA PIJA LA OPINION DE LAS KUKAS');
});
