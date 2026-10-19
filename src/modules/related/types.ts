export interface PaperMetadata {
  itemID: number;
  libraryID: number;
  title: string;
  abstractNote: string;
  authors: string[];
  tags: string[];
  year?: number;
}

export interface CandidateSearchScope {
  libraryID: number;
  collectionID?: number;
  collectionIDs?: number[];
  recursive?: boolean;
  label: string;
}

export interface RelatedCandidate {
  itemID: number;
  item: Zotero.Item;
  metadata: PaperMetadata;
  score: number;
  reasons: string[];
}

export interface CandidateFinderOptions {
  maxCandidates: number;
  minScore: number;
  weights: SimilarityWeights;
  allowZeroScoreFallback?: boolean;
}

export interface RelatedPrefs {
  maxCandidates: number;
  minScorePercent: number;
  searchScope: SearchScopeMode;
  weights: SimilarityWeights;
  ai: AIScoringPrefs;
  tagging: AITagGenerationPrefs;
}

export type SearchScopeMode = "collection" | "collectionRecursive" | "library";

export interface SimilarityWeights {
  title: number;
  abstract: number;
  authors: number;
  tags: number;
}

export interface AIScoringPrefs {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
  thinkingEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high";
  candidateLimit: number;
  scoreWeight: number;
}

export interface AITagGenerationPrefs {
  tagCount: number;
}

export interface SimilarityResult {
  score: number;
  titleScore: number;
  abstractScore: number;
  authorScore: number;
  tagScore: number;
  reasons: string[];
}

export interface ReviewDialogInput {
  source: PaperMetadata;
  candidates: RelatedCandidate[];
  scope: CandidateSearchScope;
}

export interface ReviewDialogResult {
  confirmed: boolean;
  selectedItemIDs: number[];
}

export interface AIRerankRequest {
  source: PaperMetadata;
  candidates: RelatedCandidate[];
  prefs: AIScoringPrefs;
  maxCandidates: number;
}

export interface AIRerankResult {
  candidates: RelatedCandidate[];
  usedAI: boolean;
  warning?: string;
}
