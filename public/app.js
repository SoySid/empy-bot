(() => {
  "use strict";

  document.documentElement.classList.add("js");

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
      fact: "Recupera hechos guardados (UserFact) y recuerdos vectoriales con pgvector en Supabase sin inventar datos.",
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
          text: "El archivo no miente. Fue *Tincho* el sábado 14 a las 04:12 AM:\n\n_\"Juro por mi viejo que hasta diciembre no toco un vaso de fernet\"_.\n\nSi querés que lo audite formalmente, tirale `!fiscal` respondiendo a su último mensaje.",
          time: "22:14",
        },
      ],
    },
    messi: {
      command: "!messi [enojado] Che, ¿cómo vas a llegar tarde al asado otra vez?",
      fact: "Genera una nota de voz OGG Opus nativa mediante Fish Audio y FFmpeg aplicando la modulación [enojado].",
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
            durationLabel: "0:07",
            transcript: "\"¿Otra vez tarde al asado, hermano? ¡El fuego ya está hecho hace cuarenta minutos! Traé hielo por lo menos.\"",
          },
          time: "22:16",
        },
      ],
    },
    laburar: {
      command: "!laburar",
      fact: "Ejecuta transacciones atómicas en Prisma PostgreSQL combinando profesión, título universitario (+25%) y herramientas.",
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
      fact: "Consulta en tiempo real las cotizaciones argentinas vía DolarApi (Oficial, Blue, MEP, Tarjeta, CCL y Cripto).",
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
      fact: "Reparte la palabra secreta por mensaje privado a cada jugador, asigna 1 impostor y abre votación en el grupo.",
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

  const VOICES = [
    "messi", "milei", "cristina", "momo", "clint", "xocas", "town", "farid", "tini",
    "fernan", "scaloni", "dross", "gaspi", "mda", "rubius", "vegetta", "trump", "closs", "valentino",
    "miku", "nana", "angela", "mlbb", "melissa", "paquito", "xborg", "layla", "esmeralda",
    "martis", "claude", "edith", "light", "alonso", "hirara", "brainrot", "alice", "loquendo",
  ];

  const MOD_TAGS = [
    "[enojado]", "[cantando]", "[grito]", "[susurro]",
    "[triste]", "[risa]", "[rapido]", "[lento]",
  ];

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

    if (labelEl) labelEl.textContent = ok ? "Copiado" : "Error";

    const liveRegion = document.getElementById("copyLiveRegion");
    if (liveRegion) {
      let msg = ok ? `Copiado ${text}` : "No se pudo copiar";
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

  // 1. Reveals suaves al hacer scroll
  function initReveals() {
    const targets = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    targets.forEach((el) => io.observe(el));
  }

  // 2. Estado vivo desde /health
  async function fetchServerHealth() {
    const textEl = document.getElementById("serverStatusText");
    const heroUptime = document.getElementById("heroUptime");
    if (!textEl) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch("/health", { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP error");
      const data = await res.json();

      if (data.connected && !data.suspended) {
        textEl.textContent = `En línea · ${data.uptime || "0s"}`;
        if (heroUptime) heroUptime.textContent = data.uptime || "Activo";
      } else if (data.suspended) {
        textEl.textContent = "Suspendido";
        if (heroUptime) heroUptime.textContent = "Pausado";
      } else {
        textEl.textContent = "En espera de QR";
        if (heroUptime) heroUptime.textContent = data.uptime || "Listo";
      }
    } catch {
      clearTimeout(timer);
      textEl.textContent = "Demo local";
      if (heroUptime) heroUptime.textContent = "Modo demo";
    }
  }

  // 3. Menú móvil
  function initMobileNav() {
    const toggle = document.getElementById("menuToggle");
    const nav = document.getElementById("mobileNav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const isOpen = !nav.hidden;
      nav.hidden = isOpen;
      toggle.setAttribute("aria-expanded", String(!isOpen));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // 4. Simulador de WhatsApp
  function initSimulator() {
    const buttons = Array.from(document.querySelectorAll(".scenario-btn[data-scenario]"));
    const feed = document.getElementById("waChatFeed");
    const cmdEl = document.getElementById("waActiveCmd");
    const factEl = document.getElementById("scenarioFact");
    const copyBtn = document.getElementById("simCopyTrigger");
    const copyLabel = document.getElementById("simCopyLabel");

    if (!buttons.length || !feed) return;
    let activeKey = "memoria";

    function renderScenario(key) {
      const scenario = SCENARIOS[key];
      if (!scenario) return;
      activeKey = key;

      buttons.forEach((btn) => {
        btn.setAttribute("aria-selected", String(btn.dataset.scenario === key));
      });

      if (cmdEl) cmdEl.textContent = scenario.command;
      if (factEl) factEl.textContent = scenario.fact;
      feed.innerHTML = "";

      scenario.messages.forEach((msg) => {
        const bubble = document.createElement("div");
        bubble.className = `wa-bubble ${msg.out ? "wa-out" : "wa-in"}`;

        const sender = document.createElement("span");
        sender.className = "wa-sender";
        sender.textContent = msg.sender;
        bubble.appendChild(sender);

        if (msg.ptt) {
          const pttWrap = document.createElement("div");
          pttWrap.className = "wa-ptt-box";

          const controls = document.createElement("div");
          controls.className = "wa-ptt-controls";

          const playBtn = document.createElement("button");
          playBtn.type = "button";
          playBtn.className = "wa-ptt-play";
          playBtn.setAttribute("aria-label", "Reproducir nota de voz simulada");
          playBtn.textContent = "Oír";

          const track = document.createElement("div");
          track.className = "wa-ptt-track";
          const fill = document.createElement("div");
          fill.className = "wa-ptt-fill";
          track.appendChild(fill);

          const dur = document.createElement("span");
          dur.className = "wa-time nums";
          dur.textContent = msg.ptt.durationLabel;

          controls.append(playBtn, track, dur);

          const tag = document.createElement("span");
          tag.className = "wa-time";
          tag.textContent = msg.ptt.tag;

          const transcript = document.createElement("p");
          transcript.className = "wa-ptt-transcript";
          transcript.textContent = msg.ptt.transcript;

          playBtn.addEventListener("click", () => {
            pttWrap.classList.remove("is-playing");
            void pttWrap.offsetWidth;
            pttWrap.classList.add("is-playing");
            playBtn.textContent = "Pausa";
            setTimeout(() => {
              playBtn.textContent = "Oír";
            }, 2200);
          });

          pttWrap.append(controls, tag, transcript);
          bubble.appendChild(pttWrap);
        } else {
          const body = document.createElement("div");
          body.innerHTML = formatWhatsAppText(msg.text);
          bubble.appendChild(body);
        }

        const time = document.createElement("span");
        time.className = "wa-time nums";
        time.textContent = msg.time;
        bubble.appendChild(time);

        feed.appendChild(bubble);
      });
    }

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => renderScenario(btn.dataset.scenario));
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const scenario = SCENARIOS[activeKey];
        if (scenario) copyTextWithFeedback(scenario.command, copyBtn, copyLabel, "Copiar");
      });
    }

    renderScenario("memoria");
  }

  // 5. Acordeón de Pipeline de 4 Capas
  function initAccordion() {
    const panels = Array.from(document.querySelectorAll("#pipelineAccordion .acc-panel"));
    if (!panels.length) return;

    panels.forEach((panel) => {
      const trigger = panel.querySelector(".acc-trigger");
      if (!trigger) return;

      trigger.addEventListener("click", () => {
        panels.forEach((p) => {
          const active = p === panel;
          p.classList.toggle("is-open", active);
          const btn = p.querySelector(".acc-trigger");
          if (btn) btn.setAttribute("aria-expanded", String(active));
        });
      });
    });
  }

  // 6. Armador de comando de voz
  function initVoiceBuilder() {
    const voiceList = document.getElementById("voiceList");
    const modList = document.getElementById("modTagList");
    const preview = document.getElementById("voiceCommandPreview");
    const copyBtn = document.getElementById("copyVoiceCmd");
    const copyLabel = document.getElementById("copyVoiceLabel");

    if (!voiceList || !modList || !preview) return;

    let selectedVoice = "messi";
    let selectedTag = "[enojado]";
    const sampleText = "Che, ¿a qué hora caen al asado?";

    function updatePreview() {
      const parts = [`!${selectedVoice}`];
      if (selectedTag) parts.push(selectedTag);
      parts.push(sampleText);
      preview.textContent = parts.join(" ");
    }

    VOICES.forEach((voice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn";
      btn.textContent = `!${voice}`;
      btn.setAttribute("aria-pressed", String(voice === selectedVoice));
      btn.addEventListener("click", () => {
        selectedVoice = voice;
        voiceList.querySelectorAll(".chip-btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        updatePreview();
      });
      voiceList.appendChild(btn);
    });

    MOD_TAGS.forEach((tag) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn";
      btn.textContent = tag;
      btn.setAttribute("aria-pressed", String(tag === selectedTag));
      btn.addEventListener("click", () => {
        const next = selectedTag === tag ? "" : tag;
        selectedTag = next;
        modList.querySelectorAll(".chip-btn").forEach((b) => {
          b.setAttribute("aria-pressed", String(b.textContent === selectedTag));
        });
        updatePreview();
      });
      modList.appendChild(btn);
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyTextWithFeedback(preview.textContent || "", copyBtn, copyLabel, "Copiar comando");
      });
    }

    updatePreview();
  }

  // 7. Explorador de los 145 comandos
  function initCatalog() {
    const tabsContainer = document.getElementById("categoryTabs");
    const searchInput = document.getElementById("cmdSearch");
    const grid = document.getElementById("commandsGrid");
    const countEl = document.getElementById("catalogCount");
    const footer = document.getElementById("catalogFooter");
    const toggleBtn = document.getElementById("toggleAllBtn");

    if (!tabsContainer || !grid) return;

    let activeCategory = "Todas";
    let showAll = false;
    const INITIAL_LIMIT = 18;

    CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-tab";
      btn.role = "tab";
      btn.textContent = cat;
      btn.setAttribute("aria-selected", String(cat === activeCategory));
      btn.addEventListener("click", () => {
        activeCategory = cat;
        showAll = false;
        tabsContainer.querySelectorAll(".cat-tab").forEach((t) => {
          t.setAttribute("aria-selected", String(t.textContent === cat));
        });
        btn.scrollIntoView({ block: "nearest", inline: "nearest" });
        render();
      });
      tabsContainer.appendChild(btn);
    });

    function render() {
      const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
      const filtered = COMMANDS.filter((c) => {
        const matchCat = activeCategory === "Todas" || c.cat === activeCategory;
        if (!matchCat) return false;
        if (!query) return true;
        return (
          c.name.toLowerCase().includes(query) ||
          c.aliases.toLowerCase().includes(query) ||
          c.desc.toLowerCase().includes(query) ||
          c.cat.toLowerCase().includes(query)
        );
      });

      const isDefaultUnfiltered = activeCategory === "Todas" && !query && !showAll;
      const visible = isDefaultUnfiltered ? filtered.slice(0, INITIAL_LIMIT) : filtered;

      if (countEl) {
        countEl.textContent =
          filtered.length === COMMANDS.length && isDefaultUnfiltered
            ? `Mostrando ${visible.length} de ${COMMANDS.length} comandos`
            : `${filtered.length} ${filtered.length === 1 ? "comando" : "comandos"}`;
      }

      if (footer) {
        footer.hidden = !(activeCategory === "Todas" && !query && filtered.length > INITIAL_LIMIT);
      }
      if (toggleBtn) {
        toggleBtn.textContent = showAll
          ? "Mostrar resumen inicial"
          : `Ver los ${COMMANDS.length} comandos completos`;
      }

      grid.innerHTML = "";
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "commands-empty";
        empty.textContent = "No hay comandos que coincidan con esa búsqueda.";
        grid.appendChild(empty);
        return;
      }

      const frag = document.createDocumentFragment();
      visible.forEach((cmd) => {
        const row = document.createElement("article");
        row.className = "cmd-row";

        const top = document.createElement("div");
        top.className = "cmd-top";

        const nameEl = document.createElement("code");
        nameEl.className = "cmd-name";
        nameEl.textContent = cmd.name;

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "cmd-copy";
        const copyText = document.createElement("span");
        copyText.textContent = "Copiar";
        copyBtn.appendChild(copyText);
        copyBtn.addEventListener("click", () => {
          copyTextWithFeedback(cmd.name, copyBtn, copyText, "Copiar");
        });

        top.append(nameEl, copyBtn);

        const descEl = document.createElement("p");
        descEl.className = "cmd-desc";
        descEl.textContent = cmd.desc;

        const metaEl = document.createElement("span");
        metaEl.className = "cmd-meta";
        metaEl.textContent = cmd.aliases ? `${cmd.cat} · Alias: ${cmd.aliases}` : cmd.cat;

        row.append(top, descEl, metaEl);
        frag.appendChild(row);
      });

      grid.appendChild(frag);
    }

    if (searchInput) {
      searchInput.addEventListener("input", render);
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        showAll = !showAll;
        render();
      });
    }

    render();
  }

  initReveals();
  fetchServerHealth();
  initMobileNav();
  initSimulator();
  initAccordion();
  initVoiceBuilder();
  initCatalog();
})();
