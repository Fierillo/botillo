// Dependecy imports
import { TextChannel, Message } from "discord.js";
import { config } from "dotenv";
const axios = require('axios');
const schedule = require('node-schedule');
import TelegramBot from 'node-telegram-bot-api';
const fs = require('fs');
const path = require('path');

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

// CONSTANTS
const PRODILLO_FILE = path.join(__dirname, 'prodillo.json');
// Set time interval for automatic bot updates
const TIME_INTERVAL = 1000*210;
// Set time interval for prodillo game
const PRODILLO_TIME_INTERVAL = 1000*21;
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
let prodilloData: { [key: string]: number } = {};
let isProdilleabe: boolean = false;
let bitcoinMax: number = 0;
let isTest: boolean = false;
let isWin: boolean = false;

// If bot is restarted, prodilloData is restored from file
try {
  prodilloData = JSON.parse(fs.readFileSync(PRODILLO_FILE, 'utf-8'));
} catch (e) {
  console.warn('No se pudo leer el archivo de predicciones. Se iniciará uno nuevo.');
}

// Initialize starting deadline for Prodillo game, next Bitcoin difficulty adjustment using mempool API
async function deadline() {
  const latestHeight = await axios.get('https://mempool.space/api/blocks/tip/height');
  return {
    winnerDeadline: 2016 - latestHeight.data % 2016, // 2016 is the Bitcoin difficulty adjustment
    prodilleableDeadline: (2016 - latestHeight.data % 2016) - 420, // prodillos can be submitted 420 blocks before the difficulty adjustment
  }
}

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
  const luckyNumber = Math.random();
  const selectedMsg = luckyNumber <= 0.1 ? '🫂 ABRACEN A SUS FAMILIAS!' : luckyNumber <= 0.8 ? 'SE VIENE' : '🔥 SE RECONTRA VIENE';
  
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

// ------------TELEGRAM ONLY-------------

