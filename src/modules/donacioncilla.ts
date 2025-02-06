// import dependencies
import fetch from 'node-fetch';
const fs = require('fs');
const https = require('https');

function setupLndConnection() {
    const lndRestHost = process.env.LND_REST_HOST || 'localhost:8080';
    const cert = fs.readFileSync(process.env.LND_TLS_CERT_PATH);
    const macaroon = process.env.LND_MACAROON ?? '';
  
    return {
      host: lndRestHost,
      agent: new https.Agent({
        rejectUnauthorized: false,
        ca: [cert]
      }),
      macaroon: macaroon
    };
  }

// defines invoice function that uses LND REST API
export async function createInvoiceREST (amount: number, description: string) {
  const { host, agent, macaroon } = setupLndConnection();  

  try {
    const response = await fetch(`https://${host}/v1/invoices`, {
      method: 'POST',
      headers: {
        'Grpc-Metadata-macaroon': macaroon ?? '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: amount,
        memo: description
      }),
      agent
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
    console.error('Error during invoice creation using REST API:', error);
    throw error;
  }
}

/*// Función para monitorear pagos
function monitorPayments() {
    const { host, agent, macaroon } = setupLndConnection();
  
    async function pollForPayments() {
      try {
        const response = await fetch(`https://${host}/v1/invoices/subscribe`, {
          method: 'GET',
          headers: {
            'Grpc-Metadata-macaroon': macaroon,
            'Content-Type': 'application/json'
          },
          agent: agent
        });
  
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        if (!response.body) {
          throw new Error('Response body is null');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
  
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
  
          const chunk = decoder.decode(value, { stream: true });
          const payments = chunk.split('\n').filter(Boolean).map(line => JSON.parse(line));
  
          for (const payment of payments) {
            if (payment.state === 'SETTLED') {
              console.log('Pago recibido:', payment);
            }
          }
        }
      } catch (error) {
        console.error('Error al monitorear pagos:', error);
        setTimeout(pollForPayments, 5000); // Reintentar después de 5 segundos
      }
    }
  
    pollForPayments().catch(console.error);
  }*/