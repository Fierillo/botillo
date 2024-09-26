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
const TIME_INTERVAL = 60000
// Set channel ID
const CHANNEL_ID = '1288321546691153975'

// Define initial variables
let maxPrice: number = 0;
let minPrice: number = Infinity;
let lastReportedMax: number | null = null;
let lastReportedMin: number | null = null;

// Define function that fetches the Bitcoin price using CriptoYa API
const getBitcoinPrice = async (): Promise<number | undefined> => {
  try {
    const response = await axios.get('https://criptoya.com/api/btc/usd'); // API para obtener el precio
    return response.data['bitsoalpha'].ask; // Cambia esto a la API que prefieras
  } catch (error) {
    console.error('Error al obtener el precio de Bitcoin:', error);
  }
};

// Define function that fetches the max and min price of the day
const getMaxMinPriceOfDay = async (): Promise<{ max: number, min: number }> => {
  try {
    const response = await axios.get('https://criptoya.com/api/btc/usd');
    return {
      max: response.data['bitsoalpha'].high, 
      min: response.data['bitsoalpha'].low,   
    };
  } catch (error) {
    console.error('Error al obtener los máximos/mínimos diarios:', error);
    return { max: 0, min: Infinity };
  }
};

// Define function that reports the new high or low price
const reportNewPrice = async (channel: TextChannel, price: number, type: 'max' | 'min') => {
  if (type === 'max') {
    lastReportedMax = price;
    await channel.send(`nuevo maximo diario de ฿: $${price}`);
  } else {
    lastReportedMin = price;
    await channel.send(`🐻 nuevo minimo diario de ฿: $${price}`);
  }
};

// Define function that tracks the Bitcoin price and stores the max and min only if values surpass old values
const trackBitcoinPrice = async (channel: TextChannel) => {
  setInterval(async () => {
    const price = await getBitcoinPrice();

    if (price) {
      // Report if price is higher than max
      if (price > maxPrice) {
        maxPrice = price;
        if (price > (lastReportedMax || 0)) {
          await reportNewPrice(channel, price, 'max');
        }
      }

      // Report if price is lower than min
      if (price < minPrice) {
        minPrice = price;
        if (price < (lastReportedMin || Infinity)) {
          await reportNewPrice(channel, price, 'min');
        }
      }
    }
  }, TIME_INTERVAL);
};

// Function to reset daily highs and lows
const resetDailyHighsAndLows = () => {
  schedule.scheduleJob('0 0 * * *', async () => { // Se ejecuta a medianoche
    maxPrice = 0;
    minPrice = Infinity;
    lastReportedMax = null;
    lastReportedMin = null;
    console.log('Reiniciando máximos y mínimos diarios.');
  });
};

// Define initial event listeners, sets channel ID and schedules High and Low reset
client.once('ready', async () => {
  console.log(`Conectado como ${client.user?.tag}`);

  const channel = client.channels.cache.get(CHANNEL_ID) as TextChannel;

  if (channel) {
    // Send test message
    channel.send(`¡Hola mundillo!`);
    // Initialize the Bitcoin price tracking function
    trackBitcoinPrice(channel); 
    // Initialize the daily high and low reset function
    resetDailyHighsAndLows(); 
  } else {
    console.error('Error: No se encontró el canal especificado.');
  }
});

// Bot token
client.login(process.env.DISCORD_TOKEN);
