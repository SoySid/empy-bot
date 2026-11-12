(() => {
  "use strict";

  const CATEGORIES = [
    "Todas",
    "Voces y Audio",
    "Descargas y Stickers",
    "Generadores y Humor",
    "Utilidades de Grupo",
    "Tiempo Real",
    "Astrología y Tarot",
    "Minijuegos",
    "Economía Urbana",
    "Reacciones",
    "Admin",
  ];

  const COMMANDS = [
    // Voces y Audio (7)
    { name: "!voces", aliases: "!voices, !listarvoces", cat: "Voces y Audio", desc: "Lista todas las voces clonadas y neurales disponibles en el bot." },
    { name: "!decir", aliases: "!say, !hablar, !voz", cat: "Voces y Audio", desc: "Genera una nota de voz gratuita con Edge-TTS (es-AR-TomasNeural) o lee un mensaje citado." },
    { name: "!tomas", aliases: "!chris, !el-tomas, !vozdetomas", cat: "Voces y Audio", desc: "Nota de voz neuronal masculina con ElevenLabs v4 y tags emocionales ([happy], [chuckles], [whispering])." },
    { name: "!<nombre_voz>", aliases: "!messi, !milei, !momo, !miku", cat: "Voces y Audio", desc: "Envía nota de voz PTT OGG Opus con +35 voces Fish Audio y 8 etiquetas de modulación." },
    { name: "!audio", aliases: "!transcribir, !resumir, !t", cat: "Voces y Audio", desc: "Transcribe o resume notas de voz y audios citados usando Whisper Large v3." },
    { name: "!shazam", aliases: "!musica, !cancion, !quees", cat: "Voces y Audio", desc: "Identifica la canción de un audio, nota de voz o video citado por huella acústica." },
    { name: "!letra", aliases: "!lyrics, !letras", cat: "Voces y Audio", desc: "Busca y envía la letra completa de cualquier tema musical mediante LRCLIB." },

    // Descargas y Stickers (4)
    { name: "!descargar", aliases: "!d, !dl, !tt, !x, !fb, !ig", cat: "Descargas y Stickers", desc: "Descarga videos o medios de TikTok, X/Twitter, Facebook, Instagram y enlaces compatibles." },
    { name: "!mp3", aliases: "!ytaudio, !ytmp3, !musica", cat: "Descargas y Stickers", desc: "Extrae y envía el audio en formato MP3 desde enlaces o búsquedas de YouTube." },
    { name: "!s", aliases: "!pegatina, !toimg, !img, !gif", cat: "Descargas y Stickers", desc: "Convierte fotos o videos a sticker WebP con Sharp, o un sticker citado a PNG/MP4." },
    { name: "!sticker", aliases: "!guardarsticker, !addsticker", cat: "Descargas y Stickers", desc: "Guarda stickers citados en PostgreSQL por categoría (bardo, burla, risa, triste, wtf, triggers)." },

    // Generadores y Humor (7)
    { name: "!tweet", aliases: "!faketweet, !tweetfalso", cat: "Generadores y Humor", desc: "Genera una captura simulada de tweet verificado en modo oscuro (admite citar a otro usuario)." },
    { name: "!cronica", aliases: "!placa, !placaroja, !urgente", cat: "Generadores y Humor", desc: "Crea una placa roja urgente estilo Crónica TV con texto propio o mensaje citado." },
    { name: "!dni", aliases: "!carnet, !cedula, !identidad", cat: "Generadores y Humor", desc: "Genera una tarjeta paródica de DNI argentino usando la foto de perfil de WhatsApp." },
    { name: "!mierda", aliases: "!esunamierda, !mileimierda", cat: "Generadores y Humor", desc: "Genera el meme de Milei sentenciando que algo es una mierda (admite --sticker)." },
    { name: "!clave", aliases: "!esclave, !mileiclave", cat: "Generadores y Humor", desc: "Genera el meme cósmico de Milei sentenciando que algo es clave (admite --sticker)." },
    { name: "!roast", aliases: "!quemar, !criticar, !basurear", cat: "Generadores y Humor", desc: "Analiza visualmente una foto o sticker citado y devuelve un remate contextual." },
    { name: "!socrates", aliases: "!filosofo, !mayeutica", cat: "Generadores y Humor", desc: "Examina una frase u opinión citada con ironía socrática y mayéutica punzante." },

    // Utilidades de Grupo (11)
    { name: "!encuesta", aliases: "!poll, !votacion", cat: "Utilidades de Grupo", desc: "Publica una encuesta interactiva nativa de WhatsApp separando opciones con |." },
    { name: "!arbitro", aliases: "!juicio, !tribunal, !veredicto", cat: "Utilidades de Grupo", desc: "Emite un veredicto arbitral analizando el contexto reciente de discusiones del grupo." },
    { name: "!fiscal", aliases: "", cat: "Utilidades de Grupo", desc: "Audita contradicciones y carpetazos buscando declaraciones previas en el archivo pgvector." },
    { name: "!humo", aliases: "!promesas, !apuestas, !vendehumo", cat: "Utilidades de Grupo", desc: "Registra compromisos o apuestas grupales y mantiene el ranking de vende-humo." },
    { name: "!ranking", aliases: "!top, !mensajes", cat: "Utilidades de Grupo", desc: "Muestra el podio diario de mensajes del grupo o el histórico con !ranking total." },
    { name: "!resumen", aliases: "!resumir, !summary", cat: "Utilidades de Grupo", desc: "Sintetiza el flujo reciente del chat o toda la jornada con !resumen hoy." },
    { name: "!tokens", aliases: "!consumo, !uso", cat: "Utilidades de Grupo", desc: "Muestra el recuento de llamadas y cuota consumida de los modelos y APIs." },
    { name: "!cumple", aliases: "!cumpleanos, !aniversario, !bday", cat: "Utilidades de Grupo", desc: "Muestra la fecha oficial de cumpleaños y aniversario de Empy-Bot." },
    { name: "!bug", aliases: "!error, !reportar, !fallo", cat: "Utilidades de Grupo", desc: "Reporta un fallo técnico directamente a la base de datos de seguimiento en Notion." },
    { name: "!idea", aliases: "!sugerencia, !propuesta", cat: "Utilidades de Grupo", desc: "Envía una propuesta de nuevo comando o mejora a la cola de Notion." },
    { name: "!lista", aliases: "!backlog, !tickets, !ideas", cat: "Utilidades de Grupo", desc: "Lista los bugs en seguimiento e ideas activas pendientes en el tablero de Notion." },

    // Tiempo Real (5)
    { name: "!dolar", aliases: "!dólar, !usd, !cotizacion", cat: "Tiempo Real", desc: "Cotizaciones en vivo del dólar argentino vía DolarApi (Oficial, Blue, MEP, Tarjeta, CCL, Cripto)." },
    { name: "!clima", aliases: "!tiempo, !openmeteo", cat: "Tiempo Real", desc: "Temperatura, sensación térmica, humedad y viento mediante Open-Meteo." },
    { name: "!buscar", aliases: "!google, !web, !search", cat: "Tiempo Real", desc: "Búsqueda web en tiempo real para noticias, datos puntuales o consultas abiertas." },
    { name: "!hoy", aliases: "!efemerides, !undiacomohoy", cat: "Tiempo Real", desc: "Efemérides y hechos históricos destacados de la fecha actual vía Wikimedia." },
    { name: "!peli", aliases: "!pelicula, !serie, !tmdb", cat: "Tiempo Real", desc: "Ficha de películas y series con sinopsis, puntaje, año y streaming vía TMDB." },

    // Astrología y Tarot (6)
    { name: "!horoscopo", aliases: "!signo", cat: "Astrología y Tarot", desc: "Pronóstico diario para un signo zodiacal o para el signo guardado en tu perfil." },
    { name: "!astrologia", aliases: "!astro", cat: "Astrología y Tarot", desc: "Análisis astrológico extendido y posiciones planetarias actuales." },
    { name: "!cartaastral", aliases: "!natal", cat: "Astrología y Tarot", desc: "Calcula sol, luna y ascendente reales con astronomy-engine según fecha y hora natal." },
    { name: "!sinastria", aliases: "!compatibilidad", cat: "Astrología y Tarot", desc: "Compara compatibilidad astrológica y sinastría entre dos integrantes del grupo." },
    { name: "!tarot", aliases: "!tirada", cat: "Astrología y Tarot", desc: "Tirada de cartas de tarot con interpretación simbólica contextualizada." },
    { name: "!setcumple", aliases: "!setsigno, !micumple, !misigno", cat: "Astrología y Tarot", desc: "Guarda tu fecha de nacimiento, hora, ciudad o signo en UserFact para cálculos automáticos." },

    // Minijuegos (22)
    { name: "!juegos", aliases: "", cat: "Minijuegos", desc: "Cartelera interactiva con todos los minijuegos activos, reglas y pozos." },
    { name: "!pescar", aliases: "!pesca", cat: "Minijuegos", desc: "Jornada de pesca deportiva para capturar especies de distinto valor y rareza." },
    { name: "!acuario", aliases: "!peces", cat: "Minijuegos", desc: "Muestra tu acuario personal con todos los ejemplares pescados." },
    { name: "!tiendapesca", aliases: "", cat: "Minijuegos", desc: "Catálogo de cañas de pescar y carnadas especiales." },
    { name: "!comprarpesca", aliases: "", cat: "Minijuegos", desc: "Compra cañas o cebos para mejorar las probabilidades y rarezas de pesca." },
    { name: "!pokemon", aliases: "!poke", cat: "Minijuegos", desc: "Ronda de trivia visual para adivinar un Pokémon por su silueta." },
    { name: "!pokedex", aliases: "", cat: "Minijuegos", desc: "Consulta tu Pokédex personal con criaturas capturadas y estadísticas." },
    { name: "!bandera", aliases: "!banderas, !pais", cat: "Minijuegos", desc: "Trivia geográfica para identificar países a partir de su bandera." },
    { name: "!boss", aliases: "!jefe", cat: "Minijuegos", desc: "Muestra vida restante, pozo acumulado y participantes del jefe grupal." },
    { name: "!atacar", aliases: "!pegarboss", cat: "Minijuegos", desc: "Asesta un golpe cooperativo al jefe comunitario para intentar derrotarlo." },
    { name: "!wordle", aliases: "", cat: "Minijuegos", desc: "Inicia o muestra el tablero comunitario de Wordle en español." },
    { name: "!palabra", aliases: "!w", cat: "Minijuegos", desc: "Envía un intento de 5 letras en la partida activa de Wordle." },
    { name: "!superheroe", aliases: "!heroe", cat: "Minijuegos", desc: "Desafío por pistas graduales para adivinar un superhéroe o villano." },
    { name: "!coleccionheroes", aliases: "!misheroes", cat: "Minijuegos", desc: "Álbum personal con los personajes de cómics desbloqueados." },
    { name: "!mlbbquiz", aliases: "!heromlbb", cat: "Minijuegos", desc: "Trivia de habilidades y personajes de Mobile Legends: Bang Bang." },
    { name: "!mlbbdex", aliases: "", cat: "Minijuegos", desc: "Registro personal de héroes de MLBB obtenidos en trivias." },
    { name: "!ahorcado", aliases: "!arriesgar", cat: "Minijuegos", desc: "Ahorcado grupal por categorías temáticas con pozo de fichas." },
    { name: "!ruletarusa", aliases: "!disparar", cat: "Minijuegos", desc: "Juego de supervivencia grupal con tambor de 6 recámaras y 1 bala." },
    { name: "!campominado", aliases: "!campo, !minas, !pisar, !cobrar", cat: "Minijuegos", desc: "Tablero de 16 casilleros con diamantes, minas ocultas y pozo multiplicador." },
    { name: "!tuttifrutti", aliases: "!basta, !tutti", cat: "Minijuegos", desc: "Tutti Frutti multijugador con 7 categorías oficiales, puntaje y ranking." },
    { name: "!ciego", aliases: "!elnumero, !unirme, !arriesgar", cat: "Minijuegos", desc: "Deducción con números secretos enviados al privado, debate y margen ±3." },
    { name: "!impostor", aliases: "!imp, !votar, !terminarimpostor", cat: "Minijuegos", desc: "Deducción social grupal con palabra secreta por privado, 1 impostor y votación abierta." },

    // Economía Urbana (28)
    { name: "!billetera", aliases: "!saldo, !bal", cat: "Economía Urbana", desc: "Muestra saldo, oficio, tier de herramienta, negocios pasivos y energía." },
    { name: "!profesion", aliases: "!oficio, !trabajo", cat: "Economía Urbana", desc: "Elige entre 12 profesiones disponibles o asignación aleatoria." },
    { name: "!laburar", aliases: "!changa, !trabajar", cat: "Economía Urbana", desc: "Realiza una changa de tu oficio con cooldown de 1:30 min (baja a 1:00 min con herramientas)." },
    { name: "!afilar", aliases: "", cat: "Economía Urbana", desc: "Mantiene y afila tus herramientas de trabajo para evitar penalizaciones por desgaste." },
    { name: "!universidad", aliases: "!estudiar, !facultad", cat: "Economía Urbana", desc: "Cursa estudios universitarios para ganar un +25% salarial permanente en tu oficio." },
    { name: "!renunciar", aliases: "!borrartrabajo", cat: "Economía Urbana", desc: "Deja tu oficio actual para elegir una nueva profesión conservando tus herramientas." },
    { name: "!tienda", aliases: "!shop, !almacen", cat: "Economía Urbana", desc: "Catálogo de comida, herramientas por tier, reliquias y negocios pasivos." },
    { name: "!comprar", aliases: "!buy", cat: "Economía Urbana", desc: "Compra consumibles, herramientas o inversiones pasivas de la tienda." },
    { name: "!reclamar", aliases: "!agarrar, !botin", cat: "Economía Urbana", desc: "Recoge recompensas espontáneas que caen durante la actividad del chat." },
    { name: "!asistir", aliases: "!auxilio, !curar", cat: "Economía Urbana", desc: "Atiende una emergencia vecinal ligada a tu profesión para cobrar recompensa." },
    { name: "!comer", aliases: "!morfar, !beber, !tomar", cat: "Economía Urbana", desc: "Consume provisiones o bebidas de tu mochila para recuperar energía." },
    { name: "!alimentar", aliases: "!invitar, !dar, !convidar", cat: "Economía Urbana", desc: "Invita o transfiere comida o bebida de tu inventario a otro integrante." },
    { name: "!inventario", aliases: "!mochila, !inv", cat: "Economía Urbana", desc: "Lista todos los ítems y consumibles guardados en tu mochila." },
    { name: "!diario", aliases: "!daily", cat: "Economía Urbana", desc: "Cobro cada 20 horas: base de $250 más las rentas de tus inversiones pasivas." },
    { name: "!transferir", aliases: "!pagar", cat: "Economía Urbana", desc: "Transfiere fichas de tu billetera a otro miembro del grupo." },
    { name: "!estado", aliases: "!climaglobal", cat: "Economía Urbana", desc: "Muestra los modificadores económicos globales activos en la ciudad." },
    { name: "!escudo", aliases: "", cat: "Economía Urbana", desc: "Compra y activa un escudo temporal contra asaltos de otros miembros." },
    { name: "!robar", aliases: "!asalto", cat: "Economía Urbana", desc: "Intenta un hurto a otro usuario con riesgo de multa económica si fallás." },
    { name: "!21", aliases: "!blackjack", cat: "Economía Urbana", desc: "Inicia una partida de Blackjack apostando fichas contra el bot." },
    { name: "!pedir", aliases: "!hit", cat: "Economía Urbana", desc: "Pide una carta adicional en tu partida activa de Blackjack." },
    { name: "!plantarse", aliases: "!stand", cat: "Economía Urbana", desc: "Se planta con tu mano actual para resolver la partida de Blackjack." },
    { name: "!ruleta", aliases: "", cat: "Economía Urbana", desc: "Apuesta fichas en la ruleta con multiplicadores por color." },
    { name: "!slot", aliases: "!tragamonedas", cat: "Economía Urbana", desc: "Juega en la máquina tragamonedas con combinaciones de pago." },
    { name: "!titulo", aliases: "!chapa", cat: "Economía Urbana", desc: "Compra o asigna un título personalizado visible en tu perfil y changas." },
    { name: "!mutear", aliases: "!silencio, !mute, !callar", cat: "Economía Urbana", desc: "Silencia el grupo durante 1 a 5 minutos pagando con fichas." },
    { name: "!comprarnombre", aliases: "!cambiarnombre, !renombrar", cat: "Economía Urbana", desc: "Cambia el nombre del grupo de WhatsApp pagando $100.000 fichas." },
    { name: "!coima", aliases: "", cat: "Economía Urbana", desc: "Elimina el tiempo de espera para volver a robar pagando una tarifa." },
    { name: "!economia", aliases: "!guiaeco", cat: "Economía Urbana", desc: "Despliega la guía rápida de reglas, tarifas y costos de la economía." },

    // Reacciones (34)
    { name: "!golpear", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de golpe mencionando al integrante objetivo." },
    { name: "!pegar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de cachetazo o golpe ligero hacia otro miembro." },
    { name: "!patada", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de patada mencionando al usuario citado o etiquetado." },
    { name: "!abrazar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía una animación de abrazo grupal o hacia alguien del chat." },
    { name: "!mimos", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación afectuosa de mimos hacia otro participante." },
    { name: "!besar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de beso mencionando al usuario objetivo." },
    { name: "!morder", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de mordida hacia otro integrante del grupo." },
    { name: "!acariciar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de caricia en la cabeza al usuario mencionado." },
    { name: "!chocar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Choca los cinco en bucle animado con otro integrante." },
    { name: "!cosquillas", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de cosquillas mencionando a un miembro." },
    { name: "!lamer", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de lamida hacia el usuario etiquetado." },
    { name: "!molestar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de toque o molestia amistosa a otro miembro." },
    { name: "!pellizcar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación de pellizco hacia el usuario objetivo." },
    { name: "!matar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Envía animación dramática de ataque cómico hacia un miembro." },
    { name: "!llorar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de llanto en el chat." },
    { name: "!triste", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de tristeza o bajón." },
    { name: "!bailar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de baile o festejo." },
    { name: "!reir", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de risa o carcajada." },
    { name: "!dormir", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de sueño o siesta." },
    { name: "!bostezar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de bostezo ante aburrimiento." },
    { name: "!festejar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de celebración en el grupo." },
    { name: "!brindis", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de brindis compartiendo copa." },
    { name: "!enojado", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de enojo o furia." },
    { name: "!confundido", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de desconcierto o duda." },
    { name: "!facepalm", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de llevarse la mano a la cara." },
    { name: "!aplaudir", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de aplausos para otro mensaje." },
    { name: "!correr", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de huida o corrida rápida." },
    { name: "!sonrojar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de sonrojo." },
    { name: "!timido", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de timidez." },
    { name: "!miedo", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de susto o pánico." },
    { name: "!saludar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de saludo al llegar al chat." },
    { name: "!guiño", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada de guiño cómplice." },
    { name: "!fumar", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada fumando." },
    { name: "!comer", aliases: "OtakuGIFs", cat: "Reacciones", desc: "Reacción animada comiendo (GIF en bucle; distinto de economía)." },

    // Admin (21)
    { name: "!darficha", aliases: "!darplata", cat: "Admin", desc: "Acredita saldo a la billetera de un miembro (solo Creador)." },
    { name: "!quitarficha", aliases: "!quitarplata", cat: "Admin", desc: "Descuenta saldo de la billetera de un miembro (solo Creador)." },
    { name: "!vaciar", aliases: "", cat: "Admin", desc: "Deja en cero el saldo de un usuario específico (solo Creador)." },
    { name: "!darescudo", aliases: "!proteger, !escudodivino", cat: "Admin", desc: "Otorga un escudo anti-robo temporal por X horas (solo Creador)." },
    { name: "!quitarescudo", aliases: "!desproteger, !sacarescudo", cat: "Admin", desc: "Remueve el escudo anti-robo activo de un usuario (solo Creador)." },
    { name: "!buff", aliases: "!darbuff, !bendicion", cat: "Admin", desc: "Otorga turnos de buff laboral (+30% de cobro) a un miembro (solo Creador)." },
    { name: "!nerf", aliases: "", cat: "Admin", desc: "Aplica penalización o reducción de rendimiento laboral a un usuario (solo Creador)." },
    { name: "!quitarbuff", aliases: "", cat: "Admin", desc: "Elimina los turnos de buff activos de un usuario (solo Creador)." },
    { name: "!saciar", aliases: "!curarhambre, !llenarpanza", cat: "Admin", desc: "Restaura al 100% el nivel de energía/hambre de un usuario (solo Creador)." },
    { name: "!hambrear", aliases: "!inanicion", cat: "Admin", desc: "Reduce al 0% la energía/hambre de un usuario (solo Creador)." },
    { name: "!daritem", aliases: "", cat: "Admin", desc: "Agrega ítems o consumibles directamente al inventario de un usuario (solo Creador)." },
    { name: "!quitaritem", aliases: "", cat: "Admin", desc: "Retira ítems del inventario de un usuario (solo Creador)." },
    { name: "!congelar", aliases: "", cat: "Admin", desc: "Congela la economía de un miembro bloqueando transacciones y changas (solo Creador)." },
    { name: "!descongelar", aliases: "", cat: "Admin", desc: "Levanta el congelamiento económico de un usuario (solo Creador)." },
    { name: "!inspeccionar", aliases: "!perfiladmin", cat: "Admin", desc: "Muestra el estado completo de un perfil en base de datos (solo Creador)." },
    { name: "!reiniciareco", aliases: "", cat: "Admin", desc: "Restablece los valores económicos iniciales de un usuario (solo Creador)." },
    { name: "!ban", aliases: "!banear, !blockcmd", cat: "Admin", desc: "Bloquea el uso de un comando específico a un usuario citado (solo Creador)." },
    { name: "!unban", aliases: "!desban, !desbanear", cat: "Admin", desc: "Restablece el uso de un comando previamente bloqueado a un usuario (solo Creador)." },
    { name: "!bans", aliases: "!comandosbaneados", cat: "Admin", desc: "Consulta la lista de comandos restringidos para un usuario." },
    { name: "!borraridea", aliases: "!delidea, !eliminaridea", cat: "Admin", desc: "Archiva una sugerencia o reporte de Notion por ID o palabra clave (solo Creador)." },
    { name: "!apagar", aliases: "!shutdown, !off, !apagate", cat: "Admin", desc: "Cierra y apaga el proceso del bot de forma segura (solo Creador)." },
  ];

  const SCENARIOS = {
    memoria: {
      command: "@Empy ¿te acordás quién dijo que no tomaba más fernet?",
      messages: [
        {
          out: true,
          sender: "Colo",
          text: "@Empy ¿te acordás quién dijo que no tomaba más fernet?",
          time: "22:14",
        },
        {
          out: false,
          sender: "Empy-Bot",
          quoteAuthor: "Colo",
          quoteText: "@Empy ¿te acordás quién dijo que no tomaba más fernet?",
          text: "El archivo no miente. Fue *Tincho* el sábado 14 a las 04:12 AM:\n\n_\"Juro por mi viejo que hasta diciembre no toco un vaso de fernet\"_.\n\nSi querés que lo audite formalmente, tirale `!fiscal` respondiendo a su último mensaje.",
          time: "22:14",
        },
      ],
    },
    messi: {
      command: "!messi [enojado] Che, ¿cómo vas a llegar tarde al asado otra vez?",
      messages: [
        {
          out: true,
          sender: "Lucho",
          text: "!messi [enojado] Che, ¿cómo vas a llegar tarde al asado otra vez?",
          time: "22:16",
        },
        {
          out: false,
          sender: "Empy-Bot",
          ptt: {
            tag: "[enojado] · Fish Audio PTT",
            durationSec: 7,
            durationLabel: "0:07",
            transcript: "\"¿Otra vez tarde al asado, hermano? ¡El fuego ya está hecho hace cuarenta minutos! Traé hielo por lo menos.\"",
          },
          time: "22:16",
        },
      ],
    },
    laburar: {
      command: "!laburar",
      messages: [
        {
          out: true,
          sender: "Santi",
          text: "!laburar",
          time: "22:18",
        },
        {
          out: false,
          sender: "Empy-Bot",
          text: "*CHANGA COMPLETADA: PROGRAMADOR*\n\nMetiste un deploy sin romper producción y te acreditaron *$1.480* fichas.\n\n• Bonus Universidad: _+25%_\n• Herramienta Tier 3: _+20% cobro_\n• Energía restante: *78%* · Próximo turno: *1:00 min*",
          time: "22:18",
        },
      ],
    },
    dolar: {
      command: "!dolar",
      messages: [
        {
          out: true,
          sender: "Mati",
          text: "!dolar",
          time: "22:20",
        },
        {
          out: false,
          sender: "Empy-Bot",
          text: "*COTIZACIÓN DÓLAR (ARGENTINA)*\n\n• *Oficial:* Compra *$1.045* | Venta *$1.085*\n• *Blue:* Compra *$1.210* | Venta *$1.230*\n• *MEP:* Compra *$1.182* | Venta *$1.186*\n• *Cripto:* Compra *$1.205* | Venta *$1.218*\n\n_Fuente: DolarApi en tiempo real_",
          time: "22:20",
        },
      ],
    },
    impostor: {
      command: "!impostor",
      messages: [
        {
          out: true,
          sender: "Fede",
          text: "!impostor",
          time: "22:23",
        },
        {
          out: false,
          sender: "Empy-Bot",
          text: "*PARTIDA DE IMPOSTOR INICIADA*\n\nEnvié la palabra secreta por mensaje privado a *5 integrantes* y le asigné el rol de *IMPOSTOR* a 1 jugador.\n\nDebatan en el grupo sin regalar la palabra. Cuando quieran definir usen `!votar @usuario` o `!terminarimpostor`.",
          time: "22:23",
        },
      ],
    },
  };

  const PIPELINE_LAYERS = {
    "1": {
      badge: "CAPA 1 · COSTO $0",
      latency: "Latencia ~0 ms",
      title: "Filtro heurístico local ($0)",
      desc: "Evalúa cada mensaje entrante de Baileys en memoria local. Las menciones directas a @Empy o respuestas a sus mensajes tienen prioridad inmediata; las intervenciones espontáneas descartan risas sueltas (\"jaja\", \"xd\"), emojis aislados y spam respetando un cooldown dinámico.",
      source: "src/services/pipeline/heuristic-filter.ts",
      output: "Capa 2 (Triage) o descarte silencioso",
    },
    "2": {
      badge: "CAPA 2 · TRIAGE RÁPIDO",
      latency: "Latencia ~1 s",
      title: "Triage rápido con Groq (qwen/qwen3.8-27b)",
      desc: "Lee los últimos mensajes del grupo para clasificar la intención real del diálogo: broma, opinión, consejo, chicana, recuerdo o silencio. Si intervenir no suma valor genuino al hilo, el bot elige callar.",
      source: "src/services/pipeline/triage.service.ts",
      output: "Capa 3 (Hidratación RAG) o silencio",
    },
    "3": {
      badge: "CAPA 3 · MEMORIA QUIRÚRGICA",
      latency: "Caché 0 ms + pgvector",
      title: "Hidratación RAG (RAM Cache + pgvector)",
      desc: "Resuelve apodos y perfiles activos al instante desde caché en RAM (user-cache.ts), e inyecta desde Supabase hechos permanentes (UserFact), jerga comunitaria (GroupLexicon) y recuerdos vectoriales semánticos.",
      source: "src/services/pipeline/rag-hydration.service.ts",
      output: "Prompt hidratado hacia Capa 4",
    },
    "4": {
      badge: "CAPA 4 · GENERACIÓN + FALLBACK",
      latency: "Alta disponibilidad",
      title: "Generación con respaldo automático",
      desc: "Genera la respuesta natural con la familia Google Gemini / Gemma (gemma-4-26b-a4b-it, gemini-flash-lite-latest, gemini-3.1-flash-lite). Si se alcanza el límite de cuota, conmuta automáticamente a Groq (qwen/qwen3.8-27b).",
      source: "src/services/pipeline/generator.service.ts",
      output: "Respuesta final en texto o audio PTT",
    },
  };

  const VOICES = {
    famosos: [
      "messi", "milei", "cristina", "momo", "clint", "xocas", "town", "farid", "tini",
      "fernan", "scaloni", "dross", "gaspi", "mda", "rubius", "vegetta", "trump", "closs", "valentino",
    ],
    personajes: [
      "miku", "nana", "angela", "mlbb", "melissa", "paquito", "xborg", "layla", "esmeralda",
      "martis", "claude", "edith", "light", "alonso", "hirara", "brainrot", "alice", "loquendo",
    ],
  };

  // Helpers seguros
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatWhatsAppText(raw) {
    const safe = escapeHtml(raw);
    const withCode = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
    const withBold = withCode.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
    const withItalic = withBold.replace(/_([^_]+)_/g, "<em>$1</em>");
    return withItalic
      .split("\n\n")
      .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  let lastAnnouncedCopy = "";
  const copyTimers = new WeakMap();

  function legacyCopy(text) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    document.body.append(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }

  async function copyTextWithFeedback(text, button, labelEl, defaultLabel) {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = legacyCopy(text);
      }
    } catch {
      ok = legacyCopy(text);
    }

    clearTimeout(copyTimers.get(button));
    button.removeAttribute("data-copied");
    button.removeAttribute("data-failed");
    void button.offsetWidth;
    button.setAttribute(ok ? "data-copied" : "data-failed", "");

    if (labelEl) {
      labelEl.textContent = ok ? "Copiado" : "Error";
    }

    const liveRegion = document.getElementById("copyLiveRegion");
    if (liveRegion) {
      let msg = ok ? `Copiado ${text}` : "No se pudo copiar el comando";
      if (msg === lastAnnouncedCopy) msg += "\u00A0";
      lastAnnouncedCopy = msg;
      liveRegion.textContent = msg;
    }

    copyTimers.set(
      button,
      setTimeout(() => {
        button.removeAttribute("data-copied");
        button.removeAttribute("data-failed");
        if (labelEl) labelEl.textContent = defaultLabel;
      }, 1500)
    );
  }

  // 1. Estado real desde /health
  async function fetchServerHealth() {
    const pill = document.getElementById("serverStatusPill");
    const textEl = document.getElementById("serverStatusText");
    const heroUptime = document.getElementById("heroUptime");
    const simBotState = document.getElementById("simBotState");

    if (!pill || !textEl) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch("/health", { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP error");
      const data = await res.json();

      pill.classList.remove("is-connected", "is-suspended", "is-demo");

      if (data.connected && !data.suspended) {
        pill.classList.add("is-connected");
        textEl.textContent = `En línea · ${data.uptime || "0s"}`;
        if (heroUptime) heroUptime.textContent = data.uptime || "Activo";
        if (simBotState) simBotState.textContent = "Empy-Bot · conectado en vivo";
      } else if (data.suspended) {
        pill.classList.add("is-suspended");
        textEl.textContent = "Bot suspendido";
        if (heroUptime) heroUptime.textContent = data.uptime || "Pausado";
        if (simBotState) simBotState.textContent = "Empy-Bot · suspendido";
      } else {
        pill.classList.add("is-demo");
        textEl.textContent = "En espera de conexión";
        if (heroUptime) heroUptime.textContent = data.uptime || "Esperando QR";
        if (simBotState) simBotState.textContent = "Empy-Bot · demo interactiva";
      }
    } catch {
      clearTimeout(timer);
      pill.classList.remove("is-connected", "is-suspended");
      pill.classList.add("is-demo");
      textEl.textContent = "Demo interactiva";
      if (heroUptime) heroUptime.textContent = "Modo demo";
      if (simBotState) simBotState.textContent = "Empy-Bot · demo interactiva";
    }
  }

  // 2. Simulador WhatsApp + Audio PTT
  function initSimulator() {
    const tabs = Array.from(document.querySelectorAll(".scenario-chip[data-scenario]"));
    const chatBody = document.getElementById("waChatBody");
    const activeCmdEl = document.getElementById("waActiveCmd");
    const replayBtn = document.getElementById("waReplayBtn");
    const copyTrigger = document.getElementById("simCopyTrigger");
    const copyLabel = document.getElementById("simCopyLabel");

    if (!tabs.length || !chatBody) return;

    let currentScenarioKey = "memoria";
    let pttTimer = null;
    let pttPlaying = false;

    function stopPtt() {
      if (pttTimer) {
        clearInterval(pttTimer);
        pttTimer = null;
      }
      pttPlaying = false;
    }

    function renderScenario(key, autoPlayPtt = false) {
      stopPtt();
      currentScenarioKey = key;
      const scenario = SCENARIOS[key];
      if (!scenario) return;

      tabs.forEach((tab) => {
        const selected = tab.dataset.scenario === key;
        tab.setAttribute("aria-selected", String(selected));
      });

      if (activeCmdEl) {
        activeCmdEl.textContent = scenario.command;
      }

      chatBody.innerHTML = "";

      scenario.messages.forEach((msg, index) => {
        const article = document.createElement("article");
        article.className = `wa-msg ${msg.out ? "wa-msg-out" : "wa-msg-in"} is-entering`;
        article.style.animationDelay = `${index * 90}ms`;

        const sender = document.createElement("div");
        sender.className = "wa-sender";
        sender.textContent = msg.sender;
        article.appendChild(sender);

        if (msg.quoteAuthor) {
          const quote = document.createElement("div");
          quote.className = "wa-quote";
          const qa = document.createElement("span");
          qa.className = "wa-quote-author";
          qa.textContent = msg.quoteAuthor;
          const qt = document.createElement("span");
          qt.textContent = msg.quoteText;
          quote.append(qa, qt);
          article.appendChild(quote);
        }

        if (msg.ptt) {
          const pttWrap = document.createElement("div");
          pttWrap.className = "wa-ptt";

          const tag = document.createElement("span");
          tag.className = "wa-ptt-tag";
          tag.textContent = msg.ptt.tag;
          pttWrap.appendChild(tag);

          const player = document.createElement("div");
          player.className = "wa-ptt-player";

          const playBtn = document.createElement("button");
          playBtn.type = "button";
          playBtn.className = "wa-play-btn";
          playBtn.setAttribute("aria-label", "Reproducir nota de voz simulada");

          const playSvg =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
          const pauseSvg =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
          playBtn.innerHTML = playSvg;

          const barsWrap = document.createElement("div");
          barsWrap.className = "wa-wave-bars";
          barsWrap.setAttribute("aria-hidden", "true");
          const barHeights = [35, 62, 48, 88, 72, 40, 95, 65, 52, 84, 70, 44, 92, 60, 76, 38, 86, 68, 50, 90, 56, 42];
          const barEls = barHeights.map((h, i) => {
            const b = document.createElement("span");
            b.className = "wa-bar";
            b.style.height = `${h}%`;
            b.style.animationDelay = `${(i % 5) * 70}ms`;
            barsWrap.appendChild(b);
            return b;
          });

          const timeEl = document.createElement("span");
          timeEl.className = "wa-ptt-time tabular";
          timeEl.textContent = msg.ptt.durationLabel;

          player.append(playBtn, barsWrap, timeEl);
          pttWrap.appendChild(player);

          const transcript = document.createElement("div");
          transcript.className = "wa-transcript";
          const tLabel = document.createElement("span");
          tLabel.className = "wa-transcript-label";
          tLabel.textContent = "Transcripción generada:";
          const tBody = document.createElement("span");
          tBody.textContent = msg.ptt.transcript;
          transcript.append(tLabel, tBody);
          pttWrap.appendChild(transcript);

          let elapsed = 0;
          const total = msg.ptt.durationSec;

          function updateBars(progressRatio) {
            const activeCount = Math.round(progressRatio * barEls.length);
            barEls.forEach((b, idx) => {
              b.classList.toggle("is-played", idx < activeCount);
            });
          }

          function startPlayback() {
            if (pttPlaying) {
              stopPtt();
              pttWrap.classList.remove("is-playing");
              playBtn.innerHTML = playSvg;
              playBtn.setAttribute("aria-label", "Reproducir nota de voz simulada");
              return;
            }
            if (elapsed >= total) elapsed = 0;
            pttPlaying = true;
            pttWrap.classList.add("is-playing");
            playBtn.innerHTML = pauseSvg;
            playBtn.setAttribute("aria-label", "Pausar nota de voz simulada");

            pttTimer = setInterval(() => {
              elapsed += 0.25;
              const ratio = Math.min(1, elapsed / total);
              updateBars(ratio);
              const sec = Math.min(total, Math.floor(elapsed));
              timeEl.textContent = `0:0${sec}`;
              if (elapsed >= total) {
                stopPtt();
                pttWrap.classList.remove("is-playing");
                playBtn.innerHTML = playSvg;
                playBtn.setAttribute("aria-label", "Reproducir nota de voz simulada");
                timeEl.textContent = msg.ptt.durationLabel;
              }
            }, 250);
          }

          playBtn.addEventListener("click", startPlayback);
          article.appendChild(pttWrap);

          if (autoPlayPtt) {
            setTimeout(() => startPlayback(), 220);
          }
        } else {
          const textDiv = document.createElement("div");
          textDiv.className = "wa-text";
          textDiv.innerHTML = formatWhatsAppText(msg.text);
          article.appendChild(textDiv);
        }

        const meta = document.createElement("div");
        meta.className = "wa-meta tabular";
        const timeSpan = document.createElement("span");
        timeSpan.textContent = msg.time;
        meta.appendChild(timeSpan);
        if (msg.out) {
          const ticks = document.createElement("span");
          ticks.className = "wa-ticks";
          ticks.setAttribute("aria-label", "Leído");
          ticks.innerHTML =
            '<svg width="16" height="10" viewBox="0 0 18 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 5.5 4.2 8.8 10.5 2"/><path d="M6.5 5.5 9.7 8.8 16 2"/></svg>';
          meta.appendChild(ticks);
        }
        article.appendChild(meta);
        chatBody.appendChild(article);
      });
    }

    tabs.forEach((tab, idx) => {
      tab.addEventListener("click", () => {
        renderScenario(tab.dataset.scenario, tab.dataset.scenario === "messi");
        tab.scrollIntoView({ block: "nearest", inline: "nearest" });
      });

      tab.addEventListener("keydown", (e) => {
        let nextIdx = -1;
        if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
        else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") nextIdx = 0;
        else if (e.key === "End") nextIdx = tabs.length - 1;

        if (nextIdx >= 0) {
          e.preventDefault();
          const nextTab = tabs[nextIdx];
          nextTab.focus();
          renderScenario(nextTab.dataset.scenario, false);
          nextTab.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      });
    });

    if (replayBtn) {
      replayBtn.addEventListener("click", () => {
        renderScenario(currentScenarioKey, currentScenarioKey === "messi");
      });
    }

    if (copyTrigger) {
      copyTrigger.addEventListener("click", () => {
        const cmd = SCENARIOS[currentScenarioKey]?.command || "";
        if (cmd) copyTextWithFeedback(cmd, copyTrigger, copyLabel, "Copiar");
      });
    }

    renderScenario("memoria", false);
  }

  // 3. Diagrama interactivo de 4 capas
  function initPipeline() {
    const stepBtns = Array.from(document.querySelectorAll(".pipeline-step[data-layer]"));
    const badge = document.getElementById("layerBadge");
    const latency = document.getElementById("layerLatency");
    const title = document.getElementById("layerTitle");
    const desc = document.getElementById("layerDesc");
    const source = document.getElementById("layerSource");
    const output = document.getElementById("layerOutput");

    if (!stepBtns.length) return;

    function selectLayer(layerKey) {
      const data = PIPELINE_LAYERS[layerKey];
      if (!data) return;

      stepBtns.forEach((btn) => {
        const active = btn.dataset.layer === layerKey;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", String(active));
      });

      if (badge) badge.textContent = data.badge;
      if (latency) latency.textContent = data.latency;
      if (title) title.textContent = data.title;
      if (desc) desc.textContent = data.desc;
      if (source) source.textContent = data.source;
      if (output) output.textContent = data.output;
    }

    stepBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => selectLayer(btn.dataset.layer));
      btn.addEventListener("keydown", (e) => {
        let next = -1;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % stepBtns.length;
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + stepBtns.length) % stepBtns.length;
        if (next >= 0) {
          e.preventDefault();
          stepBtns[next].focus();
          selectLayer(stepBtns[next].dataset.layer);
        }
      });
    });
  }

  // 4. Constructor de Voces & Modulación
  function initVoiceComposer() {
    const groupTabs = Array.from(document.querySelectorAll(".vg-tab[data-voice-group]"));
    const chipsContainer = document.getElementById("voiceChipsContainer");
    const modChips = Array.from(document.querySelectorAll(".mod-chip[data-mod]"));
    const previewEl = document.getElementById("composedVoicePreview");
    const copyBtn = document.getElementById("copyComposedVoice");
    const copyLabel = document.getElementById("composedVoiceLabel");

    if (!chipsContainer || !previewEl) return;

    let activeGroup = "famosos";
    let selectedVoice = "messi";
    let selectedMod = "[enojado]";

    function updatePreview() {
      const modPart = selectedMod ? ` ${selectedMod}` : "";
      previewEl.textContent = `!${selectedVoice}${modPart} Che, ¿viste lo que puso el fiscal recién?`;
    }

    function renderVoices() {
      const list = VOICES[activeGroup] || [];
      chipsContainer.innerHTML = "";
      list.forEach((v) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `voice-chip${v === selectedVoice ? " is-selected" : ""}`;
        btn.textContent = `!${v}`;
        btn.addEventListener("click", () => {
          selectedVoice = v;
          renderVoices();
          updatePreview();
        });
        chipsContainer.appendChild(btn);
      });
    }

    groupTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        activeGroup = tab.dataset.voiceGroup;
        groupTabs.forEach((t) => {
          const isAct = t === tab;
          t.classList.toggle("is-active", isAct);
          t.setAttribute("aria-selected", String(isAct));
        });
        if (!(VOICES[activeGroup] || []).includes(selectedVoice)) {
          selectedVoice = VOICES[activeGroup][0];
        }
        renderVoices();
        updatePreview();
      });
    });

    modChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const tag = chip.dataset.mod;
        selectedMod = selectedMod === tag ? "" : tag;
        modChips.forEach((c) => c.classList.toggle("is-selected", c.dataset.mod === selectedMod));
        updatePreview();
      });
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyTextWithFeedback(previewEl.textContent.trim(), copyBtn, copyLabel, "Copiar comando");
      });
    }

    renderVoices();
    updatePreview();
  }

  // 5. Explorador del Catálogo de 145 Comandos
  function initCommandCatalog() {
    const searchInput = document.getElementById("commandSearch");
    const clearBtn = document.getElementById("searchClear");
    const tablist = document.getElementById("categoryTablist");
    const grid = document.getElementById("commandsGrid");
    const summary = document.getElementById("catalogSummary");
    const footer = document.getElementById("catalogFooter");
    const toggleAllBtn = document.getElementById("toggleAllBtn");

    if (!tablist || !grid || !searchInput) return;

    const DEFAULT_LIMIT = 18;
    let activeCat = "Todas";
    let showAllInTodas = false;
    let query = "";

    function getCategoryCount(cat) {
      if (cat === "Todas") return COMMANDS.length;
      return COMMANDS.filter((c) => c.cat === cat).length;
    }

    function renderTabs() {
      tablist.innerHTML = "";
      CATEGORIES.forEach((cat, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cat-tab";
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", String(cat === activeCat));
        btn.dataset.cat = cat;

        const labelSpan = document.createElement("span");
        labelSpan.textContent = cat;
        const countSpan = document.createElement("span");
        countSpan.className = "cat-count tabular";
        countSpan.textContent = String(getCategoryCount(cat));

        btn.append(labelSpan, countSpan);

        btn.addEventListener("click", () => {
          activeCat = cat;
          renderTabs();
          renderCommands();
          const activeEl = tablist.querySelector('[aria-selected="true"]');
          if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        });

        btn.addEventListener("keydown", (e) => {
          const allTabs = Array.from(tablist.querySelectorAll(".cat-tab"));
          let nextIdx = -1;
          if (e.key === "ArrowRight") nextIdx = (idx + 1) % allTabs.length;
          else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + allTabs.length) % allTabs.length;
          else if (e.key === "Home") nextIdx = 0;
          else if (e.key === "End") nextIdx = allTabs.length - 1;

          if (nextIdx >= 0) {
            e.preventDefault();
            activeCat = CATEGORIES[nextIdx];
            renderTabs();
            renderCommands();
            const focused = tablist.querySelectorAll(".cat-tab")[nextIdx];
            if (focused) {
              focused.focus();
              focused.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
          }
        });

        tablist.appendChild(btn);
      });
    }

    function normalizeStr(s) {
      return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    }

    function renderCommands() {
      const q = normalizeStr(query.trim());
      if (clearBtn) clearBtn.hidden = q.length === 0;

      const filtered = COMMANDS.filter((cmd) => {
        const matchesCat = activeCat === "Todas" || cmd.cat === activeCat;
        if (!matchesCat) return false;
        if (!q) return true;
        const haystack = normalizeStr(`${cmd.name} ${cmd.aliases} ${cmd.desc} ${cmd.cat}`);
        return haystack.includes(q);
      });

      const shouldLimit = activeCat === "Todas" && !q && !showAllInTodas;
      const visible = shouldLimit ? filtered.slice(0, DEFAULT_LIMIT) : filtered;

      if (summary) {
        if (filtered.length === 0) {
          summary.textContent = "0 resultados";
        } else if (shouldLimit) {
          summary.textContent = `Mostrando ${visible.length} de ${COMMANDS.length} comandos`;
        } else {
          summary.textContent = `${filtered.length} ${filtered.length === 1 ? "comando" : "comandos"}${activeCat !== "Todas" ? ` en ${activeCat}` : ""}`;
        }
      }

      if (footer && toggleAllBtn) {
        const showFooter = activeCat === "Todas" && !q && filtered.length > DEFAULT_LIMIT;
        footer.hidden = !showFooter;
        toggleAllBtn.textContent = showAllInTodas
          ? "Contraer catálogo"
          : `Ver los ${COMMANDS.length} comandos completos`;
      }

      grid.innerHTML = "";

      if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "commands-empty";
        empty.textContent = `No encontramos comandos que coincidan con "${query}". Probá con otra palabra o limpiá el filtro.`;
        grid.appendChild(empty);
        return;
      }

      const fragment = document.createDocumentFragment();

      visible.forEach((cmd) => {
        const card = document.createElement("article");
        card.className = "cmd-card";

        const top = document.createElement("div");
        top.className = "cmd-top";

        const code = document.createElement("code");
        code.className = "cmd-name";
        code.textContent = cmd.name;

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "cmd-copy";
        copyBtn.setAttribute("aria-label", `Copiar comando ${cmd.name}`);

        const copyText = document.createElement("span");
        copyText.textContent = "Copiar";
        copyBtn.appendChild(copyText);

        copyBtn.addEventListener("click", () => {
          copyTextWithFeedback(cmd.name, copyBtn, copyText, "Copiar");
        });

        top.append(code, copyBtn);

        const desc = document.createElement("p");
        desc.className = "cmd-desc";
        desc.textContent = cmd.desc;

        const meta = document.createElement("div");
        meta.className = "cmd-meta";

        const aliases = document.createElement("span");
        aliases.className = "cmd-aliases";
        aliases.textContent = !cmd.aliases ? "Sin alias" : `Alias: ${cmd.aliases}`;

        const catTag = document.createElement("span");
        catTag.className = "cmd-cat-tag";
        catTag.textContent = cmd.cat;

        meta.append(aliases, catTag);
        card.append(top, desc, meta);
        fragment.appendChild(card);
      });

      grid.appendChild(fragment);
    }

    searchInput.addEventListener("input", () => {
      query = searchInput.value;
      renderCommands();
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        query = "";
        searchInput.focus();
        renderCommands();
      });
    }

    if (toggleAllBtn) {
      toggleAllBtn.addEventListener("click", () => {
        showAllInTodas = !showAllInTodas;
        renderCommands();
      });
    }

    renderTabs();
    renderCommands();
  }

  // 6. Menú móvil accesible
  function initMobileMenu() {
    const toggle = document.getElementById("menuToggle");
    const drawer = document.getElementById("mobileNav");
    if (!toggle || !drawer) return;

    function setOpen(open) {
      drawer.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú de navegación" : "Abrir menú de navegación");
    }

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      setOpen(!isOpen);
    });

    drawer.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // Inicialización
  document.addEventListener("DOMContentLoaded", () => {
    initMobileMenu();
    initSimulator();
    initPipeline();
    initVoiceComposer();
    initCommandCatalog();
    fetchServerHealth();
  });
})();
