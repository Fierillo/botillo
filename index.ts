import { execSync } from "child_process";
import { TextChannel } from "discord.js";
import { config } from "dotenv";
import { Telegraf, Context } from 'telegraf'; 
import { message } from 'telegraf/filters'; 
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
import { createInvoiceREST } from './src/modules/donacioncilla';
import { getListilla, getProdillo, getTrofeillos, prodilloInterval, saveValues } from './src/modules/prodillo';
import { bitcoinPrices, getBitcoinPrices, loadValues, trackBitcoinPrice, telegramChats, discordChannels } from './src/modules/bitcoinPrices';
//import { getTest } from "./src/modules/test";

config();

const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

const PRODILLOS_FILE = path.join(__dirname, '/src/db/prodillos.json');
const BITCOIN_FILE = path.join(__dirname, '/src/db/bitcoin.json');

client.login(process.env.DISCORD_TOKEN_ORIGINAL!);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

function ensureChatIsSaved(ctx: Context) {
  if (ctx.chat && !telegramChats.hasOwnProperty(ctx.chat.id)) {
    const chatName = ctx.chat.type === 'private' ? ctx.chat.first_name : ctx.chat.title;
    telegramChats[ctx.chat.id] = chatName || 'Unknown';
    console.log(`Chat guardado: ${chatName} [${ctx.chat.id}]`);
  }
}

bot.catch((err, ctx) => {
  const timestamp = new Date().toISOString();
  console.error(`${timestamp} - Ocurrió un error en Telegraf para ${ctx.updateType}`, err);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

let prodillos: Record<string, { user: string; predict: number }> = {};
export { prodillos }

function loadProdillos() {
  if (!fs.existsSync(PRODILLOS_FILE)) {
      fs.writeFileSync(PRODILLOS_FILE, JSON.stringify(prodillos, null, 2))
  }
  try {
  prodillos = JSON.parse(fs.readFileSync(PRODILLOS_FILE, 'utf-8'));
  return console.log('prodillos.json values loaded successfully!')
  } catch (e) {
  throw new Error(`CRITICAL ERROR: Couldn't read prodillos.json file`);
  }
}

// STARTING EVENT
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
  
  await loadProdillos();
  await loadValues();
  trackBitcoinPrice(bot); 
  setTimeout(() => prodilloInterval(bot, telegramChats, prodillos, bitcoinPrices), 420);
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000);
  bot.launch();
  console.log('Botillo is alive in Telegram!');
});

function seViene() {
  const luckyNumber = Math.random();
  const selectedMsg = luckyNumber <= 0.1 
  ? '🫂 ABRACEN A SUS FAMILIAS!' 
  : luckyNumber <= 0.8 ? 'SE VIENE' 
  : '🔥 SE RECONTRA VIENE';
  
  Object.keys(telegramChats).forEach(chatId => 
    bot.telegram.sendMessage(Number(chatId), selectedMsg!)); // <--- CAMBIO
  Object.values(discordChannels).forEach(channel => 
    channel.send(selectedMsg!));
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000);
};

schedule.scheduleJob('0 21 * * *', async () => {
  const { max, min } = await getBitcoinPrices();
  
  bitcoinPrices.lastReportedMax = max;
  bitcoinPrices.lastReportedMin = min;
  
  const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
  data.lastReportedMax = bitcoinPrices.lastReportedMax;
  data.lastReportedMin = bitcoinPrices.lastReportedMin;
  await saveValues(BITCOIN_FILE, 'lastReportedMax', bitcoinPrices.lastReportedMax);
  await saveValues(BITCOIN_FILE, 'lastReportedMin', bitcoinPrices.lastReportedMin);
  
  for (const channelId in discordChannels) {
    discordChannels[channelId].send(`¡GN humanos!\n🦁 El máximo de ₿ del dia fue: $${max}\n🐻 El mínimo fue: $${min}\n🔺 La variación del dia fue: $${max-min} (${(100*(max/min)-100).toFixed(1)}%)`);
  }
  for (const chatId in telegramChats) {
    bot.telegram.sendMessage(chatId, `¡GN humanos!\n🦁 El máximo de ₿ del dia fue: $${max}\n🐻 El mínimo fue: $${min}\n🔺 La variación del dia fue: $${max-min} (${(100*(max/min)-100).toFixed(1)}%)`); // <--- CAMBIO
  }
});

client.on('messageCreate', async (message: { content: string; channel: TextChannel; }) => {
  if (message.content === '/precio') {
    const { price } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`precio de ₿: $${price} (${(100*(price/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)`);
  } else if (message.content === '/hilo') {
    const { max, min } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`🦁 máximo diario de ₿: $${max} (${(100*(max/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)\n🐻 mínimo diario de ₿: $${min}\n🔺 Volatilidad diaria: $${max-min} (${(100*(max/min)-100).toFixed(1)}%)\n🚀 ATH de ₿: $${bitcoinPrices.bitcoinATH}`);
}});

schedule.scheduleJob('0 8 * * *', () => { 
  for (const channelId in discordChannels) {
    discordChannels[channelId].send(`GM humanos 🧉`);
  }
  for (const chatId in telegramChats) {
    bot.telegram.sendMessage(chatId, `GM humanos 🧉`); // <--- CAMBIO
  }
});

