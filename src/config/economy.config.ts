/**
 * Configuración desacoplada del Sistema de Economía Gamificada y Motor Combinatorio de empy-bot.
 */

export type ProfessionType =
  | "mecanico"
  | "enfermero"
  | "modelo"
  | "programador"
  | "albanil"
  | "preventista"
  | "recepcionista"
  | "espia"
  | "manicura"
  | "tatuadora"
  | "macumbero"
  | "profesora_especial";

export interface ProfessionMetadata {
  id: ProfessionType;
  name: string;
  icon: string;
  category: JobCategory;
  aliases: string[];
  description: string;
}

export const PROFESSIONS: Record<ProfessionType, ProfessionMetadata> = {
  mecanico: {
    id: "mecanico",
    name: "Mecánico",
    icon: "🔧",
    category: "calle",
    aliases: ["mecanico", "taller", "mecanica", "fierrero"],
    description: "Metido en la fosa entre grasa, motores rateando y llaves francesas.",
  },
  enfermero: {
    id: "enfermero",
    name: "Enfermero",
    icon: "🩺",
    category: "comercio",
    aliases: ["enfermero", "enfermera", "salud", "hospital"],
    description: "Guardias eternas en el hospital, suero, inyecciones y pacientes complicados.",
  },
  modelo: {
    id: "modelo",
    name: "Modelo / Fachero",
    icon: "🕶️",
    category: "pantalla",
    aliases: ["modelo", "fachero", "topmodel", "influencer", "facha"],
    description: "Campañas de ropa urbana, presencia VIP, fotos de gym y trajes slim fit.",
  },
  programador: {
    id: "programador",
    name: "Programador",
    icon: "💻",
    category: "pantalla",
    aliases: ["programador", "programadora", "dev", "sistemas", "coder"],
    description: "Picando código en TypeScript, peleando contra bugs y cafés fríos.",
  },
  albanil: {
    id: "albanil",
    name: "Albañil",
    icon: "🧱",
    category: "calle",
    aliases: ["albanil", "albanileria", "obra", "albañil"],
    description: "Hormigón, plomada, fratacho y mezcla bajo el sol en la obra.",
  },
  preventista: {
    id: "preventista",
    name: "Preventista",
    icon: "🛵",
    category: "calle",
    aliases: ["preventista", "ventas", "viajante", "distribuidora"],
    description: "En motito 110 recorriendo kioscos y peleándole stock a los supermercados.",
  },
  recepcionista: {
    id: "recepcionista",
    name: "Recepcionista de Correo",
    icon: "📦",
    category: "comercio",
    aliases: ["recepcionista", "correo", "limpio", "paquetes", "encomiendas", "cartero"],
    description: "Ventanilla del correo en Limpio, entrega de encomiendas y reclamos de paquetes.",
  },
  espia: {
    id: "espia",
    name: "Espía / Agente Secreto",
    icon: "🕵️‍♂️",
    category: "turbio",
    aliases: ["espia", "agente", "detective", "investigador", "infiltrado", "007"],
    description: "Operaciones encubiertas, micrófonos clandestinos, fotos a infieles e infiltraciones.",
  },
  manicura: {
    id: "manicura",
    name: "Manicura / Nails Artist",
    icon: "💅",
    category: "comercio",
    aliases: ["manicura", "unas", "uñas", "nail", "nails", "esteticista", "belleza"],
    description: "Esmaltado semipermanente, esculpidas de acrílico con strass y chusmerío de clientas.",
  },
  tatuadora: {
    id: "tatuadora",
    name: "Tatuadora / Piercer",
    icon: "💉",
    category: "comercio",
    aliases: ["tatuadora", "tatuador", "tatto", "tattoo", "tinta", "piercer", "tatuajes"],
    description: "Agujas esterilizadas, tintas negras, tapar nombres de ex y aguantar clientes cagones.",
  },
  macumbero: {
    id: "macumbero",
    name: "Macumbero / Brujo",
    icon: "🔮",
    category: "turbio",
    aliases: ["macumbero", "brujo", "macumba", "brujeria", "curandero", "hechicero", "santero"],
    description: "Amarres de amor, limpiezas de aura, trabajos en el cruce de calles y velas negras.",
  },
  profesora_especial: {
    id: "profesora_especial",
    name: "Prof. de Educación Especial",
    icon: "🧩",
    category: "comercio",
    aliases: ["profesora_especial", "profesora", "educacion_especial", "docente_especial", "maestra_especial", "especial", "docente"],
    description: "Adaptación curricular, pictogramas, estimulación sensorial y contención pedagógica con paciencia infinita.",
  },
};

export interface WeatherDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  multipliers: {
    calle: number;
    pantalla: number;
    comercio: number;
    turbio: number;
  };
  professionMultipliers: Record<ProfessionType, number>;
}

export type JobCategory = "calle" | "pantalla" | "comercio" | "turbio";

export interface CategoryMadLibs {
  roles: string[];
  contextos: string[];
  exitos: string[];
  fracasos: string[];
}

export const ECONOMY_CONFIG = {
  // Billetera y saldos
  INITIAL_BALANCE: 5000,
  MIN_ACTIVE_BALANCE: 20000, // Saldo mínimo para intentar o sufrir asaltos ($20.000)
  BASE_JOB_REWARD: 10000, // Recompensa base por laburo exitoso ($10.000 fichas)

  // Cooldowns (Laburo en 1:30 min = 90 segundos)
  PASSIVE_DAILY_HOURS: 20,
  PASSIVE_DAILY_AMOUNT: 15000, // Cobro diario base ($15.000)
  JOB_COOLDOWN_MINUTES: 1.5, // 1 minuto y 30 segundos
  ROB_COOLDOWN_MINUTES: 0.5, // Robos cada 30 segundos
  ROB_SAME_VICTIM_COOLDOWN_MINUTES: 2, // Cooldown contra la misma víctima a 2 minutos
  ROB_SHIELD_HOURS: 0, // Cero escudos (abolidos)

  // Tasas de asalto (Rebalanceado a saldos millonarios)
  ROB_SUCCESS_RATE: 0.65,
  ROB_MIN_PERCENT: 0.15,
  ROB_MAX_PERCENT: 0.35,
  ROB_MAX_CAP: 120000, // Tope de botín máximo por asalto ($120.000)
  ROB_FAILURE_FINE: 25000, // Multa de indemnización al fallar ($25.000)

  // Costos de servicios multimedia
  COST_STICKER: 1500,
  COST_FISH_AUDIO: 3500,

  // Casino (Sin límite de monto: podés apostar todo tu saldo / all-in)
  CASINO_MAX_BETS_PER_MINUTE: 5,
  ROULETTE: {
    MIN_BET: 1000,
    MAX_BET: Number.MAX_SAFE_INTEGER,
  },
  SLOT: {
    MIN_BET: 1000,
    MAX_BET: Number.MAX_SAFE_INTEGER,
  },

  // Rotación de clima (Cada 15 minutos para mayor dinamismo)
  WEATHER_ROTATION_MS: 15 * 60 * 1000,

  // Eventos del destino espontáneos (cada ~40 a 70 mensajes con 35% de probabilidad)
  DESTINY_EVENTS: {
    MIN_MESSAGES: 40,
    MAX_MESSAGES: 70,
    TRIGGER_PROBABILITY: 0.35,
    MIN_AMOUNT: 15000,
    MAX_AMOUNT: 45000,
  },
};

