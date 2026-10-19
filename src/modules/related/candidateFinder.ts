import {
  CandidateFinderOptions,
  CandidateSearchScope,
  PaperMetadata,
  RelatedCandidate,
} from "./types";
import { scoreCandidate } from "./similarity";

export async function findCandidates(
  source: Zotero.Item,
  scope: CandidateSearchScope,
  options: CandidateFinderOptions,
): Promise<RelatedCandidate[]> {
  const sourceMetadata = extractMetadata(source);
  const relatedItemIDs = getRelatedItemIDs(source);
  const itemIDs = await getScopeItemIDs(scope);
  const scoredCandidates: RelatedCandidate[] = [];

  for (const itemID of itemIDs) {
    if (itemID === source.id || relatedItemIDs.has(itemID)) continue;

    const item = await getItem(itemID);
    if (!isCandidateItem(item, scope.libraryID)) continue;

    const metadata = extractMetadata(item);
    const result = scoreCandidate(sourceMetadata, metadata, options.weights);

    scoredCandidates.push({
      itemID,
      item,
      metadata,
      score: result.score,
      reasons: result.reasons,
    });
  }

  const rankedCandidates = scoredCandidates.sort((a, b) => b.score - a.score);
  const thresholdCandidates = rankedCandidates.filter(
    (candidate) => candidate.score >= options.minScore,
  );
  const fallbackCandidates = rankedCandidates.filter(
    (candidate) => candidate.score > 0,
  );
  const candidates = thresholdCandidates.length
    ? thresholdCandidates
    : fallbackCandidates.length || !options.allowZeroScoreFallback
      ? fallbackCandidates
      : rankedCandidates;

  return candidates.slice(0, options.maxCandidates);
}

export function extractMetadata(item: Zotero.Item): PaperMetadata {
  return {
    itemID: item.id,
    libraryID: item.libraryID,
    title: getField(item, "title") || getDisplayTitle(item),
    abstractNote: getField(item, "abstractNote"),
    authors: getAuthors(item),
    tags: getTags(item),
    year: getYear(item),
  };
}

function getField(item: Zotero.Item, field: string) {
  return String((item.getField(field as any, false, true) as string) || "");
}

function getDisplayTitle(item: Zotero.Item) {
  const displayTitle = (item as any).getDisplayTitle?.();
  return typeof displayTitle === "string" ? displayTitle : "";
}

function getAuthors(item: Zotero.Item) {
  const creators = item.getCreators?.() || [];
  return creators
    .map((creator: any) =>
      [creator.firstName, creator.lastName]
        .filter((part) => typeof part === "string" && part.trim())
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
}

function getTags(item: Zotero.Item) {
  return (item.getTags?.() || [])
    .map((tag: any) => String(tag.tag || "").trim())
    .filter(Boolean);
}

function getYear(item: Zotero.Item) {
  const date = String(
    (item.getField("date" as any, false, true) as string) || "",
  );
  const match = date.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

async function getScopeItemIDs(scope: CandidateSearchScope) {
  const collectionIDs =
    scope.collectionIDs ?? (scope.collectionID ? [scope.collectionID] : []);
  if (collectionIDs.length) {
    const itemIDs = new Set<number>();
    for (const collectionID of collectionIDs) {
      const collection = Zotero.Collections.get(collectionID);
      if (!collection || collection.libraryID !== scope.libraryID) continue;

      if (scope.recursive) {
        const search = new Zotero.Search();
        (search as any).libraryID = scope.libraryID;
        search.addCondition("collectionID", "is", collectionID);
        search.addCondition("recursive", "true");
        search.addCondition("noChildren", "true");
        for (const itemID of await search.search()) itemIDs.add(itemID);
      } else {
        for (const itemID of collection.getChildItems(true) as number[]) {
          itemIDs.add(itemID);
        }
      }
    }
    return Array.from(itemIDs);
  }

  const search = new Zotero.Search();
  (search as any).libraryID = scope.libraryID;
  search.addCondition("noChildren", "true");
  return search.search();
}

async function getItem(itemID: number) {
  return (await Zotero.Items.getAsync(itemID)) as Zotero.Item;
}

function isCandidateItem(
  item: Zotero.Item | false | undefined,
  libraryID: number,
) {
  if (!item || item.libraryID !== libraryID) return false;
  if (!item.isRegularItem?.()) return false;
  if ((item as any).isFeedItem) return false;
  return true;
}

function getRelatedItemIDs(item: Zotero.Item) {
  const ids = new Set<number>();
  const relatedItems = (item as any).relatedItems;
  if (!Array.isArray(relatedItems)) return ids;

  for (const relatedItem of relatedItems) {
    if (typeof relatedItem === "number") {
      ids.add(relatedItem);
    } else if (typeof relatedItem === "string") {
      const resolved = (Zotero.Items as any).getByLibraryAndKey?.(
        item.libraryID,
        relatedItem,
      );
      if (resolved?.id) ids.add(resolved.id);
    } else if (relatedItem?.id) {
      ids.add(relatedItem.id);
    }
  }
  return ids;
}
