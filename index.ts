// Dependecy imports
import axios from "axios";
import { execSync } from "child_process";
import { TextChannel, Message } from "discord.js";
import { config } from "dotenv";
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
const BITCOIN_FILE = path.join(__dirname, 'bitcoin.json');
const TROFEILLOS_FILE = path.join(__dirname, 'trofeillos.json');
// Set time interval for automatic bot updates
const TIME_INTERVAL = 1000*210;
// Set time interval for prodillo game
const PRODILLO_TIME_INTERVAL = 1000*21;
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

// Prodillo trophy
const trofeillo = '🏆 ';

// Define global variables
let lastReportedMax: number = 0;
let lastReportedMin: number = Infinity;
let telegramChats: { [key: number]: boolean } = {};
let discordChannels: { [key: string]: TextChannel } = {};
let prodillos: Record<string, { user: string; predict: number }>;
let isProdilleabe: boolean = false;
let bitcoinMax: number = 0;
let bitcoinMaxBlock: number = 0;
let bitcoinATH: number = 73757;
let bitcoinPrices = {
  lastReportedMax: lastReportedMax,
  lastReportedMin: lastReportedMin,
  bitcoinMax: bitcoinMax,
  bitcoinMaxBlock: bitcoinMaxBlock,
  bitcoinATH: bitcoinATH
};
let isTest: boolean = false;
let isWin: boolean = false;
let isWon: boolean = false;
let winnerName: string = '';
let trofeillos: Record<string, { champion: string; trofeillo: string[]}> = {};
let lastPrices: { price: number, min: number, max: number } = { price: 21, min: 21, max: 21 };
let lastDeadline = {
  latestHeight: Infinity,
  winnerDeadline: Infinity,
  prodilleableDeadline: Infinity,
}

// Restores prodillos from JSON file
try {
  prodillos = JSON.parse(fs.readFileSync(PRODILLO_FILE, 'utf-8'));
} catch (e) {
  console.warn('No se pudo leer el archivo prodillo.json\nSe iniciará uno nuevo.');
}

// Restores Bitcoin prices from bitcoin.json file
async function initialValues() {
  try {
    bitcoinPrices = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf-8'));
    lastReportedMax = bitcoinPrices.lastReportedMax;
    lastReportedMin = bitcoinPrices.lastReportedMin;
    bitcoinMax = bitcoinPrices.bitcoinMax;
    bitcoinATH = bitcoinPrices.bitcoinATH;
    bitcoinMaxBlock = bitcoinPrices.bitcoinMaxBlock;
    console.log('Initial values with bitcoin.json updated successfully:', bitcoinPrices);
  } catch (e) {
    console.warn('Could not read bitcoin.json file, using default values');
  }
}

// Initialize starting deadline for Prodillo game, next Bitcoin difficulty adjustment using mempool API
async function deadline() {
  try {
    const response = await axios.get('https://mempool.space/api/blocks/tip/height');
    const latestHeight = Number(response.data);
    lastDeadline = {
      latestHeight: latestHeight,
      winnerDeadline: 2015 - latestHeight % 2016, // 2016 is the Bitcoin difficulty adjustment
      prodilleableDeadline: (2015 - latestHeight % 2016) - 690, // prodillos can be submitted 690 blocks before the difficulty adjustment
    };
    return lastDeadline;
  } catch (error) {
    console.error('deadline() error');
    return lastDeadline;
  };
}

// Define function that fetches the Bitcoin price using Binance API
async function getBitcoinPrices () {
  try {  
    const { data } = await axios.get<{ last: string, low: string, high: string }>('https://www.bitstamp.net/api/v2/ticker/btcusd');
    lastPrices = {
      price: parseInt(data.last),
      min: parseInt(data.low),
      max: parseInt(data.high),
    }
    return lastPrices;
  } catch (error) {
    console.error('getBitcoinPrices() error');
    return lastPrices;
  }
};

