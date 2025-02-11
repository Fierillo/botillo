// Dependency imports
import { execSync } from "child_process";
import { TextChannel, Message } from "discord.js";
import { config } from "dotenv";
const schedule = require('node-schedule');
import TelegramBot from 'node-telegram-bot-api';
const fs = require('fs');
const path = require('path');
import { createInvoiceREST } from './src/modules/donacioncilla';
import { prodilloInterval, prodilloState } from './src/modules/prodillo';
import { getBitcoinPrices } from './src/modules/bitcoinPrices';
import { deadline } from './src/modules/deadline';

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
const TROFEILLOS_FILE = path.join(__dirname, '/src/db/trofeillos.json');
// Set time interval for automatic bot updates
const TIME_INTERVAL = 1000*210;
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
let bitcoinPrices = {
  bitcoinATH: 0,
  lastReportedMax: 0,
  lastReportedMin: Infinity,
  bitcoinMax: 0,
  bitcoinMaxBlock: 0,
};
export { bitcoinPrices };
let isTest: boolean = false;
let trofeillos: Record<string, { champion: string; trofeillo: string[]}> = {};

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
  setTimeout(() => prodilloInterval(bot, telegramChats, prodillos), 420);
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000); // Interval between 1 and 69 hours
});

// Restores Bitcoin prices from bitcoin.json file
async function loadValues() {
  if (!fs.existsSync(BITCOIN_FILE)) {
    fs.writeFileSync(BITCOIN_FILE, JSON.stringify(bitcoinPrices, null, 2));
  }
  try {
    const data: typeof bitcoinPrices = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf-8'));
    bitcoinPrices = {
      lastReportedMax: data.lastReportedMax,
      lastReportedMin: data.lastReportedMin,
      bitcoinMax: data.bitcoinMax,
      bitcoinATH: data.bitcoinATH,
      bitcoinMaxBlock: data.bitcoinMaxBlock,
    }
    console.log('Initial values with bitcoin.json updated successfully:', data);
  } catch (e) {
    throw new Error(`CRITICAL ERROR: Couldn't read bitcoin.json file`);
  }
}

async function saveValues(key: string, value: number) {
  try {
    const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
      data[key] = value;
      await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
      console.log(`${key} updated successfully:`, value);
  } catch (err) {
      console.error(`Failed to save ${key} value in bitcoin.json`);
  }
}
export { saveValues };

// Define function that tracks the Bitcoin price at regular intervals and report the max and min only if values surpass old reported values
async function trackBitcoinPrice() {
  while (true) {
    try {
      const { min, max } = await getBitcoinPrices();
      // If price is higher than ATH...
      //console.log('trackBitcoinPrice.start called')
      if (max > bitcoinPrices.bitcoinATH) {
        bitcoinPrices.bitcoinATH = max;
        
        // Load bitcoin.json file and update bitcoinATH
        await saveValues('bitcoinATH', bitcoinPrices.bitcoinATH);

        // Sends ATH message to all Telegram and Discord chats
        Object.keys(telegramChats).forEach(async chatId => 
          (await hasSendPermission(chatId)) 
          ? bot.sendMessage(Number(chatId),`🚀 NUEVO ATH DE ₿: $${bitcoinPrices.bitcoinATH}`) 
          : null);
        Object.values(discordChannels).forEach(channel => 
          channel.send(`🚀 NUEVO ATH DE ₿: $${bitcoinPrices.bitcoinATH}`));
      } 
      // If price is higher than reported max...
      else if (max > bitcoinPrices.lastReportedMax && max < bitcoinPrices.bitcoinATH) {
        bitcoinPrices.lastReportedMax = max;

        // Load bitcoin.json file and update lastReportedMax
        await saveValues('lastReportedMax', bitcoinPrices.lastReportedMax);
        
        // And sends daily high message to all Telegram and Discord chats
        Object.keys(telegramChats).forEach(async chatId => 
          (await hasSendPermission(chatId)) 
          ? bot.sendMessage(Number(chatId),`🦁 nuevo máximo diario de ₿: $${bitcoinPrices.lastReportedMax}`) 
          : null);
        Object.values(discordChannels).forEach(channel => 
          channel.send(`🦁 nuevo máximo diario de ₿: $${bitcoinPrices.lastReportedMax}`));
      }
      // If price is lower than reported min...
      else if (min < bitcoinPrices.lastReportedMin) {
        bitcoinPrices.lastReportedMin = min;
        
        // Load bitcoin.json file and update lastReportedMin
        await saveValues('lastReportedMin', bitcoinPrices.lastReportedMin);
        
        // Sends daily low message to all Telegram and Discord chats
        Object.keys(telegramChats).forEach(async chatId => 
          (await hasSendPermission(chatId)) 
          ? bot.sendMessage(Number(chatId),`🐻 nuevo mínimo diario de ₿: $${bitcoinPrices.lastReportedMin}`) 
          : null);
        Object.values(discordChannels).forEach(channel => 
          channel.send(`🐻 nuevo mínimo diario de ₿: $${bitcoinPrices.lastReportedMin}`));
      } else {
        //console.log('trackBitcoinPrice.end called');
      }
    } catch (error) {
      console.error('trackBitcoinPrice() error');
    }
    await new Promise(resolve => setTimeout(resolve, TIME_INTERVAL));
  }
};

