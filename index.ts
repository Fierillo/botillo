import { execSync } from "child_process";
import { TextChannel } from "discord.js";
import { config } from "dotenv";
import { Telegraf } from 'telegraf'; 
const fs = require('fs');
const path = require('path');
import { prodilloRoundManager } from './src/modules/prodillo';
import { loadValues } from './src/modules/utils';
import { BitcoinPriceTracker } from './src/modules/types';
import { startPaymentChecker } from './src/modules/paymentChecker';
import { startScheduler } from './src/modules/scheduler';
import { bitcoinPrices, getBitcoinPrices, trackBitcoinPrice, telegramChats, discordChannels } from './src/modules/bitcoinPrices';
import { getGracefulShutdown } from "./src/modules/gracefulShutdown";
const { loadAutoChannelConfig, initAutoChannel } = require("./src/modules/config");
import { setupTelegram } from "./src/modules/telegramHandlers";
import { setupDiscord } from "./src/modules/discordHandlers";

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
  console.error('Uncaught exception:', (error as Error).message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

export let prodillos: Record<string, { user: string; predict: number }> = {};

function loadProdillos() {
  if (!fs.existsSync(PRODILLOS_FILE)) {
      fs.writeFileSync(PRODILLOS_FILE, JSON.stringify(prodillos, null, 2))
  }
  try {
    prodillos = JSON.parse(fs.readFileSync(PRODILLOS_FILE, 'utf-8'));
    console.log('prodillos.json values loaded successfully!');
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
  } catch (error) {
    console.warn('No se pudo obtener info de Git (posiblemente no es un repo o Git no disponible):', (error as Error).message);
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
  
  loadProdillos();
  loadAutoChannelConfig();
  if (!fs.existsSync(BITCOIN_FILE)) {
    fs.writeFileSync(BITCOIN_FILE, JSON.stringify(bitcoinPrices, null, 2));
  }
  try {
    const data = await loadValues<BitcoinPriceTracker>(BITCOIN_FILE);
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
  
  setupTelegram(bot);
  setupDiscord(client);
  
  trackBitcoinPrice(bot);
  setTimeout(() => prodilloRoundManager(bot, telegramChats, prodillos, bitcoinPrices), 420);
  startScheduler();
  startPaymentChecker(bot);
  launchBotWithRetry(bot);
});

getGracefulShutdown(bot, client);
