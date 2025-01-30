// ln-service.d.ts
declare module 'ln-service' {
    export function createInvoice(args: {
      lnd: any;
      tokens: number;
      description?: string;
    }): Promise<{
      request: string;
      id: string;
      secret: string;
    }>;
  }