// Define function that tracks the Bitcoin price at regular intervals and report the max and min only if values surpass old reported values
async function trackBitcoinPrice() {
  while (true) {
    try {
      const { min, max } = await getBitcoinPrices();
      // If price is higher than ATH...
      if (max > bitcoinATH) {
        bitcoinATH = max;
        
        // Load bitcoin.json file and update bitcoinATH
        try {
          const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
            data.bitcoinATH = bitcoinATH;
            await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
            console.log('bitcoinATH updated successfully:', data.bitcoinATH);
        } catch (err) {
            console.error('Failed to save ATH value in bitcoin.json');
        }

        // Sends ATH message to all Telegram and Discord chats
        Object.keys(telegramChats).forEach(chatId => bot.sendMessage(Number(chatId),`NUEVO ATH DE ₿: $${bitcoinATH}`));
        Object.values(discordChannels).forEach(channel => channel.send(`NUEVO ATH DE ₿: $${bitcoinATH}`));
      } else if (max > lastReportedMax && max < bitcoinATH) {
        // If price is higher than reported max...
        lastReportedMax = max;

        // Load bitcoin.json file and update lastReportedMax
        try {
          const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
            data.lastReportedMax = lastReportedMax;
            await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
            console.log('lastReportedMax updated successfully:', data.lastReportedMax);
        } catch (err) {
            console.error('Failed to save lastReportedMax in bitcoin.json');
        }
        
        // And sends daily high message to all Telegram and Discord chats
        Object.keys(telegramChats).forEach(chatId => bot.sendMessage(Number(chatId),`nuevo máximo diario de ₿: $${lastReportedMax}`));
        Object.values(discordChannels).forEach(channel => channel.send(`nuevo máximo diario de ₿: $${lastReportedMax}`));
      }
      // If price is lower than reported min...
      if (min < lastReportedMin) {
        lastReportedMin = min;
        
        // Load bitcoin.json file and update lastReportedMin
        try {
          const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
            data.lastReportedMin = lastReportedMin;
            await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
            console.log('lastReportedMin updated successfully:', data.lastReportedMin);
        } catch (err) {
            console.error('Failed to save lastReportedMin in bitcoin.json');
        }
        
        // Sends daily low message to all Telegram and Discord chats
        Object.keys(telegramChats).forEach(chatId => bot.sendMessage(Number(chatId),`🐻 nuevo mínimo diario de ₿: $${lastReportedMin}`));
        Object.values(discordChannels).forEach(channel => channel.send(`🐻 nuevo mínimo diario de ₿: $${lastReportedMin}`));
      }
    } catch (error) {
      console.error('trackBitcoinPrice() error');
    }
    await new Promise(resolve => setTimeout(resolve, TIME_INTERVAL));
  }
};

// Sends SE VIENE message at random intervals to all channels and chats where bot is
function seViene() {
  const luckyNumber = Math.random();
  const selectedMsg = luckyNumber <= 0.1 ? '🫂 ABRACEN A SUS FAMILIAS!' : luckyNumber <= 0.8 ? 'SE VIENE' : '🔥 SE RECONTRA VIENE';
  
  // Sends message to all Telegram and Discord chats
  Object.keys(telegramChats).forEach(chatId => bot.sendMessage(Number(chatId),selectedMsg!));
  Object.values(discordChannels).forEach(channel => channel.send(selectedMsg!));
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000); // Interval between 1 and 69 hours
};

