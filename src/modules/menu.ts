import { getString } from "../utils/locale";
import { getSelectedScopeCollections } from "../utils/collectionSelection";
import { getRelatedPrefs } from "./preferences";
import { extractMetadata, findCandidates } from "./related/candidateFinder";
import { rerankCandidatesWithAI } from "./related/aiReranker";
import { openClearRelatedConfirmDialog } from "./related/clearRelatedDialog";
import {
  addBidirectionalRelatedItems,
  clearRelatedItems,
  countRelatedItemLinks,
} from "./related/relatedWriter";
import { openRelatedNetworkDialog } from "./related/networkGraph";
import { openReviewDialog } from "./related/reviewDialog";
import { CandidateSearchScope, SearchScopeMode } from "./related/types";
import { generateTagsForItems } from "./tags/aiTagger";

const MENU_FIND_ID = "zotero-itemmenu-airelatedpapers-find-related";
const MENU_NETWORK_ID = "zotero-itemmenu-airelatedpapers-open-network";
const MENU_TAGS_ID = "zotero-itemmenu-airelatedpapers-generate-tags";
const MENU_CLEAR_RELATED_ID = "zotero-itemmenu-airelatedpapers-clear-related";
let registeredMenuIDs: string[] = [];

export function registerItemContextMenu() {
  if (registeredMenuIDs.length) return;
  const icon = `chrome://${addon.data.config.addonRef}/content/icons/icon16.png`;

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: MENU_FIND_ID,
    label: getString("menu-find-related", "label"),
    icon,
    isHidden: () => !getSingleRegularItem(),
    isDisabled: () => !getSingleRegularItem(),
    commandListener: async () => {
      await runFindRelated();
    },
  });
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: MENU_NETWORK_ID,
    label: getString("menu-open-related-network", "label"),
    icon,
    isHidden: () => !getSingleRegularItem(),
    isDisabled: () => !getSingleRegularItem(),
    commandListener: async () => {
      const source = getSingleRegularItem();
      if (!source) {
        alertUser(getString("error-select-one"));
        return;
      }
      await openRelatedNetworkDialog(source);
    },
  });
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: MENU_TAGS_ID,
    label: getString("menu-generate-tags", "label"),
    icon,
    isHidden: () => !getSelectedRegularItems().length,
    isDisabled: () => !getSelectedRegularItems().length,
    commandListener: async () => {
      await runGenerateTags();
    },
  });
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: MENU_CLEAR_RELATED_ID,
    label: getString("menu-clear-related", "label"),
    icon,
    isHidden: () => !getSelectedRegularItems().length,
    isDisabled: () => !getSelectedRegularItems().length,
    commandListener: async () => {
      await runClearRelated();
    },
  });
  registeredMenuIDs = [
    MENU_FIND_ID,
    MENU_NETWORK_ID,
    MENU_TAGS_ID,
    MENU_CLEAR_RELATED_ID,
  ];
}

export function unregisterItemContextMenu() {
  for (const menuID of registeredMenuIDs) {
    ztoolkit.Menu.unregister(menuID);
  }
  registeredMenuIDs = [];
}

async function runFindRelated(contextItems?: Zotero.Item[]) {
  try {
    const source = getSingleRegularItem(contextItems);
    if (!source) {
      alertUser(getString("error-select-one"));
      return;
    }

    const prefs = getRelatedPrefs();
    let scope = getCurrentScope(source, prefs.searchScope);
    const localPoolSize = prefs.ai.enabled
      ? Math.max(prefs.maxCandidates, prefs.ai.candidateLimit)
      : prefs.maxCandidates;
    let candidates = await findCandidates(source, scope, {
      maxCandidates: localPoolSize,
      minScore: prefs.minScorePercent / 100,
      weights: prefs.weights,
      allowZeroScoreFallback: Boolean(scope.collectionID),
    });
    if (!candidates.length && scope.collectionID) {
      scope = {
        libraryID: source.libraryID,
        label: getString("scope-current-library"),
      };
      candidates = await findCandidates(source, scope, {
        maxCandidates: localPoolSize,
        minScore: prefs.minScorePercent / 100,
        weights: prefs.weights,
      });
    }

    if (!candidates.length) {
      alertUser(getString("result-no-candidates"));
      return;
    }

    const aiCandidateLimit = Math.min(
      prefs.ai.candidateLimit,
      candidates.length,
    );
    const aiCandidates = candidates.slice(0, aiCandidateLimit);
    const localOnlyCandidates = candidates.slice(aiCandidateLimit);
    const aiResult = await rerankCandidatesWithAI({
      source: extractMetadata(source),
      candidates: aiCandidates,
      prefs: prefs.ai,
      maxCandidates: aiCandidateLimit,
    });
    candidates = [...aiResult.candidates, ...localOnlyCandidates]
      .sort((a, b) => b.score - a.score)
      .slice(0, prefs.maxCandidates);
    if (aiResult.warning) {
      alertUser(aiResult.warning);
    }

    const result = await openReviewDialog({
      source: extractMetadata(source),
      candidates,
      scope,
    });
    if (!result.confirmed) return;
    if (!result.selectedItemIDs.length) {
      alertUser(getString("result-no-selection"));
      return;
    }

    const selectedResult = (await Zotero.Items.getAsync(
      result.selectedItemIDs,
    )) as Zotero.Item | Zotero.Item[];
    const selectedItems = Array.isArray(selectedResult)
      ? selectedResult
      : [selectedResult];
    const added = await addBidirectionalRelatedItems(source, selectedItems);
    alertUser(
      getString("result-related-written", {
        args: { count: added },
      }),
    );
  } catch (error) {
    ztoolkit.log("Failed to find related papers", error);
    alertUser(getString("error-run-failed"));
  }
}

