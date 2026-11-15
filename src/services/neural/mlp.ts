import { z } from "zod";

export interface TrainingSample {
  features: number[];
  label: string;
}

export interface PredictionResult {
  label: string;
  confidence: number;
  probabilities: Array<{ label: string; prob: number }>;
}

export interface TrainingConfig {
  hiddenSize?: number;
  learningRate?: number;
  momentum?: number;
  l2Decay?: number;
  epochs?: number;
  seed?: number;
}

export const MLPModelSchema = z.object({
  inputSize: z.number().int().positive(),
  hiddenSize: z.number().int().positive(),
  labels: z.array(z.string().min(1)).min(2),
  w1: z.array(z.array(z.number())),
  b1: z.array(z.number()),
  w2: z.array(z.array(z.number())),
  b2: z.array(z.number()),
});

export type SerializedMLP = z.infer<typeof MLPModelSchema>;

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianLike(rng: () => number, scale: number): number {
  // Suma de 3 uniformes centradas en 0 para aproximar distribución normal sin Math.log(0)
  const u = rng() + rng() + rng() - 1.5;
  return u * scale;
}

function leakyRelu(x: number): number {
  return x > 0 ? x : 0.01 * x;
}

function leakyReluDeriv(x: number): number {
  return x > 0 ? 1 : 0.01;
}

function softmax(logits: number[]): number[] {
  let maxLogit = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > maxLogit) maxLogit = logits[i];
  }
  const exps = new Array<number>(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const val = Math.exp(logits[i] - maxLogit);
    exps[i] = val;
    sum += val;
  }
  for (let i = 0; i < exps.length; i++) {
    exps[i] = sum > 0 ? exps[i] / sum : 1 / logits.length;
  }
  return exps;
}

/**
 * Perceptrón Multicapa (3 capas: Entrada -> Oculta LeakyReLU -> Salida Softmax)
 * entrenado con Cross-Entropy Loss, Backpropagation y SGD con Momentum.
 */
export class NeuralMLP {
  readonly inputSize: number;
  readonly hiddenSize: number;
  readonly labels: string[];
  private labelToIndex: Map<string, number>;

  private w1: number[][];
  private b1: number[];
  private w2: number[][];
  private b2: number[];

  constructor(inputSize: number, labels: string[], hiddenSize = 24, seed = 42) {
    if (labels.length < 2) {
      throw new Error("NeuralMLP requiere al menos 2 clases de salida.");
    }
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.labels = [...labels];
    this.labelToIndex = new Map(labels.map((l, i) => [l, i]));

    const rng = createRng(seed);
    const scale1 = Math.sqrt(2 / inputSize);
    const scale2 = Math.sqrt(1 / hiddenSize);

    this.w1 = Array.from({ length: hiddenSize }, () =>
      Array.from({ length: inputSize }, () => gaussianLike(rng, scale1))
    );
    this.b1 = new Array(hiddenSize).fill(0);

    this.w2 = Array.from({ length: labels.length }, () =>
      Array.from({ length: hiddenSize }, () => gaussianLike(rng, scale2))
    );
    this.b2 = new Array(labels.length).fill(0);
  }

  static fromJSON(raw: unknown): NeuralMLP {
    const parsed = MLPModelSchema.parse(raw);
    const mlp = new NeuralMLP(parsed.inputSize, parsed.labels, parsed.hiddenSize);
    mlp.w1 = parsed.w1;
    mlp.b1 = parsed.b1;
    mlp.w2 = parsed.w2;
    mlp.b2 = parsed.b2;
    return mlp;
  }

