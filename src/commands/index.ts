import { Command } from "./types.js";
import { FEATURE_FLAGS } from "../config/feature-flags.js";
import { bugCommand, ideaCommand, listaCommand, borrarIdeaCommand } from "./feedback.js";
import { searchCommand } from "./search.js";
import { shutdownCommand } from "./shutdown.js";
import { reglaCommand } from "./regla.js";
import { sCommand } from "./s.js";
import { stickerCommand } from "./sticker.js";
import { audioCommand } from "./audio.js";
import { tomasCommand } from "./tomas.js";
import { downloadCommand, mp3Command } from "./download.js";
import { tokensCommand } from "./tokens.js";
import { reactionCommand } from "./reaction.js";
import { summaryCommand } from "./summary.js";
import { sayCommand, vocesCommand, buildVoiceCommands, createVoiceCommand } from "./say.js";
import { pollCommand } from "./poll.js";
import { rankingCommand } from "./ranking.js";
import { arbitroCommand } from "./arbitro.js";
import { fiscalCommand } from "./fiscal.js";
import { humoCommand } from "./humo.js";
import { dolarCommand, climaCommand, hoyCommand, cumpleCommand } from "./info.js";
import { letraCommand } from "./letra.js";
import { tweetCommand } from "./tweet.js";
import { cronicaCommand } from "./cronica.js";
import { mierdaCommand } from "./mierda.js";
import { claveCommand } from "./clave.js";
import { dniCommand } from "./dni.js";
import { roastCommand } from "./roast.js";
import { socratesCommand } from "./socrates.js";
import { psicologoCommand } from "./psicologo.js";
import { peliCommand } from "./peli.js";
import { shazamCommand } from "./shazam.js";
import { banCommand, unbanCommand, desbanCommand, bansListCommand } from "./ban.js";
import {
  astrologiaCommand,
  horoscopoCommand,
  cartaAstralCommand,
  sinastriaCommand,
  tarotCommand,
  setCumpleCommand,
} from "./astrology/index.js";
import {
  laburarCommand,
  afilarCommand,
  diarioCommand,
  robarCommand,
  ruletaCommand,
  slotCommand,
  estadoCommand,
  billeteraCommand,
  transferirCommand,
  economiaCommand,
  escudoCommand,
  tiendaCommand,
  comprarCommand,
  inventarioCommand,
  comerCommand,
  mutearCommand,
  comprarNombreCommand,
  tituloCommand,
  coimaCommand,
  alimentarCommand,
  profesionCommand,
  blackjackCommand,
  pedirCommand,
  plantarseCommand,
  reclamarCommand,
  asistirCommand,
  universidadCommand,
  borrarTrabajoCommand,
  darFichaCommand,
  quitarFichaCommand,
  darEscudoCommand,
  quitarEscudoCommand,
  buffCommand,
  nerfCommand,
  vaciarCommand,
  saciarCommand,
  hambrearCommand,
  quitarBuffCommand,
  darItemCommand,
  quitarItemCommand,
  congelarCommand,
  descongelarCommand,
  inspeccionarCommand,
  reiniciarEcoCommand,
} from "./economy/index.js";
import {
  juegosCommand,
  pescarCommand,
  acuarioCommand,
  tiendaPescaCommand,
  comprarPescaCommand,
  pokemonCommand,
  pokedexCommand,
  banderaCommand,
  bossCommand,
  atacarCommand,
  wordleCommand,
  palabraCommand,
  superheroeCommand,
  superheroesColeccionCommand,
  mlbbCommand,
  mlbbdexCommand,
  ahorcadoCommand,
  arriesgarCommand,
  ruletarusaCommand,
  campominadoCommand,
  pisarCommand,
  cobrarCommand,
  tuttifruttiCommand,
  ciegoCommand,
  unirmeCommand,
  impostorCommand,
  votarCommand,
  terminarImpostorCommand,
  quienCommand,
} from "./games/index.js";

