export const HASH_BUCKETS = 128;
export const STYLE_FEATURES = 8;
export const FEATURE_DIMENSION = HASH_BUCKETS + STYLE_FEATURES;

const MAX_INPUT_LENGTH = 500;

function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizeForTokens(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/https?:\/\/\S+/g, " _url_ ")
    .replace(/@\d{5,}/g, " _mention_ ")
    .replace(/[^\p{L}\p{N}\s_?!]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addHashedFeature(buckets: Float64Array, token: string, weight: number): void {
  const h = fnv1aHash(token);
  const idx = h % HASH_BUCKETS;
  const sign = (h & 0x80000000) !== 0 ? -1 : 1;
  buckets[idx] += sign * weight;
}

/**
 * Convierte un texto corto en un vector numérico fijo de 136 dimensiones:
 * 128 buckets de Feature Hashing (unigramas, bigramas y char n-grams) + 8 rasgos de estilo.
 */
export function vectorizeText(rawText: string): number[] {
  const safeText = (rawText || "").slice(0, MAX_INPUT_LENGTH);
  const buckets = new Float64Array(HASH_BUCKETS);

  const normalized = normalizeForTokens(safeText);
  const words = normalized.split(" ").filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    addHashedFeature(buckets, `w:${w}`, 1.0);

    if (i + 1 < words.length) {
      addHashedFeature(buckets, `b:${w}_${words[i + 1]}`, 1.2);
    }

    if (w.length >= 3) {
      const padded = `^${w}$`;
      for (let j = 0; j <= padded.length - 3; j++) {
        addHashedFeature(buckets, `c3:${padded.slice(j, j + 3)}`, 0.45);
      }
      if (padded.length >= 4) {
        for (let j = 0; j <= padded.length - 4; j++) {
          addHashedFeature(buckets, `c4:${padded.slice(j, j + 4)}`, 0.35);
        }
      }
    }
  }

  let normSq = 0;
  for (let i = 0; i < HASH_BUCKETS; i++) {
    normSq += buckets[i] * buckets[i];
  }
  const norm = Math.sqrt(normSq);

  const features = new Array<number>(FEATURE_DIMENSION);
  for (let i = 0; i < HASH_BUCKETS; i++) {
    features[i] = norm > 0 ? buckets[i] / norm : 0;
  }

  const letters = safeText.match(/\p{L}/gu) || [];
  const upperLetters = safeText.match(/\p{Lu}/gu) || [];
  const exclCount = (safeText.match(/!/g) || []).length;
  const questCount = (safeText.match(/\?/g) || []).length;
  const digitCount = (safeText.match(/\d/g) || []).length;
  const emojiCount = (safeText.match(/\p{Extended_Pictographic}/gu) || []).length;
  const hasLaugh = /\b(j[aeiou]{2,}|h[aeiou]{2,}|kjj+|xd+|lol+|lmao+|jsjs+)\b/i.test(normalized) ? 1 : 0;
  const hasElongation = /(.)\1{2,}/i.test(safeText) ? 1 : 0;

  features[HASH_BUCKETS + 0] = Math.min(1, safeText.trim().length / 160);
  features[HASH_BUCKETS + 1] = letters.length > 0 ? upperLetters.length / letters.length : 0;
  features[HASH_BUCKETS + 2] = Math.min(1, exclCount / 3);
  features[HASH_BUCKETS + 3] = Math.min(1, questCount / 3);
  features[HASH_BUCKETS + 4] = hasLaugh;
  features[HASH_BUCKETS + 5] = hasElongation;
  features[HASH_BUCKETS + 6] = Math.min(1, digitCount / 8);
  features[HASH_BUCKETS + 7] = Math.min(1, emojiCount / 4);

  return features;
}
