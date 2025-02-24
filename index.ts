// Dependency imports
import { execSync } from "child_process";
import { TextChannel, Message } from "discord.js";
import { config } from "dotenv";
const schedule = require('node-schedule');
import TelegramBot from 'node-telegram-bot-api';
const fs = require('fs');
const path = require('path');
import { createInvoiceREST } from './src/modules/donacioncilla';
import { getListilla, getProdillo, getTrofeillos, prodilloInterval, saveValues, prodilloState } from './src/modules/prodillo';
import { bitcoinPrices, getBitcoinPrices, loadValues, trackBitcoinPrice } from './src/modules/bitcoinPrices';
import { getTest } from "./src/modules/test";

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
const PRODILLOS_FILE = path.join(__dirname, '/src/db/prodillos.json');
const BITCOIN_FILE = path.join(__dirname, '/src/db/bitcoin.json');

// Discord bot token
client.login(process.env.DISCORD_TOKEN_ORIGINAL!);
// Telegram bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN!, { 
  polling: {
    interval: 2100, // polling interval in ms
    autoStart: true,
  }
});

// If bot receives ECONNRESET error, it will ignore it
bot.on('polling_error', (error) => {
  if (error && error.message && error.message.includes('ECONNRESET')) {
    // Ignoramos el error ECONNRESET
    console.warn('ECONNRESET detected... Omitting.');
  } else {
    console.error('Polling error:', error);
  }
});

// Define global variables
let telegramChats: { [key: number]: string } = {};
let discordChannels: { [key: string]: TextChannel } = {};
let prodillos: Record<string, { user: string; predict: number }> = {};
export { prodillos }

// Restores prodillos from JSON file
function loadProdillos() {
  if (!fs.existsSync(PRODILLOS_FILE)) {
      fs.writeFileSync(PRODILLOS_FILE, JSON.stringify(prodillos, null, 2))
  }
  try {
  prodillos = JSON.parse(fs.readFileSync(PRODILLOS_FILE, 'utf-8'));
  } catch (e) {
  throw new Error(`CRITICAL ERROR: Couldn't read prodillos.json file`);
  }
}

// STARTING EVENT
// Detects automatically the Discord server where the bot is, detects the first text-based channel, store it and send a message to it
client.on('ready', async () => {
  console.log(execSync('git log -1 --pretty=%B').toString().trim())
  console.log(`${client.user?.tag} ready on Discord!`);
  client.guilds.cache.forEach((guild: { channels: { cache: any[]; }; name: any; }) => {
    guild.channels.cache.forEach(async (channel) => {
      if (channel.isTextBased() && channel instanceof TextChannel) {
        discordChannels[channel.id] = channel;
        console.log(`Discord channel: ${guild.name} [${channel.id}]`);
      }
    });
  });
  
  // Starts main functions
  await loadProdillos();
  await loadValues();
  setTimeout(trackBitcoinPrice, 210);
  setTimeout(() => prodilloInterval(bot, telegramChats, prodillos, bitcoinPrices), 420);
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000); // Interval between 1 and 69 hours
});

// Sends SE VIENE message at random intervals to all channels and chats where bot is
function seViene() {
  const luckyNumber = Math.random();
  const selectedMsg = luckyNumber <= 0.1 
  ? '🫂 ABRACEN A SUS FAMILIAS!' 
  : luckyNumber <= 0.8 ? 'SE VIENE' 
  : '🔥 SE RECONTRA VIENE';
  
  // Sends message to all Telegram and Discord chats
  Object.keys(telegramChats).forEach(chatId => 
    bot.sendMessage(Number(chatId),selectedMsg!));
  Object.values(discordChannels).forEach(channel => 
    channel.send(selectedMsg!));
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000); // Interval between 1 and 69 hours
};

// Define cron job to reset daily highs and lows at midnight (UTC = 00:00)
schedule.scheduleJob('0 21 * * *', async () => { // 21:00 at local time (UTC-3) = 00:00 UTC
  bitcoinPrices.lastReportedMax = 0;
  bitcoinPrices.lastReportedMin = Infinity;
  
  // Load bitcoin.json file and update lastReportedMax/Min
  const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
  data.lastReportedMax = bitcoinPrices.lastReportedMax;
  data.lastReportedMin = bitcoinPrices.lastReportedMin;
  await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
  
  // Then send reset message to all Discord channels...
  for (const channelId in discordChannels) {
    discordChannels[channelId].send(`¡GN humanos!\n🔄 reiniciando máximos y mínimos diarios...`);
  }
  // And to all Telegram chats...
  for (const chatId in telegramChats) {
      bot.sendMessage(chatId, `¡GN humanos!\n🔄 reiniciando máximos y mínimos diarios...`);
  }
});

