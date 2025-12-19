import "websocket-polyfill";
import { NWCClient } from '@getalby/sdk';
import { config } from 'dotenv';
import path from 'path';
import { saveValues, loadValues } from './utils';
import { Invoice, PaymentRecord } from './types';

config();

if (!process.env.NWC_CONNECTION_STRING) {
  throw new Error(`NWC_CONNECTION_STRING isn't defined in .env.`);
}

let nwcClient: NWCClient;
const INVOICES_CACHE_FILE = path.join(process.cwd(), 'src/db/invoicesCache.json');



let invoices: Map<string, PaymentRecord>;

export async function createInvoice(amountSats: number, userId, user: string, predict: string): Promise<Invoice> {
  const description = `prodillo-${user}-${predict}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Creating invoice attempt ${attempt}/3...`);
      
      const response = await Promise.race([
        nwcClient.makeInvoice({
          amount: amountSats * 1000,
          description,
          expiry: 600,
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('NWC timeout 10s')), 10000)
        )
      ]);

      if (!response || !response.invoice || !response.payment_hash) {
        throw new Error('No invoice/payment_hash from NWC');
      }

      const bolt11 = response.invoice;
      const paymentHash = response.payment_hash;
      const invoiceId = `inv-${userId}-${Date.now()}`;
      const createdAt = response.created_at || Math.floor(Date.now() / 1000);
      const expiresAt = response.expires_at || (createdAt + 600);

      invoices.set(invoiceId, {
        invoiceId,
        bolt11,
        description,
        paymentHash,
        expiresAt,
        amount: amountSats,
      });

      await saveValues(INVOICES_CACHE_FILE, 'invoices', Object.fromEntries(invoices));
      console.log(`✅ Invoice ${attempt === 1 ? '' : '(retry)'} ${bolt11.substring(0, 50)}... ID: ${invoiceId}`);
      
      return { bolt11, invoiceId };
    } catch (error: any) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt === 3) throw error;
      if (error.message.includes('Timeout') || error.message.includes('Nip47') || error.code === 'INTERNAL') {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.log(`Retry in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
}

export async function checkPaymentStatus(invoiceId: string, user: string, userId: string, predict: string): Promise<boolean> {
  try {
    const record = invoices.get(invoiceId);
    if (!record) {
      console.log(`❌ Invoice ${invoiceId} not found in cache`);
      return false;
    }

    if (record.paidAt) {
      console.log(`✅ Invoice ${invoiceId} already marked as paid at ${new Date(record.paidAt).toISOString()}`);
      return true;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (record.expiresAt && nowSec > record.expiresAt) {
      console.log(`⏰ Invoice ${invoiceId} expired at ${new Date(record.expiresAt * 1000).toISOString()}`);
      return false;
    }

    const response = await nwcClient.listTransactions({
      limit: 100,
    });
    
    if (!response || !response.transactions) {
      console.log(`⚠️ No transactions returned from NWC`);
      return false;
    }

    const transaction = response.transactions.find((t: any) => 
      t.payment_hash === record.paymentHash && t.state === 'settled'
    );

    if (transaction) {
      console.log(`✅ Payment confirmed for ${user} [${userId}]: $${predict}`);
      console.log(`   Amount: ${transaction.amount} msats (${transaction.amount / 1000} sats)`);
      console.log(`   Settled at: ${new Date(transaction.settled_at * 1000).toISOString()}`);
      record.paidAt = Date.now();
      await saveValues(INVOICES_CACHE_FILE, 'invoices', Object.fromEntries(invoices));
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking payment status via NWC:', error);
    return false;
  }
}

export async function initializeNWC(): Promise<void> {
  try {
    console.log('Initializing NWC connection...');
    nwcClient = new NWCClient({
      nostrWalletConnectUrl: process.env.NWC_CONNECTION_STRING,
    });
    
    const publicKey = nwcClient.publicKey;
    console.log('✅ NWC connection established. Public key:', publicKey);

    const data = await loadValues(INVOICES_CACHE_FILE);
    const invoicesData = data.invoices || {};
    invoices = new Map(Object.entries(invoicesData));
    console.log(`✅ Loaded ${invoices.size} invoices from cache`);
  } catch (error) {
    console.error('Error initializing NWC:', error);
    throw error;
  }
}
