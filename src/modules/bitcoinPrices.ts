import axios from "axios";
import { saveValues } from "./prodillo";
import TelegramBot from "node-telegram-bot-api";
import { TextChannel } from "discord.js";
import path from "path";
const fs = require('fs');

// Set time interval for trackBitcoinPrice()
const TIME_INTERVAL = 1000*420;

const BITCOIN_FILE = path.join(__dirname, '../db/bitcoin.json');

let lastPrices = { price: 0, min: 0, max: 0 };
let bitcoinPrices = {
    bitcoinATH: 0,
    lastReportedMax: 0,
    lastReportedMin: Infinity,
    bitcoinMax: 0,
    bitcoinMaxBlock: 0,
};
let telegramChats: { [key: number]: string } = {};
let discordChannels: { [key: string]: TextChannel } = {};

// Define function that fetches the Bitcoin price using Binance API
async function getBitcoinPrices() {
  try {
    const { data } = await axios.get<{ last: string, low: string, high: string }>(
      'https://www.bitstamp.net/api/v2/ticker/btcusd',
      { timeout: 10000 } // 10 segundos máximo
    );
    lastPrices = {
      price: parseInt(data.last),
      min: parseInt(data.low),
      max: parseInt(data.high),
    };
    return lastPrices;
  } catch (error: any) {
    const errorMsg = error.response
      ? `Bitstamp API falló: ${error.response.status}`
      : `getBitcoinPrices() error: ${error.message}`;
    console.error(errorMsg);
    return lastPrices;
  }
}

// Restores Bitcoin prices from bitcoin.json file
async function loadValues() {
    if (!fs.existsSync(BITCOIN_FILE)) {
      fs.writeFileSync(BITCOIN_FILE, JSON.stringify(bitcoinPrices, null, 2));
    }
    try {
      const data: typeof bitcoinPrices = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf-8'));
      if (!data.lastReportedMax) {data.lastReportedMax = 0}
      if (!data.lastReportedMin) {data.lastReportedMin = Infinity}
      if (!data.bitcoinMax) {data.bitcoinMax = 0}
      if (!data.bitcoinATH) {data.bitcoinATH = 0}
      if (!data.bitcoinMaxBlock) {data.bitcoinMaxBlock = 0}
      await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
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

// Define function that tracks the Bitcoin price at regular intervals and report the max and min only if values surpass old reported values
async function trackBitcoinPrice(bot: TelegramBot) {
  let retryCount = 0;
  const maxRetries = 5;

  while (true) {
    try {
      const { min, max } = await getBitcoinPrices();
      retryCount = 0;

      // If price hits a new ATH
      if (max > bitcoinPrices.bitcoinATH) {
        bitcoinPrices.bitcoinATH = max;
        await saveValues('bitcoinATH', bitcoinPrices.bitcoinATH);
        await notifyAll(bot, `🚀 NUEVO ATH DE ₿: $${bitcoinPrices.bitcoinATH}`);
      } 
      // If price hits a new daily max
      else if (max > bitcoinPrices.lastReportedMax && max < bitcoinPrices.bitcoinATH) {
        bitcoinPrices.lastReportedMax = max;
        await saveValues('lastReportedMax', bitcoinPrices.lastReportedMax);
        await notifyAll(bot, `🦁 nuevo máximo diario de ₿: $${bitcoinPrices.lastReportedMax}`);
      } 
      // If price hits a new daily min
      else if (min < bitcoinPrices.lastReportedMin) {
        bitcoinPrices.lastReportedMin = min;
        await saveValues('lastReportedMin', bitcoinPrices.lastReportedMin);
        await notifyAll(bot, `🐻 nuevo mínimo diario de ₿: $${bitcoinPrices.lastReportedMin}`);
      }

      await new Promise(resolve => setTimeout(resolve, TIME_INTERVAL));
    } catch (error: any) {
      console.error('trackBitcoinPrice() error:', error.message);
      retryCount++;
      // Retry logic with exponential backoff until 5 retries, then pause for 5 minutes
      if (retryCount <= maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        console.warn(`Retrying in ${delay/1000}s (try ${retryCount}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Reached max retry, pause for 5m...');
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        retryCount = 0;
      }
    }
  }
}

// Helper para enviar mensajes a todos los chats
async function notifyAll(bot: TelegramBot, message: string) {
  for (const chatId of Object.keys(telegramChats)) {
    if (await hasSendPermission(chatId, bot)) {
      await bot.sendMessage(Number(chatId), message).catch(err =>
        console.error(`Fallo al enviar a Telegram ${chatId}:`, err.message)
      );
    }
  }
  for (const channel of Object.values(discordChannels)) {
    await channel.send(message).catch(err =>
      console.error(`Fallo al enviar a Discord ${channel.id}:`, err.message)
    );
  }
}

// Function to check if bot has permission to send messages and leave if it can't
async function hasSendPermission(chatId: string, bot: TelegramBot): Promise<boolean> {
  try {
    const botInfo = await bot.getMe();
    const chatMember = await bot.getChatMember(chatId, botInfo.id);
    
    // If the bot is 'restricted', check if it can send messages
    if (chatMember.status === 'restricted') {
      if (!chatMember.can_send_messages) {
        console.log(`bot is restricted in: ${chatId}, leaving...`);
        await bot.leaveChat(chatId);
        return false;
      }
      return chatMember.can_send_messages;
    }
    
    // If the bot is 'member', 'administrator' or 'creator', it has permission
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      return true;
    }
    
    // In any other case, assume no permission and leave
    console.log(`Bot can't send messages in: ${chatId} (status: ${chatMember.status}), leaving...`);
    await bot.leaveChat(chatId);
    return false;
  } catch (error: any) {
    console.error(`Error verifying permissions in ${chatId}:`, error.message);
    // If there is another error, assume no permission and leave
    try {
      await bot.leaveChat(chatId);
      console.log(`${chatId} is unachievable, leaving...`);
    } catch (leaveError: any) {
      console.error(`ERROR trying to leave ${chatId}:`, leaveError.message);
    }
    return false;
  }
}

export { bitcoinPrices, loadValues, trackBitcoinPrice, telegramChats, discordChannels, getBitcoinPrices };