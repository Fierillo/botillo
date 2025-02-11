import fs from 'fs';
import { getBitcoinPrices } from './bitcoinPrices';
import { deadline } from './deadline'; 
import path from 'path';
import TelegramBot from 'node-telegram-bot-api';

// CONSTANTS
const PRODILLOS_FILE = path.join(__dirname, '../db/prodillos.json');
const BITCOIN_FILE = path.join(__dirname, '../db/bitcoin.json');
const TROFEILLOS_FILE = path.join(__dirname, '../db/trofeillos.json');
const PRODILLO_TIME_INTERVAL = 1000 * 69;

// variables
let trofeillos: Record<string, { champion: string; trofeillo: string[] }> = {};
let trofeillo = '🏆 ';
let prodilloState = {
  winnerName: '',
  isProdilleable: true,
  isWon: false,
  isWin: false,
};

type BitcoinPriceTracker = {
  bitcoinATH: number;
  lastReportedMax: number;
  lastReportedMin: number;
  bitcoinMax: number;
  bitcoinMaxBlock: number;
};

// Defines function that save values in bitcoin.json file
async function saveValues(key: string, value: number) {
  try {
    const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf8'));
      data[key] = value;
      await fs.promises.writeFile(BITCOIN_FILE, JSON.stringify(data, null, 2));
      console.log(`${key} updated successfully:`, value);
  } catch (err) {
      console.error(`Failed to save ${key} value in bitcoin.json`);
  }
}

// Defines interval that checks deadlines and enable/disable prodillos. When deadline is over, sends a message to all Telegram chats to let them know the winner
async function prodilloInterval(bot: TelegramBot, telegramChats: { [key: number]: string; }, 
  prodillos: Record<string, { 
    user: string; 
    predict: number; 
  }>, 
  bitcoinPrices: BitcoinPriceTracker) {
  while (true) {
    // Calls deadline() values
    const { winnerDeadline, prodilleableDeadline, latestHeight } = await deadline();

    // Calls getBitcoinPrices() values
    const { max } = await getBitcoinPrices();

    // Load bitcoinMax of bitcoin.json
    const data: typeof bitcoinPrices = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf-8'));
    bitcoinPrices.bitcoinMax = data.bitcoinMax
  
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
      await saveValues('bitcoinMax',bitcoinPrices.bitcoinMax);
      await saveValues('bitcoinMaxBlock',bitcoinPrices.bitcoinMaxBlock);
    }
    
    // Triggers win event if deadline is over (difficulty adjustment of Bitcoin)
    if (((winnerDeadline === 0) && !prodilloState.isWon) || prodilloState.isWin) {
      
      // Read prodillos.json file and store it in a local variable
      prodillos = JSON.parse(await fs.promises.readFile(PRODILLOS_FILE, 'utf-8'));
      
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
      
      // Wipe prodillos.json file
      try {
        fs.writeFileSync(PRODILLOS_FILE, JSON.stringify({}, null, 2));
        console.log('prodillos.json file wiped successfully');
      } catch (err) {
        console.error('Failed to wipe prodillos.json file');
      }
      
      try {
        fs.writeFileSync(PRODILLOS_FILE, JSON.stringify({'0': {user: 'Hal Finney', predict: 10000000}}, null, 2));
        console.log('Hal Finney prediction added to prodillos.json file');
      } catch (err) {
        console.error('Failed to add Hal Finney prediction to prodillos.json file');
      }
      
      // Prevents that win event is triggered again for a while
      prodilloState.isWon = true
    }
    await new Promise(resolve => setTimeout(resolve, PRODILLO_TIME_INTERVAL));
  }
};

