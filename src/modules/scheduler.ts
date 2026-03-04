const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

const BITCOIN_FILE = path.join(process.cwd(), 'src/db/bitcoin.json');
const { getBitcoinPrices, bitcoinPrices } = require('./bitcoinPrices');
const { saveValues, loadValues } = require('./utils');
const { sendToAll } = require('./notifier');

export function startScheduler() {
  schedule.scheduleJob('0 00 * * *', async () => {
    const { max, min } = await getBitcoinPrices();
    
    bitcoinPrices.lastReportedMax = max;
    bitcoinPrices.lastReportedMin = min;
    
    const data = await loadValues(BITCOIN_FILE);
    data.lastReportedMax = bitcoinPrices.lastReportedMax;
    data.lastReportedMin = bitcoinPrices.lastReportedMin;
    await saveValues(BITCOIN_FILE, 'lastReportedMax', bitcoinPrices.lastReportedMax);
    await saveValues(BITCOIN_FILE, 'lastReportedMin', bitcoinPrices.lastReportedMin);
    
    const msg = `¡GN humanos!\n🦁 El máximo de ₿ del dia fue: $${max}\n🐻 El mínimo fue: $${min}\n🔺 La variación del dia fue: $${max-min} (${(100*(max/min)-100).toFixed(1)}%)`;
    sendToAll(msg);
  });

  schedule.scheduleJob('0 11 * * *', () => { 
    sendToAll('GM humanos 🧉');
  });

  console.log('Scheduler started');
}
