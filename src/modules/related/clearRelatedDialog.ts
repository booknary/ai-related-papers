import { getString } from "../../utils/locale";

export async function openClearRelatedConfirmDialog(input: {
  itemCount: number;
  linkCount: number;
}) {
  const dialogData: { [key: string]: any } = {};
  const dialog = new ztoolkit.Dialog(2, 1)
    .addCell(
      0,
      0,
      {
        tag: "h2",
        properties: {
          innerText: getString("clear-related-dialog-title"),
        },
        styles: {
          margin: "0 0 8px",
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
          innerText: getString("clear-related-dialog-description", {
            args: {
              itemCount: input.itemCount,
              linkCount: input.linkCount,
            },
          }),
        },
        styles: {
          maxWidth: "440px",
          margin: "0",
          lineHeight: "1.45",
        },
      },
      false,
    )
    .addButton(getString("clear-related-confirm"), "confirm")
    .addButton(getString("dialog-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("clear-related-dialog-title"), {
      width: 500,
      height: 230,
      resizable: false,
      centerscreen: true,
    });

  addon.data.dialog = dialog;
  await dialogData.unloadLock.promise;
  addon.data.dialog = undefined;
  return dialogData._lastButtonId === "confirm";
}