// Send Bitcoin price when user writes /precio, and max/min BTC price when user writes /hilo
client.on('messageCreate', async (message: { content: string; channel: TextChannel; }) => {
  if (message.content === '/precio') {
    const { price } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`precio de ₿: $${price} (${(100*(price/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)`);
  } else if (message.content === '/hilo') {
    const { max, min } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`🦁 máximo diario de ₿: $${max} (${(100*(max/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)\n🐻 mínimo diario de ₿: $${min}\n🔺 Volatilidad diaria: $${max-min} (${(100*(max/min)-100).toFixed(1)}%)\n🚀 ATH de ₿: $${bitcoinPrices.bitcoinATH}`);
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

// ------------TELEGRAM COMMANDS-------------

// Stores the chats where the bot is
bot.on('message', (msg) => {
  if (!telegramChats.hasOwnProperty(msg.chat.id)) {
    telegramChats[msg.chat.id] = msg.chat.title || msg.chat.first_name || 'Unknown';
    console.log(`Added telegram chat: ${msg.chat.title || msg.chat.first_name} [${msg.chat.id}]`);
    
    // Shows all the Telegram chats where the bot is
    console.log("Current Chats:");
    for (const [id, name] of Object.entries(telegramChats)) {
      console.log(`- ${name} [${id}]`);
    }
  }
});

// Send Bitcoin price when user writes /precio
bot.onText(/\/precio(@botillo21_bot)?/, async (msg) => {
  try {
    const { price } = await getBitcoinPrices();
    bot.sendMessage(msg.chat.id, `Precio actual de ₿: $${price} (${(100*(price/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)`);
  } catch (error) {
    bot.sendMessage(msg.chat.id, 'Lo siento, hubo un error al obtener el precio de Bitcoin.');
    console.error('error in Telegram command /precio');
  }
});

// Send High and Low prices when user writes /hilo
bot.onText(/\/hilo(@botillo21_bot)?/, async (msg) => {
  try {  
    const { max, min } = await getBitcoinPrices();
    bot.sendMessage(msg.chat.id, `🦁 máximo diario de ₿: $${max} (${(100*(max/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)\n🐻 mínimo diario de ₿: $${min}\n🔺 Volatilidad diaria: $${max-min} (${(100*(max/min)-100).toFixed(1)}%)\n🚀 ATH de ₿: $${bitcoinPrices.bitcoinATH}`);
  } catch (error) {
    bot.sendMessage(msg.chat.id, 'Lo siento, hubo un error al obtener el precio de Bitcoin.');
    console.error('error in Telegram command /hilo');
  }
});

// Welcome message constant
const welcome = (id: number, name: string | undefined) => bot.sendMessage(id, `¡GM ${name}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automáticamente el máximo o mínimo mas reciente de Bitcoin\n/precio - Muestro el precio actual de Bitcoin\n/hilo - Muestro el máximo y mínimo en lo que va del dia\n/start - Muestro este mensaje\n\nProdillo: adivina el proximo máximo de BTC\n- Cada ronda dura 2016 bloques (un ajuste de dificultad)\n- Los jugadores pueden enviar prodillos hasta 420 bloques antes del fin de la ronda\n- El jugador que mas se aproxime al máximo de BTC de esa ronda sera el ganador\n/prodillo - Registra tu predicción del máximo de BTC de esta ronda\n/listilla - Muestra la lista de jugadores y sus prodillos\n/trofeillos - Muestra el salon de ganadores de prodillos\n\nPuedes mirar mi código en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`, {disable_web_page_preview: true});

// Sends welcome message when user writes /start
bot.onText(/^\/start$/, (msg) => welcome(msg.chat.id, msg.chat.title || msg.chat.first_name));

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
  if (Math.random() <= 0.21) {
    bot.sendMessage(msg.chat.id, msg.chat.id === -1001778459295 ? 'NO ME INTERESA LA OPINION DE LAS KUKAS' : 'ME CHUPA LA PIJA LA OPINION DE LAS KUKAS');
  }
});

// Bot replies to shitcoiners
bot.onText(/(?<=\s|^)(eth|solana|sol |bcash|bch |polkadot|dot |cardano|ada )\w*/i, (msg) => {
  if (Math.random() <= 0.21) {
    bot.sendMessage(msg.chat.id, '🚨 ALERTA DU SHITCOINER 🚨');
  }
});

bot.onText(/\/test/, (msg) => {
  try {
    getTest(bot, msg)
  } catch (error) {    
    console.error('error in getTest()');
  }
});

// Stores user predictions of BTC price in a JSON file and replies a reminder with the deadline
bot.onText(/\/prodillo(\s|\@botillo21_bot\s)(.+)/, async (msg, match) => {
  const userId = msg.from?.id;
  const user = msg.from?.username;
  const predictStr = (match as RegExpMatchArray)[2];
  const predict = Math.round(Number(predictStr));
  
  getProdillo(bot, msg.chat.id, userId!, user!, predict, prodillos, bitcoinPrices)
});

// When user writes /lista, sends a list of all registered prodillos
bot.onText(/\/listilla/, async (msg) => {
  getListilla(bot, msg.chat.id, prodillos, bitcoinPrices)
});

// When user writes /trofeillos, sends a list of all winners of the game and the number of trophys of each one
bot.onText(/\/trofeillos/, (msg) => {
  getTrofeillos(bot, msg.chat.id)
});

// Defines a function that creates an invoice for donations
bot.onText(/\/donacioncilla(\s|\@botillo21_bot\s)(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const user = msg.from?.username;
  const amountStr = (match as RegExpMatchArray)[2];
  const amount = Math.round(Number(amountStr));

  if (userId && user && !isNaN(amount) && amount >= 0 && isFinite(amount)) {
    try {
      // Create LND invoice
      const invoice = await createInvoiceREST(amount, `Donación de ${amount} satoshis`);
      
      console.log(`🟨 ¡User ${user} [${userId}] wants to donate ${amount} sats!`);
      await bot.sendMessage(chatId, `🍾 ¡Gracias por querer donar ${amount} satoshi${amount > 1 ? 's' : ''} loko/a! 🙏\n\n¡Toma, paga aca!: ${invoice.request}`);
    } catch (error) {
      console.error(`❌ error when ${user} [${userId}] tried to donate ${amount} sats`, error);
      await bot.sendMessage(chatId, '❌ Lo siento loko, hubo un error al generar el invoice, proba devuelta');
    }
  } else {
    await bot.sendMessage(chatId, '❌ ¡Ingresaste cualquier cosa loko!\n\n/donacioncilla <monto en satoshis>');
  }
});