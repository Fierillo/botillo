import axios from "axios";
import WebSocket from 'ws';

let lastDeadline = {
    latestHeight: Infinity,
    winnerDeadline: Infinity,
    prodilleableDeadline: Infinity,
};

/*// Initialize starting deadline for Prodillo game, next Bitcoin difficulty adjustment using mempool API
export async function deadline() {
    console.log('deadline() called');
    try {
      const response = await axios.get('https://mempool.space/api/blocks/tip/height');
      const latestHeight = Number(response.data);
      lastDeadline = {
        latestHeight: latestHeight,
        winnerDeadline: 2015 - latestHeight % 2016, // 2016 is the Bitcoin difficulty adjustment
        prodilleableDeadline: (2015 - latestHeight % 2016) - 690, // prodillos can be submitted 690 blocks before the difficulty adjustment
      };
      return lastDeadline;
    } catch (error) {
      console.error('deadline() error');
      return lastDeadline;
    };
  };*/

// Conexión WebSocket básica
const ws = new WebSocket('wss://mempool.space/api/v1/ws');

ws.on('open', () => {
  console.log('Conectado a Bitcoin blocks');
  ws.send(JSON.stringify({ action: 'want', data: ['blocks'] }));
});

ws.on('message', (data: string) => {
  try {
      const block = JSON.parse(data);
      if (block.height) {
        const height = Number(block.height);
        lastDeadline = {
          latestHeight: height,
          winnerDeadline: 2015 - (height % 2016),
          prodilleableDeadline: (2015 - (height % 2016)) - 690
        };
      }
  } catch (e) {
    console.error('deadline() error');
  }
});

ws.on('close', () => {
  console.log('Connection closed - retrying in 5 seconds...');
  setTimeout(() => new WebSocket(ws.url), 5000);
});

// Mantenemos la misma interfaz original
export async function deadline() {
  console.log('deadline() called'); 
  return lastDeadline;
}