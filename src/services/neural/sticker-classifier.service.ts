import { NeuralMLP } from "./mlp.js";
import { FEATURE_DIMENSION, vectorizeText } from "./vectorizer.js";

export const STICKER_MOOD_CATEGORIES = [
  "bardo",
  "burla",
  "risa",
  "triste",
  "wtf",
  "festejo",
  "afecto",
  "duda",
] as const;

export type StickerMoodCategory = (typeof STICKER_MOOD_CATEGORIES)[number];

export interface StickerMoodPrediction {
  topCategory: StickerMoodCategory;
  confidence: number;
  ranked: Array<{ category: StickerMoodCategory; prob: number }>;
}

const DATASET: Array<{ category: StickerMoodCategory; text: string }> = [
  // bardo
  { category: "bardo", text: "deja de trolear la concha de tu madre" },
  { category: "bardo", text: "me tienen podrido los mancos de este equipo" },
  { category: "bardo", text: "se re pudrio todo aca loco" },
  { category: "bardo", text: "no te hagas el picante conmigo gil" },
  { category: "bardo", text: "anda a cagar boludo siempre haces lo mismo" },
  { category: "bardo", text: "me tenes las bolas llenas hermano" },
  { category: "bardo", text: "que bronca me da cuando tiran la partida asi" },
  { category: "bardo", text: "si seguis bardeando te voy a cagar a puteadas" },
  { category: "bardo", text: "son infumables jugando de esta manera" },
  { category: "bardo", text: "cerrame el orto un rato que no paras de hablar" },
  { category: "bardo", text: "la re puta madre que los pario perdimos por vos" },
  { category: "bardo", text: "no te banco mas pibe sos un dolor de huevos" },
  { category: "bardo", text: "dale forro move el culo que nos matan a todos" },
  { category: "bardo", text: "te haces el guapo atras de la pantalla bobo" },

  // burla
  { category: "burla", text: "domadisimo quedaste papa no existis" },
  { category: "burla", text: "que manco sos por dios ni una bala pegas" },
  { category: "burla", text: "te bailaron sabroso hermano alto paseo" },
  { category: "burla", text: "sos un pecho frio terrible en las finales" },
  { category: "burla", text: "anda a jugar al buscaminas mejor maestro" },
  { category: "burla", text: "sos un cono con teclado y mouse" },
  { category: "burla", text: "te re descansaron adelante de todo el server" },
  { category: "burla", text: "que papelon acabas de hacer hermano" },
  { category: "burla", text: "desinstala el juego ya mismo por favor" },
  { category: "burla", text: "ni contra los bots en facil ganas vos" },
  { category: "burla", text: "te pasaron el trapo de ida y vuelta" },
  { category: "burla", text: "un bot con lag apunta mejor que vos" },
  { category: "burla", text: "te humillaron en dos segundos crack" },
  { category: "burla", text: "che avisale al monitor que hay que prenderlo" },

  // risa
  { category: "risa", text: "jajajaja me tente mal con eso" },
  { category: "risa", text: "no puedo parar de reirme boludo" },
  { category: "risa", text: "jajaja que hdp me hiciste estallar" },
  { category: "risa", text: "kjjj me muero de risa con esa cara" },
  { category: "risa", text: "jaja es buenisimo ese meme loco" },
  { category: "risa", text: "me cague de risa mal amigo" },
  { category: "risa", text: "jsjsjs sos un payaso terrible" },
  { category: "risa", text: "estoy llorando de la risa aca" },
  { category: "risa", text: "jajaja te fuiste al carajo" },
  { category: "risa", text: "muy bueno lpm jajaja me estalle" },
  { category: "risa", text: "escupi todo el mate de la risa" },
  { category: "risa", text: "ahahaha no da mas de gracioso esto" },
  { category: "risa", text: "jajajsjs que delirio tiraste" },
  { category: "risa", text: "jajaja tiraste la posta me hiciste reir" },

  // triste
  { category: "triste", text: "que bajon hermano estoy re mal hoy" },
  { category: "triste", text: "tuve un dia de mierda no doy mas" },
  { category: "triste", text: "estoy re triste la verdad me pegue un bajon" },
  { category: "triste", text: "que paja todo no tengo ganas de nada" },
  { category: "triste", text: "me rompieron el corazon mal" },
  { category: "triste", text: "estoy hecho mierda animicamente hoy" },
  { category: "triste", text: "que depresion me da este lunes lluvioso" },
  { category: "triste", text: "me fue para el orto en el parcial estoy liquidado" },
  { category: "triste", text: "me quiero poner a llorar que mala suerte" },
  { category: "triste", text: "estoy agotado mentalmente no puedo mas" },
  { category: "triste", text: "que pena me dio enterarme de eso" },
  { category: "triste", text: "me siento re solo ultimamente" },
  { category: "triste", text: "todo me sale mal esta semana lpm" },
  { category: "triste", text: "desaprobe el final y me quiero matar" },

  // wtf
  { category: "wtf", text: "que carajo acabo de leer aca" },
  { category: "wtf", text: "flasheaste cualquiera hermano que decis" },
  { category: "wtf", text: "re turbina eso que mandaste recien" },
  { category: "wtf", text: "pero que mierda es esto amigo" },
  { category: "wtf", text: "wtf chabon estas re loco" },
  { category: "wtf", text: "que flashero todo este asunto" },
  { category: "wtf", text: "bizarro mal lo que contaste recien" },
  { category: "wtf", text: "de donde sacaste semejante falopa" },
  { category: "wtf", text: "me quede tieso viendo ese video" },
  { category: "wtf", text: "para un poco que es re turbio esto" },
  { category: "wtf", text: "que acabo de ver por dios mis ojos" },
  { category: "wtf", text: "cualquiera tiraste ahi no tiene sentido" },
  { category: "wtf", text: "es lo mas raro que vi en todo el mes" },
  { category: "wtf", text: "che esto es completamente surrealista" },

  // festejo
  { category: "festejo", text: "vamos carajo ganamos al fin" },
  { category: "festejo", text: "gg ez partidaza nos mandamos hoy" },
  { category: "festejo", text: "golazo papa vamos arriba la concha de la lora" },
  { category: "festejo", text: "aprobe todo me recibi vamoo" },
  { category: "festejo", text: "campeones otra vez dale que salimos de joda" },
  { category: "festejo", text: "que triunfo epico metimos recien" },
  { category: "festejo", text: "al fin una buena loco hay que festejar" },
  { category: "festejo", text: "salimos primeros en el torneo vamooos" },
  { category: "festejo", text: "rompimos todo hoy somos unos cracks" },
  { category: "festejo", text: "festejen muchachos que lo dimos vuelta" },
  { category: "festejo", text: "que alegria enorme tengo consegui el laburo" },
  { category: "festejo", text: "subi de rango por fin carajo" },
  { category: "festejo", text: "brindemos por esta victoria muchachos" },
  { category: "festejo", text: "feliz cumple papa pasala de diez" },

  // afecto
  { category: "afecto", text: "te quiero mucho amigo gracias por todo" },
  { category: "afecto", text: "un abrazo enorme para vos hermano" },
  { category: "afecto", text: "sos un sol te re banco siempre" },
  { category: "afecto", text: "gracias por estar siempre genio" },
  { category: "afecto", text: "los quiero banda manga de locos" },
  { category: "afecto", text: "que lindo gesto tuviste hoy conmigo" },
  { category: "afecto", text: "sos lo mas grande que hay amigo" },
  { category: "afecto", text: "me alegraste el dia con ese mensaje" },
  { category: "afecto", text: "abrazo grande crack cuidate mucho" },
  { category: "afecto", text: "mucho amor para todo el grupo" },
  { category: "afecto", text: "sos re buena gente vos te aprecio" },
  { category: "afecto", text: "te mando un beso gigante cuidate" },
  { category: "afecto", text: "gracias totales por darme una mano" },
  { category: "afecto", text: "me caes re bien hermano sos un tipazo" },

  // duda
  { category: "duda", text: "che alguien sabe como funciona esto?" },
  { category: "duda", text: "no se si conviene hacerlo asi" },
  { category: "duda", text: "tengo una duda con el codigo del bot" },
  { category: "duda", text: "sera verdad lo que dijeron hoy?" },
  { category: "duda", text: "che a que hora nos conectamos hoy?" },
  { category: "duda", text: "que opinan ustedes de este tema?" },
  { category: "duda", text: "alguien tiene idea donde queda eso?" },
  { category: "duda", text: "no estoy seguro si va a andar bien" },
  { category: "duda", text: "y si mejor probamos otra cosa?" },
  { category: "duda", text: "como era el comando para buscar stickers?" },
  { category: "duda", text: "che esto es posta o es bait?" },
  { category: "duda", text: "cuanto falta para que arranque el partido?" },
  { category: "duda", text: "me explican que paso que colgue?" },
  { category: "duda", text: "dudo mucho que funcione asi nomas" },
];

