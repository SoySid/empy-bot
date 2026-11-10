import { Command, CommandContext } from "../types.js";

export const juegosCommand: Command = {
  name: "juegos",
  aliases: ["minijuegos", "games", "arcade"],
  description: "Muestra la cartelera con todos los juegos disponibles en el bot, premios y cómo jugarlos.",
  execute: async ({ sock, remoteJid, msg }: CommandContext) => {
    const text =
      `🎮 *CARTELERA DE MINIJUEGOS DE EMPY* 🎮\n\n` +
      `⚡ *1. ¿Quién es este Pokémon?* (\`!pokemon\` o \`!poke\`)\n` +
      `• El bot manda la silueta negra oficial del Pokémon.\n` +
      `• El primero en escribir el nombre en el chat se lleva el premio y lo captura en su \`!pokedex\`.\n` +
      `• *Premio:* *$10.000 a $20.000* fichas.\n\n` +
      `🌍 *2. Banderas del Mundo* (\`!bandera\` o \`!pais\`)\n` +
      `• Trivia de geografía con la bandera oficial y pistas de continente/capital.\n` +
      `• El primero en adivinar el país gana el pozo.\n` +
      `• *Premio:* *$10.000 a $20.000* fichas.\n\n` +
      `🎣 *3. Pesca de Río & Laguna* (\`!pescar\` o \`!pesca\`)\n` +
      `• Tirás la línea con tu caja de carnadas acumulables.\n` +
      `• Hay 30 peces coleccionables para tu \`!acuario\` con pesos y récords.\n` +
      `• Mejorá tu equipo y cañas en la \`!tiendapesca\`.\n` +
      `• *Precios:* Desde *$1.000* (comunes) hasta *$20.000* (trofeos épicos y leyendas).\n\n` +
      `👹 *4. Raid / Boss Grupal* (\`!boss\` | \`!atacar\`)\n` +
      `• Invocan a un monstruo grupal con barra de HP (3.000 a 5.000 de vida).\n` +
      `• Todos cooperan pegando con \`!atacar\` hasta vencerlo.\n` +
      `• *Pozo de botín:* *$15.000 a $20.000* fichas repartidas entre los atacantes.\n\n` +
      `🟩 *5. Wordle Grupal* (\`!wordle\` | \`!palabra <texto>\`)\n` +
      `• Adivinen la palabra secreta de 5 letras en 6 intentos compartidos con emojis 🟩🟨⬛.\n` +
      `• *Premio:* *$100.000 a $200.000* fichas al que acierte la palabra.\n\n` +
      `🪢 *6. El Ahorcado Grupal* (\`!ahorcado\` | \`!arriesgar <frase>\`)\n` +
      `• Descubran la frase secreta por categorías temáticas antes de agotar las 6 vidas.\n` +
      `• Podes tirar letras sueltas (\`!ahorcado a\` o la letra al chat) o la frase entera con \`!arriesgar\`.\n` +
      `• *Micro-bonus:* *$2.000* fichas por letra acertada.\n` +
      `• *Pozo acumulado:* *$50.000 a $120.000* fichas al resolver la frase.\n\n` +
      `🦸 *7. Superhéroes de Cómics & Películas* (\`!superheroe\` o \`!comic\`)\n` +
      `• Adiviná el personaje de Marvel/DC por su imagen pixelada y pistas de bando.\n` +
      `• Colecciónalos en \`!coleccioncomics\`.\n` +
      `• *Premio:* *$10.000 a $20.000* fichas.\n\n` +
      `⚔️ *8. Héroes de Mobile Legends* (\`!mlbb\` o \`!heroe\`)\n` +
      `• Adiviná el héroe de MLBB por su avatar misterioso y pistas de rol/línea.\n` +
      `• Dominá el roster en tu \`!mlbbdex\`.\n` +
      `• *Premio:* *$10.000 a $20.000* fichas.\n\n` +
      `🔫 *9. Ruleta Rusa* (\`!ruletarusa\` o \`!disparar\`)\n` +
      `• Tambor de 6 recámaras y 1 bala. ¿Te animás a apretar el gatillo?\n` +
      `• *Castigo:* Si sale la bala, ¡muerte! El bot te ignora totalmente durante 5 minutos.\n\n` +
      `💣 *10. Campo Minado Grupal* (\`!campominado\`, \`!campo\` o \`!minas [apuesta]\`)\n` +
      `• Tablero 4x4 con 3 minas ocultas y 13 casilleros con diamantes.\n` +
      `• Pisá casilleros con \`!pisar <A1..D4>\` para multiplicar el pozo o retírate con \`!cobrar\`.\n\n` +
      `🍓 *11. Tutti Frutti Multijugador* (\`!tuttifrutti\` o \`!basta\`)\n` +
      `• Sorteo de letra y 7 categorías oficiales con puntuación clásica.\n` +
      `• El primero canta ¡BASTA!, activa 1 min de prórroga y compiten por puntos.\n\n` +
      `🕶️ *12. El Número Ciego* (\`!ciego\` | \`!unirme\` | \`!arriesgar <número>\`)\n` +
      `• Números del 1 al 99 al privado de cada jugador (el tuyo es secreto).\n` +
      `• Debate libre sin interrupciones del bot y deducción con tolerancia ±3.\n` +
      `• *Premios escalonados:* Desde *$10.000* hasta *$50.000* fichas.\n\n` +
      `🎭 *Humor y Generadores:*\n` +
      `• \`!roast\` — Bardeo visual con remate ácido citando una foto o sticker.\n` +
      `• \`!tweet <texto> [@user]\` — Genera una imagen de tweet verificado en modo oscuro.\n` +
      `• \`!dni [@user]\` — Tarjeta de documento argentino con foto y datos humorísticos.\n\n` +
      `🎰 *Casino Clásico:* \`!ruleta\` | \`!slot\` | \`!21\``;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg as any });
  },
};