export const GLOBAL_WEATHERS: Record<string, WeatherDefinition> = {
  NORMAL: {
    id: "NORMAL",
    name: "Día Normal",
    icon: "☀️",
    description: "Cielo despejado y clima templado. La economía y la calle funcionan a ritmo habitual.",
    multipliers: {
      calle: 1.0,
      pantalla: 1.0,
      comercio: 1.0,
      turbio: 1.0,
    },
    professionMultipliers: {
      mecanico: 1.0,
      enfermero: 1.0,
      modelo: 1.0,
      programador: 1.0,
      albanil: 1.0,
      preventista: 1.0,
      recepcionista: 1.0,
      espia: 1.0,
      manicura: 1.0,
      tatuadora: 1.0,
      macumbero: 1.0,
      profesora_especial: 1.0,
    },
  },
  LLUVIA_TORRENCIAL: {
    id: "LLUVIA_TORRENCIAL",
    name: "Lluvia Torrencial e Inundación",
    icon: "🌧️",
    description: "Diluvio feroz y calles anegadas. Impacto equitativo en toda la economía urbana.",
    multipliers: {
      calle: 1.1,
      pantalla: 1.1,
      comercio: 1.1,
      turbio: 1.1,
    },
    professionMultipliers: {
      mecanico: 1.1,
      enfermero: 1.1,
      modelo: 1.1,
      programador: 1.1,
      albanil: 1.1,
      preventista: 1.1,
      recepcionista: 1.1,
      espia: 1.1,
      manicura: 1.1,
      tatuadora: 1.1,
      macumbero: 1.1,
      profesora_especial: 1.1,
    },
  },
  OLA_CALOR: {
    id: "OLA_CALOR",
    name: "Ola de Calor Extrema (41°C)",
    icon: "🔥",
    description: "Sensación térmica insoportable. Impacto equitativo en todos los rubros de la ciudad.",
    multipliers: {
      calle: 1.1,
      pantalla: 1.1,
      comercio: 1.1,
      turbio: 1.1,
    },
    professionMultipliers: {
      mecanico: 1.1,
      enfermero: 1.1,
      modelo: 1.1,
      programador: 1.1,
      albanil: 1.1,
      preventista: 1.1,
      recepcionista: 1.1,
      espia: 1.1,
      manicura: 1.1,
      tatuadora: 1.1,
      macumbero: 1.1,
      profesora_especial: 1.1,
    },
  },
  PARO_TRANSPORTE: {
    id: "PARO_TRANSPORTE",
    name: "Paro General de Colectivos y Trenes",
    icon: "🚌🚫",
    description: "Caos vehicular y parálisis del transporte. Menor movilidad y recaudación para todos por igual.",
    multipliers: {
      calle: 0.9,
      pantalla: 0.9,
      comercio: 0.9,
      turbio: 0.9,
    },
    professionMultipliers: {
      mecanico: 0.9,
      enfermero: 0.9,
      modelo: 0.9,
      programador: 0.9,
      albanil: 0.9,
      preventista: 0.9,
      recepcionista: 0.9,
      espia: 0.9,
      manicura: 0.9,
      tatuadora: 0.9,
      macumbero: 0.9,
      profesora_especial: 0.9,
    },
  },
  CORTE_LUZ: {
    id: "CORTE_LUZ",
    name: "Corte Masivo de Luz",
    icon: "⚡❌",
    description: "Apagón general en media ciudad. Dificultades operativas que afectan a todos parejo.",
    multipliers: {
      calle: 0.85,
      pantalla: 0.85,
      comercio: 0.85,
      turbio: 0.85,
    },
    professionMultipliers: {
      mecanico: 0.85,
      enfermero: 0.85,
      modelo: 0.85,
      programador: 0.85,
      albanil: 0.85,
      preventista: 0.85,
      recepcionista: 0.85,
      espia: 0.85,
      manicura: 0.85,
      tatuadora: 0.85,
      macumbero: 0.85,
      profesora_especial: 0.85,
    },
  },
  INICIO_CLASES: {
    id: "INICIO_CLASES",
    name: "Inicio del Ciclo Lectivo",
    icon: "🎒📚",
    description: "Vuelta a clases en todas las escuelas. Estímulo comercial y mayor movimiento general.",
    multipliers: {
      calle: 1.15,
      pantalla: 1.15,
      comercio: 1.15,
      turbio: 1.15,
    },
    professionMultipliers: {
      mecanico: 1.15,
      enfermero: 1.15,
      modelo: 1.15,
      programador: 1.15,
      albanil: 1.15,
      preventista: 1.15,
      recepcionista: 1.15,
      espia: 1.15,
      manicura: 1.15,
      tatuadora: 1.15,
      macumbero: 1.15,
      profesora_especial: 1.15,
    },
  },
  CRECIDA_PARANA: {
    id: "CRECIDA_PARANA",
    name: "Crecida del Río Paraná",
    icon: "🌊🐟",
    description: "El río avanza sobre la costanera. Dificultades fluviales y urbanas para todos por igual.",
    multipliers: {
      calle: 0.95,
      pantalla: 0.95,
      comercio: 0.95,
      turbio: 0.95,
    },
    professionMultipliers: {
      mecanico: 0.95,
      enfermero: 0.95,
      modelo: 0.95,
      programador: 0.95,
      albanil: 0.95,
      preventista: 0.95,
      recepcionista: 0.95,
      espia: 0.95,
      manicura: 0.95,
      tatuadora: 0.95,
      macumbero: 0.95,
      profesora_especial: 0.95,
    },
  },
};

