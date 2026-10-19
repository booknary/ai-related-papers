import { assert } from "chai";
import { bindModelSelector } from "../src/modules/ai/modelSelector";
import {
  fetchModelCatalog,
  ModelCatalogError,
  ModelOption,
} from "../src/modules/ai/modelCatalog";
import { config } from "../package.json";

describe("model selector", function () {
  let root: HTMLDivElement;
  const prefix = "model-selector-test";
  let saved: string[];

  beforeEach(function () {
    root = document.createElement("div");
    saved = [];
    for (const [suffix, tag] of [
      ["aiModel", "select"],
      ["aiCustomModel", "input"],
      ["aiFetchModels", "button"],
      ["aiModelsStatus", "div"],
      ["aiBaseURL", "input"],
      ["aiAPIKey", "input"],
    ]) {
      const element = document.createElement(tag);
      element.id = `${prefix}-${suffix}`;
      root.appendChild(element);
    }
    document.body.appendChild(root);
  });

  afterEach(function () {
    root.remove();
  });

  function bind(loadModels: typeof fetchModelCatalog) {
    bindModelSelector({
      window,
      prefix,
      initialModel: "saved-model",
      getConnection: () => ({
        baseURL: "https://api.deepseek.com",
        apiKey: "fixture-key",
      }),
      saveModel: (model) => saved.push(model),
      loadModels,
      messages: {
        custom: "Custom",
        current: (model) => `Saved: ${model}`,
        loading: "Loading",
        loaded: (count) => `Loaded ${count}`,
        failed: () => "Failed",
      },
    });
  }
  const select = () =>
    document.getElementById(`${prefix}-aiModel`) as HTMLSelectElement;
  const refresh = () =>
    document.getElementById(`${prefix}-aiFetchModels`) as HTMLButtonElement;
  const status = () =>
    document.getElementById(`${prefix}-aiModelsStatus`) as HTMLElement;

  it("keeps the saved model until the user chooses a fetched model", async function () {
    let calls = 0;
    bind(async () => {
      calls++;
      return [{ id: "new-model", name: "New Model" }];
    });
    assert.equal(calls, 0);
    assert.equal(select().value, "saved-model");
    refresh().click();
    await waitUntil(() => status().textContent === "Loaded 1");
    assert.equal(select().value, "saved-model");
    assert.deepEqual(saved, []);
    select().value = "new-model";
    select().dispatchEvent(new window.Event("change"));
    assert.deepEqual(saved, ["new-model"]);
    assert.equal(refresh().disabled, false);
  });

  it("supports manual models and ignores blank manual input", function () {
    bind(async () => []);
    const custom = document.getElementById(
      `${prefix}-aiCustomModel`,
    ) as HTMLInputElement;
    select().value = "";
    select().dispatchEvent(new window.Event("change"));
    assert.equal(custom.hidden, false);
    custom.value = " ";
    custom.dispatchEvent(new window.Event("change"));
    assert.deepEqual(saved, []);
    custom.value = "custom-model";
    custom.dispatchEvent(new window.Event("change"));
    assert.deepEqual(saved, ["custom-model"]);
    assert.equal(select().value, "custom-model");
  });

  it("keeps the current selection on API failure", async function () {
    bind(async () => {
      throw new ModelCatalogError("http", 401);
    });
    refresh().click();
    await waitUntil(() => status().textContent === "Failed");
    assert.equal(select().value, "saved-model");
    assert.equal(refresh().disabled, false);
    assert.deepEqual(saved, []);
  });

  it("discards stale results after changing API settings", async function () {
    let resolveModels: (models: ModelOption[]) => void;
    bind(
      async () =>
        new Promise((resolve) => {
          resolveModels = resolve;
        }),
    );
    refresh().click();
    const base = document.getElementById(`${prefix}-aiBaseURL`)!;
    base.dispatchEvent(new window.Event("input"));
    resolveModels!([{ id: "stale-model" }]);
    await Zotero.Promise.delay(20);
    assert.notInclude(
      Array.from(select().options).map((option) => option.value),
      "stale-model",
    );
    assert.equal(select().value, "saved-model");
    assert.equal(refresh().disabled, false);
  });

  describe("model selector in Zotero preferences", function () {
    this.timeout(15000);

    it("fetches and saves models in the actual settings pane", async function () {
      const pane = Zotero.PreferencePanes.pluginPanes.find(
        (entry) => entry.pluginID === config.addonID,
      );
      assert.exists(pane);
      const prefs = Zotero.Utilities.Internal.openPreferences(pane!.id);
      assert.exists(prefs);
      const main = Zotero.getMainWindow() as any;
      const originalFetch = main.fetch;
      const prefKey = `${config.prefsPrefix}.aiModel`;
      const originalModel = Zotero.Prefs.get(prefKey, true);
      let stage = "loading settings";
      try {
        const prefix = `zotero-prefpane-${config.addonRef}`;
        await waitUntil(() =>
          Boolean(prefs!.document.getElementById(`${prefix}-aiModel`)),
        );
        const select = prefs!.document.getElementById(
          `${prefix}-aiModel`,
        ) as HTMLSelectElement;
        stage = "populating model options";
        await waitUntil(() => select.options.length >= 2);
        assert.equal(select.localName, "select");
        const refresh = prefs!.document.getElementById(
          `${prefix}-aiFetchModels`,
        ) as HTMLButtonElement;
        const status = prefs!.document.getElementById(
          `${prefix}-aiModelsStatus`,
        )!;
        stage = "handling missing API key";
        refresh.click();
        await waitUntil(() => Boolean(status.textContent) && !refresh.disabled);
        assert.notInclude(status.textContent, "airelatedpapers-models-");
        assert.match(status.textContent || "", /API/);
        stage = "fetching fixture models";
        main.fetch = async (url: string) => {
          assert.equal(url, "https://api.deepseek.com/models");
          return {
            ok: true,
            json: async () => ({
              data: [{ id: "fixture-model", name: "Fixture Model" }],
            }),
          };
        };
        const key = prefs!.document.getElementById(
          `${prefix}-aiAPIKey`,
        ) as HTMLInputElement;
        key.value = "fixture-key";
        key.dispatchEvent(new prefs!.Event("input"));
        refresh.click();
        await waitUntil(() =>
          Array.from(select.options).some(
            (option) => option.value === "fixture-model",
          ),
        );
        stage = "persisting selected model";
        select.value = "fixture-model";
        select.dispatchEvent(new prefs!.Event("change"));
        assert.equal(Zotero.Prefs.get(prefKey, true), "fixture-model");
        key.value = "";
      } catch (error) {
        const failure = new Error(`${stage}: ${String(error)}`);
        Object.defineProperty(failure, "message", {
          value: failure.message,
          enumerable: true,
        });
        throw failure;
      } finally {
        main.fetch = originalFetch;
        if (originalModel === undefined) Zotero.Prefs.clear(prefKey, true);
        else Zotero.Prefs.set(prefKey, originalModel, true);
        prefs?.close();
      }
    });
  });
});

async function waitUntil(predicate: () => boolean) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 8000)
      throw new Error("Model selector check timed out");
    await Zotero.Promise.delay(20);
  }
}