// Function to check if bot has permission to send messages
async function hasSendPermission(chatId: string) {
  try {
    const botInfo = await bot.getMe();
    const chatMember = await bot.getChatMember(chatId, botInfo.id);
    
    // If the bot is 'restricted', we check if it can send messages.
    if (chatMember.status === 'restricted') {
      return chatMember.can_send_messages;
    }
    
    // If the bot is 'member', 'administrator' or 'creator', it has permission.
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      return true;
    }
    
    // In any other case, the bot doesn't have permission.
    return false;
  } catch (error) {
    console.error(`Error verificando permisos en el chat ${chatId}:`, error);
    return false;
  }
}

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
    bot.sendMessage(msg.chat.id, `¡Ingresaste cualquier cosa loko!\n\n/test on - Activa el modo de prueba\n/test off - Desactiva el modo de prueba'\n/test win - Activa el evento de victoria`);
  }
});*/

// Stores user predictions of BTC price in a JSON file and replies a reminder with the deadline
bot.onText(/\/prodillo(\s|\@botillo21_bot\s)(.+)/, async (msg, match) => {
  
  // Calls deadline function and stores in local variables
  const { winnerDeadline, prodilleableDeadline } = await deadline();
  
  // If deadline for prodillos is over, returns a message to the users to let them know
  if(!prodilloState.isProdilleable && !isTest) {
    return await bot.sendMessage(msg.chat.id, `Tarde loko!\nespera ${winnerDeadline} bloques que comience una nueva ronda de prodillos!`);
  }
  const userId = msg.from?.id;
  const user = msg.from?.username;
  const predictStr = (match as RegExpMatchArray)[2];
  const predict = Math.round(Number(predictStr));
  
  if ((prodilloState.isProdilleable || isTest) && userId && user && !isNaN(predict) && predict >= 0 && isFinite(predict)) {

    // try to read prodillos.json file
    try {
      const fileContent = await fs.promises.readFile(PRODILLOS_FILE, 'utf-8');
      prodillos = JSON.parse(fileContent);
    } catch (error) {
      console.error('error trying to read prodillos.json');
    }

    // try to read bitcoin.json file
    try {
      const fileContent = await fs.promises.readFile(BITCOIN_FILE, 'utf-8');
      bitcoinPrices = JSON.parse(fileContent);
    } catch (error) {
      console.error('error trying to read bitcoin.json');
    }

    // Check if the prediction already exists
    const existingPredictions = Object.values(prodillos).map(p => p.predict);
    if (existingPredictions.includes(predict)) {
      return await bot.sendMessage(msg.chat.id, `Ese prodillo ya existe. ¡Elegí otro valor loko!`);
    }
    
    // If the prediction is lower than current Bitcoin max price in the round, returns a message to the user
    if (predict < bitcoinPrices.bitcoinMax) {
      return await bot.sendMessage(msg.chat.id, `Tenes que ingresar un valor mayor a ${bitcoinPrices.bitcoinMax} para tener alguna chance de ganar.\nMentalidad de tiburón loko!`);
    }
    
    // Stores user prediction in a prodillos.json file
    prodillos[userId] = {
      user: user,
      predict: predict,
    };
    await fs.promises.writeFile(PRODILLOS_FILE, JSON.stringify(prodillos, null, 2));
    
    // Sends a reminder with the deadline
    await bot.sendMessage(msg.chat.id, `Prodillo de ${user} registrado: $${predict}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${prodilloState.isProdilleable? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques`, {disable_web_page_preview: true});
    console.log(`Registered prodillo of ${user} [${userId}]: ${predict}`);
  } else await bot.sendMessage(msg.chat.id, '¡Ingresaste cualquier cosa loko!\n\n/prodillo <numero>');
});