  toJSON(): SerializedMLP {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      labels: [...this.labels],
      w1: this.w1.map((row) => [...row]),
      b1: [...this.b1],
      w2: this.w2.map((row) => [...row]),
      b2: [...this.b2],
    };
  }

  private forward(input: number[]): { z1: Float64Array; a1: Float64Array; probs: number[] } {
    const z1 = new Float64Array(this.hiddenSize);
    const a1 = new Float64Array(this.hiddenSize);

    for (let h = 0; h < this.hiddenSize; h++) {
      let sum = this.b1[h];
      const row = this.w1[h];
      for (let i = 0; i < this.inputSize; i++) {
        const x = input[i] ?? 0;
        if (x !== 0) sum += row[i] * x;
      }
      z1[h] = sum;
      a1[h] = leakyRelu(sum);
    }

    const logits = new Array<number>(this.labels.length);
    for (let c = 0; c < this.labels.length; c++) {
      let sum = this.b2[c];
      const row = this.w2[c];
      for (let h = 0; h < this.hiddenSize; h++) {
        sum += row[h] * a1[h];
      }
      logits[c] = sum;
    }

    return { z1, a1, probs: softmax(logits) };
  }

  train(samples: TrainingSample[], config: TrainingConfig = {}): { finalLoss: number; accuracy: number } {
    const epochs = config.epochs ?? 80;
    const baseLr = config.learningRate ?? 0.08;
    const momentum = config.momentum ?? 0.85;
    const l2 = config.l2Decay ?? 1e-4;
    const rng = createRng(config.seed ?? 1337);

    const numClasses = this.labels.length;
    const vw1 = Array.from({ length: this.hiddenSize }, () => new Float64Array(this.inputSize));
    const vb1 = new Float64Array(this.hiddenSize);
    const vw2 = Array.from({ length: numClasses }, () => new Float64Array(this.hiddenSize));
    const vb2 = new Float64Array(numClasses);

    // Precomputar índices dispersos (no cero) por muestra para acelerar forward/backprop
    const prepared = samples
      .map((s) => {
        const targetIdx = this.labelToIndex.get(s.label);
        if (targetIdx === undefined) return null;
        const nzIdx: number[] = [];
        const nzVal: number[] = [];
        for (let i = 0; i < this.inputSize; i++) {
          const v = s.features[i] ?? 0;
          if (v !== 0) {
            nzIdx.push(i);
            nzVal.push(v);
          }
        }
        return { targetIdx, nzIdx, nzVal };
      })
      .filter((item): item is { targetIdx: number; nzIdx: number[]; nzVal: number[] } => item !== null);

    const indices = prepared.map((_, idx) => idx);
    const z1 = new Float64Array(this.hiddenSize);
    const a1 = new Float64Array(this.hiddenSize);
    const logits = new Array<number>(numClasses);
    const dLogits = new Float64Array(numClasses);
    const dHidden = new Float64Array(this.hiddenSize);

    let lastLoss = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      const lr = baseLr * (1 - (0.5 * epoch) / epochs);
      let epochLoss = 0;

      for (const idx of indices) {
        const { targetIdx, nzIdx, nzVal } = prepared[idx];
        const nzLen = nzIdx.length;

        for (let h = 0; h < this.hiddenSize; h++) {
          let sum = this.b1[h];
          const row = this.w1[h];
          for (let k = 0; k < nzLen; k++) {
            sum += row[nzIdx[k]] * nzVal[k];
          }
          z1[h] = sum;
          a1[h] = leakyRelu(sum);
        }

        for (let c = 0; c < numClasses; c++) {
          let sum = this.b2[c];
          const row = this.w2[c];
          for (let h = 0; h < this.hiddenSize; h++) {
            sum += row[h] * a1[h];
          }
          logits[c] = sum;
        }

        const probs = softmax(logits);
        epochLoss += -Math.log(Math.max(1e-9, probs[targetIdx]));

        for (let c = 0; c < numClasses; c++) {
          dLogits[c] = c === targetIdx ? probs[c] - 1 : probs[c];
        }

        dHidden.fill(0);
        for (let c = 0; c < numClasses; c++) {
          const dl = dLogits[c];
          const w2Row = this.w2[c];
          const vw2Row = vw2[c];

          for (let h = 0; h < this.hiddenSize; h++) {
            dHidden[h] += dl * w2Row[h];
            const gradW2 = dl * a1[h] + l2 * w2Row[h];
            vw2Row[h] = momentum * vw2Row[h] - lr * gradW2;
            w2Row[h] += vw2Row[h];
          }
          vb2[c] = momentum * vb2[c] - lr * dl;
          this.b2[c] += vb2[c];
        }

        for (let h = 0; h < this.hiddenSize; h++) {
          const dz = dHidden[h] * leakyReluDeriv(z1[h]);
          const w1Row = this.w1[h];
          const vw1Row = vw1[h];

          for (let k = 0; k < nzLen; k++) {
            const i = nzIdx[k];
            const gradW1 = dz * nzVal[k] + l2 * w1Row[i];
            vw1Row[i] = momentum * vw1Row[i] - lr * gradW1;
            w1Row[i] += vw1Row[i];
          }
          vb1[h] = momentum * vb1[h] - lr * dz;
          this.b1[h] += vb1[h];
        }
      }

      lastLoss = prepared.length > 0 ? epochLoss / prepared.length : 0;
    }

    const evalRes = this.evaluate(samples);
    return { finalLoss: Number(lastLoss.toFixed(4)), accuracy: evalRes.accuracy };
  }

  evaluate(samples: TrainingSample[]): { accuracy: number; loss: number } {
    if (samples.length === 0) return { accuracy: 0, loss: 0 };
    let correct = 0;
    let totalLoss = 0;

    for (const s of samples) {
      const targetIdx = this.labelToIndex.get(s.label);
      if (targetIdx === undefined) continue;
      const { probs } = this.forward(s.features);
      totalLoss += -Math.log(Math.max(1e-9, probs[targetIdx]));

      let bestIdx = 0;
      for (let c = 1; c < probs.length; c++) {
        if (probs[c] > probs[bestIdx]) bestIdx = c;
      }
      if (bestIdx === targetIdx) correct++;
    }

    return {
      accuracy: Number((correct / samples.length).toFixed(4)),
      loss: Number((totalLoss / samples.length).toFixed(4)),
    };
  }

  predictProba(input: number[]): PredictionResult {
    const { probs } = this.forward(input);
    const probabilities = this.labels
      .map((label, idx) => ({ label, prob: probs[idx] }))
      .sort((a, b) => b.prob - a.prob);

    return {
      label: probabilities[0].label,
      confidence: probabilities[0].prob,
      probabilities,
    };
  }
}
