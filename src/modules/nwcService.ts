import "websocket-polyfill";
import { NWCClient } from '@getalby/sdk';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

config();

if (!process.env.NWC_CONNECTION_STRING) {
  throw new Error(`NWC_CONNECTION_STRING isn't defined in .env.`);
}

let nwcClient: NWCClient;
const INVOICES_CACHE_FILE = path.join(process.cwd(), 'src/db/invoicesCache.json');

export interface Invoice {
  bolt11: string;
  invoiceId: string;
}

export interface PaymentRecord {
  invoiceId: string;
  bolt11: string;
  description: string;
  paymentHash: string;
  paidAt?: number;
  expiresAt?: number;
  amount: number;
}

function loadInvoicesFromDisk(): Map<string, PaymentRecord> {
  const map = new Map<string, PaymentRecord>();
  if (existsSync(INVOICES_CACHE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(INVOICES_CACHE_FILE, 'utf-8'));
      Object.entries(data).forEach(([key, value]: [string, any]) => {
        map.set(key, value);
      });
    } catch (error) {
      console.error('Error loading invoices cache:', error);
    }
  }
  return map;
}

function saveInvoicesToDisk(invoices: Map<string, PaymentRecord>) {
  const obj: Record<string, PaymentRecord> = {};
  invoices.forEach((value, key) => {
    obj[key] = value;
  });
  writeFileSync(INVOICES_CACHE_FILE, JSON.stringify(obj, null, 2));
}

let invoices = loadInvoicesFromDisk();

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
      
      saveInvoicesToDisk(invoices);

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
      saveInvoicesToDisk(invoices);
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
    
    invoices = loadInvoicesFromDisk();
    console.log(`✅ Loaded ${invoices.size} invoices from cache`);
  } catch (error) {
    console.error('Error initializing NWC:', error);
    throw error;
  }
}