// Define cron job to reset daily highs and lows at midnight (UTC = 00:00)
schedule.scheduleJob('0 21 * * *', async () => { // 21:00 at local time (UTC-3) = 00:00 UTC
  lastReportedMax = 0;
  lastReportedMin = Infinity;
  
  // Load bitcoin.json file and update lastReportedMax/Min
  const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
  data.lastReportedMax = lastReportedMax;
  data.lastReportedMin = lastReportedMin;
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

// STARTING EVENT
// Detects automatically the Discord server where the bot is, detects the first text-based channel, store it and send a message to it
client.on('ready', () => {
  console.log(execSync('git log -1 --pretty=%B').toString().trim())
  console.log(`${client.user?.tag} listo en Discord!`);
  client.guilds.cache.forEach((guild: { channels: { cache: any[]; }; name: any; }) => {
    guild.channels.cache.forEach(async (channel) => {
      if (channel.isTextBased() && channel instanceof TextChannel) {
        discordChannels[channel.id] = channel;
        console.log(`Discord channel: ${guild.name} [${channel.id}]`);
      }
    });
  });
  // Starts main functions
  setTimeout(initialValues, 2100);
  setTimeout(trackBitcoinPrice, 4200);
  setTimeout(prodilloInterval, 6900);
  setTimeout(seViene, 21000);
});

// Send Bitcoin price when user writes /precio, and max/min BTC price when user writes /hilo
client.on('messageCreate', async (message: { content: string; channel: TextChannel; }) => {
  if (message.content === '/precio') {
    const { price } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`precio de ₿: $${price} (${100*(price/bitcoinATH)}% hasta el ATH)`);
  } else if (message.content === '/hilo') {
    const { max, min } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`máximo diario de ₿: $${max}\n🐻 mínimo diario de ₿: $${min}\nATH de ₿: $${bitcoinATH}`);
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
  const { price } = await getBitcoinPrices();
  bot.sendMessage(msg.chat.id, `precio actual de ₿: $${price} (${100*(price/bitcoinATH)}% hasta el ATH)`);
});

// Send High and Low prices when user writes /hilo
bot.onText(/\/hilo/, async (msg) => {
  const { max, min } = await getBitcoinPrices();
  bot.sendMessage(msg.chat.id, `máximo diario de ₿: $${max}\n🐻 mínimo diario de ₿: $${min}\nATH de ₿: $${bitcoinATH}`);
});

// Welcome message constant
const welcome = (id: number, name: string | undefined) => bot.sendMessage(id, `¡GM ${name}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automaticamente el maximo o minimo mas reciente de Bitcoin\n/precio - Muestro el precio actual de Bitcoin\n/hilo - Muestro el máximo y mínimo en lo que va del dia\n/start - Muestro este mensaje\n\nProdillo: adivina el proximo maximo de BTC\n- Cada ronda dura 2016 bloques (un ajuste de dificultad)\n- Los jugadores pueden enviar prodillos hasta 420 bloques antes del fin de la ronda\n- El jugador que mas se aproxime al maximo de BTC de esa ronda sera el ganador\n/prodillo - Registra tu predicción del máximo de BTC de esta ronda\n/listilla - Muestra la lista de jugadores y sus prodillos\n/trofeillos - Muestra el salon de ganadores de prodillos\n\nPuedes mirar mi codigo en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`, {disable_web_page_preview: true});

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

// Defines interval that checks deadlines and enable/disable prodillos. When deadline is over, sends a message to all Telegram chats to let them know the winner
async function prodilloInterval() {
  while (true) {
    // Calls deadline() values
    const { winnerDeadline, prodilleableDeadline, latestHeight } = await deadline();

    // Calls getBitcoinPrices() values
    const { max } = await getBitcoinPrices();
  
    // Check if deadline for prodillos is over
    isProdilleabe = (prodilleableDeadline > 0);
    
    // Check if winner has been announced and some blocks passed
    if (isWon && !(winnerDeadline === 0) && (winnerDeadline < 2010)) {
      isWon = false
    }
    
    // Updates bitcoinMax to track maximum BTC price in the current round, also record it in a JSON file. Aditionally record the correspondent block height
    if (max > bitcoinMax) {
      bitcoinMax = max;
      bitcoinMaxBlock = latestHeight;
      
      // Load bitcoin.json file and update bitcoinMax/bitcoinMaxBlock
      try {
      const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
        data.bitcoinMax = bitcoinMax;
        data.bitcoinMaxBlock = bitcoinMaxBlock;
        await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('Failed to save bitcoinMax/bitcoinMaxBlock in bitcoin.json');
      }
    }
    
    // Triggers win event if deadline is over (difficulty adjustment of Bitcoin)
    if (((winnerDeadline === 0) && !isWon) || isWin) {
      
      // Read prodillo.json file and store it in a local variable
      prodillos = JSON.parse(await fs.promises.readFile(PRODILLO_FILE, 'utf-8'));
      
      // Sort the prodillos by their difference from the current Max Bitcoin price of the round
      const prodillosSorted = Object.entries(prodillos).sort(([,a],[,b]) => 
        Math.abs(a.predict - bitcoinMax) - Math.abs(b.predict - bitcoinMax)
      );
      
      // Format the list of prodillos
      const formattedList = prodillosSorted.map(([userId, { user, predict }]) => {
        return `${user}: $${predict} (dif: ${(Math.abs(predict as unknown as number - bitcoinMax))})`}).join('\n');

      // Stores the winner in local variables
      const winnerId = prodillosSorted[0][0];
      winnerName = prodillosSorted[0][1].user;
      
      // Send a message to all Telegram chats
      for (const chatId in telegramChats) {
        await bot.sendMessage(chatId, `<pre>🏁 ¡LA RONDA A LLEGADO A SU FIN!\nMaximo de ₿ de esta ronda: $${bitcoinMax}\n------------------------------------------\n${formattedList}\n\nEl ganador es ${winnerName} 🏆</pre>`, { parse_mode: 'HTML' });
      }

      // Read trofeillos.json file and store it in a global variable
      try {
      trofeillos = JSON.parse(fs.readFileSync('trofeillos.json', 'utf-8'));
      console.log('trofeillos.json file read successfully');
      } catch (error) {
      console.log('Could not read trofeillos.json file');
      }

      // Add the new trophy to winner
      if (!trofeillos[winnerId]) {
        trofeillos[winnerId] = { 
        champion: winnerName, 
        trofeillo: [`${trofeillo}[${bitcoinMaxBlock}]`],
        };
      } else {
        trofeillos[winnerId].trofeillo.push(`${trofeillo}[${bitcoinMaxBlock}]`);
      }
    
      // Save the new trophy status in a JSON file
      fs.writeFileSync(TROFEILLOS_FILE, JSON.stringify(trofeillos, null, 2));

      // Restart max BTC price for the nex round
      bitcoinMax = 0;
      
      // Wipe bitcoin.json file
      try {
        fs.writeFileSync(BITCOIN_FILE, JSON.stringify({}, null, 2));
        console.log('bitcoin.json file wiped successfully');
      } catch (err) {
        console.error('Failed to wipe bitcoin.json file');
      }
      
      // Wipe prodillo.json file
      try {
        fs.writeFileSync(PRODILLO_FILE, JSON.stringify({}, null, 2));
        console.log('prodillo.json file wiped successfully');
      } catch (err) {
        console.error('Failed to wipe prodillo.json file');
      }
      
      try {
        fs.writeFileSync(PRODILLO_FILE, JSON.stringify({'0': {user: 'Hal Finney', predict: 10000000}}, null, 2));
        console.log('Hal Finney prediction added to prodillo.json file');
      } catch (err) {
        console.error('Failed to add Hal Finney prediction to prodillo.json file');
      }
      
      // Prevents that win event is triggered again for a while
      isWon = true
    }
    await new Promise(resolve => setTimeout(resolve, PRODILLO_TIME_INTERVAL));
  }
};

// Stores user predictions of BTC price in a JSON file and replies a reminder with the deadline
bot.onText(/\/prodillo(\s|\@botillo21_bot\s)(\d+)/, async (msg, match) => {
  
  // Calls deadline function and stores in local variables
  const { winnerDeadline, prodilleableDeadline } = await deadline();
  
  // If deadline for prodillos is over, returns a message to the users to let them know
  if(!isProdilleabe && !isTest) {
    return await bot.sendMessage(msg.chat.id, `Tarde loko!\nespera ${winnerDeadline} bloques que comience una nueva ronda de prodillos!`);
  }
  const userId = msg.from?.id;
  const user = msg.from?.username;
  const predictStr = (match as RegExpMatchArray)[2];
  const predict = Math.round(Number(predictStr));
  
  if ((isProdilleabe || isTest) && userId && user && !isNaN(predict) && predict >= 0 && isFinite(predict)) {

    // try to read prodillo.json file
    try {
      const fileContent = await fs.promises.readFile(PRODILLO_FILE, 'utf-8');
      prodillos = JSON.parse(fileContent);
    } catch (error) {
      console.error('Error en /prodillo');
    }

    // Check if the prediction already exists
    const existingPredictions = Object.values(prodillos).map(p => p.predict);
    if (existingPredictions.includes(predict)) {
      return await bot.sendMessage(msg.chat.id, `Ese prodillo ya existe. ¡Elegi otro valor loko!`);
    }
    
    // If the prediction is lower than current Bitcoin max price in the round, returns a message to the user
    if (predict < bitcoinMax) {
      return await bot.sendMessage(msg.chat.id, `Tenes que ingresar un valor mayor a ${bitcoinMax} para tener alguna chance de ganar.\nMentalidad de tiburón loko!`);
    }
    
    // Stores user prediction in a prodillo.json file
    prodillos[userId] = {
      user: user,
      predict: predict,
    };
    await fs.promises.writeFile(PRODILLO_FILE, JSON.stringify(prodillos, null, 2));
    
    // Sends a reminder with the deadline
    await bot.sendMessage(msg.chat.id, `Prodillo de ${user} registrado: $${predict}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${isProdilleabe? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques`, {disable_web_page_preview: true});
    console.log(`Registered prodillo of ${user} [${userId}]: ${predict}`);
  } else await bot.sendMessage(msg.chat.id, '¡Ingresaste cualquier cosa loko!\n\n/prodillo <numero>');
});

// When user writes /lista, sends a list of all registered prodillos
bot.onText(/\/listilla/, async (msg) => {
  try {
    // Read prodillo.json file and store it in a local variable
    prodillos = JSON.parse(await fs.promises.readFile(PRODILLO_FILE, 'utf-8'));
    
    // Get the deadlines
    const { winnerDeadline, prodilleableDeadline } = await deadline();
    
    // Sort the prodillos by their difference from the current Max Bitcoin price
    const sortedProdillos = Object.entries(prodillos).map(([userId, { user, predict }]) => {
      return {user, predict, diff: Math.abs(predict - bitcoinMax)};
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
    await bot.sendMessage(msg.chat.id, `<pre><b>LISTA DE PRODILLOS:</b>\n\nPrecio máximo de ₿ en esta ronda: $${bitcoinMax}\n-----------------------------------------------------\n${formattedList}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${isProdilleabe ? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques</pre>`, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Could not get the list of prodillos');
    await bot.sendMessage(msg.chat.id, 'No se pudo obtener la lista de prodillos.');
  }
});

// When user writes /trofeillos, sends a list of all winners of the game and the number of trophys of each one
bot.onText(/\/trofeillos/, (msg) => {
  
  // Read trofeillos.json to get the list of winners
  try {
    trofeillos = JSON.parse(fs.readFileSync('trofeillos.json', 'utf-8'));
  } catch (e) {
    trofeillos = {};
  }
  let mensaje = "";
  for (const [id, data] of Object.entries(trofeillos)) {
    mensaje += `\n- ${data.champion}: ${data.trofeillo}`;
  }
  bot.sendMessage(msg.chat.id, `<pre><b>SALA DE TROFEILLOS</b>\n\nUltimo campeón: ${winnerName}\nCampeón: 🏆 [nro. de bloque]\n------------------------------------------------------------------------------${mensaje || 'No hay ganadores aún.'}</pre>`, { parse_mode: 'HTML' });
});