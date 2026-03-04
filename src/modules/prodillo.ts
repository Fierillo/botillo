import fs from 'fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getBitcoinPrices, telegramChats } from './bitcoinPrices';
import { deadline } from './deadline';
import path from 'path';
import { Telegraf, Context } from 'telegraf';
import qrcode from 'qrcode';
import { createInvoice } from './nwcService';
import { loadValues, saveValues } from './utils';
import { TrofeillosChampion, TrofeillosDB, BitcoinPriceTracker, PendingProdillo } from './types';
import { generateWinnerImage } from './imageGenerator';
const { sendToTelegram, sendPhotoToAllTelegram, broadcastNewProdillo } = require('./notifier');

const PRODILLOS_FILE = path.join(process.cwd(), 'src/db/prodillos.json');

const BITCOIN_FILE = path.join(process.cwd(), 'src/db/bitcoin.json');
const TROFEILLOS_FILE = path.join(process.cwd(), 'src/db/trofeillos.json');
const PENDING_FILE = path.join(process.cwd(), 'src/db/pendingProdillos.json');
const INVOICES_CACHE_FILE = path.join(process.cwd(), 'src/db/invoicesCache.json');
const PRODILLO_ROUND_CHECK_INTERVAL = 1000 * 69;

let trofeillos = {} as TrofeillosDB;
const TROPHY_ICON = '🏆';

let prodilloState = {
  winnerName: '',
  isPredictionWindowOpen: true,
  hasRoundWinnerBeenAnnounced: false,
  forceWin: false,
  isTest: false,
  reminder121Sent: false,
  reminder21Sent: false,
  winnerReminder420Sent: false,
  winnerReminder210Sent: false,
  winnerReminder21Sent: false,
};