export const MAD_LIBS_CATEGORIES: Record<JobCategory, CategoryMadLibs> = {
  calle: {
    roles: [
      "Laburaste de albañil pegando ladrillos huecos y revocando una medianera",
      "Te tocó hacer mezcla con pala y carretilla bajo el sol para una losa",
      "Fuiste de albañil a techar con chapa un galpón esquivando alambres",
      "Laburaste de preventista en motito 110 levantando pedidos de gaseosa",
      "Fuiste de preventista a pelearle stock de cervezas al chino del súper",
      "Recorriste 20 kioscos de preventista con una planilla toda arrugada",
      "Agarraste turno de Rappi con una bici playera sin frenos",
      "Fuiste de trapito a la cancha con un trapo rejilla sucio",
      "Saliste a vender medias y repasadores en la estación de tren",
      "Te pusiste a lavar parabrisas en el semáforo de la avenida",
      "Ayudaste en una mudanza bajando una heladera por escalera caracol",
      "Hiciste de delivery en moto esquivando pozos a los pedos",
    ],
    contextos: [
      "mientras el capataz te apuraba gritando: '¡Metéle que se viene el agua, vago!',",
      "bajo un sol impiadoso de 38 grados que te derretía las zapatillas,",
      "peleándote con un fletero que te tiró el camión encima y te gritó: '¡Salí salame!',",
      "con el dueño del almacén diciendo: 'Anotámelo a cuenta que estoy seco',",
      "esquivando una jauría de perros rabiosos en un pasillo sin luz,",
      "con la carretilla tambaleando al borde de una zanja con barro,",
      "mientras un cana te miraba de reojo con la mano en la cartuchera,",
      "haciendo equilibrio en un andamio de madera atado con alambre,",
      "con la moto tosiendo porque te quedaste sin nafta a mitad de camino,",
      "en plena hora pico con bocinazos y gente a los empujones,",
    ],
    exitos: [
      "y el patrón te felicitó: '¡Al fin uno que no es vago!' y te pagó al contado.",
      "y el chino te firmó el pedido completo y te regaló una gaseosa fría.",
      "y cobraste el jornal completito con propina extra para unas birras.",
      "y un cliente generoso te dejó una propina en billetes que te salvó el mes.",
      "y terminaste la losa antes del diluvio y te liquidaron con premio.",
      "y el fletero se copó: 'Tomá pibe, te lo ganaste' y te dio un plus.",
      "y metiste récord de ventas zafando de todos los inspectores.",
      "y te pagaron sin chistar y te invitaron un sanguche de bondiola.",
    ],
    fracasos: [
      "pero se te cayó el balde de mezcla encima del dueño y te echó a patadas.",
      "pero el chino te gritó: '¡No compro nada, andáte!' y perdiste la comisión.",
      "pero pinchaste la rueda de la motito en plena villa y tuviste que volver caminando.",
      "pero se te volcaron las pizzas en el lomo de burro y las tuviste que pagar vos.",
      "pero te patinaste en el andamio, rompiste diez tejas y cobraste $0.",
      "pero te cayó un inspector municipal y te sacó la mercadería.",
      "pero el cliente te dijo: 'Te transfiero mañana' y te bloqueó en WhatsApp.",
      "pero se te cayó una bolsa de cal en los ojos y terminaste en la guardia.",
    ],
  },
  pantalla: {
    roles: [
      "Te pusiste a editar reels y tiktoks para un influencer vendehumo",
      "Hiciste de tiktoker grabando bailes y bromas pesadas en plena peatonal",
      "Grabaste un vivo de TikTok morfándote una hamburguesa de 4 pisos",
      "Editaste los mejores momentos de un streamer de Kick a los apurones",
      "Fuiste community manager respondiendo puteadas en el Twitter de una marca",
      "Hiciste miniaturas clickbait para YouTube con caras gritando con ojos abiertos",
      "Grabaste audios de voz fingiendo ser locutor cordobés para un comercial trucho",
      "Manejaste la cuenta de Instagram de una rotisería peleando con los clientes",
      "Hiciste de streamer bancando el lag de Fibertel con 3 personas viéndote",
      "Editaste un videoclip de trap barrial con efectos de fuego recontra berretas",
    ],
    contextos: [
      "mientras el influencer te mandaba audios de 5 minutos diciendo: '¡Hacelo más viral, bro!',",
      "con la computadora hirviendo como un reactor nuclear a punto de estallar,",
      "con el Premiere colgándose cada vez que querías meter una transición,",
      "aguantando comentarios en el chat que decían: '¡Qué cringe das hermano!',",
      "a las 4 de la mañana con los ojos rojos tomando mate cocido frío,",
      "mientras el Wi-Fi se cortaba cada vez que alguien prendía la pava eléctrica,",
      "lidiando con un cliente que te pidió 14 cambios en media hora,",
      "con gente en la calle mirándote como si fueras un extraterrestre,",
      "aguantando audios con fritura de fondo y ladridos de caniche,",
      "con dolor de espalda fatal por usar una banqueta de plástico sin respaldo,",
    ],
    exitos: [
      "y el video clavó 800k de visitas: el pibe te transfirió una locura por Mercado Pago.",
      "y el reel pegó tendencia en TikTok: te llovieron contratos y propinas.",
      "y el streamer pegó clip del año y te tiró un porcentaje jugoso de la donación.",
      "y la marca te felicitó: '¡Sos un crack!' y te depositaron un bono en mano.",
      "y el influencer quedó chocho y te pagó la edición al instante sin quejarse.",
      "y te llovieron seguidores que te llenaron la gorra virtual de cafecitos.",
      "y el clip explotó en Twitter haciéndose meme nacional y cobraste doble.",
      "y el cliente te calificó con 5 estrellas y te transfirió más de lo pactado.",
    ],
    fracasos: [
      "pero TikTok te muteó el video por copyright de cumbia y no cobraste un sope.",
      "pero se tildó la compu antes de guardar y perdiste 5 horas de edición al pedo.",
      "pero te putearon en todos los comentarios por un subtítulo con faltas de ortografía.",
      "pero el influencer te clavó visto apenas le mandaste el video y te bloqueó.",
      "pero se cortó la luz en plena renderizada y la fuente de la PC tiró humo negro.",
      "pero el video dio tanto cringe que terminaste en una cuenta de memes humillantes.",
      "pero te comiste un troyano por bajar música sin copyright y te vaciaron la cuenta.",
      "pero la marca te canceló el contrato acusándote de no tener onda juvenil.",
    ],
  },
  comercio: {
    roles: [
      "Cubriste guardia de enfermería en el hospital atendiendo 50 urgencias",
      "Laburaste de enfermero poniendo inyecciones a una fila de jubilados histéricos",
      "Hiciste de profesor cuidando un examen de secundaria lleno de machetes",
      "Diste clase de profesor suplente en un colegio sin estufa ni tizas",
      "Fuiste repositor en el chino apilando latas de arvejas abolladas",
      "Laburaste de cajero en un kiosco 24hs bancando borrachos a las 5 AM",
      "Fuiste mozo en una pizzería llena hasta las manos un sábado de lluvia",
      "Despachaste medialunas en el mostrador de una panadería de barrio",
      "Atendiste una fiambrería cortando paleta y queso con la máquina trabada",
      "Vendiste fundas de celular en un stand angosto de una galería vieja",
    ],
    contextos: [
      "mientras una señora te gritaba: '¡Nene, atendeme que estoy acá desde las 7!',",
      "con tres pibes del fondo tirando aviones de papel y gritando goles,",
      "con una bandeja tambaleando llena de cervezas pesadas entre la multitud,",
      "aguantando a un tipo en pedo que te decía: '¡Fiamé un fernet que mañana cobro!',",
      "con el posnet sin señal diciendo: 'Transacción denegada' veinte veces,",
      "mientras el patrón te controlaba cada movimiento por la cámara de seguridad,",
      "con una resaca asesina que no te dejaba ni mantenerte parado,",
      "con el director vigilándote por la ventana con cara de orto,",
      "aguantando a una clienta que te discutió 15 minutos por 20 pesos de vuelto,",
      "con la máquina de cortar fiambre tirando chispas y olor a quemado,",
    ],
    exitos: [
      "y el médico de guardia te dio un bono extra por bancar la salita solo.",
      "y los pibes aprobaron de milagro: la directora te felicitó y te pagaron completito.",
      "y una mesa de chetos te dejó una propina en billetes que desbordaba el bolsillo.",
      "y el chino te regaló una cerveza importada y te liquidó la jornada en mano.",
      "y cerraste la caja con la plata justa y un sobrante que fue a tu billetera.",
      "y la patrona te felicitó por la paciencia y te regaló una docena de medialunas.",
      "y liquidaste el stock viejo metiendo promociones truchas y cobraste comisión.",
      "y los pacientes te aplaudieron en la sala de espera y te dieron una caja de bombones.",
    ],
    fracasos: [
      "pero le erraste de aguja a un tipo grandote que te pegó una puteada histórica.",
      "pero los pibes te escondieron las cosas, el aula fue un bardo y te descontaron el día.",
      "pero se te cayó una bandeja de pizzas arriba de una cheta y te rajaron.",
      "pero te metieron un billete falso de 10 lucas y lo tuviste que pagar vos.",
      "pero se pudrió un cajón de tomates y el chino te puteó en mandarín.",
      "pero se te cayó una horma de queso cremoso al piso y te la cobraron al costo.",
      "pero te descubrieron comiéndote una empanada a escondidas atrás del mostrador.",
      "pero el posnet cobró de más a un cana retirado que te armó un escándalo policial.",
    ],
  },
  turbio: {
    roles: [
      "Fuiste a revender entradas truchas plastificadas en la cancha",
      "Pasaste quiniela clandestina en la trastienda de una gomería de barrio",
      "Vendiste cuentas de streaming truchas por grupos de compraventa de WhatsApp",
      "Hiciste de campana en la esquina con una motito avisando si venía la cana",
      "Vendiste zapatillas 'importadas de Brasil' que trajiste de La Salada",
      "Armaste certificados médicos truchos para zafar de ir a laburar un lunes",
      "Vendiste chips de celular activados con DNI de jubilados fallecidos",
      "Vendiste perfumes franceses rebajados con alcohol fino y agua de la canilla",
      "Manejaste una timba clandestina de dados en el fondo de un galpón",
      "Hiciste de intermediario para cobrar deudas dudosas apretando morosos",
    ],
    contextos: [
      "con un patrullero pasando despacito con las balizas apagadas,",
      "escondiendo los billetes en la plantilla de las zapatillas por si las moscas,",
      "con un comprador sospechoso que te decía: '¿Esto es posta o me estás verseando?',",
      "disimulando con la moto apagada haciéndote el que mirás el celular,",
      "en un callejón oscuro atrás de la estación con olor a humedad,",
      "con el corazón latiéndote a mil cada vez que frenaba una moto atrás tuyo,",
      "negociando precios apurado mientras dos tipos de civil te miraban fijo,",
      "con el teléfono descartable sonando cada diez segundos de números privados,",
      "con los nervios de punta esperando que el cliente no se avive de la truchada,",
      "en medio de un apagón de luz que dejó la cuadra como boca de lobo,",
    ],
    exitos: [
      "y el comprador picó como un campeón, te dio la tarasca y te tomaste el palo en Uber.",
      "y coronaste el negocio del día sin que nadie sospeche un carajo.",
      "y la jugada de la quiniela no salió y te quedaste con toda la recaudación.",
      "y vendiste la última tanda con ganancia limpia antes de que caiga la brigada.",
      "y el moroso se asustó, pagó todo en efectivo y te quedaste con la comisión.",
      "y los clientes quedaron chochos con sus cuentas y te recomendaron a medio barrio.",
      "y zafaste de un control policial disimulando como un actor de Hollywood.",
      "y te pagaron por adelantado y te esfumaste en el gentío como una sombra.",
    ],
    fracasos: [
      "pero apareció la brigada de civil y tuviste que tirar todo a una zanja.",
      "pero el comprador se dio cuenta en la cara, te apuró con dos primos y te sacó todo.",
      "pero la cuenta se cayó a los 10 minutos y te escracharon con foto y DNI en Facebook.",
      "pero el número de la quiniela salió a la cabeza y tuviste que vender la moto para pagar.",
      "pero te pagaron con billetes fotocopiados tan berretas que te mancharon los dedos.",
      "pero te corrió un perro pitbull dos cuadras y perdiste la billetera en la huida.",
      "pero se armó una pelea general entre puesteros y ligaste un botellazo de rebote.",
      "pero te ficharon en la esquina y tuviste que salir corriendo sin zapatillas.",
    ],
  },
};

