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
  
  try {
    await initializeNWC();
  } catch (error) {
    console.error('Failed to initialize NWC, payment checker will retry on next check');
  }

  // Poll pending invoices every 10s
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

        // Verify invoice exists in cache
        if (!invoicesCache[item.invoiceId]) {
          console.log(`⚠️ Invoice ${item.invoiceId} not in cache, removing from pending`);
          delete pending[userId];
          writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
          continue;
        }

        try {
          const isPaid = await checkPaymentStatus(item.invoiceId);
          
          if (isPaid) {
            console.log(`✅ Payment confirmed for ${item.user} [${userId}]: $${item.predict}`);
            
            // Add to prodillos
            const currentProdillos = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
            currentProdillos[userId] = { user: item.user, predict: item.predict };
            await fs.writeFile(PRODILLOS_FILE, JSON.stringify(currentProdillos, null, 2));
            
            // Send confirmations
            await bot.telegram.sendMessage(item.chatId, `¡Pago confirmado! Prodillo de ${item.user} registrado: $${item.predict}`).catch(console.error);
            await bot.telegram.sendMessage(userId, `¡Pago confirmado! Tu prodillo de $${item.predict} ha sido registrado.`).catch(console.error);
            
            // Remove from pending
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