async function prodilloRoundManager(
  bot: Telegraf, 
  telegramChats: { [key: number]: string; }, 
  prodillos: Record<string, { user: string; predict: number; }>, 
  bitcoinPrices: BitcoinPriceTracker,
) {
  while (true) {
    const { winnerDeadline, prodilleableDeadline, latestHeight } = await deadline();
    const { max: currentBitcoinPrice } = await getBitcoinPrices();

    const bitcoinData = JSON.parse(await fs.readFile(BITCOIN_FILE, 'utf-8'));
    bitcoinPrices.bitcoinMax = bitcoinData.bitcoinMax;
  
    prodilloState.isPredictionWindowOpen = (prodilleableDeadline > 0);
    
    if (prodilleableDeadline === 121 && !prodilloState.reminder121Sent) {
      sendToTelegram('⛏️ ¡121 bloquitos para el cierre!\n\nDale que todavía estas a tiempo con /prodillo <número>');
      prodilloState.reminder121Sent = true;
    }
    
    if (prodilleableDeadline === 21 && !prodilloState.reminder21Sent) {
      sendToTelegram('🚨 ¡21 bloquecitos loko/a!\n\nÚltima chance señor/a: /prodillo <número>');
      prodilloState.reminder21Sent = true;
    }
    
    if (prodilleableDeadline > 121) {
      prodilloState.reminder121Sent = false;
      prodilloState.reminder21Sent = false;
    }
    
    if (winnerDeadline === 420 && !prodilloState.winnerReminder420Sent) {
      sendToTelegram('🏁 ¡Faltan 420 bloquecillos para el fin de la ronda!\n\n¡Se aproxima, loko/a! ¿Quién se llevará el premio?');
      prodilloState.winnerReminder420Sent = true;
    }

    if (winnerDeadline === 210 && !prodilloState.winnerReminder210Sent) {
      sendToTelegram('🏁 ¡Quedan 210 bloquecillos nomás!\n\n¡Se re viene! La tensión se puede cortar con un cuchillo...');
      prodilloState.winnerReminder210Sent = true;
    }

    if (winnerDeadline === 21 && !prodilloState.winnerReminder21Sent) {
      sendToTelegram('🏁 ¡Últimos 21 bloquecillos para el fin de la ronda loko/a!\n\n¡Últimos suspiros, que gane el mejor!');
      prodilloState.winnerReminder21Sent = true;
    }

    if (winnerDeadline > 420) {
      prodilloState.winnerReminder420Sent = false;
      prodilloState.winnerReminder210Sent = false;
      prodilloState.winnerReminder21Sent = false;
    }
    
    if (prodilloState.hasRoundWinnerBeenAnnounced && winnerDeadline > 0 && winnerDeadline < 210) {
      prodilloState.hasRoundWinnerBeenAnnounced = false;
    }
    
    if (currentBitcoinPrice > bitcoinPrices.bitcoinMax) {
      bitcoinPrices.bitcoinMax = currentBitcoinPrice;
      bitcoinPrices.bitcoinMaxBlock = latestHeight;
      await saveValues(BITCOIN_FILE, 'bitcoinMax', bitcoinPrices.bitcoinMax);
      await saveValues(BITCOIN_FILE, 'bitcoinMaxBlock', bitcoinPrices.bitcoinMaxBlock);
    }
    
    const isRoundOver = (winnerDeadline === 0 || winnerDeadline > 2010) && !prodilloState.hasRoundWinnerBeenAnnounced;

    if (isRoundOver || prodilloState.forceWin) {
      const currentProdillos = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
      const treasury = Math.ceil(((await loadValues(PRODILLOS_FILE)).treasury || 0) * 0.79);
      
      const sortedProdillos = Object.entries(currentProdillos).sort(([,a]: any,[,b]: any) => 
        Math.abs(a.predict - bitcoinPrices.bitcoinMax) - Math.abs(b.predict - bitcoinPrices.bitcoinMax)
      );
      
      if (sortedProdillos.length === 0) {
        console.log("Round ended, but no predictions were made.");
        await new Promise(resolve => setTimeout(resolve, PRODILLO_ROUND_CHECK_INTERVAL));
        continue;
      }

      const formattedList = sortedProdillos.map(([, { user, predict }]: any) => {
        return `${user}: $${predict} (dif: ${(Math.abs(predict - bitcoinPrices.bitcoinMax))})`;
      }).join('\n');

      const [winnerId, winnerData] = sortedProdillos[0] as [string, { user: string, predict: number }];
      prodilloState.winnerName = winnerData.user;
      
      const announcement = `<pre>🏁 ¡LA RONDA HA TERMINADO!\nMáximo de ₿ de esta ronda: $${bitcoinPrices.bitcoinMax}\n------------------------------------------\n${formattedList}\n\nCampeón/a: ${prodilloState.winnerName} 🏆\nPremio: ${treasury} sats</pre>`;
      
      sendToTelegram(announcement, { parse_mode: 'HTML' });

      try {
        const winnerImage = await generateWinnerImage(prodilloState.winnerName);
        sendPhotoToAllTelegram(winnerImage, announcement);
      } catch (imgError) {
        console.error('Error generating winner image:', imgError);
      }

      try {
        const data = readFileSync(TROFEILLOS_FILE, 'utf-8');
        trofeillos = JSON.parse(data);
      } catch (error) {
        console.log(`trofeillos.json doesn't exist → creating new one`);
        trofeillos = { currentChampion: null, currentChampionId: null };
      }

      const trophy = `${TROPHY_ICON} [${bitcoinPrices.bitcoinMaxBlock}]`;
      
      if (!trofeillos[winnerId]) {
        trofeillos[winnerId] = {
          champion: prodilloState.winnerName,
          "trofeillos profesionales": [trophy]
        };
      } else {
        const entry = trofeillos[winnerId] as TrofeillosChampion;
        if (!entry["trofeillos profesionales"]) {
          entry["trofeillos profesionales"] = [];
        }
        entry["trofeillos profesionales"]!.push(trophy);
      }
    
      trofeillos.currentChampion = prodilloState.winnerName;
      trofeillos.currentChampionId = winnerId;
      
      writeFileSync(TROFEILLOS_FILE, JSON.stringify(trofeillos, null, 2));

      bitcoinPrices.bitcoinMax = 0;
      bitcoinPrices.bitcoinMaxBlock = 0;
      await saveValues(BITCOIN_FILE, 'bitcoinMax', 0);
      await saveValues(BITCOIN_FILE, 'bitcoinMaxBlock', 0);
      
      const halFinneyPrediction = {'0': {user: 'Hal Finney', predict: 10000000}};
      await fs.writeFile(PRODILLOS_FILE, JSON.stringify(halFinneyPrediction, null, 2));
      
      await fs.writeFile(PENDING_FILE, JSON.stringify({}, null, 2));
      await fs.writeFile(INVOICES_CACHE_FILE, JSON.stringify({ invoices: {} }, null, 2));
      
      prodilloState.hasRoundWinnerBeenAnnounced = true;
      prodilloState.reminder121Sent = false;
      prodilloState.reminder21Sent = false;
      console.log(`Round finished! Winner: ${prodilloState.winnerName} [${winnerId}]`);
    }

    await new Promise(resolve => setTimeout(resolve, PRODILLO_ROUND_CHECK_INTERVAL));
  }
};