export const PROFESSION_MAD_LIBS: Record<ProfessionType, CategoryMadLibs> = {
  mecanico: {
    roles: [
      // Electromecánica
      "Enchufaste el osciloscopio y el scanner OBD2 para cazar un corto intermitente en la ECU de una Amarok",
      "Desarmaste la fusilera y el alternador quemado de un Bora que se quedó sin carga en plena autopista",
      "Tuviste que rehacer el mazo de cables del encendido de un Peugeot 206 con cables tostados y sulfatados",
      "Te tocó diagnosticar con punta lógica y multímetro el burro de arranque pegado de un camión Mercedes",
      // Climatización / Aire Acondicionado
      "Cargaste gas refrigerante R134a y aceite sintético en el compresor trabado de un Corolla en plena siesta",
      "Metiste 250 PSI de nitrógeno con el manómetro para rastrear una microfuga traicionera en el evaporador",
      "Lavaste el circuito con R141b y cambiaste la válvula de expansión congelada de una Hilux",
      "Reemplazaste el presostato de alta y el filtro deshidratador saturado de un Gol Trend sin enfriar",
      // GNC
      "Calibraste la rampa de inyectores de GNC de 5ta generación en una Kangoo laburante conectando la notebook",
      "Regulaste el reductor de presión de gas y cambiaste el diafragma reseco de un Siena remisero",
      "Desmontaste la cuna y los cilindros de GNC para mandar a prueba hidráulica reglamentaria",
      "Solucionaste la falla de emulador de inyección de una Suran que rateaba a nafta y tiraba explosiones a gas",
      // Tradicional & Fierros pesados
      "Te metiste a la fosa con la llave de 17 y la neumática a bajar la caja trabada de un Falcon",
      "Cambiaste la junta de culata soplada y cepillaste la tapa de cilindros de un Corsa hirviendo",
      "Clavaste embrague nuevo sinterizado y rulemán de empuje a una F-100 cargada hasta las manijas",
      "Hiciste tren delantero completo con bujes de teflón, extremos y fuelles en un Palio que flameaba",
      "Purgaste el circuito de frenos con purgador neumático sacando burbujas de líquido hervido",
      "Le hiciste distribución completa con bomba de agua y tensor hidráulico a un Gol al milímetro",
    ],
    contextos: [
      "con 42 grados a la sombra, el radiador escupiendo vapor y el liso perdiendo la espuma en el banco,",
      "peleando contra un tornillo torx barrido que no salía ni con extractor cónico ni con calor de soplete,",
      "respirando olor a nafta súper, gas comprimido, líquido de frenos DOT4 y aceite quemado de caja,",
      "con Sergio Torres y Grupo Cali sonando de fondo en una radio a pilas engrasada al palo,",
      "con el dueño parado al lado de la fosa preguntando cada 3 minutos: '¿Falta mucho jefe, cuánto me va a doler?',",
      "esquivando nubes de jejenes y mosquitos del Paraná que te picaban arriba del mameluco sucio,",
      "con el manómetro marcando presiones raras y la rampa de inyección vibrando como lavarropas viejo,",
      "con los nudillos cortados contra el múltiple de escape hirviendo y secándote la frente con un trapo rejilla,",
      "con el gato hidráulico cediendo de a milímetros en el piso aceitoso del galpón,",
      "mientras el compresor de aire del fondo tosía y tiraba chispazos de carbón cada vez que arrancaba,",
    ],
    exitos: [
      "y el motor arrancó ronroneando en 4 cilindros parejito: el cliente te pagó la mano de obra sin chistar y te regaló un pack de lisos helados.",
      "y la computadora borró todos los errores de check engine al toque: cobraste diagnóstico VIP, repuestos y mano de obra al contado.",
      "y el aire acondicionado quedó tirando escarcha a 4 grados bajo cero: el tipo festejó chocho y te dejó una propina descomunal.",
      "y la Kangoo a gas quedó picando como un fórmula 1 sin toser: el remisero te transfirió con un extra para el asado del domingo.",
      "y la distribución quedó a punto exacto con cero juego: jornalazo completo en mano y cliente fidelizado de por vida.",
    ],
    fracasos: [
      "pero zafó la manguera de alta presión de GNC, metió un estruendo de cañón y voló la gorra del patrón al techo.",
      "pero conectaste la batería al revés por apurado, pegó un chispazo azul atómico y quemaste la fusilera principal.",
      "pero se te falseó la rosca de la bujía en la tapa de aluminio recién cepillada y casi te ponés a llorar en la fosa.",
      "pero se te cayó el tubo de 10 milímetros adentro del cárter destapado y tuviste que desarmar medio motor de vuelta.",
      "pero explotó la manguera del manómetro cargando gas refrigerante y te tapó la cara de fluorescente ultravioleta.",
    ],
  },
  enfermero: {
    roles: [
      "Te tocó hacer guardia nocturna en urgencias con tu jarra de tereré cargada de menta'i y burrito",
      "Fuiste a clavarle una inyección intramuscular a un tipo ka'ure que no paraba de cantar en la camilla",
      "Tuviste que suturar 6 puntos en la frente a un mitã'i que se cayó de la moto gritando: '¡Ndera kore!'",
      "Le tomaste la presión a una doña que llegó con 18/10 y la calmaste con un trago de tereré con pohã ñana",
      "Te pusiste a ordenar el carro de medicación a las 4 AM mientras masticabas una chipá calentita",
      "Pusiste una vía intravenosa con suero a un paciente difícil tirándole: '¡Tranquilo che patrón, no duele!'",
      "Hiciste triage en la sala de espera llena de pacientes tosiendo y rezando en guaraní",
      "Te tocó nebulizar a tres pibes con bronquitis que se calmaron cuando les hablaste en guaraní",
      "Fuiste a sacarle sangre a un abuelo hipertenso con venas invisibles haciendo magia con el lazo",
      "Cubriste el turno de terapia intensiva chequeando sueros y monitores cardíacos a oscuras",
      "Colocaste una sonda nasogástrica con paciencia de santo esquivando los manotazos del paciente",
      "Curaste una herida rebelde con gasa furacina y pervinox mientras le cebabas un tereré al acompañante",
    ],
    contextos: [
      "con el calor sofocante de la madrugada mientras la guampa de palo santo no paraba de rotar,",
      "mientras un pariente desesperado te gritaba en la ventanilla: '¡Eju pya'e enfermero por favor!',",
      "con el ventilador de techo haciendo un chillido de película mientras rezabas en guaraní,",
      "sin dormir hace 24 horas y con los pies doliéndote como si hubieras caminado desde Asunción,",
      "esquivando un estornudo en la nuca en la guardia abarrotada y tirando: '¡Ndera, tapate la boca!',",
      "con la jarra térmica llena de hielo picado y remedio yuyo dándote la última energía de la noche,",
      "mientras el monitor cardíaco sonaba como campana de iglesia en plena emergencia,",
      "aguantando a un doctor engreído que no sabía ni tomar la temperatura y te tiraba todo el laburo,",
      "con el ambo blanco manchado de pervinox y una sonrisa serena que transmitía paz a la sala,",
      "con el timbre de la sala 5 sonando cada dos minutos mientras preparabas las ampollas,",
    ],
    exitos: [
      "y le embocaste la vía en la vena finita de una: el doctor te gritó '¡Iporãiterei!' y la jefa te anotó horas extra.",
      "y el paciente te bendijo: '¡Aguyje enfermero, tenés mano de ángel!' y te regaló una caja de chipá recién horneada.",
      "y salvaste la guardia de un colapso total con tu calma zen: te liquidaron el jornal con bono de insalubridad al 100%.",
      "y el abuelo estabilizó la presión al toque, te agradeció emocionado y te dejó un billete generoso para el almuerzo.",
      "y suturaste la herida tan prolijo que parecía bordado de ñandutí: te felicitaron y te pagaron con propina extra.",
    ],
    fracasos: [
      "pero el paciente ka'ure te pegó un manotazo al ver la aguja y la jeringa voló clavándose en la cortina.",
      "pero se te volcó la jarra de tereré arriba del teclado de la compu de admisión y se colgó el sistema del hospital.",
      "pero te mareaste por no haber almorzado nada y casi te desmayás arriba del carrito de curaciones.",
      "pero el familiar te denunció en el libro de quejas porque no le convidaste tereré y te comiste una sanción.",
      "pero se rompió la ruedita de la camilla en el pasillo y el paciente se fue patinando hasta la puerta.",
    ],
  },
  modelo: {
    roles: [
      "Te tocó posar en remera musculosa y gafas oscuras en un descampado de La Matanza al lado del arroyo",
      "Hiciste una sesión de fotos de alta costura europea en la puerta del shopping de San Justo esquivando el 96",
      "Fuiste de presencia VIP al boliche de Ramos Mejía fingiendo que vivís en Milán pero te bajaste en el 242",
      "Grabaste un reel de moda urbana en la plaza de San Justo pasando hambre para que no se note la pancita",
      "Posaste con sobretodo camel y borcegos en la estación de Laferrere mirando al horizonte con cara de misterioso",
      "Hiciste fotos para una marca de ropa de Once con el cuerpo flaquito sobreviviendo a base de apio y lechuga",
      "Desfilaste en una pasarela improvisada en un salón de fiestas de Isidro Casanova con traje slim fit apretadísimo",
      "Posaste arriba del capó de un Bora planchado en una gomería de González Catán para un catálogo de indumentaria",
      "Grabaste un TikTok de estilo masculino en la estación de Ramos Mejía tirando facha con bufanda en pleno verano",
      "Hiciste de extra fachero en el videoclip de un cantante de RKT en un pasillo de monoblocks de La Tablada",
      "Posaste con campera de cuero entallada en una terraza de Lomas del Mirador con mirada seductora a la cámara",
      "Hiciste una sesión lookbook de trajes de gala en una barbería de Ciudad Evita aguantando la respiración",
    ],
    contextos: [
      "mientras los pibes de la esquina de La Matanza te gritaban con onda: '¡Eh facha, prestame las llantas!',",
      "con la panza pegada a la columna de no comer carbohidratos hace tres días para dar el peso de pasarela,",
      "con el fotógrafo gritando: '¡Cara de desfile parisino, ignorá que atrás pasa el tren Sarmiento!',",
      "aguantando el frío en cuero en una esquina de San Justo mientras la gente pasaba con camperón polar,",
      "con miedo a que te salpique barro en las zapatillas de diseñador importadas en la parada del 96,",
      "aguantando la respiración para que se marquen las costillas y los pómulos de modelo esquelético,",
      "con el barbero de Ramos retocándote el jopo con laca cada 30 segundos,",
      "mientras tres señoras que volvían de hacer las compras se paraban a sacarte fotos con el celular,",
      "haciendo equilibrio en borcegos que te apretaban los dedos pero sonriendo con glamour,",
      "con el estómago rugiéndote de hambre como un león pidiendo a gritos una empanada de carne,",
    ],
    exitos: [
      "y la foto quedó digna de cartelera de Milán: la marca te duplicó el cachet y te pagaron con billetes crocantes.",
      "y el reel en San Justo clavó medio millón de vistas en TikTok: te pagaron la presencia VIP con propina en dólares.",
      "y la rompiste en la pasarela de Ramos: te aplaudieron de pie y te regalaron toda la ropa de la sesión.",
      "y el fotógrafo te felicitó: 'Tenés una estructura ósea increíble, pibe' y te liquidaron al contado en el acto.",
      "y te fichó una agencia de Palermo para una campaña internacional: cobraste cachet de primera categoría.",
    ],
    fracasos: [
      "pero te dio un calambre en la panza por meter tanta panza para adentro y te doblaste del dolor en plena toma.",
      "pero se te reventó el botón del pantalón slim fit al agacharte y tuviste que salir tapándote con el saco.",
      "pero pasó un bondi a los pedos por la avenida y te empapó el traje de diseñador con agua de charco.",
      "pero en el boliche de Ramos te confundieron con el barman y te mandaron a limpiar los vasos rotos de la pista.",
      "pero te bajó la presión de no comer nada y te desmayaste de jeta arriba de un perchero de ropa.",
    ],
  },
  programador: {
    roles: [
      "Te pusiste a tirar código en TypeScript para arreglar un bug en producción que tiró la base de datos",
      "Tuviste que migrar un backend en PHP viejo a microservicios en Docker a las 2 AM",
      "Te clavaste una sesión de debugging maratónica buscando un punto y coma fantasma",
      "Escribiste un scraper en Python para sacarle datos a la competencia sin que te bloqueen la IP",
      "Te tocó refactorizar una función spaghetti de 2000 líneas escrita por un indio hace 5 años",
      "Configuraste los pipelines de CI/CD en GitHub Actions peleando contra los permisos de AWS",
      "Hiciste una landing page con Next.js y Tailwind para un cliente que quería que 'impacte visualmente'",
      "Implementaste un webhook de pagos de Stripe y Mercado Pago esquivando fallos de red",
      "Tuviste que armar una API REST en Express con autenticación JWT esquivando ataques DDoS",
      "Te pusiste a optimizar índices en PostgreSQL porque las consultas tardaban 40 segundos",
      "Hiciste un bot de Discord y WhatsApp para automatizar la atención de una empresa",
      "Te tocó arreglar un problema de CORS infernal que rompía la aplicación en Safari",
    ],
    contextos: [
      "mientras el Project Manager te preguntaba cada 10 minutos: '¿Cómo venimos con eso?',",
      "con la espalda encorvada en C y el cuello duro como una piedra de estar sentado 14 horas,",
      "sobreviviendo a base de café instantáneo fuerte y mate amargo hirviendo,",
      "con 48 pestañas de Stack Overflow abiertas y ChatGPT dándote respuestas alucinadas,",
      "mientras la VPN de la empresa se caía cada 3 minutos reseteando tu terminal,",
      "con la laptop bufando como una turbina de avión a 95 grados centígrados,",
      "aguantando una reunión de Daily que duró una hora y media donde nadie dijo nada útil,",
      "mientras el gato se te subía al teclado borrándote media terminal de comandos,",
      "con la pantalla azul de Windows amenazando en cada compilación pesada,",
      "peleando contra un error de linter que te marcaba 300 warnings por comillas simples,",
    ],
    exitos: [
      "y el fix pasó a producción sin romper nada: el CTO te mandó felicitaciones por Slack y te acreditaron un bono en dólares.",
      "y optimizaste la query de la base de datos reduciendo la carga en un 90%: cobraste como un duque.",
      "y cerraste todos los tickets del sprint antes del viernes a la tarde y te liquidaron las horas extra completitas.",
      "y el cliente quedó fascinado con el MVP: te transfirió el pago final de inmediato con 5 estrellas.",
      "y automatizaste todo el flujo de trabajo dejándote tiempo libre para tomar mate y cobrar sueldo entero.",
    ],
    fracasos: [
      "pero tiraste un 'git push --force' a la rama main y borraste 3 semanas de código del equipo entero.",
      "pero metiste un loop infinito que prendió fuego la factura de AWS por $5,000 dólares y te comiste un sumario.",
      "pero se te cayó el vaso con café arriba del teclado mecánico y quemaste la placa madre.",
      "pero dejaste la API key pública en un repo de GitHub y un bot ruso te vació la cuenta de pruebas.",
      "pero borraste la tabla de usuarios en producción sin hacer backup y tuviste que apagar el celular.",
    ],
  },
  albanil: {
    roles: [
      "Te tocó levantar una pared de ladrillos huecos del 12 a plomada y nivel",
      "Fuiste a tirar una losa de hormigón llenando baldes a pulmón con la pala",
      "Te subiste al andamio a revocar con hidrófugo la medianera de una casa de dos pisos",
      "Tuviste que picar un contrapiso viejo con maza y cortafierro que rebotaba como piedra",
      "Te pusiste a techar con chapa canalizada clavando clavos de cabeza de plomo",
      "Hiciste la mezcla en el trompito con tres de arena, uno de cal y medio de cemento",
      "Pegaste cerámicos en el piso del baño cortando las esquinas con la amoladora",
      "Cavaste una zanja de 1 metro de profundidad para tirar los caños de desagüe pluvial",
      "Te tocó cortar vigas de hierro del 10 tirando chispas con la amoladora angular",
      "Pastinaste 60 metros de porcelanato en las rodillas con una esponja húmeda",
      "Armaste el encofrado de madera con tablas y alambre para las columnas de la esquina",
      "Bajaste de un camión volcador 100 bolsas de cemento Portland cargándolas al hombro",
    ],
    contextos: [
      "bajo un sol impiadoso de 40 grados que te tostaba la nuca y te secaba la garganta,",
      "con el capataz gritando como loco desde abajo: '¡Métele que no vinimos a pasear, che!',",
      "tragando polvo de cal y cemento seco que te dejaba la garganta como una lija,",
      "con las manos cuarteadas y ampolladas a pesar de los guantes de descarne rotos,",
      "haciendo equilibrio en un tablón chueco que crujía cada vez que dabas un paso con el balde,",
      "con el balde de mezcla tan pesado que te hacía crujir las vértebras lumbares,",
      "mientras los perros de la cuadra te toreaban desde abajo cada vez que mirabas al piso,",
      "con una zanja llena de barro podrido donde se te enterraban las alpargatas,",
      "con una astilla clavada en la palma de la mano que no te dejaba agarrar la cuchara,",
      "con la radio a transistores sonando cuarteto cordobés entre el polvo de los escombros,",
    ],
    exitos: [
      "y la pared quedó derecha como una vela: el dueño de la obra te felicitó y te pagó el jornal con asado y vino incluido.",
      "y llenaron la losa entera antes de las 4 de la tarde: cobraste la quincena redondita y con propina.",
      "y el revoque fino quedó lisito como manteca: el arquitecto te anotó para la próxima obra grande.",
      "y terminaste el contrapiso en tiempo récord: te pagaron al contado con billetes crocantes.",
      "y techaste antes de que caiga la tormenta: el dueño te regaló un cajón de cervezas heladas más el jornal.",
    ],
    fracasos: [
      "pero se te derrumbó la pared recién levantada porque le faltaba hierro y tuviste que juntar los escombros.",
      "pero se te cayó un ladrillo desde el andamio y le rompiste el parabrisas al auto del vecino.",
      "pero la mezcla se te endureció en el trompito por tomar mate de más y tuviste que romperla a golpes.",
      "pero te cortaste con una chapa oxidada y te tuvieron que vacunar contra el tétanos en la salita.",
      "pero el nivel estaba torcido, la pared quedó como la torre de Pisa y tuviste que tirarla abajo gratis.",
    ],
  },
  preventista: {
    roles: [
      "Saliste en la motito 110 con la pechera de la distribuidora a levantar pedidos por el barrio",
      "Fuiste a pelearle stock y precio de fernet y cerveza al chino del supermercado de la avenida",
      "Recorriste 30 kioscos y despensas con una carpeta llena de planillas y talonarios",
      "Te mandaron a abrir cuentas nuevas en almacenes de barrio ofreciendo ofertas de gaseosas",
      "Tuviste que convencer a una almacenera renegada para que te compre 5 cajones de aceite",
      "Fuiste a cobrar fiados viejos esquivando las excusas de los comerciantes secos",
      "Te tocó volantear y ofrecer líneas nuevas de golosinas y snacks en todos los colegios",
      "Manejaste la motito zigzagueando entre los colectivos para llegar antes que la competencia",
      "Te pusiste a levantar pedidos de cigarrillos y alfajores en 15 kioscos de estaciones de servicio",
      "Fuiste a chequear stock a una fiambrería peleando la exhibición de las heladeras",
      "Tuviste que negociar una devolución de mercadería vencida con un comerciante re caliente",
      "Recorriste una avenida comercial completa caminando bajo el sol con el catálogo pesado al hombro",
    ],
    contextos: [
      "con la moto haciendo contraexplosiones porque se te quedó sin aceite,",
      "esquivando una jauría de perros bravos que te tiraban tarascones a los tobillos,",
      "con el dueño del kiosco diciéndote: 'Vení la semana que viene que no vendí una goma',",
      "bajo una llovizna molesta que te empapó las planillas y te corrió la tinta de las biromes,",
      "cargando el bolso pesado con catálogos y muestras gratis que te rompían el hombro,",
      "con el supervisor mandándote audios de WhatsApp cada 15 minutos: '¿Cuántos cajones metiste hoy?',",
      "con el asfalto patinoso y un colectivo que casi te pasa por encima en una rotonda,",
      "mientras el rayo del sol te cocinaba el casco barato que olía a encierro,",
      "con el tanque de nafta en la reserva y la billetera sin un solo billete chico,",
      "peleando contra el viento que te volaba las boletas por toda la vereda,",
    ],
    exitos: [
      "y el chino te compró 50 cajones de birra al contado: clavaste la mejor comisión del mes y te llevaste un buen fajo.",
      "y convenciste a 10 kioscos de un saque: llegaste al objetivo semanal y la distribuidora te dio un bono extra.",
      "y cobraste todas las deudas pendientes sin que nadie te chamuye: tu jefe te felicitó en el grupo de ventas.",
      "y el almacenero te firmó el pedido grande y encima te regaló un sanguche de fiambre casero.",
      "y metiste récord de ventas de gaseosas en la zona sur: cobraste comisión doble y premio en mano.",
    ],
    fracasos: [
      "pero el chino te sacó corriendo al grito de: '¡Muy caro! ¡No quiero nada, andáte!' y perdiste el día.",
      "pero pinchaste la rueda trasera de la moto en el medio de la nada y tuviste que empujarla 20 cuadras.",
      "pero se te cayó el talonario en un charco de agua servida y se borraron todos los pedidos de la mañana.",
      "pero te cayó un control de tránsito, no tenías el seguro encima y te secuestraron la motito.",
      "pero te robaron la mochila con los catálogos mientras tomabas agua en una estación de servicio.",
    ],
  },
  recepcionista: {
    roles: [
      "Te tocó atender la ventanilla del correo de Limpio en hora pico con 40 personas en fila",
      "Fuiste a buscar un paquete de AliExpress sin tracking entre una montaña de cajas en el depósito",
      "Tuviste que sellar y registrar 80 encomiendas pesadas antes de que pase el camión de las 14:00",
      "Le explicaste con paciencia a un don que su paquete todavía estaba en la aduana del aeropuerto",
      "Te pusiste a cerrar cajas apuradas con la pistola de cinta haciendo un ruido ensordecedor",
      "Tuviste que calmar a una doña enfurecida que fue a retirar una encomienda con fotocopia de cédula borrosa",
      "Acomodaste en la estantería de chapa 50 bultos pesados que llegaron del centro logístico",
      "Manejaste la compu vieja con Windows 7 buscando un número de guía en el sistema que andaba lentísimo",
      "Te tocó pesar encomiendas en la balanza electrónica peleándole los gramos a un cliente avaro",
      "Entregaste tres paquetes de compras online verificando firmas y huellas en las planillas amarillentas",
      "Atendiste el teléfono de la sucursal de Limpio aguantando a 15 clientes preguntando: '¿Llegó mi pedido?'",
      "Tuviste que separar las cartas documento de los paquetes chicos bajo el ventilador de techo que chillaba",
    ],
    contextos: [
      "con la cola de gente saliendo hasta la vereda bajo el solazo de Limpio,",
      "mientras el sistema informático del correo se colgaba cada vez que querías escanear un código,",
      "con la pistola de cinta trabándose con el rollo pegajoso a mitad de paquete,",
      "mientras un cliente apurado te golpeaba el vidrio de la ventanilla con las llaves de la moto,",
      "con el olor a cartón húmedo y polvo de encomiendas que te hacía estornudar sin parar,",
      "buscando un sobre chiquito entre cajas de repuestos y televisores gigantes,",
      "con el calor asfixiante de la sucursal mientras el aire acondicionado tiraba apenas una brisa tibia,",
      "aguantando a un tipo que te decía: '¡Pero si en la página dice que ya está en sucursal!',",
      "con una pila de cajas tambaleándose al borde de caerse arriba del mostrador,",
      "con los dedos negros de tinta por estampar sellos en 200 planillas consecutivas,",
    ],
    exitos: [
      "y encontraste el paquete perdido al toque en el fondo del depósito: el cliente te bendijo y te dejó una propina jugosa.",
      "y liquidaste la fila entera de la ventanilla en tiempo récord: el encargado de Limpio te felicitó y te pagó un bono en mano.",
      "y el camión de caudales llegó justo a tiempo con todas las planillas firmadas y cobraste comisión completa.",
      "y la doña quedó tan agradecida con su encomienda que te trajo dos empanadas de carne y una gaseosa fría.",
      "y cerraste la caja del día sin que falte un solo paquete ni un solo guaraní: jornal completo y premio de puntualidad.",
    ],
    fracasos: [
      "pero se te cayó una caja frágil desde lo alto del estante y se escuchó un ruido a vidrio roto catastrófico.",
      "pero se cortó la luz en todo Limpio, la compu se apagó de golpe y la gente en la fila empezó a putear en coro.",
      "pero le entregaste el paquete a un tipo con el mismo apellido y te comiste tremendo sumario administrativo.",
      "pero se te terminó el rollo de cinta de embalar en plena hora pico y el camión se fue dejándote las cajas.",
      "pero una caja con botellas de miel de caña se reventó en el depósito manchándote los zapatos y 10 paquetes más.",
    ],
  },
  espia: {
    roles: [
      "Te pusiste anteojos negros y gabardina a seguir a un sospechoso de infidelidad por la estación de tren",
      "Plantaste un micrófono oculto en una maceta en el lobby de un hotel céntrico",
      "Clonaste la tarjeta de acceso a las oficinas de una empresa fantasma en Puerto Madero",
      "Hackeaste las cámaras de seguridad de un estacionamiento para cazar una reunión clandestina",
      "Sacaste 40 fotos con teleobjetivo desde la ventanilla de un auto polarizado sin que nadie te vea",
      "Te hiciste pasar por mozo en una cena VIP para escuchar la conversación de dos políticos turbios",
      "Interceptaste un paquete con documentos confidenciales en un bar de San Telmo",
      "Rastreaste la IP de un estafador virtual hasta un monoblock en Villa Lugano",
      "Hiciste una guardia de 8 horas adentro del baúl de un auto comiendo galletitas de agua",
      "Instalaste un rastreador GPS magnético abajo del paragolpes de una camioneta sospechosa",
    ],
    contextos: [
      "con la gabardina haciéndote transpirar a chorros bajo un calor de 35 grados,",
      "mientras fingías leer un diario con dos agujeros recortados para espiar,",
      "esquivando la mirada de un guardia patovica que te sacaba dos cabezas,",
      "con la batería de la cámara al 2% y el blanco a punto de subirse a un taxi,",
      "con el corazón en la garganta disimulando que hablabas solo por celular,",
      "haciendo equilibrio en una escalera de incendios oxidada que crujía con cada paso,",
      "mientras el café amargo de termo te quemaba la lengua en plena madrugada,",
      "aguantando las ganas de estornudar para que no te descubran atrás de una cortina,",
      "con un perro caniche que no paraba de ladrarte desde un balcón buchoneando tu posición,",
      "en un callejón oscuro con el teléfono descartable vibrando a cada segundo,",
    ],
    exitos: [
      "y sacaste la foto infraganti con nitidez 4K: el cliente te pagó los honorarios de detective con un fajo en dólares.",
      "y la grabación de audio salió impecable sin ruido blanco: cobraste la misión encubierta al contado.",
      "y te esfumaste en la multitud como un fantasma sin dejar rastros: el informante te depositó la recompensa.",
      "y el GPS funcionó a la perfección marcando la ruta exacta: el cliente te dio una propina monstruosa.",
      "y coronaste la infiltración como el mismísimo 007 criollo: jornal de agente secreto y felicitaciones.",
    ],
    fracasos: [
      "pero te sonó la alarma del celular con el ringtone de Los Palmeras y te descubrieron al toque.",
      "pero se te cayó el lente teleobjetivo rodando por las escaleras y tuviste que salir corriendo.",
      "pero el sospechoso se dio cuenta, te persiguió con dos primos y perdiste la cámara en la huida.",
      "pero dejaste la tapa de la lente puesta en todas las fotos y te cancelaron el contrato por nabo.",
      "pero te quedaste dormido en la guardia adentro del auto y el blanco se fue hace 4 horas.",
    ],
  },
  manicura: {
    roles: [
      "Te tocó esculpir uñas de acrílico XXL con pedrería y strass a una clienta recontra exigente",
      "Hiciste un esmaltado semipermanente en tono vía láctea con francesita impecable",
      "Tuviste que limar y retirar 10 uñas postizas pegadas con pegamento instantáneo trucho",
      "Diseñaste nail art a mano alzada con pincel fino haciendo dibujitos de mariposas y fuego",
      "Hiciste capping de gel fortalecedor mientras tu clienta te ventilaba todo su historial amoroso",
      "Te pusiste a atender 4 turnos seguidos de señoras coquetas en el showroom de tu casa",
      "Hiciste extensión con soft gel y efecto ojo de gato magnético que brillaba en la oscuridad",
      "Arreglaste una uña partida al ras haciendo magia con polvo acrílico y molde de papel",
      "Pusiste glitter encapsulado y dijes dorados en un set completo para una quinceañera",
      "Atendiste un turno de urgencia un sábado a las 9 de la noche para una novia desesperada",
    ],
    contextos: [
      "mientras la clienta no paraba de mover los dedos para mandar audios de 7 minutos por WhatsApp,",
      "tragando polvo de limado que te dejaba las pestañas y el barbijo tapizados de blanco,",
      "con la clienta contándote que el novio le mira las historias a la prima y llorando arriba de la mesa,",
      "con la cabina UV recalentada y la clienta quejándose: '¡Ay me quema, me quema!',",
      "con el torno eléctrico chillando a 30.000 revoluciones mientras sostenías la uña con pulso de cirujano,",
      "aguantando el olor fuerte a monómero acrílico con la ventana abierta y frío polar,",
      "con los ojos bizcos de pintar rayitas de un milímetro sin pestañear,",
      "con la clienta diciendo cada 2 minutos: 'Fijate que esa me quedó medio torcidita',",
      "mientras se te volcaba el potecito de strass diminuto desparramando 500 brillos por el piso,",
      "con mate dulce y galletitas de agua en la mesita mientras chusmeaban las fotos de Instagram,",
    ],
    exitos: [
      "y las uñas quedaron dignas de tapa de revista: la clienta subió la foto a sus historias, te llovieron 20 turnos y te dejó propina.",
      "y el set duró intacto sin desprenderse ni un milímetro: cobraste la sesión completa más un extra por el nail art.",
      "y la novia quedó fascinada con el diseño de brillos: te pagó el triple por el rescate de último momento.",
      "y la clienta se fue desahogada y con manos de reina: te transfirió de una y te recomendó a todas las amigas.",
      "y liquidaste el esmaltado en tiempo récord con acabado espejo: ganancia limpia y agenda llena.",
    ],
    fracasos: [
      "pero la clienta metió el dedo fresco adentro de la campera y se le pegó toda la pelusa de la lana.",
      "pero se te zafó la fresa del torno y le rozaste la cutícula a una doña que te armó tremendo escándalo.",
      "pero la clienta te dijo: 'No me gustó el tono, sacámelo todo' después de 3 horas de laburo al pedo.",
      "pero la clienta te dijo 'te transfiero cuando llegue a casa' y te clavó visto y bloqueo.",
      "pero se te volcó el frasco entero de acetona pura arriba de la mesa derritiendo el mantel de plástico.",
    ],
  },
  tatuadora: {
    roles: [
      "Tuviste que tatuar un león realista con ojos celestes en el antebrazo de un pibe de 20 años",
      "Te tocó tapar con un cover-up gigante en tinta negra el nombre de la ex pareja de un flaco arrepentido",
      "Hiciste una sesión maratónica de 6 horas de puntillismo y mandalas en la espalda",
      "Tatuaste unas frases en letra cursiva en las costillas a una piba que temblaba del dolor",
      "Hiciste un piercing en la nariz esquivando los lagrimones de una clienta cagona",
      "Tatuaste un escudo de fútbol con laureles y estrellas a un fanático descontrolado",
      "Hiciste un diseño de anime en estilo blackwork con líneas finas y sombras suaves",
      "Tuviste que hacer un brazalete maorí a mano alzada acomodando las curvas con marcador",
      "Tatuaste un retrato de un perrito caniche con sombreado gris plata y detalles blancos",
      "Calibraste la máquina de tatuar con aguja de 3RL para tirar líneas perfectas sin temblar",
    ],
    contextos: [
      "mientras el cliente se quejaba: 'Pará un toque que me duele' cada 4 pinchazos con la aguja,",
      "con la espalda doblada en cuatro hace 5 horas y la luz del aro led quemándote la retina,",
      "esquivando un desmayo inminente del cliente que se puso blanco como un papel,",
      "con la máquina rotativa zumbando como un enjambre de avispas mientras limpiabas con papel tissue,",
      "con el stencil que se borraba a mitad del tatuaje obligándote a improvisar a puro pulso,",
      "aguantando a tres amigos del cliente que fueron a hacer aguante y opinaban de cada trazo,",
      "con olor a jabón verde antibacterial y vaselina sólida pegada en los guantes de nitrilo,",
      "mientras sonaba heavy metal y trap a todo volumen en el estudio para tapar los quejidos,",
      "con las piernas acalambradas en la banqueta redonda y la aguja rozando el hueso de la muñeca,",
      "con el cliente apretando una pelotita antiestrés como si le fuera la vida en ello,",
    ],
    exitos: [
      "y el cover-up tapó el nombre de la ex a la perfección: el cliente te abrazó llorando y te dejó una propina en billetes.",
      "y las líneas quedaron rectas y prolijas como talladas en piedra: el pibe te etiquetó y te llenaron la agenda de reservas.",
      "y el tatuaje en las costillas quedó soñado: la clienta aguantó como una campeona y pagó la sesión al contado.",
      "y el retrato del perrito quedó idéntico a la foto: cobraste cachet de artista de primera categoría.",
      "y terminaste la manga completa antes de que cierre el local: jornalazo récord con propina incluida.",
    ],
    fracasos: [
      "pero el cliente se movió de golpe por el cosquilleo y le quedó una raya torcida afuera del dibujo.",
      "pero al cliente le bajó la presión, se desmayó de la camilla y tuviste que darle un caramelo de apuro.",
      "pero el cliente se miró al espejo y dijo: 'En la foto se veía más grande' y te discutió el precio 40 minutos.",
      "pero te salpicó tinta negra indeleble en tu remera favorita nueva y se arruinó para siempre.",
      "pero la máquina se quedó sin batería a 3 centímetros de terminar la última sombra.",
    ],
  },
  macumbero: {
    roles: [
      "Preparaste un caldero con ruda, azufre y miel para destrabar un juicio sucesorio",
      "Fuiste a un cruce de cuatro esquinas a medianoche a plantar siete velas rojas y pochoclo",
      "Tiraste las cartas del Tarot Marsellés para averiguar si el marido de una clienta andaba de picaflor",
      "Ataste una cinta roja de siete nudos con la foto de un deudor para que pague hasta el último centavo",
      "Hiciste una descarga espiritual con humo de tabaco y caña con ruda en una gomería embrujada",
    ],
    contextos: [
      "con olor a incienso barato y velas de sebo derritiéndose sobre el piso de baldosas,",
      "esquivando las miradas desconfiadas de los vecinos del barrio que te miraban de reojo,",
      "con una copa de sidra y maíz pisingallo ofrendados a los santos en una esquina oscura,",
      "mientras las cenizas de romero volaban por el aire y se te metían en los ojos,",
      "con los perros de la cuadra aullando como locos al compás de tus oraciones en voz baja,",
    ],
    exitos: [
      "y la entidad dio el visto bueno: la clienta te pagó con un billete de diez mil y una botella de vino tinto.",
      "y el amarre quedó sellado a fuego: el pibe volvió al otro día llorando de amor y cobraste el laburo completo.",
      "y la mala racha del negocio se cortó de golpe: el dueño te llenó el bolsillo agradecido.",
      "y las cartas cantaron la posta: la clienta te dejó propina y te recomendó a todas las amigas del zumba.",
    ],
    fracasos: [
      "pero una ráfaga de viento te voló la ceniza a la cara y casi te prendés fuego la barba con una vela.",
      "pero un perro callejero se robó la tira de asado que habías dejado de ofrenda en la esquina.",
      "pero te confundiste de nombre en la oración y le amarraste el corazón a la suegra de la clienta.",
    ],
  },
  profesora_especial: {
    roles: [
      "Armaste una secuencia pedagógica con pictogramas PECS para estructurar la rutina matutina de un nene",
      "Guiaste una sesión de estimulación sensorial con texturas, mordillos y música suave en el gabinete",
      "Adaptaste un examen de matemática con consignas visuales y números en relieve para una nena integrada",
      "Trabajaste la coordinación óculo-manual y pinza fina usando bloques encastrables de madera",
      "Configuraste un comunicador digital con sintetizador de voz para un alumno no verbal",
    ],
    contextos: [
      "con el timbre del recreo sonando al lado de la ventana y el bullicio de los chicos en el pasillo,",
      "con una paciencia titánica mientras el alumno exploraba las texturas a su propio ritmo,",
      "en una mesita adaptada con velcro y almohadones ergonómicos para evitar sobrecargas,",
      "con la maestra de grado mirando con admiración cómo lograbas calmar la ansiedad de la sala,",
      "compartiendo una sonrisa cómplice con la mamá que esperaba los avances en la puerta,",
    ],
    exitos: [
      "y el nene logró señalar 'quiero agua' por primera vez: emoción total en el gabinete y honorarios cobrados con creces.",
      "y la adaptación funcionó tan bien que el alumno aprobó la unidad con honores: la directora felicitó tu informe.",
      "y la sesión de integración fluyó sin una sola crisis: cobraste la mensualidad de apoyo con propina de los padres.",
      "y el informe interdisciplinario fue aprobado por el neurólogo: te renovaron el contrato con aumento de horas.",
    ],
    fracasos: [
      "pero el nene se entusiasmó de más, voló la caja de témperas por el aire y quedaron los dos pintados de azul.",
      "pero el velcro de los pictogramas se pegó a tu guardapolvo y terminaste con cinco tarjetas colgando de la panza.",
      "pero la plastilina sensorial se derritió por el calor y se pegó en los pelitos del brazo del alumno.",
    ],
  },
};

