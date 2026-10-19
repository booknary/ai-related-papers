import { getString } from "../../utils/locale";
import {
  RelatedCandidate,
  ReviewDialogInput,
  ReviewDialogResult,
} from "./types";

export async function openReviewDialog(
  input: ReviewDialogInput,
): Promise<ReviewDialogResult> {
  const selectedItemIDs = new Set<number>();
  const dialogData: { [key: string]: any } = {
    loadCallback: () => {
      ztoolkit.log("Related candidates dialog opened");
    },
    unloadCallback: () => {
      ztoolkit.log("Related candidates dialog closed");
    },
  };
  const dialog = new ztoolkit.Dialog(3, 1);

  dialog
    .addCell(
      0,
      0,
      {
        tag: "h2",
        properties: {
          innerText: getString("dialog-title"),
        },
        styles: {
          margin: "0 0 8px",
          maxWidth: "760px",
        },
      },
      false,
    )
    .addCell(
      1,
      0,
      {
        tag: "p",
        properties: {
          innerText: getString("dialog-description", {
            args: {
              count: input.candidates.length,
              scope: input.scope.label,
              title: input.source.title || getString("untitled-item"),
            },
          }),
        },
        styles: {
          maxWidth: "760px",
          margin: "0 0 10px",
        },
      },
      false,
    );

  dialog.addCell(
    2,
    0,
    {
      tag: "div",
      namespace: "html",
      styles: {
        width: "760px",
        maxHeight: "360px",
        overflowY: "auto",
        overflowX: "hidden",
        border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
        borderRadius: "6px",
      },
      children: [
        createHeaderRow(),
        ...input.candidates.map((candidate) =>
          createCandidateRow(candidate, selectedItemIDs),
        ),
      ],
    },
    false,
  );

  dialog
    .addButton(getString("dialog-confirm"), "confirm")
    .addButton(getString("dialog-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("dialog-title"), {
      width: 820,
      height: 500,
      resizable: true,
      centerscreen: true,
    });

  addon.data.dialog = dialog;
  await dialogData.unloadLock.promise;
  addon.data.dialog = undefined;

  return {
    confirmed: dialogData._lastButtonId === "confirm",
    selectedItemIDs: Array.from(selectedItemIDs),
  };
}

function createHeaderRow() {
  return {
    tag: "div",
    namespace: "html",
    styles: rowStyles({
      fontWeight: "600",
      position: "sticky",
      top: "0",
      zIndex: "1",
      backgroundColor: "Canvas",
      borderBottom:
        "1px solid color-mix(in srgb, currentColor 18%, transparent)",
    }),
    children: [
      createTextCell(getString("dialog-column-select")),
      createTextCell(getString("dialog-column-score")),
      createTextCell(getString("dialog-column-title")),
      createTextCell(getString("dialog-column-reasons")),
    ],
  };
}

function createCandidateRow(
  candidate: RelatedCandidate,
  selectedItemIDs: Set<number>,
) {
  const title = candidate.metadata.title || getString("untitled-item");
  const authorsAndYear = formatAuthorsAndYear(candidate);
  const reasons = candidate.reasons.join(", ");

  return {
    tag: "div",
    namespace: "html",
    styles: rowStyles({
      borderBottom:
        "1px solid color-mix(in srgb, currentColor 10%, transparent)",
    }),
    children: [
      {
        tag: "input",
        namespace: "html",
        attributes: {
          type: "checkbox",
        },
        listeners: [
          {
            type: "change",
            listener: (event: Event) => {
              if ((event.target as HTMLInputElement).checked) {
                selectedItemIDs.add(candidate.itemID);
              } else {
                selectedItemIDs.delete(candidate.itemID);
              }
            },
          },
        ],
        styles: {
          margin: "0",
        },
      },
      createTextCell(`${Math.round(candidate.score * 100)}%`),
      {
        tag: "div",
        namespace: "html",
        attributes: {
          title: `${title}\n${authorsAndYear}`,
        },
        styles: {
          minWidth: "0",
          overflow: "hidden",
        },
        children: [
          {
            tag: "div",
            namespace: "html",
            properties: {
              innerText: title,
            },
            styles: ellipsisStyles({
              fontWeight: "600",
              maxWidth: "100%",
            }),
          },
          {
            tag: "div",
            namespace: "html",
            properties: {
              innerText: authorsAndYear,
            },
            styles: ellipsisStyles({
              color: "color-mix(in srgb, currentColor 72%, transparent)",
              fontSize: "12px",
              marginTop: "2px",
              maxWidth: "100%",
            }),
          },
        ],
      },
      {
        tag: "span",
        namespace: "html",
        attributes: {
          title: reasons,
        },
        properties: {
          innerText: reasons,
        },
        styles: ellipsisStyles({
          maxWidth: "100%",
        }),
      },
    ],
  };
}

function createTextCell(text: string) {
  return {
    tag: "span",
    namespace: "html",
    properties: {
      innerText: text,
    },
    styles: ellipsisStyles({
      maxWidth: "100%",
    }),
  };
}

function rowStyles(extra: Record<string, string>) {
  return {
    display: "grid",
    gridTemplateColumns: "48px 64px minmax(0, 1fr) 210px",
    columnGap: "10px",
    alignItems: "center",
    minHeight: "42px",
    padding: "7px 10px",
    boxSizing: "border-box",
    ...extra,
  };
}

function ellipsisStyles(extra: Record<string, string>) {
  return {
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    ...extra,
  };
}

function formatAuthorsAndYear(candidate: RelatedCandidate) {
  const authors = candidate.metadata.authors.slice(0, 3).join(", ");
  const suffix =
    candidate.metadata.authors.length > 3
      ? ` ${getString("author-list-ellipsis")}`
      : "";
  const year = candidate.metadata.year ? ` (${candidate.metadata.year})` : "";
  return `${authors}${suffix}${year}`.trim() || getString("unknown-authors");
}