async function getProdillo(
  ctx: Context,
  prodillo: Record<string, { user: string; predict: number; }>,
  bitcoinPrices: BitcoinPriceTracker,
  bot: Telegraf
) {
  const { winnerDeadline, prodilleableDeadline } = await deadline();

  if(!prodilloState.isPredictionWindowOpen && !prodilloState.isTest) {
    return ctx.reply(`¡Tarde, loko/a! La ventana de predicciones está cerrada.\nEspera ${winnerDeadline} bloques para que comience la nueva ronda.`);
  }

  if (!ctx.from) {
    console.error("ctx.from is undefined.");
    return;
  }

  const text = (ctx.message as any).text;
  const args = text.split(' ');
  const predict = Math.round(Number(args[1]));
  const { id: userId, username: user } = ctx.from;

  if (user && !isNaN(predict) && predict >= 0 && isFinite(predict)) {
    const currentProdillos = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
    const pendingProdillos = existsSync(PENDING_FILE) 
      ? JSON.parse(readFileSync(PENDING_FILE, 'utf-8')) 
      : {};
    const bitcoinData = JSON.parse(await fs.readFile(BITCOIN_FILE, 'utf-8'));
    bitcoinPrices.bitcoinMax = bitcoinData.bitcoinMax;

    const existingPending = pendingProdillos[userId];
    const existingConfirmed = currentProdillos[userId];

    if (existingPending || existingConfirmed) {
      const oldPredict = existingPending?.predict || existingConfirmed?.predict;
      if (predict === oldPredict) {
        return ctx.reply(`Ya tenés un prodillo de $${predict} ${existingPending ? 'pendiente' : 'confirmado'}. Elegí otro valor.`);
      }
    }

    if (Object.values(currentProdillos).some((p: any) => p.predict === predict) ||
        Object.values(pendingProdillos).some((p: any) => p.predict === predict)) {
      return ctx.reply(`Ese prodillo ya está tomado (pendiente o pagado). ¡Elegí otro valor, loko/a!`);
    }

    if (predict < bitcoinPrices.bitcoinMax) {
      return ctx.reply(`Tenes que ingresar un valor mayor a $${bitcoinPrices.bitcoinMax} para tener chance.\n¡Mentalidad de tiburón, loko/a!`);
    }

    if (existingPending) {
      delete pendingProdillos[userId];
      writeFileSync(PENDING_FILE, JSON.stringify(pendingProdillos, null, 2));
    }
    if (existingConfirmed) {
      delete currentProdillos[userId];
      await fs.writeFile(PRODILLOS_FILE, JSON.stringify(currentProdillos, null, 2));
    }

    try {
      const { bolt11, invoiceId } = await createInvoice(21, userId, user.toString(), predict.toString());

      const pending: Record<string, PendingProdillo> = existsSync(PENDING_FILE)
        ? JSON.parse(readFileSync(PENDING_FILE, 'utf-8'))
        : {};
      pending[userId] = { 
        user: user || 'Anónimo', 
        predict, 
        chatId: (ctx.chat as any).id, 
        invoiceId,
        chatType: ctx.chat.type 
      };
      writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));

      if (prodilloState.isPredictionWindowOpen || prodilloState.isTest) {
        console.log(`[PRODILLO] Ventana ABIERTA o TEST, anunciando prodillo de ${user}: $${predict}`);
        await broadcastNewProdillo(user || 'Anónimo', predict, userId);
      } else {
        console.log(`[PRODILLO] Ventana CERRADA, no se anuncia prodillo de ${user}: $${predict}`);
      }

      const qrCode = await qrcode.toDataURL(bolt11);
      const qrBuffer = Buffer.from(qrCode.split(',')[1], 'base64');

      const instruction = `*¡Prodillo de $${predict} pendiente de pago!*\n\n` +
        `Pagá 21 sats en 10 minutos.\n\n` +
        `QR o invoice:\n`;

      try {
        await bot.telegram.sendPhoto(userId, { source: qrBuffer });
        await bot.telegram.sendMessage(userId, `${bolt11}\n\n${instruction}`, { parse_mode: 'Markdown' });
      } catch (dmErr) {
        console.error(`MP a ${user} falló:`, dmErr);
        await ctx.replyWithPhoto({ source: qrBuffer });
        await ctx.reply(`${bolt11}\n\n${instruction}`, { parse_mode: 'Markdown' });
        
        await ctx.reply(`⚠️ Che *${user}*, intenté mandarte el invoice para pagar pero no tenés habilitado los mensajes, ¡media pila, habilita los mensajes o escribime vos por privado!`, { parse_mode: 'MarkdownV2' });
      }

      console.log(`Pending prodillo: ${user} [${userId}]: $${predict}`);

    } catch (error: any) {
      console.error('Error en getProdillo:', error);
      ctx.reply('Error al crear la invoice. Revisa tu conexión y probá de nuevo.');
    }
  } else {
    ctx.reply('¡Ingresaste cualquier cosa, loko/a!\n\nUso: /prodillo <numero>');
  }
}