// Buffer FIFO en memoria para evitar combinaciones repetidas (ampliado a 120 hashes)
const recentHashes: string[] = [];
const FIFO_MAX_SIZE = 120;

/**
 * Genera una changa no repetida con roles, contextos y desenlaces aleatorios.
 */
export function generateMadLibsJob(
  categoryOrProfession: JobCategory | ProfessionType,
  forcedSuccess?: boolean,
  blooperResistancePercent: number = 0
): {
  category: JobCategory;
  profession?: ProfessionType;
  role: string;
  context: string;
  outcome: string;
  fullText: string;
  isSuccess: boolean;
  hash: string;
} {
  const isProfession = categoryOrProfession in PROFESSION_MAD_LIBS;
  const pool = isProfession
    ? PROFESSION_MAD_LIBS[categoryOrProfession as ProfessionType]
    : MAD_LIBS_CATEGORIES[categoryOrProfession as JobCategory];

  const derivedCategory: JobCategory = isProfession
    ? PROFESSIONS[categoryOrProfession as ProfessionType]?.category || "calle"
    : (categoryOrProfession as JobCategory);

  // Chance base de blooper ("fracaso"): 12%.
  // Con blooperResistancePercent (ej. 80% de sede taller/sede), se reduce hasta un 80% (2.4% chance).
  const clampedResistance = Math.max(0, Math.min(99, blooperResistancePercent));
  const failureChance = Math.max(0.01, 0.12 * (1 - (clampedResistance / 100)));
  const isSuccess = forcedSuccess !== undefined ? forcedSuccess : Math.random() >= failureChance;
  const outcomes = isSuccess ? pool.exitos : pool.fracasos;

  let chosenRole = "";
  let chosenContext = "";
  let chosenOutcome = "";
  let hash = "";

  // Intentar hasta 25 veces encontrar una combinación no reciente
  for (let attempt = 0; attempt < 25; attempt++) {
    const rIdx = Math.floor(Math.random() * pool.roles.length);
    const cIdx = Math.floor(Math.random() * pool.contextos.length);
    const oIdx = Math.floor(Math.random() * outcomes.length);

    hash = `${categoryOrProfession}:${rIdx}-${cIdx}-${oIdx}-${isSuccess ? "S" : "F"}`;

    chosenRole = pool.roles[rIdx];
    chosenContext = pool.contextos[cIdx];
    chosenOutcome = outcomes[oIdx];

    if (!recentHashes.includes(hash)) {
      break;
    }
  }

  // Registrar en FIFO
  recentHashes.push(hash);
  if (recentHashes.length > FIFO_MAX_SIZE) {
    recentHashes.shift();
  }

  const fullText = `${chosenRole} ${chosenContext} ${chosenOutcome}`;

  return {
    category: derivedCategory,
    profession: isProfession ? (categoryOrProfession as ProfessionType) : undefined,
    role: chosenRole,
    context: chosenContext,
    outcome: chosenOutcome,
    fullText,
    isSuccess,
    hash,
  };
}

