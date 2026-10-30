/**
 * Catálogo Oficial de Héroes de Mobile Legends: Bang Bang (MLBB).
 */

export interface MlbbHeroDefinition {
  id: string;
  name: string;
  aliases: string[];
  role: string;
  lane: string;
  iconUrl: string;
}

export const MLBB_HEROES: MlbbHeroDefinition[] = [
  {
    id: "gusion",
    name: "Gusion",
    aliases: ["gusion", "gus"],
    role: "Asesino / Mago",
    lane: "Jungla / Línea Media",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_bf16690876761b80822df90eb3320d69.png",
  },
  {
    id: "chou",
    name: "Chou",
    aliases: ["chou"],
    role: "Combatiente",
    lane: "Línea de Exp / Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_3ecd2c0843df7ec85044dafff6bf4553.png",
  },
  {
    id: "alucard",
    name: "Alucard",
    aliases: ["alucard", "alu"],
    role: "Combatiente / Asesino",
    lane: "Jungla / Línea de Exp",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_0bd96658e5b8ec578226ea1622bd7231.png",
  },
  {
    id: "ling",
    name: "Ling",
    aliases: ["ling"],
    role: "Asesino",
    lane: "Jungla",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_017bade52b9fc94bbc12615de6d75c08.png",
  },
  {
    id: "bruno",
    name: "Bruno",
    aliases: ["bruno"],
    role: "Tirador",
    lane: "Línea de Oro",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_2a733ac5b7d1f97093e82940af6f5008.png",
  },
  {
    id: "estes",
    name: "Estes",
    aliases: ["estes"],
    role: "Apoyo",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_ff4de3b0aabd1d2f6e184db1c831f6a9.png",
  },
  {
    id: "gord",
    name: "Gord",
    aliases: ["gord"],
    role: "Mago",
    lane: "Línea Media",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_9513f5e10ec33f76747732eaf2082259.png",
  },
  {
    id: "valir",
    name: "Valir",
    aliases: ["valir"],
    role: "Mago",
    lane: "Línea Media / Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_bf16690876761b80822df90eb3320d69.png",
  },
  {
    id: "carmilla",
    name: "Carmilla",
    aliases: ["carmilla"],
    role: "Apoyo / Tanque",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_6fb8f120dafdcbc1b5da2a2667016ad5.png",
  },
  {
    id: "floryn",
    name: "Floryn",
    aliases: ["floryn"],
    role: "Apoyo",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_5a57b91e4914cf071a3849e352e530a5.png",
  },
  {
    id: "lolita",
    name: "Lolita",
    aliases: ["lolita"],
    role: "Tanque / Apoyo",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_474cea36a4bfdc7bf7d94530853a99b2.png",
  },
  {
    id: "gloo",
    name: "Gloo",
    aliases: ["gloo"],
    role: "Tanque",
    lane: "Línea de Exp",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_c472fe0233e5ef84a3ac9ba4a229d09f.png",
  },
  {
    id: "popol_kupa",
    name: "Popol and Kupa",
    aliases: ["popol and kupa", "popol", "kupa"],
    role: "Tirador",
    lane: "Línea de Oro / Jungla",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_1acbb23b9a50f412104047a60eb18808.png",
  },
  {
    id: "khufra",
    name: "Khufra",
    aliases: ["khufra"],
    role: "Tanque / Apoyo",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_2fe99f4001211d18b3d2b95d0d3dc395.png",
  },
  {
    id: "minotaur",
    name: "Minotaur",
    aliases: ["minotaur", "minotauro"],
    role: "Tanque / Apoyo",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_3ecd2c0843df7ec85044dafff6bf4553.png",
  },
  {
    id: "argus",
    name: "Argus",
    aliases: ["argus"],
    role: "Combatiente",
    lane: "Línea de Exp",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_0bd96658e5b8ec578226ea1622bd7231.png",
  },
  {
    id: "masha",
    name: "Masha",
    aliases: ["masha"],
    role: "Combatiente / Tanque",
    lane: "Línea de Exp",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_4d79ba6ebb0a0f2bf542917f0b19d056.png",
  },
  {
    id: "rafaela",
    name: "Rafaela",
    aliases: ["rafaela", "rafa"],
    role: "Apoyo",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_68277dce415742c4a98883151c693a07.png",
  },
  {
    id: "aulus",
    name: "Aulus",
    aliases: ["aulus"],
    role: "Combatiente",
    lane: "Jungla / Línea de Exp",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_1366d775809e52ee6526b5b58d93cdff.png",
  },
  {
    id: "edith",
    name: "Edith",
    aliases: ["edith"],
    role: "Tanque / Tirador",
    lane: "Línea de Exp / Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_daab57918de01a6d5bb2ed6f45808a7e.png",
  },
  {
    id: "diggie",
    name: "Diggie",
    aliases: ["diggie"],
    role: "Apoyo",
    lane: "Roaming",
    iconUrl: "https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_1232_1/100_b1bdf46136cb8a7903dae6d58e8349cb.png",
  },
];
