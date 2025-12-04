// src/utils/gracefulShutdown.ts
import { Telegraf } from 'telegraf'
import { Client } from 'discord.js'
import * as fs from 'fs'
import * as path from 'path'

const PRODILLOS_FILE   = path.join(process.cwd(), 'src/db/prodillos.json')
const BITCOIN_FILE     = path.join(process.cwd(), 'src/db/bitcoin.json')

const DESPEDIDA = 'Botillo se fue a dormir. Adios humano'

export const getGracefulShutdown = (
  bot: Telegraf,
  client: Client,
  prodillos: Record<string, any>,
  bitcoin: Record<string, any>,
  discordChannels: Record<string, any>,
) => {
  let shuttingDown = false
  const exit = (code = 0) => process.exit(code)

  const saveFile = async (filePath: string, data: any, label: string) => {
    try {
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2))
      console.log(`${label} guardado`)
      return { status: 'fulfilled', label }
    } catch (err) {
      console.error(`${label} → fallo al guardar`, err)
      return { status: 'rejected', label, error: err }
    }
  }

  const shutdown = async (signal: string) => {
    if (shuttingDown) exit(1)
    shuttingDown = true

    console.log(signal)

    const saveTasks = await Promise.allSettled([
      saveFile(PRODILLOS_FILE,  prodillos,   'prodillos.json'),
      saveFile(BITCOIN_FILE,    bitcoin,     'bitcoin.json'),
    ])

    const failed = saveTasks.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
      console.error(`Fallaron ${failed.length} archivo(s) al guardar`)
    }

    try {
      await bot.stop(signal)
      console.log('Telegram bot detenido')
    } catch {
      console.log('Telegram bot → ya estaba detenido')
    }

    if (client.isReady()) {
      client.destroy()
      console.log('Discord client cerrado')
    } else {
      console.log('Discord client → ya estaba cerrado')
    }

    console.log(DESPEDIDA)
    exit()
  }

  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  process.once('SIGINT',  () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  process.on('uncaughtException', err => {
    console.error('FATAL:', err)
    shutdown('crash')
  })
}