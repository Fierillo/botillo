// dependencies
import { createInvoice } from 'ln-service';
import { credentials } from '@grpc/grpc-js';
const fs = require('fs');

// LND configuration
const lndConfig = {
    socket: 'localhost:10009', // Ej: localhost:10009
    cert: fs.readFileSync('/home/bitcoin/.lnd/tls.cert'), // Ruta a tu certificado TLS
    macaroon: fs.readFileSync('./macaroon').toString('hex'), // Ruta a tu macaroon
  };


export async function donacionsilla(amount: string) {
    // Convertir el monto a satoshis (asumiendo que el usuario introduce el monto en satoshis)
    const satoshis = parseInt(amount);

    // Crear el invoice en LND
    const invoice = await createInvoice({
        lnd: {
            authenticated: credentials.createSsl(Buffer.from(lndConfig.cert, 'hex')),
            macaroon: lndConfig.macaroon,
            socket: lndConfig.socket,
        },
        tokens: satoshis,
        description: `Donación de ${satoshis} satoshis`,
    });
    return invoice;
}