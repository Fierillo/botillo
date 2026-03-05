import path from 'path';
import { existsSync } from 'fs';
import { Telegraf } from 'telegraf';
import { config } from "dotenv";
import { checkPaymentStatus, initializeNWC } from './nwcService';
import { loadValues, loadValuesSync, saveFileValues, saveFileValuesSync } from './utils';
import { PendingProdillo, ProdilloDB, Invoice, PaymentRecord } from './types';
const { broadcastConfirmedProdillo, broadcastExpiredProdillo } = require('./notifier');

config();

const PENDING_FILE = path.join(process.cwd(), 'src/db/pendingProdillos.json');
const PRODILLOS_FILE = path.join(process.cwd(), 'src/db/prodillos.json');
const INVOICES_CACHE_FILE = path.join(process.cwd(), 'src/db/invoicesCache.json');

export async function startPaymentChecker(bot: Telegraf) {
  console.log('Starting payment checker (polling via NWC)...');
  
  for (let i = 1; i <= 10; i++) {
    try {
      await initializeNWC();
      console.log(`NWC connected at the ${i}th try`);
      break;
    } catch (e) {
      console.warn(`Try ${i}/10 to connect NWC, retrying in 8s...`);
      if (i === 10) {
        console.error(`Can't connect NWC. Bot can't use prodillo.`);
      } else {
        await new Promise(r => setTimeout(r, 8000));
      }
    }
  }

  setInterval(async () => {
    try {
      if (!existsSync(PENDING_FILE)) return;
      
      const pending: Record<string, PendingProdillo> = loadValuesSync(PENDING_FILE);
      const invoicesCache: Record<string, PaymentRecord> = loadValuesSync<{ invoices: Record<string, PaymentRecord> }>(INVOICES_CACHE_FILE)?.invoices || {};

      const keys = Object.keys(pending);
      
      if (keys.length === 0) return;
      
      for (const userId of keys) {
        const item = pending[userId];
        if (!item || !item.invoiceId) {
          console.log(`⚠️ Skipping pending without invoiceId for ${userId}`);
          continue;
        }

        if (!invoicesCache[item.invoiceId]) {
          console.log(`⚠️ Invoice ${item.invoiceId} not in cache, removing from pending`);
          delete pending[userId];
          saveFileValuesSync(PENDING_FILE, pending);
          continue;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const invoiceRecord = invoicesCache[item.invoiceId];
        if (invoiceRecord && invoiceRecord.expiresAt && nowSec > invoiceRecord.expiresAt) {
          console.log(`⏰ Invoice ${item.invoiceId} expired for user ${userId}`);
          await bot.telegram.sendMessage(userId, `Tu invoice para el prodillo de $${item.predict} expiró.`).catch(console.error);
          await broadcastExpiredProdillo(item.user, item.predict, Number(userId));
          
          delete invoicesCache[item.invoiceId];
          saveFileValuesSync(INVOICES_CACHE_FILE, { invoices: invoicesCache });
          
          delete pending[userId];
          saveFileValuesSync(PENDING_FILE, pending);
          continue;
        }

        try {
          const isPaid = await checkPaymentStatus(item.invoiceId, item.user, userId, String(item.predict));
          
          if (!isPaid) continue;

          const currentProdillos = await loadValues<ProdilloDB>(PRODILLOS_FILE);
          currentProdillos[userId] = { user: item.user, predict: item.predict } as never;
          
          await broadcastConfirmedProdillo(item.user, item.predict, Number(userId));
          
          delete pending[userId];
          saveFileValuesSync(PENDING_FILE, pending);
        } catch (error) {
          console.error(`Error checking payment for ${userId}:`, error);
        }
      }
    } catch (error) {
      console.error('Payment checker interval error:', error);
    }
  }, 10000);
}
