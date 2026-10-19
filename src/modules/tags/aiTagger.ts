import { getString } from "../../utils/locale";
import { extractMetadata } from "../related/candidateFinder";
import { AIScoringPrefs } from "../related/types";

export interface AITagGenerationSummary {
  processedItems: number;
  taggedItems: number;
  addedTags: number;
  skippedMissingMetadata: number;
  skippedNoNewTags: number;
  failedItems: number;
  apiKeyMissing: boolean;
}

export async function generateTagsForItems(
  items: Zotero.Item[],
  aiPrefs: AIScoringPrefs,
  tagCount: number,
): Promise<AITagGenerationSummary> {
  const summary: AITagGenerationSummary = {
    processedItems: items.length,
    taggedItems: 0,
    addedTags: 0,
    skippedMissingMetadata: 0,
    skippedNoNewTags: 0,
    failedItems: 0,
    apiKeyMissing: false,
  };

  if (!aiPrefs.apiKey.trim()) {
    summary.apiKeyMissing = true;
    return summary;
  }

  for (const item of items) {
    const metadata = extractMetadata(item);
    if (!metadata.title.trim() || !metadata.abstractNote.trim()) {
      summary.skippedMissingMetadata++;
      continue;
    }

    try {
      const tags = await requestAITags(metadata.title, metadata.abstractNote, {
        aiPrefs,
        tagCount,
      });
      const added = await addTagsToItem(item, tags);
      if (added > 0) {
        summary.taggedItems++;
        summary.addedTags += added;
      } else {
        summary.skippedNoNewTags++;
      }
    } catch (error) {
      summary.failedItems++;
      ztoolkit.log("AI tag generation failed", error);
    }
  }

  return summary;
}

async function requestAITags(
  title: string,
  abstractNote: string,
  options: { aiPrefs: AIScoringPrefs; tagCount: number },
) {
  const { aiPrefs } = options;
  const tagCount = clampInteger(options.tagCount, 1, 20);
  const body: any = {
    model: aiPrefs.model,
    messages: [
      {
        role: "system",
        content:
          'Generate concise academic keyword tags for a Zotero item. Use only the provided title and abstract. Return only JSON with shape {"tags":["tag"]}. Do not include explanations. Prefer noun phrases, avoid duplicates, and keep each tag under 6 words.',
      },
      {
        role: "user",
        content: JSON.stringify({
          maxTags: tagCount,
          title: clip(title, 400),
          abstractNote: clip(abstractNote, 2400),
        }),
      },
    ],
    stream: false,
  };

  if (aiPrefs.thinkingEnabled) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = aiPrefs.reasoningEffort;
  }

  const response = await fetch(
    `${aiPrefs.baseURL.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiPrefs.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`AI tag request failed with HTTP ${response.status}`);
  }

  const json = (await response.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return [];
  return parseTags(content).slice(0, tagCount);
}

async function addTagsToItem(item: Zotero.Item, tags: string[]) {
  const existingTags = new Set(
    (item.getTags?.() || []).map((tag) => normalizeTagForComparison(tag.tag)),
  );
  let added = 0;

  for (const tag of tags) {
    const normalized = normalizeGeneratedTag(tag);
    if (!normalized) continue;
    const comparisonKey = normalizeTagForComparison(normalized);
    if (existingTags.has(comparisonKey)) continue;
    if (item.addTag(normalized, 0)) {
      existingTags.add(comparisonKey);
      added++;
    }
  }

  if (added > 0) {
    await item.saveTx();
  }
  return added;
}

function parseTags(content: string) {
  try {
    const parsed = JSON.parse(stripJsonFences(content));
    const tags = Array.isArray(parsed) ? parsed : parsed?.tags;
    if (Array.isArray(tags)) {
      return dedupeTags(tags.map((tag) => String(tag)));
    }
  } catch (error) {
    ztoolkit.log(getString("warning-ai-tag-parse-failed"), error);
  }

  return dedupeTags(
    content
      .replace(/```(?:json)?/gi, "")
      .split(/[\n,;；，]+/u)
      .map((tag) => tag.replace(/^[-*\d.\s]+/u, "")),
  );
}

function dedupeTags(tags: string[]) {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeGeneratedTag(tag);
    const key = normalizeTagForComparison(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    normalizedTags.push(normalized);
  }
  return normalizedTags;
}

function normalizeGeneratedTag(tag: string) {
  return tag
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeTagForComparison(tag: string) {
  return normalizeGeneratedTag(tag).toLocaleLowerCase();
}

function stripJsonFences(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clip(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}
