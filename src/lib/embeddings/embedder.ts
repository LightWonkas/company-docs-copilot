import type { FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * One interface for every embedding model so ingestion, retrieval and the
 * ablation evals stay model-agnostic. Token counting lives here too: chunk
 * sizes must be measured with the tokenizer of the model that embeds them.
 */
export interface Embedder {
  readonly id: string;
  readonly dims: number;
  /** Max tokens the model attends to; longer input is truncated. */
  readonly maxTokens: number;
  embedQueries(texts: string[]): Promise<number[][]>;
  embedPassages(texts: string[]): Promise<number[][]>;
  countTokens(text: string): Promise<number>;
}

type ModelSpec = {
  id: string;
  model: string;
  dims: number;
  maxTokens: number;
  /** e5 models were trained with these prefixes; bge-m3 uses none. */
  queryPrefix: string;
  passagePrefix: string;
};

export const EMBEDDING_MODELS = {
  "e5-small": {
    id: "e5-small",
    model: "Xenova/multilingual-e5-small",
    dims: 384,
    maxTokens: 512,
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
  },
  "e5-base": {
    id: "e5-base",
    model: "Xenova/multilingual-e5-base",
    dims: 768,
    maxTokens: 512,
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
  },
  "bge-m3": {
    id: "bge-m3",
    model: "Xenova/bge-m3",
    dims: 1024,
    maxTokens: 8192,
    queryPrefix: "",
    passagePrefix: "",
  },
} satisfies Record<string, ModelSpec>;

export type EmbeddingModelId = keyof typeof EMBEDDING_MODELS;

/** The model whose vectors are stored in chunks.embedding (vector(384)). */
export const DEFAULT_EMBEDDER: EmbeddingModelId = "e5-small";

const BATCH = 16;

class TransformersEmbedder implements Embedder {
  readonly id: string;
  readonly dims: number;
  readonly maxTokens: number;
  private extractor: Promise<FeatureExtractionPipeline> | undefined;

  constructor(private readonly spec: ModelSpec) {
    this.id = spec.id;
    this.dims = spec.dims;
    this.maxTokens = spec.maxTokens;
  }

  // Loaded lazily and once per process: model init takes seconds (minutes on
  // the very first download), so it must never happen per request.
  private load(): Promise<FeatureExtractionPipeline> {
    this.extractor ??= (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      if (process.env.MODEL_CACHE_DIR) env.cacheDir = process.env.MODEL_CACHE_DIR;
      return pipeline("feature-extraction", this.spec.model, { dtype: "q8" });
    })();
    return this.extractor;
  }

  private async embed(texts: string[], prefix: string): Promise<number[][]> {
    const extractor = await this.load();
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH).map((t) => prefix + t);
      // Mean pooling + L2 normalisation: cosine distance then equals 1 - dot.
      const output = await extractor(batch, { pooling: "mean", normalize: true });
      vectors.push(...(output.tolist() as number[][]));
    }
    return vectors;
  }

  embedQueries(texts: string[]) {
    return this.embed(texts, this.spec.queryPrefix);
  }

  embedPassages(texts: string[]) {
    return this.embed(texts, this.spec.passagePrefix);
  }

  async countTokens(text: string): Promise<number> {
    const extractor = await this.load();
    return extractor.tokenizer.encode(text).length;
  }
}

const instances = new Map<EmbeddingModelId, Embedder>();

export function getEmbedder(id: EmbeddingModelId = DEFAULT_EMBEDDER): Embedder {
  let instance = instances.get(id);
  if (!instance) {
    instance = new TransformersEmbedder(EMBEDDING_MODELS[id]);
    instances.set(id, instance);
  }
  return instance;
}

/** pgvector text literal. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
