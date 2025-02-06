import axios from "axios";

let lastDeadline = {
    latestHeight: Infinity,
    winnerDeadline: Infinity,
    prodilleableDeadline: Infinity,
};

// Initialize starting deadline for Prodillo game, next Bitcoin difficulty adjustment using mempool API
export async function deadline() {
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
  }