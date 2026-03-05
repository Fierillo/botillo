import { Context, Telegraf } from 'telegraf';
import { deadline } from './deadline';
import { createInvoice } from './nwcService';
import { loadValues, loadValuesSync, saveFileValues, saveFileValuesSync } from './utils';
import { BitcoinPriceTracker, PendingProdillo, TrofeillosChampion, TrofeillosDB, ProdilloDB } from './types';
import path from 'path';
import qrcode from 'qrcode';

const { broadcastNewProdillo } = require('./notifier');
import { prodilloState, TROPHY_ICON, PRODILLOS_FILE, PENDING_FILE, BITCOIN_FILE, TROFEILLOS_FILE } from './prodillo';

export async function getProdillo(
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
    const currentProdillos = await loadValues<ProdilloDB>(PRODILLOS_FILE);
    const pendingProdillos = loadValuesSync<Record<string, PendingProdillo>>(PENDING_FILE);
    const bitcoinData = await loadValues<BitcoinPriceTracker>(BITCOIN_FILE);
    bitcoinPrices.bitcoinMax = bitcoinData?.bitcoinMax || 0;

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
      saveFileValuesSync(PENDING_FILE, pendingProdillos);
    }
    if (existingConfirmed) {
      delete currentProdillos[userId];
      await saveFileValues(PRODILLOS_FILE, currentProdillos);
    }

    try {
      const { bolt11, invoiceId } = await createInvoice(21, userId, user.toString(), predict.toString());

      const pending: Record<string, PendingProdillo> = loadValuesSync(PENDING_FILE);
      pending[userId] = { 
        user: user || 'Anónimo', 
        predict, 
        chatId: (ctx.chat as any).id, 
        invoiceId,
        chatType: ctx.chat.type 
      };
      saveFileValuesSync(PENDING_FILE, pending);

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
        await ctx.reply(`⚠️ Che [${user}](tg://user?id=${userId}), intenté mandarte el invoice para pagar pero no tenés habilitado los mensajes, ¡media pila, habilita los mensajes o escribime vos por privado!`, { parse_mode: 'MarkdownV2' });
      }

      console.log(`Pending prodillo: ${user} [${userId}]: $${predict}`);

    } catch (error) {
      console.error('Error en getProdillo:', error);
      ctx.reply('Error al crear la invoice. Revisa tu conexión y probá de nuevo.');
    }
  } else {
    ctx.reply('¡Ingresaste cualquier cosa, loko/a!\n\nUso: /prodillo <numero>');
  }
}

export async function getListilla(
  ctx: Context,
  prodillos: Record<string, { user: string; predict: number }>
) {
  try {
    const prodillosFromFile = await loadValues<ProdilloDB>(PRODILLOS_FILE);
    const bitcoinData = await loadValues<BitcoinPriceTracker>(BITCOIN_FILE);
    const currentRoundMaxPrice = bitcoinData?.bitcoinMax || 0;
    const treasury = Math.ceil(((prodillosFromFile?.treasury) || 0) * 0.79);

    if (Object.keys(prodillosFromFile?.users || {}).length === 0) {
      return ctx.reply('Todavía no hay prodillos en esta ronda. ¡Aprovecha con /prodillo <número>!');
    }

    const rankedPredictions = (Object.values(prodillosFromFile?.users || {}) as Array<{ user: string; predict: number }>)
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
      const diffColumn = `${isRekt ? 'REKT' : `$${diff}`}`;

      let displayRow = `${userColumn} | ${predictColumn} | ${diffColumn}`;

      if (isRekt) {
        displayRow = `\u0336${displayRow.split('').join('\u0336')}\u0336`;
      } else if (diff === leaderDifference) {
        displayRow = `👑 ${displayRow}`;
      }

      formattedList += `${displayRow}\n`;
    });

    const { winnerDeadline, prodilleableDeadline } = await deadline();

    const deadlineInfo = `🟧⛏️ Tiempo para predecir: ${prodilloState.isPredictionWindowOpen ? prodilleableDeadline : 0} bloques\n` +
                         `🏁🏆 Fin de la ronda en: ${winnerDeadline} bloques\n\n` +
                         `Máximo de ₿ de esta ronda: $${currentRoundMaxPrice}\n` +
                         `Premio actual: ${treasury} sats`;

    const message = `<pre>${formattedList}\n\n` +
                        `${deadlineInfo}</pre>`;

    return ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error al leer el archivo de prodillos:', error);
    return ctx.reply('Hubo un error al obtener la lista de prodillos.');
  }
}

export async function getTrofeillos(ctx: Context) {
  try {
    const rawData = loadValuesSync<TrofeillosDB>(TROFEILLOS_FILE);

    const currentChampion = (rawData?.currentChampion as string | null) ?? "N/A";

    let amateurList = "";
    let profesionalList = "";

    for (const [key, value] of Object.entries(rawData || {})) {
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

    const message =
      `🏆 ¡SALÓN DE LA FAMA! 🏆\n\n` +
      `Rey actual:\n${currentChampion}\n\n` +
      (profesionalList
        ? `Categoría Profesional (Pagos):\n${profesionalList}\n\n`
        : "") +
      (amateurList ? `Categoría Amateur (Gratis):\n${amateurList}` : "");

    return ctx.reply(message);
  } catch (error) {
    console.error("Error al leer trofeillos.json:", error);
    return ctx.reply("Hubo un error al obtener los trofeillos.");
  }
}