bot.command(['precio', 'precio@botillo21_bot'], async (ctx) => {
  ensureChatIsSaved(ctx);
  try {
    const { price } = await getBitcoinPrices();
    await ctx.reply(`Precio actual de ₿: $${price} (${(100 * (price / bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)`);
  } catch (error) {
    console.error(`Error en /precio para chat ${ctx.chat.id}`);
    await ctx.reply('🚨 Error al traer el precio de ₿, probá de nuevo en un rato.');
  }
});

bot.command(['hilo', 'hilo@botillo21_bot'], async (ctx) => {
  ensureChatIsSaved(ctx);
  try {
    const { max, min } = await getBitcoinPrices();
    await ctx.reply(`🦁 máximo diario de ₿: $${max} (${(100 * (max / bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)\n🐻 mínimo diario de ₿: $${min}\n🔺 Volatilidad diaria: $${max - min} (${(100 * (max / min) - 100).toFixed(1)}%)\n🚀 ATH de ₿: $${bitcoinPrices.bitcoinATH}`);
  } catch (error) {
    console.error(`Error en /hilo para chat ${ctx.chat.id}`);
    await ctx.reply('🚨 Error al traer el hilo de ₿, probá de nuevo en un rato.');
  }
});

/*bot.command('test', (ctx) => {
  ensureChatIsSaved(ctx);
  getTest(ctx);
});*/

const welcome = (ctx: Context) => {
  const name = ctx.chat?.type === 'private' ? ctx.chat.first_name : ctx.chat?.title;
  ctx.reply(`¡GM ${name}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automáticamente el máximo o mínimo mas reciente de Bitcoin\n/precio - Muestro el precio actual de Bitcoin\n/hilo - Muestro el máximo y mínimo en lo que va del dia\n/start - Muestro este mensaje\n\nProdillo: adivina el proximo máximo de BTC\n- Cada ronda dura 2016 bloques (un ajuste de dificultad)\n- Los jugadores pueden enviar prodillos hasta 420 bloques antes del fin de la ronda\n- El jugador que mas se aproxime al máximo de BTC de esa ronda sera el ganador\n/prodillo - Registra tu predicción del máximo de BTC de esta ronda\n/listilla - Muestra la lista de jugadores y sus prodillos\n/trofeillos - Muestra el salon de ganadores de prodillos\n\nPuedes mirar mi código en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`);
}

bot.start((ctx) => welcome(ctx));

bot.command(['prodillo', 'prodillo@botillo21_bot'], async (ctx) => {
  ensureChatIsSaved(ctx);
  getProdillo(ctx, prodillos, bitcoinPrices);
});

bot.command(['listilla', 'listilla@botillo21_bot'], (ctx) => {
  ensureChatIsSaved(ctx);  
  getListilla(ctx, prodillos);
});

bot.command(['trofeillos', 'trofeillos@botillo21_bot'], (ctx) => {
  ensureChatIsSaved(ctx);
  getTrofeillos(ctx);
});

bot.command(['donacioncilla', 'donacioncilla@botillo21_bot'], async (ctx) => {
  ensureChatIsSaved(ctx);
  const userId = ctx.from.id;
  const user = ctx.from.username;
  const args = ctx.message.text.split(' ');
  args.shift();
  const amountStr = args.join(' ');
  const amount = Math.round(Number(amountStr));

  if (userId && user && !isNaN(amount) && amount >= 0 && isFinite(amount)) {
    try {
      const invoice = await createInvoiceREST(amount, `Donación de ${amount} satoshis`);
      console.log(`🟨 ¡User ${user} [${userId}] wants to donate ${amount} sats!`);
      await ctx.reply(`🍾 ¡Gracias por querer donar ${amount} satoshi${amount > 1 ? 's' : ''} loko/a! 🙏\n\n¡Toma, paga aca!: ${invoice.request}`);
    } catch (error) {
      console.error(`❌ error when ${user} [${userId}] tried to donate ${amount} sats`, error);
      await ctx.reply('❌ Lo siento loko, hubo un error al generar el invoice, proba devuelta');
    }
  } else {
    await ctx.reply('❌ ¡Ingresaste cualquier cosa loko!\n\n/donacioncilla <monto en satoshis>');
  }
});

bot.hears(/(?<=\s|^)(peron|kuka|kirchner|zurdo)\w*/i, (ctx) => {
  ensureChatIsSaved(ctx);
  if (Math.random() <= 0.21) {
    ctx.reply(ctx.chat.id === -1001778459295 ? 'NO ME INTERESA LA OPINION DE LAS KUKAS' : 'ME CHUPA LA PIJA LA OPINION DE LAS KUKAS');
  }
});

bot.hears(/(?<=\s|^)(eth|solana|sol |bcash|bch |polkadot|dot |cardano|ada )\w*/i, (ctx) => {
  ensureChatIsSaved(ctx);
  if (Math.random() <= 0.21) {
    ctx.reply('🚨 ALERTA DU SHITCOINER 🚨');
  }
});

bot.on(message('text'), async (ctx) => {
  ensureChatIsSaved(ctx);

  const botUsername = ctx.botInfo.username;
  const repliedToBot = ctx.message.reply_to_message?.from?.id === ctx.botInfo.id;
  const mentionedBot = ctx.message.text.includes(`@${botUsername}`);

  if ((repliedToBot || mentionedBot) && ctx.message.text.endsWith('?')) {
    ctx.reply(Math.random() < 0.5 ? '✅ VERDADERO' : '❌ FALSO');
  };
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));