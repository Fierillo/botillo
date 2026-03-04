const fs = require('fs');
const path = require('path');

import { loadValuesSync, saveFileValuesSync } from './utils';

const CONFIG_FILE = path.join(process.cwd(), 'src/db/autoChannel.json');

interface DiscordGuildConfig {
  channelId: string | null;
}

interface TelegramChatConfig {
  threadId: number | null;
}

interface AutoChannelConfig {
  discord: Record<string, DiscordGuildConfig>;
  telegram: Record<string, TelegramChatConfig>;
}

let config: AutoChannelConfig = {
  discord: {},
  telegram: {},
};

let telegramBot: any = null;
let discordClient: any = null;

export function initAutoChannel(telegramBotInstance: any, discordClientInstance: any) {
  telegramBot = telegramBotInstance;
  discordClient = discordClientInstance;
}

export function loadAutoChannelConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveFileValuesSync(CONFIG_FILE, config);
    return config;
  }
  try {
    config = loadValuesSync(CONFIG_FILE);
    if (!config.discord) config.discord = {};
    if (!config.telegram) config.telegram = {};
    return config;
  } catch (e) {
    console.error('Error loading auto channel config:', e);
    return config;
  }
}

export function saveAutoChannelConfig(newConfig: Partial<AutoChannelConfig>) {
  config = { ...config, ...newConfig };
  saveFileValuesSync(CONFIG_FILE, config);
}

export function getAutoChannelConfig(): AutoChannelConfig {
  return config;
}

export function setDiscordChannel(guildId: string, channelId: string) {
  if (!config.discord) config.discord = {};
  config.discord[guildId] = { channelId };
  saveFileValuesSync(CONFIG_FILE, config);
}

export function setTelegramThread(chatId: number, threadId: number | null) {
  if (!config.telegram) config.telegram = {};
  config.telegram[String(chatId)] = { threadId };
  saveFileValuesSync(CONFIG_FILE, config);
}

export function getAutoTelegramThread(chatId: number): number | null {
  if (!config.telegram) return null;
  return config.telegram[String(chatId)]?.threadId ?? null;
}

export function getAutoDiscordChannel(guildId: string): string | null {
  if (!config.discord) return null;
  return config.discord[guildId]?.channelId ?? null;
}

export function getAutoChannel(client: any, guildId?: string): any {
  const targetGuildId = guildId || client.guilds.cache.first()?.id;
  if (!targetGuildId) return null;
  
  const channelId = getAutoDiscordChannel(targetGuildId);
  if (channelId) {
    const guild = client.guilds.cache.get(targetGuildId);
    if (guild) {
      const channel = guild.channels.cache.get(channelId);
      if (channel) return channel;
    }
  }
  
  const guild = client.guilds.cache.get(targetGuildId);
  if (!guild) return null;
  
  const textChannels = guild.channels.cache.filter((ch: any) => ch.isTextBased() && !ch.isThread());
  return textChannels.first() || null;
}

export function getTelegramBot() {
  return telegramBot;
}

export function getDiscordClient() {
  return discordClient;
}
