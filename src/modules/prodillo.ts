import fs from 'fs';
import { getBitcoinPrices } from './bitcoinPrices';
import { deadline } from './deadline'; 
import { prodilloState, saveValues } from '../..';
import path from 'path';
import { bitcoinPrices } from '../..';
import TelegramBot from 'node-telegram-bot-api';

// CONSTANTS
const PRODILLO_FILE = path.join(__dirname, 'prodillo.json');
const BITCOIN_FILE = path.join(__dirname, 'bitcoin.json');
const TROFEILLOS_FILE = path.join(__dirname, 'trofeillos.json');
const PRODILLO_TIME_INTERVAL = 1000 * 21;

// variables
let trofeillos: Record<string, { champion: string; trofeillo: string[] }> = {};
let trofeillo = '🏆 ';

// Defines interval that checks deadlines and enable/disable prodillos. When deadline is over, sends a message to all Telegram chats to let them know the winner
async function prodilloInterval(bot: TelegramBot, telegramChats: { [key: number]: string; }, prodillos: Record<string, { user: string; predict: number; }>) {
    while (true) {
      // Calls deadline() values
      const { winnerDeadline, prodilleableDeadline, latestHeight } = await deadline();
  
      // Calls getBitcoinPrices() values
      const { max } = await getBitcoinPrices();
    
      // Check if deadline for prodillos is over
      prodilloState.isProdilleable = (prodilleableDeadline > 0);
      
      // Check if winner has been announced and some blocks passed
      if (prodilloState.isWon && !(winnerDeadline === 0) && (winnerDeadline < 210)) {
        prodilloState.isWon = false
      }
      
      // Updates bitcoinMax and bitcoinMaxBlock to track maximum BTC price and correspondent block in the current round
      if (max > bitcoinPrices.bitcoinMax) {
        bitcoinPrices.bitcoinMax = max;
        bitcoinPrices.bitcoinMaxBlock = latestHeight;
        
        // Load bitcoin.json file and update bitcoinMax/bitcoinMaxBlock
        saveValues(bitcoinPrices.bitcoinMax);
        saveValues(bitcoinPrices.bitcoinMaxBlock);
      }
      
      // Triggers win event if deadline is over (difficulty adjustment of Bitcoin)
      if (((winnerDeadline === 0) && !prodilloState.isWon) || prodilloState.isWin) {
        
        // Read prodillo.json file and store it in a local variable
        prodillos = JSON.parse(await fs.promises.readFile(PRODILLO_FILE, 'utf-8'));
        
        // Sort the prodillos by their difference from the current Max Bitcoin price of the round
        const prodillosSorted = Object.entries(prodillos).sort(([,a],[,b]) => 
          Math.abs(a.predict - bitcoinPrices.bitcoinMax) - Math.abs(b.predict - bitcoinPrices.bitcoinMax)
        );
        
        // Format the list of prodillos
        const formattedList = prodillosSorted.map(([userId, { user, predict }]) => {
          return `${user}: $${predict} (dif: ${(Math.abs(predict as unknown as number - bitcoinPrices.bitcoinMax))})`}).join('\n');
  
        // Stores the winner in local variables
        const winnerId = prodillosSorted[0][0];
        prodilloState.winnerName = prodillosSorted[0][1].user;
        
        // Send a message to all Telegram chats
        for (const chatId in telegramChats) {
          await bot.sendMessage(chatId, `<pre>🏁 ¡LA RONDA A LLEGADO A SU FIN!\nMáximo de ₿ de esta ronda: $${bitcoinPrices.bitcoinMax}\n------------------------------------------\n${formattedList}\n\nEl ganador es ${prodilloState.winnerName} 🏆</pre>`, { parse_mode: 'HTML' });
        }
  
        // Read trofeillos.json file and store it in a global variable
        try {
        trofeillos = JSON.parse(fs.readFileSync('trofeillos.json', 'utf-8'));
        console.log('trofeillos.json file read successfully');
        } catch (error) {
        console.log('Could not read trofeillos.json file');
        }
  
        // Add the new trophy to winner
        if (!trofeillos[winnerId]) {
          trofeillos[winnerId] = { 
          champion: prodilloState.winnerName, 
          trofeillo: [`${trofeillo}[${bitcoinPrices.bitcoinMaxBlock}]`],
          };
        } else {
          trofeillos[winnerId].trofeillo.push(`${trofeillo}[${bitcoinPrices.bitcoinMaxBlock}]`);
        }
      
        // Save the new trophy status in a JSON file
        fs.writeFileSync(TROFEILLOS_FILE, JSON.stringify(trofeillos, null, 2));
  
        // Restart max BTC price for the nex round
        bitcoinPrices.bitcoinMax = 0;
        
        // Wipe bitcoin.json file
        try {
          fs.writeFileSync(BITCOIN_FILE, JSON.stringify({}, null, 2));
          console.log('bitcoin.json file wiped successfully');
        } catch (err) {
          console.error('Failed to wipe bitcoin.json file');
        }
        
        // Wipe prodillo.json file
        try {
          fs.writeFileSync(PRODILLO_FILE, JSON.stringify({}, null, 2));
          console.log('prodillo.json file wiped successfully');
        } catch (err) {
          console.error('Failed to wipe prodillo.json file');
        }
        
        try {
          fs.writeFileSync(PRODILLO_FILE, JSON.stringify({'0': {user: 'Hal Finney', predict: 10000000}}, null, 2));
          console.log('Hal Finney prediction added to prodillo.json file');
        } catch (err) {
          console.error('Failed to add Hal Finney prediction to prodillo.json file');
        }
        
        // Prevents that win event is triggered again for a while
        prodilloState.isWon = true
      }
      await new Promise(resolve => setTimeout(resolve, PRODILLO_TIME_INTERVAL));
    }
  };

export { prodilloInterval };