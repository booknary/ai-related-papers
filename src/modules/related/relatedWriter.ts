export async function addBidirectionalRelatedItems(
  source: Zotero.Item,
  selectedItems: Zotero.Item[],
) {
  let added = 0;
  let sourceChanged = false;

  await Zotero.DB.executeTransaction(async () => {
    for (const item of selectedItems) {
      if (!item || item.id === source.id) continue;

      let pairChanged = false;
      if (!isRelated(source, item)) {
        source.addRelatedItem(item);
        sourceChanged = true;
        pairChanged = true;
      }
      if (!isRelated(item, source)) {
        item.addRelatedItem(source);
        await item.save();
        pairChanged = true;
      }
      if (pairChanged) added++;
    }

    if (sourceChanged) {
      await source.save();
    }
  });

  return added;
}

export async function countRelatedItemLinks(items: Zotero.Item[]) {
  return (await collectRelatedPairs(items)).length;
}

export async function clearRelatedItems(items: Zotero.Item[]) {
  const pairs = await collectRelatedPairs(items);
  let removed = 0;

  await Zotero.DB.executeTransaction(async () => {
    const changedItems = new Set<Zotero.Item>();

    for (const pair of pairs) {
      const source = await getItem(pair.sourceID);
      const target = await getItem(pair.targetID);
      if (!source || !target) continue;

      let pairChanged = false;
      if (isRelated(source, target)) {
        await source.removeRelatedItem(target);
        changedItems.add(source);
        pairChanged = true;
      }
      if (isRelated(target, source)) {
        await target.removeRelatedItem(source);
        changedItems.add(target);
        pairChanged = true;
      }
      if (pairChanged) removed++;
    }

    for (const item of changedItems) {
      await item.save();
    }
  });

  return removed;
}

async function collectRelatedPairs(items: Zotero.Item[]) {
  const pairs = new Map<string, { sourceID: number; targetID: number }>();
  for (const source of items) {
    for (const relatedID of getRelatedItemIDs(source)) {
      const target = await getItem(relatedID);
      if (!target || target.id === source.id) continue;

      const [left, right] =
        source.id < target.id ? [source.id, target.id] : [target.id, source.id];
      pairs.set(`${left}:${right}`, {
        sourceID: source.id,
        targetID: target.id,
      });
    }
  }
  return Array.from(pairs.values());
}

async function getItem(itemID: number) {
  return (await Zotero.Items.getAsync(itemID)) as Zotero.Item | false;
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

function isRelated(item: Zotero.Item, relatedItem: Zotero.Item) {
  const relatedItems = (item as any).relatedItems;
  if (!Array.isArray(relatedItems)) return false;

  return relatedItems.some((entry) => {
    if (typeof entry === "number") return entry === relatedItem.id;
    if (typeof entry === "string") return entry === relatedItem.key;
    return entry?.id === relatedItem.id || entry?.key === relatedItem.key;
  });
}
