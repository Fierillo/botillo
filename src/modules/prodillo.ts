import fs from 'fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getBitcoinPrices, telegramChats } from './bitcoinPrices';
import { deadline } from './deadline';
import path from 'path';
import { Telegraf, Context } from 'telegraf';
import qrcode from 'qrcode';
import { createInvoice } from './nwcService';
import { loadValues, loadValuesSync, saveValues, saveFileValues, saveFileValuesSync } from './utils';
import { TrofeillosChampion, TrofeillosDB, BitcoinPriceTracker, PendingProdillo } from './types';
import { generateWinnerImage } from './imageGenerator';
const { sendToTelegram, sendPhotoToAllTelegram, broadcastNewProdillo } = require('./notifier');

export const PRODILLOS_FILE = path.join(process.cwd(), 'src/db/prodillos.json');

export const BITCOIN_FILE = path.join(process.cwd(), 'src/db/bitcoin.json');
export const TROFEILLOS_FILE = path.join(process.cwd(), 'src/db/trofeillos.json');
export const PENDING_FILE = path.join(process.cwd(), 'src/db/pendingProdillos.json');
export const INVOICES_CACHE_FILE = path.join(process.cwd(), 'src/db/invoicesCache.json');
export const PRODILLO_ROUND_CHECK_INTERVAL = 1000 * 69;

export let trofeillos = {} as TrofeillosDB;
export const TROPHY_ICON = '🏆';

export let prodilloState = {
  winnerName: '',
  isPredictionWindowOpen: true,
  hasRoundWinnerBeenAnnounced: false,
  forceWin: false,
  isTest: false,
  reminder121Sent: false,
  reminder21Sent: false,
  winnerReminder420Sent: false,
  winnerReminder210Sent: false,
  winnerReminder21Sent: false,
};

export async function prodilloRoundManager(
  bot: Telegraf, 
  telegramChats: { [key: number]: string; }, 
  prodillos: Record<string, { user: string; predict: number; }>, 
  bitcoinPrices: BitcoinPriceTracker,
) {
  while (true) {
    const { winnerDeadline, prodilleableDeadline, latestHeight } = await deadline();
    const { max: currentBitcoinPrice } = await getBitcoinPrices();

    const bitcoinData = await loadValues(BITCOIN_FILE);
    bitcoinPrices.bitcoinMax = bitcoinData.bitcoinMax;
  
    prodilloState.isPredictionWindowOpen = (prodilleableDeadline > 0);
    
    if (prodilleableDeadline === 121 && !prodilloState.reminder121Sent) {
      sendToTelegram('⛏️ ¡121 bloquitos para el cierre!\n\nDale que todavía estas a tiempo con /prodillo <número>');
      prodilloState.reminder121Sent = true;
    }
    
    if (prodilleableDeadline === 21 && !prodilloState.reminder21Sent) {
      sendToTelegram('🚨 ¡21 bloquecitos loko/a!\n\nÚltima chance señor/a: /prodillo <número>');
      prodilloState.reminder21Sent = true;
    }
    
    if (prodilleableDeadline > 121) {
      prodilloState.reminder121Sent = false;
      prodilloState.reminder21Sent = false;
    }
    
    if (winnerDeadline === 420 && !prodilloState.winnerReminder420Sent) {
      sendToTelegram('🏁 ¡Faltan 420 bloquecillos para el fin de la ronda!\n\n¡Se aproxima, loko/a! ¿Quién se llevará el premio?');
      prodilloState.winnerReminder420Sent = true;
    }

    if (winnerDeadline === 210 && !prodilloState.winnerReminder210Sent) {
      sendToTelegram('🏁 ¡Quedan 210 bloquecillos nomás!\n\n¡Se re viene! La tensión se puede cortar con un cuchillo...');
      prodilloState.winnerReminder210Sent = true;
    }

    if (winnerDeadline === 21 && !prodilloState.winnerReminder21Sent) {
      sendToTelegram('🏁 ¡Últimos 21 bloquecillos para el fin de la ronda loko/a!\n\n¡Últimos suspiros, que gane el mejor!');
      prodilloState.winnerReminder21Sent = true;
    }

    if (winnerDeadline > 420) {
      prodilloState.winnerReminder420Sent = false;
      prodilloState.winnerReminder210Sent = false;
      prodilloState.winnerReminder21Sent = false;
    }
    
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

    if (isRoundOver || prodilloState.forceWin) {
      const currentProdillos = await loadValues(PRODILLOS_FILE);
      const treasury = Math.ceil((currentProdillos.treasury || 0) * 0.79);
      
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
      
      const announcement = `<pre>🏁 ¡LA RONDA HA TERMINADO!\nMáximo de ₿ de esta ronda: $${bitcoinPrices.bitcoinMax}\n------------------------------------------\n${formattedList}\n\nCampeón/a: ${prodilloState.winnerName} 🏆\nPremio: ${treasury} sats</pre>`;
      
      sendToTelegram(announcement, { parse_mode: 'HTML' });

      try {
        const winnerImage = await generateWinnerImage(prodilloState.winnerName);
        sendPhotoToAllTelegram(winnerImage, announcement);
      } catch (imgError) {
        console.error('Error generating winner image:', imgError);
      }

      try {
        trofeillos = loadValuesSync(TROFEILLOS_FILE);
        if (Object.keys(trofeillos).length === 0) {
           trofeillos = { currentChampion: null, currentChampionId: null };
        }
      } catch (error) {
        console.log(`trofeillos.json doesn't exist → creating new one`);
        trofeillos = { currentChampion: null, currentChampionId: null };
      }

      const trophy = `${TROPHY_ICON} [${bitcoinPrices.bitcoinMaxBlock}]`;
      
      if (!trofeillos[winnerId]) {
        trofeillos[winnerId] = {
          champion: prodilloState.winnerName,
          "trofeillos profesionales": [trophy]
        };
      } else {
        const entry = trofeillos[winnerId] as TrofeillosChampion;
        if (!entry["trofeillos profesionales"]) {
          entry["trofeillos profesionales"] = [];
        }
        entry["trofeillos profesionales"]!.push(trophy);
      }
    
      trofeillos.currentChampion = prodilloState.winnerName;
      trofeillos.currentChampionId = winnerId;
      
      writeFileSync(TROFEILLOS_FILE, JSON.stringify(trofeillos, null, 2));

      bitcoinPrices.bitcoinMax = 0;
      bitcoinPrices.bitcoinMaxBlock = 0;
      await saveValues(BITCOIN_FILE, 'bitcoinMax', 0);
      await saveValues(BITCOIN_FILE, 'bitcoinMaxBlock', 0);
      
      const halFinneyPrediction = {'0': {user: 'Hal Finney', predict: 10000000}};
      await fs.writeFile(PRODILLOS_FILE, JSON.stringify(halFinneyPrediction, null, 2));
      
      await fs.writeFile(PENDING_FILE, JSON.stringify({}, null, 2));
      await fs.writeFile(INVOICES_CACHE_FILE, JSON.stringify({ invoices: {} }, null, 2));
      
      prodilloState.hasRoundWinnerBeenAnnounced = true;
      prodilloState.reminder121Sent = false;
      prodilloState.reminder21Sent = false;
      console.log(`Round finished! Winner: ${prodilloState.winnerName} [${winnerId}]`);
    }

    await new Promise(resolve => setTimeout(resolve, PRODILLO_ROUND_CHECK_INTERVAL));
  }
};

