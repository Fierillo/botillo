// src/utils/gracefulShutdown.ts
import { Telegraf } from 'telegraf'
import { Client } from 'discord.js'
import * as fs from 'fs'
import * as path from 'path'

const PRODILLOS_FILE = path.join(process.cwd(), 'src/db/prodillos.json')

const DESPEDIDA = 'Botillo goes to sleep. Goodbye human!'

export const getGracefulShutdown = (
  bot: Telegraf,
  client: Client,
) => {
  let shuttingDown = false
  const exit = (code = 0) => process.exit(code)

  const shutdown = async (signal: string) => {
    if (shuttingDown) exit(1)
    shuttingDown = true

    console.log(`🛑 Shutdown started: ${signal}`)

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