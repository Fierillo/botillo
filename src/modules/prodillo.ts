import fs from 'fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getBitcoinPrices } from './bitcoinPrices';
import { deadline } from './deadline'; 
import path from 'path';
import { Telegraf, Context } from 'telegraf';

const PRODILLOS_FILE = path.join(__dirname, '../db/prodillos.json');
const BITCOIN_FILE = path.join(__dirname, '../db/bitcoin.json');
const TROFEILLOS_FILE = path.join(__dirname, '../db/trofeillos.json');
const PRODILLO_ROUND_CHECK_INTERVAL = 1000 * 69;

let trofeillos: Record<string, { champion: string; trofeillo: string[] }> = {};
const TROPHY_ICON = '🏆';

let prodilloState = {
  winnerName: '',
  isPredictionWindowOpen: true,
  hasRoundWinnerBeenAnnounced: false,
  forceNextRound: false,
  isTest: false,
};

type BitcoinPriceTracker = {
  bitcoinATH: number;
  lastReportedMax: number;
  lastReportedMin: number;
  bitcoinMax: number;
  bitcoinMaxBlock: number;
};

async function saveValues(filePath: string, key: string, value: number) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    data[key] = value;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Updated ${key} to ${value} in ${path.basename(filePath)}`);
  } catch (err) {
    console.error(`Failed to save ${key} in ${path.basename(filePath)}:`, err);
  }
}

async function prodilloRoundManager(
  bot: Telegraf, 
  telegramChats: { [key: number]: string; }, 
  prodillos: Record<string, { user: string; predict: number; }>, 
  bitcoinPrices: BitcoinPriceTracker,
) {
  while (true) {
    const { winnerDeadline, prodilleableDeadline, latestHeight } = await deadline();
    const { max: currentBitcoinPrice } = await getBitcoinPrices();

    const bitcoinData = JSON.parse(await fs.readFile(BITCOIN_FILE, 'utf-8'));
    bitcoinPrices.bitcoinMax = bitcoinData.bitcoinMax;
  
    prodilloState.isPredictionWindowOpen = (prodilleableDeadline > 0);
    
    if (prodilloState.hasRoundWinnerBeenAnnounced && winnerDeadline > 0 && winnerDeadline < 210) {
      prodilloState.hasRoundWinnerBeenAnnounced = false;
    }
    
    if (currentBitcoinPrice > bitcoinPrices.bitcoinMax) {
      bitcoinPrices.bitcoinMax = currentBitcoinPrice;
      bitcoinPrices.bitcoinMaxBlock = latestHeight;
      await saveValues(BITCOIN_FILE, 'bitcoinMax', bitcoinPrices.bitcoinMax);
      await saveValues(BITCOIN_FILE, 'bitcoinMaxBlock', bitcoinPrices.bitcoinMaxBlock);
    }
    
    const isRoundOver = (winnerDeadline === 0 || winnerDeadline > 2010) && !prodilloState.hasRoundWinnerBeenAnnounced;

    if (isRoundOver || prodilloState.forceNextRound) {
      const currentProdillos = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
      
      const sortedProdillos = Object.entries(currentProdillos).sort(([,a]: any,[,b]: any) => 
        Math.abs(a.predict - bitcoinPrices.bitcoinMax) - Math.abs(b.predict - bitcoinPrices.bitcoinMax)
      );
      
      if (sortedProdillos.length === 0) {
        console.log("Round ended, but no predictions were made.");
        await new Promise(resolve => setTimeout(resolve, PRODILLO_ROUND_CHECK_INTERVAL));
        continue;
      }

      const formattedList = sortedProdillos.map(([, { user, predict }]: any) => {
        return `${user}: $${predict} (dif: ${(Math.abs(predict - bitcoinPrices.bitcoinMax))})`;
      }).join('\n');

      const [winnerId, winnerData] = sortedProdillos[0] as [string, { user: string, predict: number }];
      prodilloState.winnerName = winnerData.user;
      
      const announcement = `<pre>🏁 ¡LA RONDA HA TERMINADO!\nMáximo de ₿ de esta ronda: $${bitcoinPrices.bitcoinMax}\n------------------------------------------\n${formattedList}\n\nEl ganador es ${prodilloState.winnerName} 🏆</pre>`;
      
      Object.keys(telegramChats).forEach(chatId => {
        bot.telegram.sendMessage(chatId, announcement, { parse_mode: 'HTML' });
      });

      try {
        trofeillos = JSON.parse(readFileSync(TROFEILLOS_FILE, 'utf-8'));
      } catch (error) {
        console.log('Could not read trofeillos.json, creating a new one.');
        trofeillos = {};
      }

      const newTrophy = `${TROPHY_ICON}[${bitcoinPrices.bitcoinMaxBlock}]`;
      if (!trofeillos[winnerId]) {
        trofeillos[winnerId] = { champion: prodilloState.winnerName, trofeillo: [newTrophy] };
      } else {
        trofeillos[winnerId].trofeillo.push(newTrophy);
      }
    
      writeFileSync(TROFEILLOS_FILE, JSON.stringify(trofeillos, null, 2));

      bitcoinPrices.bitcoinMax = 0;
      bitcoinPrices.bitcoinMaxBlock = 0;
      await saveValues(BITCOIN_FILE, 'bitcoinMax', 0);
      await saveValues(BITCOIN_FILE, 'bitcoinMaxBlock', 0);
      
      const halFinneyPrediction = {'0': {user: 'Hal Finney', predict: 10000000}};
      await fs.writeFile(PRODILLOS_FILE, JSON.stringify(halFinneyPrediction, null, 2));
      
      prodilloState.hasRoundWinnerBeenAnnounced = true;
      console.log(`Round finished! Winner: ${prodilloState.winnerName} [${winnerId}]`);
    }
    await new Promise(resolve => setTimeout(resolve, PRODILLO_ROUND_CHECK_INTERVAL));
  }
};

async function getProdillo(
  ctx: Context, 
  prodillo: Record<string, { user: string; predict: number; }>, 
  bitcoinPrices: BitcoinPriceTracker
) {
  const { winnerDeadline, prodilleableDeadline } = await deadline();
  
  if(!prodilloState.isPredictionWindowOpen && !prodilloState.isTest) {
    return ctx.reply(`¡Tarde, loko! La ventana de predicciones está cerrada.\nEspera ${winnerDeadline} bloques para que comience la nueva ronda.`);
  }

  if (!ctx.from) {
    console.error("ctx.from is undefined.");
    return;
  }
  
  const text = (ctx.message as any).text;
  const args = text.split(' ');
  const predict = Math.round(Number(args[1]));
  const { id: userId, username: user } = ctx.from;

  if (user && !isNaN(predict) && predict >= 0 && isFinite(predict)) {
    const currentProdillos = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
    const bitcoinData = JSON.parse(await fs.readFile(BITCOIN_FILE, 'utf-8'));
    bitcoinPrices.bitcoinMax = bitcoinData.bitcoinMax;

    if (Object.values(currentProdillos).some((p: any) => p.predict === predict)) {
      return ctx.reply(`Ese prodillo ya existe. ¡Elegí otro valor, loko!`);
    }
    
    if (predict < bitcoinPrices.bitcoinMax) {
      return ctx.reply(`Tenés que ingresar un valor mayor a $${bitcoinPrices.bitcoinMax} para tener chance.\n¡Mentalidad de tiburón, loko!`);
    }
    
    currentProdillos[userId] = { user, predict };
    await fs.writeFile(PRODILLOS_FILE, JSON.stringify(currentProdillos, null, 2));
    
    ctx.reply(`Prodillo de ${user} registrado: $${predict}\n\n🟧⛏️ Tiempo para predecir: ${prodilleableDeadline} bloques\n🏁 Tiempo para el ganador: ${winnerDeadline} bloques`);
    console.log(`Registered prodillo of ${user} [${userId}]: ${predict}`);
  } else {
    ctx.reply('¡Ingresaste cualquier cosa, loko!\n\nUso: /prodillo <numero>');
  }
}

async function getListilla(
  ctx: Context, 
  prodillos: Record<string, { user: string; predict: number; }>, 
  bitcoinPrices: BitcoinPriceTracker
) {
  try {
    const currentProdillos = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
    const bitcoinData = JSON.parse(await fs.readFile(BITCOIN_FILE, 'utf-8'));
    bitcoinPrices.bitcoinMax = bitcoinData.bitcoinMax;
    
    const { winnerDeadline, prodilleableDeadline } = await deadline();
    
    const sortedProdillos = Object.values(currentProdillos).map((p: any) => ({
      ...p,
      diff: Math.abs(p.predict - bitcoinPrices.bitcoinMax)
    })).sort((a, b) => a.diff - b.diff);

    let listHeader = `<b>LISTA DE PRODILLOS:</b>\n\nMáximo actual de la ronda: $${bitcoinPrices.bitcoinMax}\n`;
    listHeader += `${'-'.repeat(45)}\n`;
    listHeader += `${'Usuario'.padEnd(20)} | ${'Predicción'.padEnd(10)} | Diferencia\n`;
    listHeader += `${'-'.repeat(45)}\n`;

    const listBody = sortedProdillos.map(({ user, predict, diff }) => {
      const isRekt = predict < bitcoinPrices.bitcoinMax;
      const line = `${user.padEnd(20)} | $${predict.toString().padStart(9)} | ${diff}`;
      return isRekt ? `<s>${line}</s> (REKT!)` : line;
    }).join('\n');

    const listFooter = `\n${'-'.repeat(45)}\n🟧⛏️ Tiempo para predecir: ${prodilloState.isPredictionWindowOpen ? prodilleableDeadline : 0} bloques\n🏁 Tiempo para el ganador: ${winnerDeadline} bloques`;

    await ctx.reply(`<pre>${listHeader}${listBody}${listFooter}</pre>`, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Could not get the list of prodillos:', error);
    await ctx.reply('No se pudo obtener la lista de prodillos.');
  }
}

async function getTrofeillos(ctx: Context) {
  if (!existsSync(TROFEILLOS_FILE)) {
    writeFileSync(TROFEILLOS_FILE, JSON.stringify({}, null, 2));
  }
  
  try {
    const currentTrofeillos = JSON.parse(readFileSync(TROFEILLOS_FILE, 'utf-8'));
    let championsList = "";
    for (const [, data] of Object.entries(currentTrofeillos)) {
      const typedData = data as { champion: string, trofeillo: string[] };
      championsList += `\n- ${typedData.champion}: ${typedData.trofeillo.join(' ')}`;
    }
    
    const message = `<pre><b>SALA DE TROFEILLOS</b>\n\nÚltimo campeón: ${prodilloState.winnerName || 'N/A'}\n${'-'.repeat(45)}${championsList || '\nNo hay ganadores aún.'}</pre>`;
    ctx.reply(message, { parse_mode: 'HTML' });
  } catch (e) {
    console.error(`CRITICAL ERROR: Couldn't read trofeillos.json file`, e);
    ctx.reply('Hubo un error al buscar la sala de trofeos.');
  }
}

export { 
  saveValues, 
  prodilloRoundManager as prodilloInterval, 
  getProdillo, 
  getListilla, 
  getTrofeillos, 
  prodilloState 
};