let cachedClassifier: NeuralMLP | null = null;

export function getClassifier(): NeuralMLP {
  if (cachedClassifier) {
    return cachedClassifier;
  }

  const mlp = new NeuralMLP(
    FEATURE_DIMENSION,
    [...STICKER_MOOD_CATEGORIES],
    24,
    2026
  );

  const samples = DATASET.map((entry) => ({
    features: vectorizeText(entry.text),
    label: entry.category,
  }));

  mlp.train(samples, {
    epochs: 90,
    learningRate: 0.08,
    seed: 2026,
  });

  cachedClassifier = mlp;
  return mlp;
}

export function classifyStickerMood(text: string): StickerMoodPrediction {
  const clf = getClassifier();
  const result = clf.predictProba(vectorizeText(text));
  const ranked = result.probabilities.map((entry) => ({
    category: entry.label as StickerMoodCategory,
    prob: entry.prob,
  }));

  return {
    topCategory: ranked[0].category,
    confidence: ranked[0].prob,
    ranked,
  };
}

export function pickSmartStickerCategory(
  text: string,
  eligibleCats: string[]
): string | null {
  if (eligibleCats.length === 0) {
    return null;
  }

  const eligibleSet = new Set(eligibleCats);
  const { ranked } = classifyStickerMood(text);
  const candidates = ranked.filter((item) => eligibleSet.has(item.category));

  if (candidates.length === 0) {
    return null;
  }

  const top1 = candidates[0];
  const top2 = candidates[1];

  if (top2 && top2.prob >= top1.prob * 0.72) {
    const total = top1.prob + top2.prob;
    return Math.random() * total < top1.prob ? top1.category : top2.category;
  }

  return top1.category;
}
