import { execSync } from "child_process";
import { TextChannel } from "discord.js";
import { config } from "dotenv";
import { Telegraf, Context } from 'telegraf'; 
import { message } from 'telegraf/filters'; 
const fs = require('fs');
const path = require('path');
import { getListilla, getProdillo, getTrofeillos, prodilloInterval } from './src/modules/prodillo';
import { saveValues, loadValues } from './src/modules/utils';
import { startPaymentChecker } from './src/modules/paymentChecker';
import { startScheduler } from './src/modules/scheduler';
import { bitcoinPrices, getBitcoinPrices, trackBitcoinPrice, telegramChats, discordChannels } from './src/modules/bitcoinPrices';
import { Message } from "telegraf/typings/core/types/typegram";
import { getGracefulShutdown } from "./src/modules/gracefulShutdown";
const { loadAutoChannelConfig, saveAutoChannelConfig, initAutoChannel } = require("./src/modules/config");
const { sendToAll } = require("./src/modules/notifier");
import { getTest } from "./src/modules/test";

config();

const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

const PRODILLOS_FILE = path.join(process.cwd(), 'src/db/prodillos.json');
const BITCOIN_FILE = path.join(process.cwd(), 'src/db/bitcoin.json');

client.login(process.env.DISCORD_BOT_TOKEN!);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

function ensureChatIsSaved(ctx: Context) {
  if (ctx.chat && !telegramChats.hasOwnProperty(ctx.chat.id)) {
    const chatName = ctx.chat.type === 'private' ? ctx.chat.first_name : ctx.chat.title;
    telegramChats[ctx.chat.id] = chatName || 'Unknown';
    console.log(`Chat guardado: ${chatName} [${ctx.chat.id}]`);
  }
}

async function launchBotWithRetry(bot: Telegraf, retries = 5, delay = 10000) {
  for (let i = 0; i < retries; i++) {
    try {
      await bot.telegram.setMyCommands([
        { command: 'precio', description: 'Ver precio actual de ₿' },
        { command: 'hilo', description: 'Ver máximo y mínimo del día' },
        { command: 'prodillo', description: 'Inscribir un prodillo' },
        { command: 'listilla', description: 'Ver prodillos de la ronda' },
        { command: 'trofeillos', description: 'Ver historial de campeones' },
        { command: 'plantar', description: 'Configurar canal para mensajes automáticos (admin)' },
        { command: 'donacioncilla', description: 'Donar sats al fondo de premios' },
      ]);
      await bot.launch();
      console.log('Botillo is alive in Telegram!');
      return;
    } catch (error) {
      console.error(`Error launching bot (attempt ${i + 1}/${retries}):`, error);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to launch bot after all retries. Exiting.');
  process.exit(1);
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
  initAutoChannel(bot, client);
  try {
    const commitMessage = execSync('git log -1 --pretty=%B').toString().trim();
    console.log(commitMessage);
  } catch (error: any) {
    console.warn('No se pudo obtener info de Git (posiblemente no es un repo o Git no disponible):', error.message);
    console.log('Versión: No disponible (entorno Docker o sin Git)');
  }

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
  loadAutoChannelConfig();
  if (!fs.existsSync(BITCOIN_FILE)) {
    fs.writeFileSync(BITCOIN_FILE, JSON.stringify(bitcoinPrices, null, 2));
  }
  try {
    const data = await loadValues(BITCOIN_FILE);
    if (!data.lastReportedMax) {data.lastReportedMax = 0}
    if (!data.lastReportedMin) {data.lastReportedMin = Infinity}
    if (!data.bitcoinMax) {data.bitcoinMax = 0}
    if (!data.bitcoinATH) {data.bitcoinATH = 0}
    if (!data.bitcoinMaxBlock) {data.bitcoinMaxBlock = 0}
    await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
    Object.assign(bitcoinPrices, {
      lastReportedMax: data.lastReportedMax,
      lastReportedMin: data.lastReportedMin,
      bitcoinMax: data.bitcoinMax,
      bitcoinATH: data.bitcoinATH,
      bitcoinMaxBlock: data.bitcoinMaxBlock,
    })
    console.log('Initial values with bitcoin.json updated successfully:', data);
  } catch (e) {
    throw new Error(`CRITICAL ERROR: Couldn't read bitcoin.json file`);
  }
  trackBitcoinPrice(bot);
  setTimeout(() => prodilloInterval(bot, telegramChats, prodillos, bitcoinPrices), 420);
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000);
  startPaymentChecker(bot);
  launchBotWithRetry(bot);
});

function seViene() {
  const luckyNumber = Math.random();
  const selectedMsg = luckyNumber <= 0.1 
  ? '🫂 ABRACEN A SUS FAMILIAS!' 
  : luckyNumber <= 0.8 ? 'SE VIENE' 
  : '🔥 SE RECONTRA VIENE';
  
  sendToAll(selectedMsg);
  setTimeout(seViene, Math.random() * ((69 - 1)*3600*1000) + 1 * 3600*1000);
};

startScheduler();