// When user writes /lista, sends a list of all registered prodillos
bot.onText(/\/listilla/, async (msg) => {
  try {
    // Read prodillos.json file and store it in a local variable
    prodillos = JSON.parse(await fs.promises.readFile(PRODILLOS_FILE, 'utf-8'));

    // Read bitcoin.json file and store it in a local variable
    bitcoinPrices = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf-8'));
    
    // Get the deadlines
    const { winnerDeadline, prodilleableDeadline } = await deadline();
    
    // Sort the prodillos by their difference from the current Max Bitcoin price
    const sortedProdillos = Object.entries(prodillos).map(([userId, { user, predict }]) => {
      return {user, predict, diff: Math.abs(predict - bitcoinPrices.bitcoinMax)};
    }).sort((a, b) => a.diff - b.diff);

    const closestProdillo = sortedProdillos[0].predict;

    let formattedList = `${('Usuario').padEnd(20, ' ')} | ${('Predicción').padEnd(10, ' ')}  | Diferencia\n`;
    formattedList += '-----------------------------------------------------\n';

    sortedProdillos.forEach(({ user, predict, diff }) => {
      if (predict < closestProdillo) {
        formattedList += `<s>${user.padEnd(20, ' ')} | $${(predict.toString()).padStart(10, ' ')} | ${diff}</s> (REKT!)\n`;
      } else {
        formattedList += `${user.padEnd(20, ' ')} | $${(predict.toString()).padStart(10, ' ')} | ${diff}\n`;
      }
    });
    await bot.sendMessage(msg.chat.id, `<pre><b>LISTA DE PRODILLOS:</b>\n\nPrecio máximo de ₿ en esta ronda: $${bitcoinPrices.bitcoinMax}\n-----------------------------------------------------\n${formattedList}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${prodilloState.isProdilleable ? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques</pre>`, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Could not get the list of prodillos');
    await bot.sendMessage(msg.chat.id, 'No se pudo obtener la lista de prodillos.');
  }
});

// When user writes /trofeillos, sends a list of all winners of the game and the number of trophys of each one
bot.onText(/\/trofeillos/, (msg) => {
  
  // Read trofeillos.json to get the list of winners
  if (!fs.existsSync(TROFEILLOS_FILE)) {
    fs.writeFileSync(TROFEILLOS_FILE, JSON.stringify(trofeillos, null, 2))
  }
  try {
  trofeillos = JSON.parse(fs.readFileSync(TROFEILLOS_FILE, 'utf-8'));
  } catch (e) {
  throw new Error(`CRITICAL ERROR: Couldn't read trofeillos.json file`);
  }
  let mensaje = "";
  for (const [id, data] of Object.entries(trofeillos)) {
    mensaje += `\n- ${data.champion}: ${data.trofeillo}`;
  }
  bot.sendMessage(msg.chat.id, `<pre><b>SALA DE TROFEILLOS</b>\n\nUltimo campeón: ${prodilloState.winnerName}\nCampeón: 🏆 [nro. de bloque]\n------------------------------------------------------------------------------${mensaje || 'No hay ganadores aún.'}</pre>`, { parse_mode: 'HTML' });
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