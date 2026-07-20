// src/graph/kg/embedding/index.ts — Code embedding 层导出

export {
  nodeToEmbeddingText,
  isEmbeddable,
  buildCodeEmbeddingIndex,
  searchCodeVectors,
  saveCodeEmbeddingIndex,
  loadCodeEmbeddingIndex,
  EMBEDDABLE_KINDS,
} from './code-embedding.js';

export type {
  CodeEmbeddingIndex,
  VectorSearchResult,
} from './code-embedding.js';
