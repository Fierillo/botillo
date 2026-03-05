import { 
  getAutoChannelConfig, 
  getAutoChannel, 
  getAutoTelegramThread,
  setDiscordChannel,
  setTelegramThread,
  getTelegramBot,
  getDiscordClient,
  getAutoDiscordChannel 
} from './config';

import { Telegraf } from 'telegraf';
import { GuildTextBasedChannel } from 'discord.js';
import { bitcoinPrices, telegramChats, discordChannels } from './bitcoinPrices';

interface TelegramSendOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  message_thread_id?: number;
  caption?: string;
}

async function sendToTelegram(chatId: number, message: string, options: TelegramSendOptions = {}) {
  const bot = getTelegramBot();
  if (!bot) return;
  const threadId = getAutoTelegramThread(chatId);
  
  await bot.telegram.sendMessage(chatId, message, {
    message_thread_id: threadId || undefined,
    ...options
  } as Record<string, unknown>).catch((err: Error) => console.error(`Telegram ${chatId} failed:`, err.message));
}

async function sendPhotoToTelegram(chatId: number, photo: Buffer, caption?: string) {
  const bot = getTelegramBot();
  if (!bot) return;
  const threadId = getAutoTelegramThread(chatId);
  const opts: TelegramSendOptions = { };
  if (threadId) opts.message_thread_id = threadId;
  if (caption) opts.caption = caption;
  
  await bot.telegram.sendPhoto(chatId, { source: photo }, opts as Record<string, unknown>)
    .catch((err: Error) => console.error(`Telegram photo ${chatId} failed:`, err.message));
}

async function sendPhotoToAllTelegram(photo: Buffer, caption?: string) {
  try {
    const chats = Object.keys(telegramChats || {});
    for (const chatId of chats) {
      await sendPhotoToTelegram(Number(chatId), photo, caption);
    }
  } catch (err) {
    console.error(`[TELEGRAM] Error:`, err);
  }
}

async function sendToAllTelegram(message: string, options: TelegramSendOptions = {}) {
  try {
    const chats = Object.keys(telegramChats || {});
    console.log(`[TELEGRAM] Enviando a ${chats.length} chats:`, chats);
    for (const chatId of chats) {
      await sendToTelegram(Number(chatId), message, options);
    }
  } catch (err) {
    console.error(`[TELEGRAM] Error:`, err);
  }
}

async function sendToDiscordChannel(guildId: string, message: string) {
  const client = getDiscordClient();
  if (!client) return;
  const channel = getAutoChannel(client, guildId);
  if (channel) {
    await channel.send(message).catch((err: Error) => 
      console.error(`Discord ${guildId} failed:`, err.message)
    );
  }
}

async function sendToAllDiscord(message: string) {
  try {
    const client = getDiscordClient();
    if (!client) return;
    
    for (const guild of client.guilds.cache.values()) {
      await sendToDiscordChannel(guild.id, message);
    }
    
    const channels = Object.values(discordChannels || {}) as GuildTextBasedChannel[];
    
    for (const channel of channels) {
      const guildId = channel.guildId;
      const autoChannelId = getAutoDiscordChannel(guildId);
      if (!autoChannelId || channel.id !== autoChannelId) {
        await channel.send(message).catch((err: Error) =>
          console.error(`Discord channel ${channel.id} failed:`, err.message)
        );
      }
    }
  } catch (err) {
    console.error(`[DISCORD] Error:`, err);
  }
}

async function sendToAll(message: string, options: TelegramSendOptions = {}) {
  await sendToAllTelegram(message, options);
  await sendToAllDiscord(message);
}

async function broadcastNewProdillo(user: string, predict: number, userId?: number) {
  console.log(`[BROADCAST] Nuevo prodillo: ${user} - $${predict}`);
  const userLinkTg = userId ? `[${user}](tg://user?id=${userId})` : user;
  const userLinkDc = `**${user}**`;
  await sendToAllTelegram(`🎯 *${userLinkTg}* inscribió un prodillo de $${predict} _pendiente de pago_`, { parse_mode: 'MarkdownV2' });
  await sendToAllDiscord(`🎯 ${userLinkDc} inscribió un prodillo de $${predict} _pendiente de pago_`);
}

async function broadcastConfirmedProdillo(user: string, predict: number, userId?: number) {
  console.log(`[BROADCAST] Prodillo confirmado: ${user} - $${predict}`);
  const userLinkTg = userId ? `[${user}](tg://user?id=${userId})` : user;
  const userLinkDc = `**${user}**`;
  await sendToAllTelegram(`✅ *${userLinkTg}* confirmó su prodillo: $${predict}`, { parse_mode: 'MarkdownV2' });
  await sendToAllDiscord(`✅ ${userLinkDc} confirmó su prodillo: $${predict}`);
}

async function broadcastExpiredProdillo(user: string, predict: number, userId?: number) {
  console.log(`[BROADCAST] Prodillo vencido: ${user} - $${predict}`);
  const userLinkTg = userId ? `[${user}](tg://user?id=${userId})` : user;
  const userLinkDc = `**${user}**`;
  await sendToAllTelegram(`⏰ *${userLinkTg}* no pagó su prodillo de $${predict}. El valor vuelve a estar disponible.`, { parse_mode: 'MarkdownV2' });
  await sendToAllDiscord(`⏰ ${userLinkDc} no pagó su prodillo de $${predict}. El valor vuelve a estar disponible.`);
}

module.exports = {
  sendToTelegram,
  sendPhotoToTelegram,
  sendPhotoToAllTelegram,
  sendToDiscordChannel,
  sendToAllDiscord,
  sendToAll,
  broadcastNewProdillo,
  broadcastConfirmedProdillo,
  broadcastExpiredProdillo,
  setDiscordChannel,
  setTelegramThread,
};
