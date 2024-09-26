// Dependecy imports
import { TextChannel } from "discord.js";
import { config } from "dotenv";
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const schedule = require('node-schedule');

// Load environment variables from .env file
config();

// Create a new Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
// Set interval for Bitcoin price tracking
const TIME_INTERVAL = Number(process.env.BOT_TIME_INTERVAL);
// Set channel ID
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID!;
// Bot token
client.login(process.env.DISCORD_TOKEN);

// Define initial variables
let lastReportedMax: number | null = null;
let lastReportedMin: number | null = null;

// Define function that fetches the Bitcoin price using CriptoYa API
const getBitcoinPrice = async (): Promise<number | undefined> => {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'); 
    return parseInt(response.data.lastPrice);
  } catch (error) {
    console.error('Error al obtener el precio de Bitcoin:', error);
  }
};

// Define function that fetches the max and min price of the day
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
const trackBitcoinPrice = async (channel: TextChannel) => {
  setInterval(async () => {
    const price = await getBitcoinPrice();

    if (price) {
      // Report if price is higher than reported max
      if (price > (lastReportedMax || 0)) {
        lastReportedMax = price;
        await channel.send(`nuevo maximo diario de ฿: $${price}`);
      }
      // Report if price is lower than reported min
      if (price < (lastReportedMin || Infinity)) {
        lastReportedMin = price;
        await channel.send(`🐻 nuevo minimo diario de ฿: $${price}`);
      }
    }
  }, TIME_INTERVAL);
};

// Function to reset daily highs and lows
const resetDailyHighsAndLows = () => {
  schedule.scheduleJob('0 0 * * *', async () => { // Se ejecuta a medianoche
    lastReportedMax = 0;
    lastReportedMin = Infinity;
    console.log('Reiniciando máximos y mínimos diarios...');
  });
};

// Define initial event listeners, sets channel ID and schedules High and Low reset
client.once('ready', async () => {
  console.log(`Conectado como ${client.user?.tag}`);

  const channel = client.channels.cache.get(CHANNEL_ID) as TextChannel;

  if (channel) {
    // Set initial High and Low values
    const { max, min } = await getMaxMinPriceOfDay();
    lastReportedMax = max;
    lastReportedMin = min;
    // Send test message
    channel.send(`¡Hola mundillo! , el maximo diario de ฿ es: $${max} y el minimo: $${min}`);
    // Initialize the Bitcoin price tracking function
    trackBitcoinPrice(channel); 
    // Initialize the daily high and low reset function
    resetDailyHighsAndLows(); 
  } else {
    console.error('Error: No se encontró el canal especificado.');
  }
});