// Comandos estáticos
const staticCommands: Command[] = [
  sCommand,
  stickerCommand,
  audioCommand,
  downloadCommand,
  mp3Command,
  tokensCommand,
  reactionCommand,
  summaryCommand,
  sayCommand,
  vocesCommand,
  tomasCommand,
  pollCommand,
  rankingCommand,
  arbitroCommand,
  fiscalCommand,
  humoCommand,
  dolarCommand,
  climaCommand,
  astrologiaCommand,
  horoscopoCommand,
  cartaAstralCommand,
  sinastriaCommand,
  tarotCommand,
  setCumpleCommand,
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [laburarCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [afilarCommand] : []),
  diarioCommand,
  robarCommand,
  ruletaCommand,
  slotCommand,
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [estadoCommand] : []),
  billeteraCommand,
  transferirCommand,
  economiaCommand,
  escudoCommand,
  tiendaCommand,
  comprarCommand,
  inventarioCommand,
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [comerCommand] : []),
  mutearCommand,
  comprarNombreCommand,
  tituloCommand,
  coimaCommand,
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [alimentarCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [profesionCommand] : []),
  blackjackCommand,
  pedirCommand,
  plantarseCommand,
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [reclamarCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [asistirCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [universidadCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [borrarTrabajoCommand] : []),
  darFichaCommand,
  quitarFichaCommand,
  darEscudoCommand,
  quitarEscudoCommand,
  buffCommand,
  nerfCommand,
  vaciarCommand,
  saciarCommand,
  hambrearCommand,
  quitarBuffCommand,
  darItemCommand,
  quitarItemCommand,
  congelarCommand,
  descongelarCommand,
  inspeccionarCommand,
  reiniciarEcoCommand,
  juegosCommand,
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [pescarCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [acuarioCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [tiendaPescaCommand] : []),
  ...(FEATURE_FLAGS.WORK_FISHING_SURVIVAL_ENABLED ? [comprarPescaCommand] : []),
  pokemonCommand,
  pokedexCommand,
  banderaCommand,
  bossCommand,
  atacarCommand,
  wordleCommand,
  palabraCommand,
  superheroeCommand,
  superheroesColeccionCommand,
  mlbbCommand,
  mlbbdexCommand,
  ahorcadoCommand,
  arriesgarCommand,
  ruletarusaCommand,
  campominadoCommand,
  pisarCommand,
  cobrarCommand,
  tuttifruttiCommand,
  ciegoCommand,
  unirmeCommand,
  impostorCommand,
  votarCommand,
  terminarImpostorCommand,
  quienCommand,
  hoyCommand,
  cumpleCommand,
  letraCommand,
  tweetCommand,
  cronicaCommand,
  mierdaCommand,
  claveCommand,
  dniCommand,
  roastCommand,
  socratesCommand,
  psicologoCommand,
  peliCommand,
  shazamCommand,
  banCommand,
  unbanCommand,
  desbanCommand,
  bansListCommand,
  bugCommand,
  ideaCommand,
  listaCommand,
  borrarIdeaCommand,
  searchCommand,
  shutdownCommand,
  reglaCommand,
];

// Comandos dinámicos: un comando por cada FISH_VOICE_* en el .env
// Ej: FISH_VOICE_AMIGO → !amigo
const voiceCommands: Command[] = buildVoiceCommands();

export const commandMap = new Map<string, Command>();

// Registrar primero los comandos estáticos (tienen máxima prioridad)
for (const cmd of staticCommands) {
  const normName = cmd.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  commandMap.set(cmd.name.toLowerCase(), cmd);
  commandMap.set(normName, cmd);
  for (const alias of cmd.aliases) {
    const normAlias = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    commandMap.set(alias.toLowerCase(), cmd);
    commandMap.set(normAlias, cmd);
  }
}

// Filtrar comandos dinámicos para que no colisionen con comandos estáticos
const filteredVoiceCommands: Command[] = [];
for (const cmd of voiceCommands) {
  const name = cmd.name.toLowerCase();
  const normName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!commandMap.has(name) && !commandMap.has(normName)) {
    commandMap.set(name, cmd);
    commandMap.set(normName, cmd);
    filteredVoiceCommands.push(cmd);
  }
}

export const commandsList: Command[] = [...staticCommands, ...filteredVoiceCommands];

export function isStaticCommand(name: string): boolean {
  const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return staticCommands.some((c) => {
    const cNorm = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (cNorm === norm || c.name.toLowerCase() === name.toLowerCase()) return true;
    return c.aliases.some((a) => {
      const aNorm = a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return aNorm === norm || a.toLowerCase() === name.toLowerCase();
    });
  });
}

export function registerDynamicVoiceCommand(voiceName: string, referenceId: string): void {
  const name = voiceName.toLowerCase();
  const normName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (isStaticCommand(name)) return;

  const cmd = createVoiceCommand(name, referenceId);
  commandMap.set(name, cmd);
  commandMap.set(normName, cmd);

  const existingIdx = commandsList.findIndex((c) => c.name.toLowerCase() === name);
  if (existingIdx >= 0) {
    commandsList[existingIdx] = cmd;
  } else {
    commandsList.push(cmd);
  }
}

export function unregisterDynamicVoiceCommand(voiceName: string): void {
  const name = voiceName.toLowerCase();
  const normName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  commandMap.delete(name);
  commandMap.delete(normName);

  const existingIdx = commandsList.findIndex((c) => c.name.toLowerCase() === name);
  if (existingIdx >= 0) {
    commandsList.splice(existingIdx, 1);
  }
}