async function getListilla(
  ctx: Context,
  prodillos: Record<string, { user: string; predict: number }>
) {
  try {
    const prodillosFromFile = JSON.parse(await fs.readFile(PRODILLOS_FILE, 'utf-8'));
    const bitcoinData = JSON.parse(await fs.readFile(BITCOIN_FILE, 'utf-8'));
    const currentRoundMaxPrice = bitcoinData.bitcoinMax;
    const treasury = Math.ceil(((await loadValues(PRODILLOS_FILE)).treasury || 0) * 0.79);

    if (Object.keys(prodillosFromFile).length === 0) {
      return ctx.reply('Todavía no hay prodillos en esta ronda. ¡Aprovecha con /prodillo <número>!');
    }

    const rankedPredictions = (Object.values(prodillosFromFile) as Array<{ user: string; predict: number }>)
      .filter(item => typeof item === 'object' && item.user && item.predict)
      .map(({ user, predict }) => {
        return { user, predict, diff: Math.abs(predict - currentRoundMaxPrice) };
      }).sort((a, b) => a.diff - b.diff);

    const leaderDifference = rankedPredictions[0].diff;

    let formattedList = `Usuario                | Predicción   | Diferencia\n`;
    formattedList += `-----------------------------------------------------\n`;

    rankedPredictions.forEach(({ user, predict, diff }) => {
      const isRekt = predict < currentRoundMaxPrice && diff > leaderDifference;

      const userColumn = user.padEnd(20, ' ');
      const predictColumn = `$${predict.toString().padStart(10, ' ')}`;
      const line = `${userColumn} | ${predictColumn} | ${diff}`;

      if (isRekt) {
        formattedList += `<s>${line}</s> (REKT!)\n`;
      } else {
        const isLeader = diff === leaderDifference;
        formattedList += `${line}${isLeader ? ' 🏆' : ''}\n`;
      }
    });

    const { winnerDeadline, prodilleableDeadline } = await deadline();
    const roundMaxPriceInfo = `Precio máximo de ₿ en esta ronda: $${currentRoundMaxPrice}`;
    const deadlineInfo = `🟧⛏️ Tiempo para predecir: ${prodilloState.isPredictionWindowOpen ? prodilleableDeadline : 0} bloques\n` +
                         `🏁 Tiempo para el ganador: ${winnerDeadline} bloques`;

    const fullMessage = `<pre><b>LISTA DE PRODILLOS:</b>\n\n` +
                        `${roundMaxPriceInfo}\n` +
                        `Pozo actual: ${treasury} sats\n` +
                        `-----------------------------------------------------\n` +
                        `${formattedList}\n` +
                        `${deadlineInfo}</pre>`;

    await ctx.reply(fullMessage, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('Error al generar la listilla:', error);
    await ctx.reply('No se pudo obtener la lista de prodillos en este momento.');
  }
}

async function getTrofeillos(ctx: Context) {
  if (!existsSync(TROFEILLOS_FILE)) {
    writeFileSync(
      TROFEILLOS_FILE,
      JSON.stringify(
        {
          currentChampion: null,
          currentChampionId: null,
        },
        null,
        2
      )
    );
  }

  try {
    const rawData = JSON.parse(readFileSync(TROFEILLOS_FILE, "utf-8")) as Record<
      string,
      any
    >;

    const currentChampion = (rawData.currentChampion as string | null) ?? "N/A";

    let amateurList = "";
    let profesionalList = "";

    for (const [key, value] of Object.entries(rawData)) {
      if (key === "currentChampion" || key === "currentChampionId") continue;

      const champData = value as {
        champion: string;
        "trofeillos amateur"?: string[];
        "trofeillos profesionales"?: string[];
      };

      const amateurTrophies = (champData["trofeillos amateur"] ?? []).join(" ");
      const proTrophies = (champData["trofeillos profesionales"] ?? []).join(" ");

      if (amateurTrophies) {
        amateurList += `\n- ${champData.champion}: ${amateurTrophies}`;
      }
      if (proTrophies) {
        profesionalList += `\n- ${champData.champion}: ${proTrophies}`;
      }
    }

    let message = `<pre><b>SALA DE TROFEILLOS</b>\n\n`;
    message += `Último campeón: <b>${currentChampion}</b>\n`;
    message += `${"=".repeat(45)}\n`;

    if (amateurList) {
      message += `\n<b>ÉPOCA AMATEUR</b>${amateurList}\n`;
    }
    if (profesionalList) {
      message += `\n<b>ÉPOCA PROFESIONAL</b> (21 sats)${profesionalList}\n`;
    }
    if (!amateurList && !profesionalList) {
      message += `\nNo hay ganadores aún.`;
    }

    message += `</pre>`;
    await ctx.reply(message, { parse_mode: "HTML" });
  } catch (e) {
    console.error("CRITICAL ERROR: Couldn't read trofeillos.json file", e);
    await ctx.reply("Hubo un error al buscar la sala de trofeos.");
  }
}

export {
  prodilloRoundManager as prodilloInterval,
  getProdillo,
  getListilla,
  getTrofeillos,
  prodilloState
};