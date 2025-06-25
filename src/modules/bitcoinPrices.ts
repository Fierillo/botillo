import axios from "axios";
import { saveValues } from "./prodillo";
import { Telegraf } from "telegraf";
import { TextChannel } from "discord.js";
import path from "path";
const fs = require('fs');

const TIME_INTERVAL = 1000 * 420;

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

async function getBitcoinPrices() {
  try {
    const { data } = await axios.get<{ last: string, low: string, high: string }>(
      'https://www.bitstamp.net/api/v2/ticker/btcusd',
      { timeout: 10000 } 
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

async function trackBitcoinPrice(bot: Telegraf) {
  let retryCount = 0;
  const maxRetries = 5;

  while (true) {
    try {
      const { min, max } = await getBitcoinPrices();
      retryCount = 0;

      if (max > bitcoinPrices.bitcoinATH) {
        bitcoinPrices.bitcoinATH = max;
        await saveValues(BITCOIN_FILE, 'bitcoinATH', bitcoinPrices.bitcoinATH);
        await notifyAll(bot, `🚀 NUEVO ATH DE ₿: $${bitcoinPrices.bitcoinATH}`);
      } 
      else if (max > bitcoinPrices.lastReportedMax && max < bitcoinPrices.bitcoinATH) {
        bitcoinPrices.lastReportedMax = max;
        await saveValues(BITCOIN_FILE, 'lastReportedMax', bitcoinPrices.lastReportedMax);
        await notifyAll(bot, `🦁 nuevo máximo diario de ₿: $${bitcoinPrices.lastReportedMax}`);
      } 
      else if (min < bitcoinPrices.lastReportedMin) {
        bitcoinPrices.lastReportedMin = min;
        await saveValues(BITCOIN_FILE, 'lastReportedMin', bitcoinPrices.lastReportedMin);
        await notifyAll(bot, `🐻 nuevo mínimo diario de ₿: $${bitcoinPrices.lastReportedMin}`);
      }

      await new Promise(resolve => setTimeout(resolve, TIME_INTERVAL));
    } catch (error: any) {
      console.error('trackBitcoinPrice() error:', error.message);
      retryCount++;
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

async function notifyAll(bot: Telegraf, message: string) {
  for (const chatId of Object.keys(telegramChats)) {
    if (await hasSendPermission(chatId, bot)) {
      await bot.telegram.sendMessage(Number(chatId), message).catch(err =>
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

async function hasSendPermission(chatId: string, bot: Telegraf): Promise<boolean> {
  try {
    const botInfo = await bot.telegram.getMe();
    const chatMember = await bot.telegram.getChatMember(chatId, botInfo.id);
    
    if (chatMember.status === 'restricted') {
      if (!chatMember.can_send_messages) {
        console.log(`bot is restricted in: ${chatId}, leaving...`);
        await bot.telegram.leaveChat(chatId); 
        return false;
      }
      return chatMember.can_send_messages;
    }
    
    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      return true;
    }
    
    console.log(`Bot can't send messages in: ${chatId} (status: ${chatMember.status}), leaving...`);
    await bot.telegram.leaveChat(chatId); 
    return false;
  } catch (error: any) {
    console.error(`Error verifying permissions in ${chatId}:`, error.message);
    try {
      await bot.telegram.leaveChat(chatId); 
      console.log(`${chatId} is unachievable, leaving...`);
    } catch (leaveError: any) {
      console.error(`ERROR trying to leave ${chatId}:`, leaveError.message);
    }
    return false;
  }
}

export { bitcoinPrices, loadValues, trackBitcoinPrice, telegramChats, discordChannels, getBitcoinPrices };