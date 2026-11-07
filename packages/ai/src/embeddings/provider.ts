import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS, embeddingModels } from '../models';

/**
 * Embeddings for two-stage retrieval (spec 7.1.5). Voyage AI in production; a deterministic
 * feature-hashing model offline so dev, CI and the fairness suite run without a key.
 * Vectors are always EMBEDDING_DIMENSIONS long and L2-normalised.
 */
export type InputType = 'document' | 'query';

export interface EmbeddingsProvider {
  readonly name: 'voyage' | 'local';
  readonly model: string;
  embed(texts: string[], inputType: InputType): Promise<number[][]>;
}

const STOP = new Set(
  'a an and are as at be by for from has have i in is it its of on or our that the their this to was we were with you your who what when how will can into over per than then they them'.split(
    ' ',
  ),
);

/** Lower-cased content words. Shared by the local embedding and the offline matcher. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$€£ ]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function bucket(feature: string): { index: number; sign: number } {
  const h = createHash('sha256').update(feature).digest();
  return { index: h.readUInt32BE(0) % EMBEDDING_DIMENSIONS, sign: h[4]! & 1 ? 1 : -1 };
}

export function normalise(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

/** Feature hashing over words and bigrams. Same text, same vector, on every machine. */
export function localEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const t = tokens(text);
  const features = [...t, ...t.slice(1).map((w, i) => `${t[i]}_${w}`)];
  for (const f of features) {
    const { index, sign } = bucket(f);
    v[index]! += sign;
  }
  return normalise(v);
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

export class LocalEmbeddings implements EmbeddingsProvider {
  readonly name = 'local' as const;
  readonly model = embeddingModels.local;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(localEmbedding);
  }
}

/**
 * Voyage AI embeddings (POST /v1/embeddings). Untested against the live API in this build: the
 * request follows Voyage's documented shape (input, model, input_type, output_dimension).
 */
export class VoyageEmbeddings implements EmbeddingsProvider {
  readonly name = 'voyage' as const;
  readonly model = embeddingModels.voyage;
  constructor(
    private readonly apiKey = process.env.VOYAGE_API_KEY ?? '',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');
  }

  async embed(texts: string[], inputType: InputType): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const batch = texts.slice(i, i + 64);
      const res = await this.fetchImpl('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          input: batch,
          model: this.model,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
        }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings failed: HTTP ${res.status}`);
      const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      const sorted = [...body.data].sort((a, b) => a.index - b.index);
      if (sorted.length !== batch.length)
        throw new Error(`Voyage returned ${sorted.length} of ${batch.length} embeddings`);
      for (const d of sorted) {
        if (d.embedding.length !== EMBEDDING_DIMENSIONS)
          throw new Error(`Voyage returned ${d.embedding.length} dimensions`);
        out.push(normalise(d.embedding));
      }
    }
    return out;
  }
}

export type EmbeddingsProviderName = 'voyage' | 'local';

/** EMBEDDINGS_PROVIDER wins; otherwise Voyage when a key is present, else local. */
export function embeddingsProviderName(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingsProviderName {
  if (env.EMBEDDINGS_PROVIDER === 'voyage' || env.EMBEDDINGS_PROVIDER === 'local')
    return env.EMBEDDINGS_PROVIDER;
  return env.VOYAGE_API_KEY ? 'voyage' : 'local';
}

let cached: EmbeddingsProvider | undefined;
export function defaultEmbeddings(): EmbeddingsProvider {
  cached ??= embeddingsProviderName() === 'voyage' ? new VoyageEmbeddings() : new LocalEmbeddings();
  return cached;
}
