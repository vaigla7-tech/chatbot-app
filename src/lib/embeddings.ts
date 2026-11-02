import { env } from "./env";
import { openAIClient } from "./ai/openai";

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  tokens: number;
}

export function embeddingsEnabled(): boolean {
  const e = env();
  return (e.EMBEDDING_PROVIDER ?? "openai") === "openai" && Boolean(e.OPENAI_API_KEY);
}

export function embeddingModel(): string {
  return env().EMBEDDING_MODEL ?? "text-embedding-3-small";
}

/** Embed texts in batches. Returns null when no embedding provider is configured. */
export async function embedTexts(texts: string[]): Promise<EmbeddingResult | null> {
  if (!embeddingsEnabled() || texts.length === 0) return null;
  const client = openAIClient(60_000);
  const model = embeddingModel();
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 24_000));
    const res = await client.embeddings.create({ model, input: batch });
    for (const item of res.data) vectors.push(item.embedding);
    tokens += res.usage?.total_tokens ?? 0;
  }
  return { vectors, model, tokens };
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
