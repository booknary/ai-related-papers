import { assert } from "chai";
import { getSelectedScopeCollections } from "../src/utils/collectionSelection";

describe("collection selection compatibility", function () {
  const first = { id: 101, libraryID: 1 } as Zotero.Collection;
  const second = { id: 102, libraryID: 1 } as Zotero.Collection;
  const otherLibrary = { id: 201, libraryID: 2 } as Zotero.Collection;

  it("uses the plural API without calling Zotero 10's throwing getter", function () {
    const collections = getSelectedScopeCollections(
      {
        getSelectedCollections: () => [first, second],
        getSelectedCollection: () => {
          throw new Error("The old selection API must not be called");
        },
      },
      1,
    );
    assert.deepEqual(collections, [first, second]);
  });

  it("keeps Zotero 9's single-selection fallback", function () {
    assert.deepEqual(
      getSelectedScopeCollections({ getSelectedCollection: () => first }, 1),
      [first],
    );
  });

  it("limits collection selection to the source item's library", function () {
    assert.deepEqual(
      getSelectedScopeCollections(
        { getSelectedCollections: () => [first, otherLibrary] },
        1,
      ),
      [first],
    );
  });

  it("handles library and saved-search views without a collection", function () {
    assert.deepEqual(
      getSelectedScopeCollections({ getSelectedCollections: () => [] }, 1),
      [],
    );
    assert.deepEqual(getSelectedScopeCollections(undefined, 1), []);
  });
});
