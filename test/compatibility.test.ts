import { assert } from "chai";
import { config } from "../package.json";
import { findCandidates } from "../src/modules/related/candidateFinder";
import {
  addBidirectionalRelatedItems,
  clearRelatedItems,
} from "../src/modules/related/relatedWriter";

describe("Zotero runtime compatibility", function () {
  this.timeout(20000);
  const collections: Zotero.Collection[] = [];
  const items: Zotero.Item[] = [];
  let libraryID: number;
  const options = {
    minScore: 0,
    maxCandidates: 50,
    weights: { title: 45, abstract: 35, authors: 15, tags: 5 },
  };

  before(async function () {
    libraryID = Zotero.Libraries.userLibraryID;
    for (const name of ["Compatibility A", "Compatibility B", "Nested"]) {
      const collection = new Zotero.Collection();
      collection.libraryID = libraryID;
      collection.name = name;
      if (collections.length === 2) collection.parentID = collections[0].id;
      await collection.saveTx();
      collections.push(collection);
    }
    for (const collection of collections) {
      const item = new Zotero.Item("journalArticle");
      item.libraryID = libraryID;
      item.setField("title", "Compatibility related paper");
      item.setField("abstractNote", "Related network compatibility test");
      item.setCollections([collection.id]);
      await item.saveTx();
      items.push(item);
    }
    items[0].setCollections([collections[0].id, collections[1].id]);
    await items[0].saveTx();
  });

  after(async function () {
    const plugin = (Zotero as any)[config.addonInstance];
    plugin.data.dialog?.window?.close();
    for (const item of items) await item.eraseTx();
    for (const collection of collections.reverse()) await collection.eraseTx();
  });

  it("loads all item menus and the preference pane", function () {
    const doc = Zotero.getMainWindow().document;
    for (const suffix of [
      "find-related",
      "open-network",
      "generate-tags",
      "clear-related",
    ]) {
      assert.exists(
        doc.getElementById(`zotero-itemmenu-airelatedpapers-${suffix}`),
      );
    }
    assert.isTrue(
      Zotero.PreferencePanes.pluginPanes.some(
        (pane) => pane.pluginID === config.addonID,
      ),
    );
  });

  it("searches the union of selected collections without duplicates", async function () {
    const candidates = await findCandidates(
      items[2],
      {
        libraryID,
        collectionIDs: [collections[0].id, collections[1].id],
        label: "Selected collections",
      },
      options,
    );
    assert.sameMembers(
      candidates.map((entry) => entry.itemID),
      [items[0].id, items[1].id],
    );
  });

  it("includes nested collections only with recursive scope", async function () {
    const scope = { libraryID, collectionID: collections[0].id, label: "A" };
    const direct = await findCandidates(items[0], scope, options);
    const recursive = await findCandidates(
      items[0],
      { ...scope, recursive: true },
      options,
    );
    assert.isEmpty(direct);
    assert.sameMembers(
      recursive.map((entry) => entry.itemID),
      [items[2].id],
    );
  });

  it("writes, filters, and clears bidirectional related links", async function () {
    assert.equal(await addBidirectionalRelatedItems(items[0], [items[1]]), 1);
    assert.include(items[0].relatedItems, items[1].key);
    assert.include(items[1].relatedItems, items[0].key);
    const candidates = await findCandidates(
      items[0],
      { libraryID, label: "Library" },
      options,
    );
    assert.notInclude(
      candidates.map((entry) => entry.itemID),
      items[1].id,
    );
    assert.equal(await clearRelatedItems([items[0], items[1]]), 1);
    assert.notInclude(items[0].relatedItems, items[1].key);
    assert.notInclude(items[1].relatedItems, items[0].key);
  });

  it("opens the network dialog, switches depth, and recenters on a node", async function () {
    await addBidirectionalRelatedItems(items[0], [items[1]]);
    await addBidirectionalRelatedItems(items[1], [items[2]]);
    const win = Zotero.getMainWindow();
    await win.ZoteroPane.selectItem(items[0].id);
    const plugin = (Zotero as any)[config.addonInstance];
    const menu = win.document.getElementById(
      "zotero-itemmenu-airelatedpapers-open-network",
    );
    menu.dispatchEvent(new win.Event("command"));
    await waitUntil(() => Boolean(plugin.data.dialog));
    const dialog = plugin.data.dialog;
    await dialog.dialogData.loadLock.promise;
    const dialogWindow = dialog.window;
    const doc = dialogWindow.document;
    await waitUntil(
      () => doc.querySelectorAll('[data-node="true"]').length === 2,
    );
    const buttons = doc.querySelectorAll("[aria-pressed]");
    assert.equal(buttons.length, 2);
    buttons[1].click();
    await waitUntil(
      () => doc.querySelectorAll('[data-node="true"]').length === 3,
    );
    assert.equal(buttons[1].getAttribute("aria-pressed"), "true");
    const bubble = doc.querySelector(`circle[data-item-id="${items[1].id}"]`);
    bubble.dispatchEvent(
      new dialogWindow.MouseEvent("mousedown", { bubbles: true }),
    );
    bubble.dispatchEvent(
      new dialogWindow.MouseEvent("mouseup", { bubbles: true }),
    );
    await waitUntil(() => {
      const center = doc.querySelector('[data-node="true"]');
      return center?.getAttribute("data-item-id") === String(items[1].id);
    });
    await waitUntil(
      () => win.ZoteroPane.getSelectedItems()[0]?.id === items[1].id,
    );
    dialogWindow.close();
  });
});

async function waitUntil(predicate: () => boolean) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 8000)
      throw new Error("Compatibility check timed out");
    await Zotero.Promise.delay(50);
  }
}