async function runGenerateTags(contextItems?: Zotero.Item[]) {
  try {
    const items = getSelectedRegularItems(contextItems);
    if (!items.length) {
      alertUser(getString("error-select-regular-items"));
      return;
    }

    const prefs = getRelatedPrefs();
    const summary = await generateTagsForItems(
      items,
      prefs.ai,
      prefs.tagging.tagCount,
    );
    if (summary.apiKeyMissing) {
      alertUser(getString("warning-ai-tag-key-missing"));
      return;
    }

    alertUser(
      getString("result-ai-tags-generated", {
        args: {
          processed: summary.processedItems,
          tagged: summary.taggedItems,
          added: summary.addedTags,
          skippedMissing: summary.skippedMissingMetadata,
          skippedNoNew: summary.skippedNoNewTags,
          failed: summary.failedItems,
        },
      }),
    );
  } catch (error) {
    ztoolkit.log("Failed to generate AI tags", error);
    alertUser(getString("warning-ai-tag-failed"));
  }
}

async function runClearRelated(contextItems?: Zotero.Item[]) {
  try {
    const items = getSelectedRegularItems(contextItems);
    if (!items.length) {
      alertUser(getString("error-select-regular-items"));
      return;
    }

    const linkCount = await countRelatedItemLinks(items);
    if (!linkCount) {
      alertUser(getString("result-no-related-to-clear"));
      return;
    }

    const confirmed = await openClearRelatedConfirmDialog({
      itemCount: items.length,
      linkCount,
    });
    if (!confirmed) return;

    const removed = await clearRelatedItems(items);
    alertUser(
      getString("result-related-cleared", {
        args: { count: removed },
      }),
    );
  } catch (error) {
    ztoolkit.log("Failed to clear related items", error);
    alertUser(getString("error-clear-related-failed"));
  }
}

function getSingleRegularItem(contextItems?: Zotero.Item[]) {
  const items = getSelectedItems(contextItems);
  if (items.length !== 1) return undefined;

  const item = items[0];
  if (!item?.isRegularItem?.() || (item as any).isFeedItem) return undefined;
  return item;
}

function getSelectedRegularItems(contextItems?: Zotero.Item[]) {
  return getSelectedItems(contextItems).filter(
    (item: Zotero.Item) => item?.isRegularItem?.() && !(item as any).isFeedItem,
  );
}

function getSelectedItems(contextItems?: Zotero.Item[]) {
  return contextItems && contextItems.length
    ? contextItems
    : getActivePane()?.getSelectedItems?.() || [];
}

function getCurrentScope(
  source: Zotero.Item,
  searchScope: SearchScopeMode,
): CandidateSearchScope {
  if (searchScope === "library") {
    return {
      libraryID: source.libraryID,
      label: getString("scope-current-library"),
    };
  }

  const pane = getActivePane();
  const collections = getSelectedScopeCollections(pane, source.libraryID);
  if (collections.length) {
    const recursive = searchScope === "collectionRecursive";
    return {
      libraryID: source.libraryID,
      collectionID: collections[0].id,
      collectionIDs: collections.map((collection) => collection.id),
      recursive,
      label:
        collections.map((collection) => collection.name).join(", ") ||
        getString(
          recursive
            ? "scope-current-collection-recursive"
            : "scope-current-collection",
        ),
    };
  }

  return {
    libraryID: source.libraryID,
    label: getString("scope-current-library"),
  };
}

function getActivePane() {
  return Zotero.getActiveZoteroPane?.() || ztoolkit.getGlobal("ZoteroPane");
}

function alertUser(message: string) {
  ztoolkit.getGlobal("alert")(message);
}
