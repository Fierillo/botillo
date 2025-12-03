import { NWCClient } from '@getalby/sdk';
import { config } from 'dotenv';
import fs from 'fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

config();

if (!process.env.NWC_CONNECTION_STRING) {
  throw new Error('NWC_CONNECTION_STRING no está definido en .env. Agrega tu NWC URI de Alby hub.');
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

// Store invoices in persistent file
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
  try {
    const description = `prodillo-${user}-${predict}`;
    
    // Request invoice from NWC wallet
    const response = await nwcClient.makeInvoice({
      amount: amountSats * 1000, // convert to msats
      description,
      expiry: 600, // 10 minutes
    });

    if (!response || !response.invoice || !response.payment_hash) {
      throw new Error('No invoice or payment_hash returned from NWC makeInvoice');
    }

    const bolt11 = response.invoice;
    const paymentHash = response.payment_hash;
    const invoiceId = `inv-${userId}-${Date.now()}`;
    const createdAt = response.created_at || Math.floor(Date.now() / 1000);
    // prefer provider's expires_at if present, fallback to createdAt+600
    const expiresAt = response.expires_at || (createdAt + 60 * 10); // 10 minutes

    // Store invoice info for polling
    invoices.set(invoiceId, {
      invoiceId,
      bolt11,
      description,
      paymentHash,
      expiresAt,
      amount: amountSats,
    });
    
    // Persist to disk
    saveInvoicesToDisk(invoices);

    console.log(`✅ Invoice created via NWC: ${bolt11.substring(0, 50)}...`);
    console.log(`   Description: ${description}`);
    console.log(`   Payment Hash: ${paymentHash}`);
    console.log(`   Invoice ID: ${invoiceId}`);

    return { bolt11, invoiceId };
  } catch (error) {
    console.error('Error creating invoice via NWC:', error);
    throw error;
  }
}

export async function checkPaymentStatus(invoiceId: string): Promise<boolean> {
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

    console.log(`Checking payment status for ${invoiceId}`);
    console.log(`   Payment Hash: ${record.paymentHash}`);

    // Check expiry (app-level: 10 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    if (record.expiresAt && nowSec > record.expiresAt) {
      console.log(`⏰ Invoice ${invoiceId} expired at ${new Date(record.expiresAt * 1000).toISOString()}`);
      return false;
    }

    // List recent transactions from NWC
    const response = await nwcClient.listTransactions({
      limit: 100,
    });
    
    if (!response || !response.transactions) {
      console.log(`⚠️ No transactions returned from NWC`);
      return false;
    }

    console.log(`   Found ${response.transactions.length} transactions from NWC`);

    // Look for a transaction matching the payment_hash (unique identifier)
    const transaction = response.transactions.find((t: any) => 
      t.payment_hash === record.paymentHash && t.state === 'settled'
    );

    if (transaction) {
      console.log(`✅ Payment CONFIRMED for ${invoiceId}`);
      console.log(`   Amount: ${transaction.amount} msats (${transaction.amount / 1000} sats)`);
      console.log(`   Settled at: ${new Date(transaction.settled_at * 1000).toISOString()}`);
      record.paidAt = Date.now();
      saveInvoicesToDisk(invoices);
      return true;
    }

    console.log(`⏳ No settled payment found yet for ${invoiceId}`);
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
    
    // Reload invoices from disk in case there are pending ones from before restart
    invoices = loadInvoicesFromDisk();
    console.log(`✅ Loaded ${invoices.size} invoices from cache`);
  } catch (error) {
    console.error('Error initializing NWC:', error);
    throw error;
  }
}
