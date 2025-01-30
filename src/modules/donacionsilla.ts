// import dependencies
import fetch from 'node-fetch';
const fs = require('fs');
const https = require('https');

// defines invoice function that uses LND REST API
export async function createInvoiceREST (amount: number, description: string) {
  const lndRestHost = process.env.LND_REST_HOST || 'localhost:8080'; // Asegúrate de establecer correctamente este valor
  const cert = fs.readFileSync(process.env.LND_TLS_CERT_PATH); // Ruta al certificado TLS de LND
  const macaroon = fs.readFileSync(process.env.LND_MACAROON).toString('hex');

  try {
    const agent = new https.Agent({
      rejectUnauthorized: false, // Esto deshabilita la verificación de certificados, solo para desarrollo
      ca: [cert]
    });

    const response = await fetch(`https://${lndRestHost}/v1/invoices`, {
      method: 'POST',
      headers: {
        'Grpc-Metadata-macaroon': macaroon,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: amount,
        memo: description
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    interface InvoiceResponse {
      payment_request: string;
      r_hash: string;
    }

    const data: InvoiceResponse = await response.json() as InvoiceResponse;
    return {
      request: data.payment_request,
      id: data.r_hash,
      secret: data.payment_request.split('secret=')[1] // Esto es un ejemplo y podría no ser la forma correcta de obtener el secreto, revisa la estructura real de la respuesta
    };
  } catch (error) {
    console.error('Error al crear factura con LND REST API:', error);
    throw error;
  }
}