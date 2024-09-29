// Dependecy imports
import { TextChannel, Message } from "discord.js";
import { config } from "dotenv";
const axios = require('axios');
import express from 'express';
import bodyParser from 'body-parser';
const schedule = require('node-schedule');
import TelegramBot from 'node-telegram-bot-api';
import { channel } from "diagnostics_channel";

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
let lastReportedMax: number | null = null;
let lastReportedMin: number | null = null;
let currentDiscordChannel: TextChannel | null = null;
let chatIds: { [key: string]: boolean } = {};
let chatId: number | null = null;

// Define function that fetches the Bitcoin price using Binance API
const getBitcoinPrice = async (): Promise<number | undefined> => {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'); 
    return parseInt(response.data.lastPrice);
  } catch (error) {
    console.error('Error al obtener el precio de Bitcoin:', error);
  }
};

// Define function that fetches the current max and min price of the day
const getMaxMinPriceOfDay = async (): Promise<{ max: number, min: number }> => {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    return {
      max: parseInt(response.data.highPrice),
      min: parseInt(response.data.lowPrice),
    };
  } catch (error) {
    console.error('Error al obtener los máximos/mínimos diarios:', error);
    return { max: 0, min: Infinity };
  }
};

// Define function that tracks the Bitcoin price at regular intervals and report the max and min only if values surpass old reported values
const trackBitcoinPrice = async (channel: TextChannel | null) => {
  setInterval(async () => {
    const price = await getBitcoinPrice();
    
    // Test reports
    // console.log(`Bitcoin price: ${price}`);
    // if (price && chatId) bot.sendMessage(chatId, `Precio actual de ฿: $${price}`);
    // if (price && channel) channel.send(`Precio actual de ฿: $${price}`);
    
    if (price && channel) {
      // Report if price is higher than reported max
      if (price > (lastReportedMax || 0)) {
        lastReportedMax = price;
        await channel.send(`nuevo maximo diario de ฿: $${price}`);
        for (const chatId in chatIds) {
          if (chatIds[chatId]) {
            await bot.sendMessage(chatId, `nuevo maximo diario de ฿: $${price}`);
          }
        }
      }
      // Report if price is lower than reported min
      if (price < (lastReportedMin || Infinity)) {
        lastReportedMin = price;
        await channel.send(`🐻 nuevo minimo diario de ฿: $${price}`);
        for (const chatId in chatIds) {
          if (chatIds[chatId]) {
            await bot.sendMessage(chatId, `🐻 nuevo minimo diario de ฿: $${price}`);
          }
        }
      }
    }
  }, TIME_INTERVAL);
};

// Define function to reset daily highs and lows at midnight (UTC: 00:00)
const resetDailyHighsAndLows = (channel: TextChannel | null) => {
  schedule.scheduleJob('0 3 * * *', async () => { // Se ejecuta a medianoche
    lastReportedMax = 0;
    lastReportedMin = Infinity;
    console.log('reiniciando máximos y mínimos diarios...');
    if (channel) {
      await channel.send(`🔄 reiniciando máximos y mínimos diarios...`);
      for (const chatId in chatIds) {
        if (chatIds[chatId]) {
          await bot.sendMessage(chatId, `🔄 reiniciando máximos y mínimos diarios...`);
        }
      }
    }
  });
};

// Initialize bot in Discord fetching automatically the servers where the bot is and sending welcome messages
client.on(' ready', () => {
  console.log(`${client.user?.tag} started in Discord!`);

  // Fetch all the servers where the bot is
  const guild = client.guilds.cache.forEach(async (guild: { name: any; channels: { cache: any[]; }; }) => {
    if (guild) {
      // Fetch the first text-based channel available in every server
      const channel = guild.channels.cache.find((channel: { isTextBased: () => any; }) => channel.isTextBased());
      if (channel && channel.isTextBased()) {
        console.log(`Discord server: ${guild.name} [${channel.id}]`);
        
        // Fetch initial High and Low prices and send a message to all the desired channels
        currentDiscordChannel = channel as TextChannel;
        const { max, min } = await getMaxMinPriceOfDay();
        lastReportedMax = max;
        lastReportedMin = min;
        await currentDiscordChannel.send(`¡Hola mundillo!\nMaximo diario de ฿: $${max}\n🐻 Minimo: $${min}`);
      } 
      // If no text-based channel is found, log a message
      else {
        console.log('Nothing text-based channel was found in the server');
      }
    // If the bot is not in any server, log a message
    } else {
      console.log('Bot is not in any server');
    }
  });
  // Initialize trackBitcoinPrice and resetDailyHighsAndLows
  resetDailyHighsAndLows(currentDiscordChannel);
  trackBitcoinPrice(currentDiscordChannel);
});

// TELEGRAM

// Initialize bot in Telegram fetching automatically the servers where the bot is and sending welcome messages
bot.once('message', async (msg) => {
  chatId = msg.chat.id;
  const chatTitle = msg.chat.title || msg.chat.first_name; // Dependiendo si es un grupo o un usuario
  console.log(`Telegram chat: ${chatTitle} [${chatId}]`);
  bot.sendMessage(chatId, `¡Hola mundillo!\nMaximo diario de ฿: $${lastReportedMax}\n🐻 Minimo: $${lastReportedMin}`);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const chatTitle = msg.chat.title || msg.chat.first_name;
  console.log(`Telegram chat: ${chatTitle} [${chatId}]`);
  chatIds[chatId] = true;
  console.log(chatIds);
});

// Send Bitcoin price when user writes /precio
bot.onText(/\/precio/, async (msg) => {
  const chatId = msg.chat.id;
  const price = await getBitcoinPrice();
  bot.sendMessage(chatId, `Precio actual de ฿: $${price}`);
});

// Send High and Low prices when user writes /hilo
bot.onText(/\/hilo/, async (msg) => {
  const chatId = msg.chat.id;
  const { max, min } = await getMaxMinPriceOfDay();
  bot.sendMessage(chatId, `Máximo diario de ฿: $${max}\n🐻 Mínimo: $${min}`);
});