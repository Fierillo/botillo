import fs from 'fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { Telegraf } from 'telegraf';
import { config } from "dotenv";
import { checkPaymentStatus, initializeNWC } from './nwcService';

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
      
      const pending: Record<string, any> = JSON.parse(readFileSync(PENDING_FILE, 'utf-8'));
      const invoicesCache: Record<string, any> = existsSync(INVOICES_CACHE_FILE)
        ? JSON.parse(readFileSync(INVOICES_CACHE_FILE, 'utf-8'))
        : {};
      
      const keys = Object.keys(pending);
      
      if (keys.length === 0) return;
      
      console.log('Payment checker: checking', keys.length, 'pending prodillos');
      
      for (const userId of keys) {
        const item = pending[userId];
        if (!item || !item.invoiceId) {
          console.log(`⚠️ Skipping pending without invoiceId for ${userId}`);
          continue;
        }

        if (!invoicesCache[item.invoiceId]) {
          console.log(`⚠️ Invoice ${item.invoiceId} not in cache, removing from pending`);
          delete pending[userId];
          writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
          continue;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const invoiceRecord = invoicesCache[item.invoiceId];
        if (invoiceRecord && invoiceRecord.expiresAt && nowSec > invoiceRecord.expiresAt) {
          console.log(`⏰ Invoice ${item.invoiceId} expired for user ${userId}, removing pending`);
          await bot.telegram.sendMessage(userId, `Tu invoice para el prodillo de $${item.predict} expiró. Volvé a crear el prodillo con /prodillo ${item.predict}`).catch(console.error);
          await bot.telegram.sendMessage(item.chatId, `La invoice de ${item.user} para $${item.predict} expiró y fue removida. El prodillo de $${item.predict} vuelve a estar disponible`).catch(console.error);
          delete pending[userId];
          writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
          continue;
        }

        try {
          const isPaid = await checkPaymentStatus(item.invoiceId, item.user, userId, item.predict);
          
          if (isPaid) {
            const currentProdillos = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
            currentProdillos[userId] = { user: item.user, predict: item.predict };
            await fs.writeFile(PRODILLOS_FILE, JSON.stringify(currentProdillos, null, 2));
            
            if (item.chatType !== 'private') {
              await bot.telegram.sendMessage(item.chatId, `¡Pago confirmado! Prodillo de [${item.user}](tg://user?id=${userId}) registrado: $${item.predict}`, { parse_mode: 'Markdown' }).catch(console.error);
            }
            await bot.telegram.sendMessage(userId, `¡Pago confirmado! Tu prodillo de $${item.predict} ha sido registrado.`).catch(console.error);
            
            delete pending[userId];
            writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
          }
        } catch (error) {
          console.error(`Error checking payment for ${userId}:`, error);
        }
      }
    } catch (error) {
      console.error('Payment checker interval error:', error);
    }
  }, 10000);
}