client.on('messageCreate', async (message: { content: string; channel: TextChannel; channelId: string; guild: any; }) => {
  if (message.content === '/precio') {
    const { price } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`precio de ₿: $${price} (${(100*(price/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)`);
  } else if (message.content === '/hilo') {
    const { max, min } = await getBitcoinPrices();
    (message.channel as TextChannel).send(`🦁 máximo diario de ₿: $${max} (${(100*(max/bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)\n🐻 mínimo diario de ₿: $${min}\n🔺 Volatilidad diaria: $${max-min} (${(100*(max/min)-100).toFixed(1)}%)\n🚀 ATH de ₿: $${bitcoinPrices.bitcoinATH}`);
  } else if (message.content === '/plantar') {
    if (!message.guild) {
      message.channel.send('❌ Este comando solo funciona en un servidor, no en DM.');
      return;
    }
    const msg = message as any;
    const member = message.guild.members.cache.get(msg.author.id);
    if (!member?.permissions.has('Administrator')) {
      message.channel.send('❌ Solo administradores pueden usar este comando.');
      return;
    }
    const { setDiscordChannel } = require('./src/modules/notifier');
    setDiscordChannel(message.guild.id, message.channelId);
    message.channel.send(`✅ Canal plantado para mensajes automáticos en este servidor: <#${message.channelId}>`);
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

bot.command('test', (ctx) => {
  ensureChatIsSaved(ctx);
  getTest(ctx);
});

bot.command('testreminder', async (ctx) => {
  ensureChatIsSaved(ctx);
  Object.keys(telegramChats).forEach(chatId => {
    ctx.reply('⛏️ ¡121 bloquitos para el cierre loko/a!\n\nDale que todavía estas a tiempo con /prodillo <número>');
    ctx.reply('🚨 ¡21 bloquitos loko/a!\n\nÚltima chance: /prodillo <número>');
  });
  ctx.reply('Recordatorios enviados (test)');
});

const welcome = (ctx: Context) => {
  const name = ctx.chat?.type === 'private' ? ctx.chat.first_name : ctx.chat?.title;
  ctx.reply(`¡GM ${name}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automáticamente el máximo o mínimo mas reciente de Bitcoin\n/precio - Muestro el precio actual de Bitcoin\n/hilo - Muestro el máximo y mínimo en lo que va del dia\n/start - Muestro este mensaje\n\nProdillo: adivina el proximo máximo de BTC\n- Cada ronda dura 2016 bloques (un ajuste de dificultad)\n- Los jugadores pueden enviar prodillos hasta 420 bloques antes del fin de la ronda\n- El jugador que mas se aproxime al máximo de BTC de esa ronda sera el ganador\n/prodillo - Registra tu predicción del máximo de BTC de esta ronda\n/listilla - Muestra la lista de jugadores y sus prodillos\n/trofeillos - Muestra el salon de ganadores de prodillos\n\nPuedes mirar mi código en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`);
}

bot.start((ctx) => welcome(ctx));

bot.command(['prodillo', 'prodillo@botillo21_bot'], async (ctx) => {
  ensureChatIsSaved(ctx);
  getProdillo(ctx, prodillos, bitcoinPrices, bot);
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

  try {
    const lightningAddress = process.env.LIGHTNING_ADDRESS;
    console.log(`🟨 ¡User ${user} [${userId}] wants to donate!`);
    await ctx.reply(`🍾 ¡Gracias por querer donar loko/a! 🙏\n\nManda sats a: ${lightningAddress}`);
  } catch (error) {
    console.error(`❌ error when ${user} [${userId}] tried to access donation`, error);
    await ctx.reply('❌ Lo siento loko, hubo un error al obtener la dirección. Proba devuelta');
  }
});

bot.command(['plantar', 'plantar@botillo21_bot'], async (ctx) => {
  ensureChatIsSaved(ctx);
  
  if (ctx.chat.type === 'private') {
    await ctx.reply('❌ Este comando solo funciona en grupos, no en chat privado.');
    return;
  }
  
  const botMember = await ctx.getChatMember(ctx.botInfo.id);
  if (botMember.status !== 'administrator' && botMember.status !== 'creator') {
    await ctx.reply('❌ Necesito ser administrador para usar topics.');
    return;
  }
  
  const userMember = await ctx.getChatMember(ctx.from.id);
  if (userMember.status !== 'administrator' && userMember.status !== 'creator') {
    await ctx.reply('❌ Solo administradores pueden usar este comando.');
    return;
  }
  
  const chatId = ctx.chat.id;
  const threadId = (ctx.message as any).message_thread_id;
  const { setTelegramThread } = require('./src/modules/notifier');
  setTelegramThread(chatId, threadId || null);
  await ctx.reply(`✅ Topic registrado para este grupo: ${threadId ? 'thread ' + threadId : 'general'}`);
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
  const repliedToBot = (ctx.message as Message.TextMessage).reply_to_message?.from?.id === ctx.botInfo.id;
  const mentionedBot = ctx.message.text.includes(`@${botUsername}`);

  if ((repliedToBot || mentionedBot) && ctx.message.text.endsWith('?')) {
    ctx.reply(Math.random() < 0.5 ? '✅ VERDADERO' : '❌ FALSO');
  };
});

getGracefulShutdown(bot, client);