async function callProdillo(bot:TelegramBot, chatId:number, userId:number, user:string, predict:number, prodillos: Record<string, { user: string; predict: number; }>, bitcoinPrices: BitcoinPriceTracker) {
  // Calls deadline function and stores in local variables
  const { winnerDeadline, prodilleableDeadline } = await deadline();
  
  // If deadline for prodillos is over, returns a message to the users to let them know
  if(!prodilloState.isProdilleable /*&& !isTest*/) {
    return await bot.sendMessage(chatId, `Tarde loko!\nespera ${winnerDeadline} bloques que comience una nueva ronda de prodillos!`);
  }
  
  if ((prodilloState.isProdilleable /*|| isTest*/) && userId && user && !isNaN(predict) && predict >= 0 && isFinite(predict)) {

    // try to read prodillos.json file
    try {
      const fileContent = await fs.promises.readFile(PRODILLOS_FILE, 'utf-8');
      prodillos = JSON.parse(fileContent);
    } catch (error) {
      console.error('error trying to read prodillos.json');
    }

    // try to read bitcoin.json file
    try {
      const data: typeof bitcoinPrices = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf-8'));
      bitcoinPrices.bitcoinMax = data.bitcoinMax;
    } catch (error) {
      console.error('error trying to read bitcoin.json');
    }

    // Check if the prediction already exists
    const existingPredictions = Object.values(prodillos).map(p => p.predict);
    if (existingPredictions.includes(predict)) {
      return await bot.sendMessage(chatId, `Ese prodillo ya existe. ¡Elegí otro valor loko!`);
    }
    
    // If the prediction is lower than current Bitcoin max price in the round, returns a message to the user
    if (predict < bitcoinPrices.bitcoinMax) {
      return await bot.sendMessage(chatId, `Tenes que ingresar un valor mayor a ${bitcoinPrices.bitcoinMax} para tener alguna chance de ganar.\nMentalidad de tiburón loko!`);
    }
    
    // Stores user prediction in a prodillos.json file
    prodillos[userId] = {
      user: user,
      predict: predict,
    };
    await fs.promises.writeFile(PRODILLOS_FILE, JSON.stringify(prodillos, null, 2));
    
    // Sends a reminder with the deadline
    await bot.sendMessage(chatId, `Prodillo de ${user} registrado: $${predict}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${prodilloState.isProdilleable? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques`, {disable_web_page_preview: true});
    console.log(`Registered prodillo of ${user} [${userId}]: ${predict}`);
  } else await bot.sendMessage(chatId, '¡Ingresaste cualquier cosa loko!\n\n/prodillo <numero>');
}

async function callListilla(bot:TelegramBot, chatId:number, prodillos: Record<string, { user: string; predict: number; }>, bitcoinPrices: BitcoinPriceTracker) {
  try {
    // Read prodillos.json file and store it in a local variable
    prodillos = JSON.parse(await fs.promises.readFile(PRODILLOS_FILE, 'utf-8'));

    // Read bitcoin.json file and store it in a local variable
    try {
      const data = JSON.parse(await fs.promises.readFile(BITCOIN_FILE, 'utf-8'));
      bitcoinPrices.bitcoinMax = data.bitcoinMax;
    } catch (error) {
      console.error('error trying to read bitcoin.json');
    }
    
    // Get the deadlines
    const { winnerDeadline, prodilleableDeadline } = await deadline();
    
    // Sort the prodillos by their difference from the current Max Bitcoin price
    const sortedProdillos = Object.entries(prodillos).map(([userId, { user, predict }]) => {
      return {user, predict, diff: Math.abs(predict - bitcoinPrices.bitcoinMax)};
    }).sort((a, b) => a.diff - b.diff);

    const closestProdillo = sortedProdillos[0].predict;

    let formattedList = `${('Usuario').padEnd(20, ' ')} | ${('Predicción').padEnd(10, ' ')}  | Diferencia\n`;
    formattedList += '-----------------------------------------------------\n';

    sortedProdillos.forEach(({ user, predict, diff }) => {
      if (predict < closestProdillo) {
        formattedList += `<s>${user.padEnd(20, ' ')} | $${(predict.toString()).padStart(10, ' ')} | ${diff}</s> (REKT!)\n`;
      } else {
        formattedList += `${user.padEnd(20, ' ')} | $${(predict.toString()).padStart(10, ' ')} | ${diff}\n`;
      }
    });
    await bot.sendMessage(chatId, `<pre><b>LISTA DE PRODILLOS:</b>\n\nPrecio máximo de ₿ en esta ronda: $${bitcoinPrices.bitcoinMax}\n-----------------------------------------------------\n${formattedList}\n\n🟧⛏️ Tiempo restante para mandar prodillos: ${prodilloState.isProdilleable ? prodilleableDeadline : 0} bloques\n🏁 Tiempo restante para saber ganador: ${winnerDeadline} bloques</pre>`, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Could not get the list of prodillos');
    await bot.sendMessage(chatId, 'No se pudo obtener la lista de prodillos.');
  }
}

async function callTrofeillos(bot:TelegramBot, chatId:number) {
  // Read trofeillos.json to get the list of winners
  if (!fs.existsSync(TROFEILLOS_FILE)) {
    fs.writeFileSync(TROFEILLOS_FILE, JSON.stringify(trofeillos, null, 2))
  }
  try {
  trofeillos = JSON.parse(fs.readFileSync(TROFEILLOS_FILE, 'utf-8'));
  } catch (e) {
  throw new Error(`CRITICAL ERROR: Couldn't read trofeillos.json file`);
  }
  let mensaje = "";
  for (const [id, data] of Object.entries(trofeillos)) {
    mensaje += `\n- ${data.champion}: ${data.trofeillo}`;
  }
  bot.sendMessage(chatId, `<pre><b>SALA DE TROFEILLOS</b>\n\nUltimo campeón: ${prodilloState.winnerName}\nCampeón: 🏆 [nro. de bloque]\n------------------------------------------------------------------------------${mensaje || 'No hay ganadores aún.'}</pre>`, { parse_mode: 'HTML' });
}

export { saveValues, prodilloInterval, callProdillo, callListilla, callTrofeillos, prodilloState };