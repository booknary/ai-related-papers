import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import { RelatedPrefs, SearchScopeMode } from "./related/types";

type PluginPrefKey = keyof _ZoteroTypes.Prefs["PluginPrefsMap"];

const DEFAULT_MAX_CANDIDATES = 10;
const DEFAULT_MIN_SCORE_PERCENT = 3;
const DEFAULT_SEARCH_SCOPE: SearchScopeMode = "collection";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_AI_TAG_COUNT = 5;
const SEARCH_SCOPE_VALUES: SearchScopeMode[] = [
  "collection",
  "collectionRecursive",
  "library",
];
const REASONING_EFFORT_VALUES = ["low", "medium", "high"] as const;

export function registerPrefs() {
  const icon = `${rootURI}content/icons/icon32.png`;
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: icon,
  });
}

export function openPluginPreferences() {
  const pane = Zotero.PreferencePanes.pluginPanes.find(
    (entry) => entry.pluginID === addon.data.config.addonID,
  );
  const paneID = pane?.id || addon.data.config.addonID;
  Zotero.Utilities.Internal.openPreferences(paneID);
}

export function registerPreferenceWindow(window: Window) {
  addon.data.prefs = { window };
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-maxCandidates`,
    "maxCandidates",
    1,
    50,
    DEFAULT_MAX_CANDIDATES,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-minScorePercent`,
    "minScorePercent",
    0,
    100,
    DEFAULT_MIN_SCORE_PERCENT,
  );
  bindStringPreference(
    window,
    `zotero-prefpane-${config.addonRef}-searchScope`,
    "searchScope",
    DEFAULT_SEARCH_SCOPE,
    SEARCH_SCOPE_VALUES,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-titleWeight`,
    "titleWeight",
    0,
    100,
    45,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-abstractWeight`,
    "abstractWeight",
    0,
    100,
    35,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-authorWeight`,
    "authorWeight",
    0,
    100,
    15,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-tagWeight`,
    "tagWeight",
    0,
    100,
    5,
  );
  bindBooleanPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiEnabled`,
    "aiEnabled",
    false,
  );
  bindStringPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiBaseURL`,
    "aiBaseURL",
    DEFAULT_BASE_URL,
  );
  bindStringPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiAPIKey`,
    "aiAPIKey",
    "",
  );
  bindStringPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiModel`,
    "aiModel",
    DEFAULT_MODEL,
  );
  bindBooleanPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiThinkingEnabled`,
    "aiThinkingEnabled",
    true,
  );
  bindStringPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiReasoningEffort`,
    "aiReasoningEffort",
    "high",
    REASONING_EFFORT_VALUES,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiCandidateLimit`,
    "aiCandidateLimit",
    1,
    50,
    10,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiScoreWeightPercent`,
    "aiScoreWeightPercent",
    0,
    100,
    50,
  );
  bindNumberPreference(
    window,
    `zotero-prefpane-${config.addonRef}-aiTagCount`,
    "aiTagCount",
    1,
    20,
    DEFAULT_AI_TAG_COUNT,
  );
}

export function getRelatedPrefs(): RelatedPrefs {
  return {
    maxCandidates: clampInteger(
      Number(getPref("maxCandidates")),
      1,
      50,
      DEFAULT_MAX_CANDIDATES,
    ),
    minScorePercent: clampInteger(
      Number(getPref("minScorePercent")),
      0,
      100,
      DEFAULT_MIN_SCORE_PERCENT,
    ),
    searchScope: getStringPref(
      "searchScope",
      DEFAULT_SEARCH_SCOPE,
      SEARCH_SCOPE_VALUES,
    ),
    weights: {
      title: getNumberPref("titleWeight", 0, 100, 45),
      abstract: getNumberPref("abstractWeight", 0, 100, 35),
      authors: getNumberPref("authorWeight", 0, 100, 15),
      tags: getNumberPref("tagWeight", 0, 100, 5),
    },
    ai: {
      enabled: getBooleanPref("aiEnabled", false),
      baseURL: getStringPref("aiBaseURL", DEFAULT_BASE_URL),
      apiKey: getStringPref("aiAPIKey", ""),
      model: getStringPref("aiModel", DEFAULT_MODEL),
      thinkingEnabled: getBooleanPref("aiThinkingEnabled", true),
      reasoningEffort: getStringPref(
        "aiReasoningEffort",
        "high",
        REASONING_EFFORT_VALUES,
      ),
      candidateLimit: getNumberPref("aiCandidateLimit", 1, 50, 10),
      scoreWeight: getNumberPref("aiScoreWeightPercent", 0, 100, 50) / 100,
    },
    tagging: {
      tagCount: getNumberPref("aiTagCount", 1, 20, DEFAULT_AI_TAG_COUNT),
    },
  };
}

function bindNumberPreference(
  window: Window,
  elementID: string,
  prefKey: PluginPrefKey,
  min: number,
  max: number,
  fallback: number,
) {
  const input = window.document.getElementById(elementID) as
    | HTMLInputElement
    | undefined;
  if (!input) return;

  input.value = String(
    clampInteger(Number(getPref(prefKey)), min, max, fallback),
  );
  input.addEventListener("change", () => {
    const value = clampInteger(Number(input.value), min, max, fallback);
    input.value = String(value);
    setPref(prefKey, value as any);
  });
}

function bindStringPreference(
  window: Window,
  elementID: string,
  prefKey: PluginPrefKey,
  fallback: string,
  allowedValues?: readonly string[],
) {
  const input = window.document.getElementById(elementID) as
    | HTMLInputElement
    | HTMLSelectElement
    | undefined;
  if (!input) return;

  input.value = getStringPref(prefKey, fallback, allowedValues);
  input.addEventListener("change", () => {
    const value = getAllowedString(input.value, fallback, allowedValues);
    input.value = value;
    setPref(prefKey, value as any);
  });
}

function bindBooleanPreference(
  window: Window,
  elementID: string,
  prefKey: PluginPrefKey,
  fallback: boolean,
) {
  const input = window.document.getElementById(elementID) as
    | HTMLInputElement
    | undefined;
  if (!input) return;

  input.checked = getBooleanPref(prefKey, fallback);
  input.addEventListener("change", () => {
    setPref(prefKey, input.checked as any);
  });
}

function getNumberPref(
  prefKey: PluginPrefKey,
  min: number,
  max: number,
  fallback: number,
) {
  return clampInteger(Number(getPref(prefKey as any)), min, max, fallback);
}

function getStringPref<T extends string>(
  prefKey: PluginPrefKey,
  fallback: T,
  allowedValues?: readonly T[],
) {
  const value = String(getPref(prefKey as any) || "");
  return getAllowedString(value, fallback, allowedValues);
}

function getAllowedString<T extends string>(
  value: string,
  fallback: T,
  allowedValues?: readonly T[],
) {
  if (!value) return fallback;
  if (allowedValues && !allowedValues.includes(value as T)) return fallback;
  return value as T;
}

function getBooleanPref(prefKey: PluginPrefKey, fallback: boolean) {
  const value = getPref(prefKey as any);
  return typeof value === "boolean" ? value : fallback;
}

function clampInteger(
  value: number,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
