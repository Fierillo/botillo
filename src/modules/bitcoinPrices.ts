import axios from "axios";

let lastPrices = { price: 0, min: 0, max: 0 };

// Define function that fetches the Bitcoin price using Binance API
export async function getBitcoinPrices () {
    //console.log('getBitcoinPrices() called');
    try {  
        const { data } = await axios.get<{ last: string, low: string, high: string }>('https://www.bitstamp.net/api/v2/ticker/btcusd');
        lastPrices = {
        price: parseInt(data.last),
        min: parseInt(data.low),
        max: parseInt(data.high),
        }
        return lastPrices;
    } catch (error) {
        console.error('getBitcoinPrices() error');
        return lastPrices;
    }
};

