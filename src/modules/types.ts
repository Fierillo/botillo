export interface Invoice {
  bolt11: string;
  invoiceId: string;
  expiresAt?: number;
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

export interface TrofeillosChampion {
  champion: string;
  "trofeillos amateur"?: string[];
  "trofeillos profesionales"?: string[];
}

export interface TrofeillosDB {
  currentChampion?: string | null;
  currentChampionId?: string | null;
  [userId: string]: TrofeillosChampion | string | null | undefined;
}

export interface BitcoinPriceTracker {
  bitcoinATH: number;
  lastReportedMax: number;
  lastReportedMin: number;
  bitcoinMax: number;
  bitcoinMaxBlock: number;
}

export interface PendingProdillo {
  user: string;
  predict: number;
  chatId: number;
  invoiceId: string;
  chatType: string;
}

export interface ProdilloDB {
  users: Record<string, { user: string; predict: number }>;
  treasury: number;
  invoices: Record<string, ProdilloInvoice>;
}

export interface ProdilloEntry {
  predict: number;
  paid: boolean;
  paidAt?: number;
}

export interface ProdilloInvoice {
  bolt11: string;
  amount: number;
  paymentHash?: string;
  paidAt?: number;
}

export interface NWCWallet {
  walletPubkey: string;
  secret: string;
}

export interface NWCBudget {
  budget: number;
  name: string;
}

export interface AutoChannelConfig {
  discord: Record<string, { channelId: string | null }>;
  telegram: Record<string, { threadId: number | null }>;
}