// Stores the chats where the bot is
bot.on('message', (msg) => {
  if (!telegramChats.hasOwnProperty(msg.chat.id)) {
    telegramChats[msg.chat.id] = true;
    console.log(`Added telegram chat: ${msg.chat.title || msg.chat.first_name} [${msg.chat.id}]`);
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
  if (msg.text && (msg.text.includes(`@${(await bot.getMe()).username}`) || msg.reply_to_message?.from?.id === (await bot.getMe()).id) && msg.text.endsWith('?')) {
    bot.sendMessage(msg.chat.id, Math.random() < 0.5 ? '✅ VERDADERO' : '❌ FALSO');
  }
});

// Bot replies ME CHUPA LA PIJA LA OPINION DE LAS KUKAS when users write "peron*", "kuka*", "kirchner*", "zurdo*"
bot.onText(/(?<=\s|^)(peron|kuka|kirchner|zurdo)\w*/i, (msg) => {
  bot.sendMessage(msg.chat.id, 'ME CHUPA LA PIJA LA OPINION DE LAS KUKAS');
});

// Bot replies to shitcoiners
bot.onText(/(?<=\s|^)(eth|solana|sol |bcash|bch |polkadot|dot |cardano|ada )\w*/i, (msg) => {
  bot.sendMessage(msg.chat.id, '🚨 ALERTA DU SHITCOINER 🚨');
});

/*bot.onText(/\/test/, (msg) => {
  const test = msg.text?.split('/test ')[1];
  if (test === 'on') {
    isTest = true;
    bot.sendMessage(msg.chat.id, '🟢 TEST ON');
  } else if (test === 'off') {
    isTest = false;
    bot.sendMessage(msg.chat.id, '🔴 TEST OFF');
  } else if (test === 'win') {
    isWin = true;
    bot.sendMessage(msg.chat.id, '🏆 WIN ON');
  } else {
    bot.sendMessage(msg.chat.id, '¡Ingresaste cualquier cosa loko!\n\n/test on - Activa el modo de prueba\n/test off - Desactiva el modo de prueba');
  }
});*/

// Defines interval that checks deadlines and enable/disable prodillos. When deadline is over, sends a message to all Telegram chats to let them know the winner
setInterval( async() => {
  
  // Check if deadline for prodillos is over
  isProdilleabe = (await deadline()).prodilleableDeadline > 0;
  const price = await getBitcoinPrice();
  const dailyMax = (await getMaxMinPriceOfDay()).max;
  
  // Updates bitcoinMax to track maximum BTC price in the current round
  if (price > bitcoinMax) {
    bitcoinMax = price;
  }
  if (dailyMax > bitcoinMax) {
    bitcoinMax = dailyMax
  }
  
  // Triggers win event if deadline is over (difficulty adjustment of Bitcoin)
  if ((await deadline()).winnerDeadline === 0) {
    let prodillos: Record<string, { user: string; predict: number }>;
    prodillos = JSON.parse(await fs.promises.readFile(PRODILLO_FILE, 'utf-8'));
    const prodillosSorted = Object.entries(prodillos).sort(([,a],[,b]) => 
      Math.abs(a.predict - bitcoinMax) - Math.abs(b.predict - bitcoinMax)
    );
    const formattedList = prodillosSorted.map(([userId, { user, predict }]) => {
      return `${user}: $${predict} (dif: ${(Math.abs(predict as unknown as number - bitcoinMax))})`}).join('\n');
    
    for (const chatId in telegramChats) {
      await bot.sendMessage(chatId, `🏁 ¡LA RONDA A LLEGADO A SU FIN!\nMaximo de ฿ de esta ronda: $${bitcoinMax}\n------------------------------------------\n${formattedList}\n\nEl ganador es ${prodillosSorted[0][1].user} 🏆`);
    }
    bitcoinMax = 0;
    // Wipe prodillo.json file
    fs.writeFileSync(PRODILLO_FILE, JSON.stringify({}, null, 2));
    // Write Hal Finney prediction as tribute
    fs.writeFileSync(PRODILLO_FILE, JSON.stringify({'0': {user: 'Hal Finney', predict: 10000000}}, null, 2));
  }
}, PRODILLO_TIME_INTERVAL);

// Define timer to promote prodillo game with a misterious message
(async function promoteProdillo() {
  for (const chatId in telegramChats) {
    await bot.sendMessage(chatId, `🟧 ${(await deadline()).winnerDeadline}`);
  }
  setTimeout(promoteProdillo, Math.random()*1000*60*210+1000*60); // 
})();

// Stores user predictions of BTC price in a JSON file and replies a reminder with the deadline
bot.onText(/\/prodillo/, async (msg) => {
  
  // Calls deadline function and stores in local variables
  const { winnerDeadline, prodilleableDeadline } = await deadline();
  
  // If deadline for prodillos is over, returns a message to the users to let them know
  if(!isProdilleabe && !isTest) {
    return await bot.sendMessage(msg.chat.id, `Tarde loko!\nespera ${winnerDeadline} bloques que comience una nueva ronda de prodillos!`);
  }
  const userId = msg.from?.id;
  const user = msg.from?.username;
  const predict = Number(msg.text?.split('/prodillo ')[1]);
  
  if ((isProdilleabe || isTest) && userId && user && !isNaN(predict) && predict >= 0) {
    let prodilloData: Record<string, { user: string; predict: number }> = {};

    // try to read prodillo.json file
    try {
      const fileContent = await fs.promises.readFile(PRODILLO_FILE, 'utf-8');
      prodilloData = JSON.parse(fileContent);
    } catch (error) {

    }
    
    // Stores user prediction in a prodillo.json file
    prodilloData[userId] = {
      user: user,
      predict: predict,
    };
    await fs.promises.writeFile(PRODILLO_FILE, JSON.stringify(prodilloData, null, 2));
    
    // Sends a reminder with the deadline
    await bot.sendMessage(msg.chat.id, `Prodillo de ${user} registrado: $${predict}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${isProdilleabe? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques`, {disable_web_page_preview: true});
  } else await bot.sendMessage(msg.chat.id, '¡Ingresaste cualquier cosa loko!\n\n/prodillo <numero>');
});

// When user writes /lista, sends a list of all registered prodillos
bot.onText(/\/lista/, async (msg) => {
  try {
    let prodillos: Record<string, { user: string; predict: number }>;
    prodillos = JSON.parse(await fs.promises.readFile(PRODILLO_FILE, 'utf-8'));
    const { winnerDeadline, prodilleableDeadline } = await deadline();
    const formattedList = Object.entries(prodillos).map(([userId, { user, predict }]) => {
      return `${user}: $${predict} (dif: ${(Math.abs(predict as number - bitcoinMax))})`}).join('\n');
    
    await bot.sendMessage(msg.chat.id, `🗒 LISTA DE PRODILLOS\nPrecio maximo de ฿ en esta ronda: $${bitcoinMax}\n------------------------------------------\n${formattedList}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${isProdilleabe? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques`);
  } catch (error) {
    console.error('Error al leer o enviar la lista:', error);
    await bot.sendMessage(msg.chat.id, 'No se pudo obtener la lista de prodillos.');
  }
});