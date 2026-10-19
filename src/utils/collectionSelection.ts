interface CollectionSelectionPane {
  getSelectedCollections?: () => Zotero.Collection[];
  getSelectedCollection?: () => Zotero.Collection | false | undefined;
}

export function getSelectedScopeCollections(
  pane: CollectionSelectionPane | undefined,
  libraryID: number,
): Zotero.Collection[] {
  if (!pane) return [];

  // Zotero 10's singular getter throws; use it only on older versions.
  const collections =
    typeof pane.getSelectedCollections === "function"
      ? pane.getSelectedCollections()
      : [pane.getSelectedCollection?.()];
  return collections.filter((collection): collection is Zotero.Collection =>
    Boolean(collection && collection.libraryID === libraryID),
  );
}
