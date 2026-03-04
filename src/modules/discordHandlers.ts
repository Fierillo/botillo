import { TextChannel } from "discord.js";
import { getBitcoinPrices, bitcoinPrices } from './bitcoinPrices';
const { setDiscordChannel } = require('./notifier');

export function setupDiscord(client: any) {
  client.on('messageCreate', async (message: { content: string; channel: TextChannel; channelId: string; guild: any; author: any }) => {
    if (message.content === '/precio') {
      const { price } = await getBitcoinPrices();
      (message.channel as TextChannel).send(`precio de ₿: $${price} (${(100 * (price / bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)`);
    } else if (message.content === '/hilo') {
      const { max, min } = await getBitcoinPrices();
      (message.channel as TextChannel).send(`🦁 máximo diario de ₿: $${max} (${(100 * (max / bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)\n🐻 mínimo diario de ₿: $${min}\n🔺 Volatilidad diaria: $${max - min} (${(100 * (max / min) - 100).toFixed(1)}%)\n🚀 ATH de ₿: $${bitcoinPrices.bitcoinATH}`);
    } else if (message.content === '/plantar') {
      if (!message.guild) {
        message.channel.send('❌ Este comando solo funciona en un servidor, no en DM.');
        return;
      }
      const msg = message as any;
      const member = message.guild.members.cache.get(msg.author.id);
      if (!member?.permissions.has('Administrator')) {
        message.channel.send('❌ Solo administradores pueden usar este comando.');
        return;
      }
      setDiscordChannel(message.guild.id, message.channelId);
      message.channel.send(`✅ Canal plantado para mensajes automáticos en este servidor: <#${message.channelId}>`);
    }
  });
}
