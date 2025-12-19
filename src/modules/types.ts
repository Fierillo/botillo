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