import { MessageContext } from "../../handlers/types.js";
import { checkPokemonGuess, isPokemonGameActive } from "./pokemon.service.js";
import { checkCountryGuess, isCountryGameActive } from "./geoguessr.service.js";
import { submitWordleGuess, isWordleGameActive, getActiveWordle } from "./wordle.service.js";
import { checkSuperheroGuess, isSuperheroGameActive } from "./superhero.service.js";
import { checkMlbbGuess, isMlbbGameActive } from "./mlbb.service.js";
import {
  submitHangmanLetter,
  submitHangmanSolve,
  isHangmanGameActive,
} from "./ahorcado.service.js";
import { setGameCooldown } from "./game-cooldown.service.js";

function formatMention(senderProfile: any): string {
  const digits = senderProfile?.phone || (senderProfile?.jid ? senderProfile.jid.split("@")[0].split(":")[0] : null);
  return digits ? `@${digits}` : `@${senderProfile?.primaryName || "Jugador"}`;
}

/**
 * Intercepta mensajes en grupos con partidas activas de Pokémon, Banderas, Wordle o Ahorcado.
 * Devuelve true si el mensaje fue consumido por una partida activa.
 */
export async function interceptGameGuess(ctx: MessageContext): Promise<boolean> {
  const { remoteJid, cleanBody, senderProfile, sock, msg } = ctx;
  if (!cleanBody || cleanBody.length < 1) return false;

  const mention = formatMention(senderProfile);

  // 1. ¿Hay partida de Pokémon activa?
  if (isPokemonGameActive(remoteJid)) {
    // Si el texto adivina el Pokémon
    const pokeRes = await checkPokemonGuess(remoteJid, senderProfile.jid, cleanBody);
    if (pokeRes.matched && pokeRes.game) {
      const newTag = pokeRes.isNewCapture ? "✨ *¡NUEVO POKÉMON EN TU POKÉDEX!*" : "*(Ya lo tenías capturado)*";
      const caption =
        `🎉 *¡CORRECTO!* ${mention} descubrió que el Pokémon era *${pokeRes.game.name}*!\n\n` +
        `• *Tipo:* ${pokeRes.game.types.join(" / ").toUpperCase()}\n` +
        `• *Región:* ${pokeRes.game.generation}\n` +
        `• *Premio:* +*$${pokeRes.reward?.toLocaleString("es-AR")}* fichas\n` +
        `• *Colección:* ${newTag} (${pokeRes.totalCaptured} descubiertos)\n` +
        `• *Tu saldo actual:* *$${pokeRes.newBalance?.toLocaleString("es-AR")}* fichas`;

      setGameCooldown(remoteJid);
      await sock.sendMessage(
        remoteJid,
        {
          image: pokeRes.game.colorBuffer,
          caption,
          mentions: [senderProfile.jid],
        },
        { quoted: msg as any }
      );
      return true;
    }
  }

  // 2. ¿Hay partida de Banderas / GeoGuessr activa?
  if (isCountryGameActive(remoteJid)) {
    const geoRes = await checkCountryGuess(remoteJid, senderProfile.jid, cleanBody);
    if (geoRes.matched && geoRes.game) {
      const text =
        `🏆 *¡ACERTASTE EL PAÍS!* ${mention} adivinó: *${geoRes.game.country.name}* ${geoRes.game.country.flagEmoji}!\n\n` +
        `• *Continente:* 🌍 ${geoRes.game.country.continent}\n` +
        `• *Capital:* 🏛️ ${geoRes.game.country.capital}\n` +
        `• *Premio cobrado:* +*$${geoRes.reward?.toLocaleString("es-AR")}* fichas\n` +
        `• *Tu saldo actual:* *$${geoRes.newBalance?.toLocaleString("es-AR")}* fichas`;

      setGameCooldown(remoteJid);
      await sock.sendMessage(
        remoteJid,
        { text, mentions: [senderProfile.jid] },
        { quoted: msg as any }
      );
      return true;
    }
  }

  // 3. ¿Hay partida de Wordle activa?
  if (isWordleGameActive(remoteJid)) {
    let wordCandidate: string | null = null;
    const lower = cleanBody.toLowerCase();

    if (lower.startsWith("!palabra ") || lower.startsWith("!p ") || lower.startsWith("!w ")) {
      wordCandidate = cleanBody.split(/\s+/)[1] || null;
    } else if (cleanBody.length === 5 && !cleanBody.includes(" ") && (ctx.quotedSnippet.includes("WORDLE") || cleanBody === cleanBody.toUpperCase())) {
      wordCandidate = cleanBody;
    }

    if (wordCandidate && wordCandidate.length === 5) {
      const wordleRes = await submitWordleGuess(
        remoteJid,
        senderProfile.jid,
        senderProfile.primaryName || senderProfile.phone,
        wordCandidate
      );

      if (wordleRes.valid) {
        if (wordleRes.gameWon) {
          setGameCooldown(remoteJid);
          const winText =
            `🎉 *¡PALABRA DESCUBIERTA EN WORDLE!* 🎉\n\n` +
            `${wordleRes.gridDisplay}\n\n` +
            `🏆 *¡Ganador:* ${mention} acertó *${wordleRes.secretWord}*!\n` +
            `• *Premio:* +*$${wordleRes.reward?.toLocaleString("es-AR")}* fichas\n` +
            `• *Saldo actual:* *$${wordleRes.newBalance?.toLocaleString("es-AR")}* fichas`;

          await sock.sendMessage(
            remoteJid,
            { text: winText, mentions: [senderProfile.jid] },
            { quoted: msg as any }
          );
        } else if (wordleRes.gameOver) {
          setGameCooldown(remoteJid);
          const loseText =
            `💀 *FIN DEL JUEGO: INTENTOS AGOTADOS* (6/6)\n\n` +
            `${wordleRes.gridDisplay}\n\n` +
            `La palabra secreta era: *${wordleRes.secretWord}*.\n` +
            `¡Nadie se llevó las fichas esta vez!`;

          await sock.sendMessage(remoteJid, { text: loseText }, { quoted: msg as any });
        } else {
          const progText =
            `🟩 *WORDLE EN CURSO* (${wordleRes.attemptNumber}/${wordleRes.maxAttempts})\n\n` +
            `${wordleRes.gridDisplay}\n\n` +
            (wordleRes.lettersStatus ? `${wordleRes.lettersStatus}\n\n` : "") +
            `⏳ _Quedan ${wordleRes.maxAttempts! - wordleRes.attemptNumber!} intentos restantes (\`!palabra <texto>\`)._`;

          await sock.sendMessage(remoteJid, { text: progText }, { quoted: msg as any });
        }
        return true;
      }
    }
  }

  // 4. ¿Hay partida de Superhéroes activa?
  if (isSuperheroGameActive(remoteJid)) {
    const heroRes = await checkSuperheroGuess(remoteJid, senderProfile.jid, cleanBody);
    if (heroRes.matched && heroRes.game) {
      const newTag = heroRes.isNewCapture ? "✨ *¡NUEVO HÉROE REGISTRADO EN TU COLECCIÓN!*" : "*(Ya lo tenías registrado)*";
      const caption =
        `🎉 *¡CORRECTO!* ${mention} descubrió que el personaje era *${heroRes.game.name}*! 🦸\n\n` +
        `• *Editorial:* ${heroRes.game.publisher}\n` +
        `• *Bando:* ${heroRes.game.alignment}\n` +
        `• *Identidad:* ${heroRes.game.fullName}\n` +
        `• *Premio:* +*$${heroRes.reward?.toLocaleString("es-AR")}* fichas\n` +
        `• *Colección:* ${newTag} (${heroRes.totalCaptured} personajes descubiertos)\n` +
        `• *Tu saldo actual:* *$${heroRes.newBalance?.toLocaleString("es-AR")}* fichas`;

      setGameCooldown(remoteJid);
      await sock.sendMessage(
        remoteJid,
        {
          image: heroRes.game.colorBuffer,
          caption,
          mentions: [senderProfile.jid],
        },
        { quoted: msg as any }
      );
      return true;
    }
  }

  // 5. ¿Hay partida de Mobile Legends activa?
  if (isMlbbGameActive(remoteJid)) {
    const mlbbRes = await checkMlbbGuess(remoteJid, senderProfile.jid, cleanBody);
    if (mlbbRes.matched && mlbbRes.game) {
      const newTag = mlbbRes.isNewCapture ? "✨ *¡NUEVO HÉROE REGISTRADO EN TU MLBB-DEX!*" : "*(Ya lo tenías en tu lista)*";
      const caption =
        `🎉 *¡ACERTASTE EL HÉROE DE MLBB!* ${mention} descubrió que era *${mlbbRes.game.hero.name}*! ⚔️\n\n` +
        `• *Rol:* ${mlbbRes.game.hero.role}\n` +
        `• *Línea:* ${mlbbRes.game.hero.lane}\n` +
        `• *Premio:* +*$${mlbbRes.reward?.toLocaleString("es-AR")}* fichas\n` +
        `• *Colección:* ${newTag} (${mlbbRes.totalCaptured} héroes dominados)\n` +
        `• *Tu saldo actual:* *$${mlbbRes.newBalance?.toLocaleString("es-AR")}* fichas`;

      setGameCooldown(remoteJid);
      await sock.sendMessage(
        remoteJid,
        {
          image: mlbbRes.game.colorBuffer,
          caption,
          mentions: [senderProfile.jid],
        },
        { quoted: msg as any }
      );
      return true;
    }
  }

  // 6. ¿Hay partida de Ahorcado activa?
  if (isHangmanGameActive(remoteJid)) {
    const trimmed = cleanBody.trim();
    const isSingleChar = trimmed.length === 1 && /^[a-zA-Z0-9]$/.test(trimmed);
    const isQuotedHangman = ctx.quotedSnippet.includes("AHORCADO") || ctx.quotedSnippet.includes("Categoría:");

    if (isSingleChar) {
      const res = await submitHangmanLetter(remoteJid, senderProfile.jid, trimmed);
      if (res.valid) {
        const senderPhone = senderProfile.phone || senderProfile.primaryName || "Jugador";
        if (res.gameWon) {
          setGameCooldown(remoteJid);
          const winText =
            `🎉 *¡AHORCADO RESUELTO!* 🏆\n\n` +
            `${res.boardDisplay}\n\n` +
            `👑 *¡Ganador:* @${senderPhone} descubrió la última letra y completó la frase: *${res.secretWord}*!\n` +
            `• *Pozo cobrado:* +*$${res.reward?.toLocaleString("es-AR")}* fichas\n` +
            `• *Saldo actual:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas`;

          await sock.sendMessage(
            remoteJid,
            { text: winText, mentions: [senderProfile.jid] },
            { quoted: msg as any }
          );
        } else if (res.gameOver) {
          setGameCooldown(remoteJid);
          const loseText =
            `💀 *FIN DEL JUEGO: EL AHORCADO FUE COMPLETADO* 💀\n\n` +
            `${res.boardDisplay}\n\n` +
            `Se agotaron las 6 vidas del grupo.\n` +
            `La frase secreta era: *${res.secretWord}*.\n` +
            `¡Nadie cobró el pozo esta vez!`;

          await sock.sendMessage(remoteJid, { text: loseText }, { quoted: msg as any });
        } else if (res.isLetterHit) {
          const hitText =
            `✅ *¡Letra "${res.guessedLetter}" encontrada!*\n\n` +
            `${res.boardDisplay}\n\n` +
            `👤 @${senderPhone} sumó +*$${res.letterReward?.toLocaleString("es-AR")}* fichas por acertar.\n` +
            `⏳ _Sigan intentando con \`!ahorcado <letra>\` o \`!arriesgar <frase>\`._`;

          await sock.sendMessage(
            remoteJid,
            { text: hitText, mentions: [senderProfile.jid] },
            { quoted: msg as any }
          );
        } else {
          const missText =
            `❌ *La letra "${res.guessedLetter}" NO está en la frase.*\n\n` +
            `${res.boardDisplay}\n\n` +
            `⚠️ _Se perdió 1 vida. Quedan ${res.livesLeft} de ${res.maxLives} vidas._`;

          await sock.sendMessage(remoteJid, { text: missText }, { quoted: msg as any });
        }
        return true;
      }
    } else if (isQuotedHangman && trimmed.length >= 2) {
      const res = await submitHangmanSolve(remoteJid, senderProfile.jid, trimmed);
      if (res.valid) {
        const senderPhone = senderProfile.phone || senderProfile.primaryName || "Jugador";
        if (res.gameWon) {
          setGameCooldown(remoteJid);
          const winText =
            `🏆 *¡ACIERTO TOTAL EN EL AHORCADO!* 🏆\n\n` +
            `${res.boardDisplay}\n\n` +
            `👑 @${senderPhone} arriesgó y adivinó la frase completa: *${res.secretWord}*!\n` +
            `• *Pozo cobrado:* +*$${res.reward?.toLocaleString("es-AR")}* fichas\n` +
            `• *Saldo actual:* *$${res.newBalance?.toLocaleString("es-AR")}* fichas`;

          await sock.sendMessage(
            remoteJid,
            { text: winText, mentions: [senderProfile.jid] },
            { quoted: msg as any }
          );
        } else if (res.gameOver) {
          setGameCooldown(remoteJid);
          const loseText =
            `💀 *FIN DEL JUEGO: EL AHORCADO FUE COMPLETADO* 💀\n\n` +
            `${res.boardDisplay}\n\n` +
            `El fallo de la solución consumió las últimas vidas del grupo.\n` +
            `La frase secreta era: *${res.secretWord}*.\n` +
            `¡Nadie cobró el pozo esta vez!`;

          await sock.sendMessage(remoteJid, { text: loseText }, { quoted: msg as any });
        } else {
          const errText =
            `${res.error}\n\n` +
            `${res.boardDisplay}\n\n` +
            `⚠️ _Quedan ${res.livesLeft} de ${res.maxLives} vidas._`;

          await sock.sendMessage(remoteJid, { text: errText }, { quoted: msg as any });
        }
        return true;
      }
    }
  }

  return false;
}

