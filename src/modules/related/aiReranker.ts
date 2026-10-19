import { getString } from "../../utils/locale";
import {
  AIRerankRequest,
  AIRerankResult,
  PaperMetadata,
  RelatedCandidate,
} from "./types";

interface ModelScore {
  itemID: number;
  score: number;
  reason?: string;
}

export async function rerankCandidatesWithAI(
  request: AIRerankRequest,
): Promise<AIRerankResult> {
  if (!request.prefs.enabled) {
    return { candidates: request.candidates, usedAI: false };
  }
  if (!request.prefs.apiKey.trim()) {
    return {
      candidates: request.candidates,
      usedAI: false,
      warning: getString("warning-ai-key-missing"),
    };
  }

  try {
    const scores = await requestAIScores(request);
    if (!scores.length) {
      return {
        candidates: request.candidates,
        usedAI: false,
        warning: getString("warning-ai-empty-response"),
      };
    }

    return {
      candidates: mergeAIScores(
        request.candidates,
        scores,
        request.prefs.scoreWeight,
        request.maxCandidates,
      ),
      usedAI: true,
    };
  } catch (error) {
    ztoolkit.log("AI scoring failed", error);
    return {
      candidates: request.candidates,
      usedAI: false,
      warning: getString("warning-ai-failed"),
    };
  }
}

async function requestAIScores(request: AIRerankRequest) {
  const body: any = {
    model: request.prefs.model,
    messages: [
      {
        role: "system",
        content:
          'You score whether Zotero candidate papers are related to a source paper. Return only JSON with shape {"scores":[{"itemID":number,"score":number,"reason":string}]}. Scores must be from 0 to 1.',
      },
      {
        role: "user",
        content: JSON.stringify({
          source: serializePaper(request.source),
          candidates: request.candidates.map((candidate) => ({
            ...serializePaper(candidate.metadata),
            localScore: round(candidate.score),
          })),
        }),
      },
    ],
    stream: false,
  };

  if (request.prefs.thinkingEnabled) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = request.prefs.reasoningEffort;
  }

  const response = await fetch(
    `${request.prefs.baseURL.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.prefs.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`AI request failed with HTTP ${response.status}`);
  }

  const json = (await response.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return [];
  return parseScores(content);
}

function mergeAIScores(
  candidates: RelatedCandidate[],
  scores: ModelScore[],
  aiWeight: number,
  maxCandidates: number,
) {
  const scoreMap = new Map(scores.map((score) => [score.itemID, score]));
  const weight = clamp01(aiWeight);

  return candidates
    .map((candidate) => {
      const aiScore = scoreMap.get(candidate.itemID);
      if (!aiScore) return candidate;

      const finalScore =
        (1 - weight) * candidate.score + weight * clamp01(aiScore.score);
      return {
        ...candidate,
        score: finalScore,
        reasons: [
          ...candidate.reasons,
          getString("reason-ai-score", {
            args: { score: Math.round(clamp01(aiScore.score) * 100) },
          }),
          ...(aiScore.reason ? [`AI: ${aiScore.reason}`] : []),
        ],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates);
}

function serializePaper(paper: PaperMetadata) {
  return {
    itemID: paper.itemID,
    title: clip(paper.title, 300),
    abstractNote: clip(paper.abstractNote, 1200),
    authors: paper.authors.slice(0, 8),
    tags: paper.tags.slice(0, 12),
    year: paper.year,
  };
}

function parseScores(content: string): ModelScore[] {
  const parsed = JSON.parse(stripJsonFences(content));
  const scores = Array.isArray(parsed) ? parsed : parsed?.scores;
  if (!Array.isArray(scores)) return [];

  return scores
    .map((entry) => ({
      itemID: Number(entry.itemID),
      score: normalizeModelScore(Number(entry.score)),
      reason: typeof entry.reason === "string" ? entry.reason : undefined,
    }))
    .filter((entry) => Number.isInteger(entry.itemID));
}

function stripJsonFences(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeModelScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  if (score > 1 && score <= 100) return score / 100;
  return clamp01(score);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clip(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}
