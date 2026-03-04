import axios from "axios";

let lastDeadline = {
    latestHeight: Infinity,
    winnerDeadline: Infinity,
    prodilleableDeadline: Infinity,
};

const BLOCKS_PER_EPOCH = 2016;
const PRODILLO_WINDOW_OFFSET = 1325;

export async function deadline() {
    try {
      const response = await axios.get('https://mempool.space/api/blocks/tip/height');
      const latestHeight = Number(response.data);
      const blocksIntoEpoch = latestHeight % BLOCKS_PER_EPOCH;
      const winnerDeadline = (BLOCKS_PER_EPOCH - 1) - blocksIntoEpoch;

      lastDeadline = {
        latestHeight,
        winnerDeadline,
        prodilleableDeadline: winnerDeadline - PRODILLO_WINDOW_OFFSET,
      };
      return lastDeadline;
    } catch (error) {
      console.error('deadline() error');
      return lastDeadline;
    }
}