import { PaperMetadata, SimilarityResult, SimilarityWeights } from "./types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "using",
  "via",
  "with",
]);

export function scoreCandidate(
  source: PaperMetadata,
  candidate: PaperMetadata,
  weights: SimilarityWeights,
): SimilarityResult {
  const titleScore = tokenSimilarity(source.title, candidate.title);
  const abstractScore = Math.max(
    tokenSimilarity(source.abstractNote, candidate.abstractNote),
    tokenSimilarity(
      [source.title, source.abstractNote].join(" "),
      [candidate.title, candidate.abstractNote].join(" "),
    ) * 0.75,
    tokenSimilarity(
      source.abstractNote || source.title,
      candidate.abstractNote || candidate.title,
    ) * 0.65,
  );
  const authorScore = authorSimilarity(source.authors, candidate.authors);
  const tagScore = tagSimilarity(source.tags, candidate.tags);
  const normalizedWeights = normalizeWeights(weights);
  const score =
    normalizedWeights.title * titleScore +
    normalizedWeights.abstract * abstractScore +
    normalizedWeights.authors * authorScore +
    normalizedWeights.tags * tagScore;

  return {
    score,
    titleScore,
    abstractScore,
    authorScore,
    tagScore,
    reasons: buildReasons({
      titleScore,
      abstractScore,
      authorScore,
      tagScore,
    }),
  };
}

function normalizeWeights(weights: SimilarityWeights): SimilarityWeights {
  const title = positiveNumber(weights.title);
  const abstract = positiveNumber(weights.abstract);
  const authors = positiveNumber(weights.authors);
  const tags = positiveNumber(weights.tags);
  const total = title + abstract + authors + tags;

  if (!total) {
    return {
      title: 0.45,
      abstract: 0.35,
      authors: 0.15,
      tags: 0.05,
    };
  }

  return {
    title: title / total,
    abstract: abstract / total,
    authors: authors / total,
    tags: tags / total,
  };
}

function positiveNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildReasons(scores: {
  titleScore: number;
  abstractScore: number;
  authorScore: number;
  tagScore: number;
}) {
  const reasons: string[] = [];
  if (scores.titleScore >= 0.2) reasons.push("similar title");
  if (scores.abstractScore >= 0.12) reasons.push("similar abstract");
  if (scores.authorScore > 0) reasons.push("shared authors");
  if (scores.tagScore > 0) reasons.push("shared tags");
  return reasons.length ? reasons : ["weak local similarity"];
}

function tokenSimilarity(a: string, b: string) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;

  const cosine = cosineSimilarity(aTokens, bTokens);
  const overlap = overlapSimilarity(aTokens, bTokens);
  return 0.7 * cosine + 0.3 * overlap;
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap(expandToken)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function normalizeText(text: string) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
}

function cosineSimilarity(aTokens: string[], bTokens: string[]) {
  const aVector = toTermFrequency(aTokens);
  const bVector = toTermFrequency(bTokens);
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (const value of aVector.values()) aNorm += value * value;
  for (const value of bVector.values()) bNorm += value * value;
  for (const [token, value] of aVector) {
    dot += value * (bVector.get(token) || 0);
  }

  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function overlapSimilarity(aTokens: string[], bTokens: string[]) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let shared = 0;
  for (const token of aSet) {
    if (bSet.has(token)) shared++;
  }
  return shared / Math.min(aSet.size, bSet.size);
}

function toTermFrequency(tokens: string[]) {
  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  return frequency;
}

function expandToken(token: string) {
  if (!hasCJK(token)) {
    return [normalizeToken(token)].filter(Boolean);
  }

  const tokens: string[] = [];
  const cjkChars = Array.from(token).filter(isCJKCharacter);
  for (let index = 0; index < cjkChars.length - 1; index++) {
    tokens.push(`${cjkChars[index]}${cjkChars[index + 1]}`);
  }
  for (let index = 0; index < cjkChars.length - 2; index++) {
    tokens.push(
      `${cjkChars[index]}${cjkChars[index + 1]}${cjkChars[index + 2]}`,
    );
  }

  const latinTokens = token
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/g, " ")
    .split(/[^a-z0-9]+/u)
    .map(normalizeToken)
    .filter(Boolean);
  return [...tokens, ...latinTokens];
}

function normalizeToken(token: string) {
  if (!token || STOP_WORDS.has(token)) return "";
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function hasCJK(token: string) {
  return Array.from(token).some(isCJKCharacter);
}

function isCJKCharacter(char: string) {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(char);
}

function authorSimilarity(sourceAuthors: string[], candidateAuthors: string[]) {
  const source = new Set(sourceAuthors.map(normalizeAuthor).filter(Boolean));
  const candidate = new Set(
    candidateAuthors.map(normalizeAuthor).filter(Boolean),
  );
  if (!source.size || !candidate.size) return 0;

  let shared = 0;
  for (const author of source) {
    if (candidate.has(author)) shared++;
  }
  return shared / Math.min(source.size, candidate.size);
}

function normalizeAuthor(author: string) {
  return normalizeText(author).replace(/\s+/g, " ").trim();
}

function tagSimilarity(sourceTags: string[], candidateTags: string[]) {
  const source = new Set(sourceTags.map(normalizeTag).filter(Boolean));
  const candidate = new Set(candidateTags.map(normalizeTag).filter(Boolean));
  if (!source.size || !candidate.size) return 0;

  let shared = 0;
  for (const tag of source) {
    if (candidate.has(tag)) shared++;
  }
  return shared / Math.min(source.size, candidate.size);
}

function normalizeTag(tag: string) {
  return normalizeText(tag).replace(/\s+/g, " ").trim();
}
