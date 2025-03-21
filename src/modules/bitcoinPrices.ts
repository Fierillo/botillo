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
async function getBitcoinPrices () {
    //console.log('getBitcoinPrices() called');
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
            (await hasSendPermission(chatId, bot)) 
            ? bot.sendMessage(Number(chatId),`🚀 NUEVO ATH DE ₿: $${bitcoinPrices.bitcoinATH}`) 
            : null);
            Object.values(discordChannels).forEach(channel => 
            channel.send(`🚀 NUEVO ATH DE ₿: $${bitcoinPrices.bitcoinATH}`));
        } 
        // If price is higher than reported max...
        else if (max > bitcoinPrices.lastReportedMax) {
            bitcoinPrices.lastReportedMax = max;

            // Load bitcoin.json file and update lastReportedMax
            await saveValues('lastReportedMax', bitcoinPrices.lastReportedMax);
            
            // And sends daily high message to all Telegram and Discord chats
            Object.keys(telegramChats).forEach(async chatId => 
            (await hasSendPermission(chatId, bot)) 
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
            (await hasSendPermission(chatId, bot)) 
            ? bot.sendMessage(Number(chatId),`🐻 nuevo mínimo diario de ₿: $${bitcoinPrices.lastReportedMin}`) 
            : null);
            Object.values(discordChannels).forEach(channel => 
            channel.send(`🐻 nuevo mínimo diario de ₿: $${bitcoinPrices.lastReportedMin}`));
        } 
        } catch (error) {
        console.error('trackBitcoinPrice() error');
        }
        await new Promise(resolve => setTimeout(resolve, TIME_INTERVAL));
    }
};

// Function to check if bot has permission to send messages
async function hasSendPermission(chatId: string, bot: TelegramBot) {
  if (!bot) {return console.log('bot is undefined in hasSendPermission()')}
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

export { bitcoinPrices, loadValues, trackBitcoinPrice, telegramChats, discordChannels, getBitcoinPrices };