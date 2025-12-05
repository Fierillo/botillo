// src/utils/gracefulShutdown.ts
import { Telegraf } from 'telegraf'
import { Client } from 'discord.js'
import * as fs from 'fs'
import * as path from 'path'

const PRODILLOS_FILE = path.join(process.cwd(), 'src/db/prodillos.json')
const BITCOIN_FILE = path.join(process.cwd(), 'src/db/bitcoin.json')

const DESPEDIDA = 'Botillo goes to sleep. Goodbye human!'

export const getGracefulShutdown = (
  bot: Telegraf,
  client: Client,
  prodillos: Record<string, any>,  
  bitcoin: Record<string, any>,    
  discordChannels: Record<string, any>,
) => {
  let shuttingDown = false
  const exit = (code = 0) => process.exit(code)

  type SaveResult = {
    status: 'fulfilled' | 'rejected';
    label: string;
    error?: any;
  };

  const saveFile = async (filePath: string, data: any, label: string, fallbackPath?: string): Promise<SaveResult> => {    try {
      console.log(`🔄 Saving ${label}`)

      if (Object.keys(data).length === 0 && fallbackPath && fs.existsSync(fallbackPath)) {
        console.warn(`⚠️ ${label} empty in memory → using file`)
        const fallbackData = JSON.parse(await fs.promises.readFile(fallbackPath, 'utf8'))
        data = fallbackData
      }

      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2))
      console.log(`✅ ${label} saved successfully`)
      return { status: 'fulfilled' as const, label };
    } catch (err) {
      console.error(`❌ ${label} → failed to save`, err)
      return { status: 'rejected' as const, label, error: err };
    }
  }

  const shutdown = async (signal: string) => {
    if (shuttingDown) exit(1)
    shuttingDown = true

    console.log(`🛑 Shutdown started: ${signal}`)

    const channelsFile = path.join(process.cwd(), 'src/db/discordChannels.json')
    await saveFile(channelsFile, discordChannels, 'discordChannels.json')

    const savePromises: Promise<SaveResult>[] = [
      saveFile(PRODILLOS_FILE, prodillos, 'prodillos.json', PRODILLOS_FILE),
      saveFile(BITCOIN_FILE, bitcoin, 'bitcoin.json', BITCOIN_FILE),
    ];

    const saveTasks = await Promise.allSettled(savePromises) as Array<{
      status: 'fulfilled';
      value: SaveResult;
    } | {
      status: 'rejected';
      reason: any;
    }>;

    const failedLabels: string[] = [];
    saveTasks.forEach((result) => {
      if (result.status === 'rejected') {
        console.error('Unexpected promise rejection:', result.reason);
      } else {
        const customResult = result.value;
        if (customResult.status === 'rejected') {
          failedLabels.push(customResult.label);
        }
      }
    });

    if (failedLabels.length > 0) {
      console.error(`❌ Fallaron ${failedLabels.length} archivo(s): ${failedLabels.join(', ')}`);
    } else {
      console.log('📁 All data was persisted successfully');
    }

    try {
      await bot.stop(signal)
      console.log('Telegram bot stopped')
    } catch {
      console.log('Telegram bot → was stopped already')
    }

    if (client.isReady()) {
      client.destroy()
      console.log('Discord client closed')
    } else {
      console.log('Discord client → was closed already')
    }

    console.log(DESPEDIDA)
    setTimeout(exit, 1000) 
  }

  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  process.once('SIGINT',  () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  process.on('uncaughtException', err => {
    console.error('💥 FATAL ERROR:', err)
    shutdown('crash')
  })
}