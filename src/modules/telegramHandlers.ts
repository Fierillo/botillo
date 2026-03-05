import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { Message } from "telegraf/typings/core/types/typegram";
import { getProdillo, getListilla, getTrofeillos } from './prodilloCommands';
import { getBitcoinPrices, bitcoinPrices, telegramChats } from './bitcoinPrices';
import { getTest } from './test';
import { config } from 'dotenv';
const { setTelegramThread } = require('./notifier');
import { prodillos } from '../../index'; // Will refactor this dependency loop later

config();

export function setupTelegram(bot: Telegraf) {
  function ensureChatIsSaved(ctx: Context) {
    if (ctx.chat && !telegramChats.hasOwnProperty(ctx.chat.id)) {
      const chatName = ctx.chat.type === 'private' ? ctx.chat.first_name : ctx.chat.title;
      telegramChats[ctx.chat.id] = chatName || 'Unknown';
      console.log(`Chat guardado: ${chatName} [${ctx.chat.id}]`);
    }
  }

  bot.command(['precio', 'precio@botillo21_bot'], async (ctx) => {
    ensureChatIsSaved(ctx);
    try {
      const { price } = await getBitcoinPrices();
      await ctx.reply(`Precio actual de ₿: $${price} (${(100 * (price / bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)`);
    } catch (error) {
      console.error(`Error en /precio para chat ${ctx.chat.id}`);
      await ctx.reply('🚨 Error al traer el precio de ₿, probá de nuevo en un rato.');
    }
  });

  bot.command(['hilo', 'hilo@botillo21_bot'], async (ctx) => {
    ensureChatIsSaved(ctx);
    try {
      const { max, min } = await getBitcoinPrices();
      await ctx.reply(`🦁 máximo diario de ₿: $${max} (${(100 * (max / bitcoinPrices.bitcoinATH)).toFixed(1)}% del ATH)\n🐻 mínimo diario de ₿: $${min}\n🔺 Volatilidad diaria: $${max - min} (${(100 * (max / min) - 100).toFixed(1)}%)\n🚀 ATH de ₿: $${bitcoinPrices.bitcoinATH}`);
    } catch (error) {
      console.error(`Error en /hilo para chat ${ctx.chat.id}`);
      await ctx.reply('🚨 Error al traer el hilo de ₿, probá de nuevo en un rato.');
    }
  });

  /*bot.command('test', (ctx) => {
    ensureChatIsSaved(ctx);
    getTest(ctx);
  });

  bot.command('testreminder', async (ctx) => {
    ensureChatIsSaved(ctx);
    Object.keys(telegramChats).forEach(chatId => {
      ctx.reply('⛏️ ¡121 bloquitos para el cierre loko/a!\n\nDale que todavía estas a tiempo con /prodillo <número>');
      ctx.reply('🚨 ¡21 bloquitos loko/a!\n\nÚltima chance: /prodillo <número>');
    });
    ctx.reply('Recordatorios enviados (test)');
  });*/

  const welcome = (ctx: Context) => {
    const name = ctx.chat?.type === 'private' ? ctx.chat.first_name : ctx.chat?.title;
    ctx.reply(`¡GM ${name}!\n\nSoy Botillo, mira las cosas que puedo hacer por ti:\n\n- Reportar automáticamente el máximo o mínimo mas reciente de Bitcoin\n/precio - Muestro el precio actual de Bitcoin\n/hilo - Muestro el máximo y mínimo en lo que va del dia\n/start - Muestro este mensaje\n\nProdillo: adivina el proximo máximo de BTC\n- Cada ronda dura 2016 bloques (un ajuste de dificultad)\n- Los jugadores pueden enviar prodillos hasta 420 bloques antes del fin de la ronda\n- El jugador que mas se aproxime al máximo de BTC de esa ronda sera el ganador\n/prodillo - Registra tu predicción del máximo de BTC de esta ronda\n/listilla - Muestra la lista de jugadores y sus prodillos\n/trofeillos - Muestra el salon de ganadores de prodillos\n\nPuedes mirar mi código en GitHub: https://github.com/Fierillo/botillo\n\n¡Gracias por usarme!`);
  }

  bot.start((ctx) => {
    ensureChatIsSaved(ctx);
    welcome(ctx);
  });

  bot.help((ctx) => {
    ensureChatIsSaved(ctx);
    welcome(ctx);
  });

  bot.command(['prodillo', 'prodillo@botillo21_bot'], async (ctx) => {
    ensureChatIsSaved(ctx);
    getProdillo(ctx, prodillos, bitcoinPrices, bot);
  });

  bot.command(['listilla', 'listilla@botillo21_bot'], (ctx) => {
    ensureChatIsSaved(ctx);
    getListilla(ctx, prodillos);
  });

  bot.command(['trofeillos', 'trofeillos@botillo21_bot'], (ctx) => {
    ensureChatIsSaved(ctx);
    getTrofeillos(ctx);
  });

  bot.command(['donacioncilla', 'donacioncilla@botillo21_bot'], async (ctx) => {
    ensureChatIsSaved(ctx);
    const userId = ctx.from.id;
    const user = ctx.from.username;

    try {
      const lightningAddress = process.env.LIGHTNING_ADDRESS;
      console.log(`🟨 ¡User ${user} [${userId}] wants to donate!`);
      await ctx.reply(`🍾 ¡Gracias por querer donar loko/a! 🙏\n\nManda sats a: ${lightningAddress}`);
    } catch (error) {
      console.error(`❌ error when ${user} [${userId}] tried to access donation`, error);
      await ctx.reply('❌ Lo siento loko, hubo un error al obtener la dirección. Proba devuelta');
    }
  });

  bot.command(['plantar', 'plantar@botillo21_bot'], async (ctx) => {
    ensureChatIsSaved(ctx);
    
    if (ctx.chat.type === 'private') {
      await ctx.reply('❌ Este comando solo funciona en grupos, no en chat privado.');
      return;
    }
    
    try {
      const userMember = await ctx.getChatMember(ctx.from.id);
      if (userMember.status !== 'administrator' && userMember.status !== 'creator') {
        await ctx.reply('❌ Solo administradores pueden usar este comando.');
        return;
      }
    } catch (err) {
      if (err.description && err.description.includes('CHAT_ADMIN_REQUIRED')) {
        await ctx.reply('❌ Necesito ser administrador del grupo para poder verificar tus permisos y plantar el canal.');
        return;
      }
      console.error('Error verificando permisos en /plantar:', err);
      await ctx.reply('❌ Hubo un error al verificar tus permisos.');
      return;
    }
    
    const chatId = ctx.chat.id;
    const threadId = (ctx.message as any).message_thread_id;
    setTelegramThread(chatId, threadId || null);
    await ctx.reply(`✅ Topic registrado para este grupo: ${threadId ? 'thread ' + threadId : 'general'}`);
  });

  bot.hears(/(?<=\s|^)(peron|kuka|kirchner|zurdo)\w*/i, (ctx) => {
    ensureChatIsSaved(ctx);
    if (Math.random() <= 0.21) {
      ctx.reply(ctx.chat.id === -1001778459295 ? 'NO ME INTERESA LA OPINION DE LAS KUKAS' : 'ME CHUPA LA PIJA LA OPINION DE LAS KUKAS');
    }
  });

  bot.hears(/(?<=\s|^)(eth|solana|sol |bcash|bch |polkadot|dot |cardano|ada )\w*/i, (ctx) => {
    ensureChatIsSaved(ctx);
    if (Math.random() <= 0.21) {
      ctx.reply('🚨 ALERTA DU SHITCOINER 🚨');
    }
  });

  bot.on(message('text'), async (ctx) => {
    ensureChatIsSaved(ctx);

    const botUsername = ctx.botInfo.username;
    const repliedToBot = (ctx.message as Message.TextMessage).reply_to_message?.from?.id === ctx.botInfo.id;
    const mentionedBot = ctx.message.text.includes(`@${botUsername}`);

    if ((repliedToBot || mentionedBot) && ctx.message.text.endsWith('?')) {
      ctx.reply(Math.random() < 0.5 ? '✅ VERDADERO' : '❌ FALSO');
    };
  });
}
