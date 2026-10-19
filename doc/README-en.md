# AI Related Papers

[简体中文](../README.md) · [Releases](https://github.com/booknary/ai-related-papers/releases) · [Issues](https://github.com/booknary/ai-related-papers/issues)

A Zotero plugin for local related-paper discovery, reviewed bidirectional links,
interactive related networks, optional AI reranking, and AI keyword tags.

Version **0.1.1** was tested on **Zotero 10.0.6 / Windows** with 10 regression
checks in an isolated test profile. A Zotero 9 selection fallback is retained and
unit-tested; Zotero 9 itself was not rerun for this version. Compatibility is
declared through Zotero `10.0.*`.

## Install

Download `ai-related-papers.xpi` from a version's **Assets** on the
[Releases page](https://github.com/booknary/ai-related-papers/releases).
In Zotero, open **Tools → Add-ons → gear → Install Add-on From File**, select the
XPI, and restart if requested. GitHub's source ZIP is not an installable plugin.

If no version has been released, build locally or download `build-result` from a
successful **Actions → CI** run. Actions artifacts require GitHub sign-in;
extract the artifact ZIP and install the XPI inside it.

## Use

| Item context menu   | Selection                 | Behavior                                                                  |
| ------------------- | ------------------------- | ------------------------------------------------------------------------- |
| Find Related Papers | Exactly one regular item  | Rank locally, optionally rerank Top N with AI, then review before linking |
| Related Network     | Exactly one regular item  | Interactive bubble graph of saved related links                           |
| AI Generate Tags    | One or more regular items | Immediately append tags generated from title and abstract                 |
| Clear Related Items | One or more regular items | Confirm before removing links in both directions                          |

Attachments, notes, and feed items are excluded. Search uses the local library;
it does not search online or import papers. Candidates are not preselected;
canceling the review does not write links.

The network side pane shows one level. The popup offers one or two levels.
Click a bubble to select its Zotero item; in two-level popup mode, clicking a
non-center bubble also recenters the graph. Drag bubbles to move them. The pane
is capped at 18 related nodes, the popup at 42, plus the center. These are saved
Zotero relations, not citations or unconfirmed AI recommendations.

Tag generation skips items missing title or abstract, appends tags without
replacing existing ones, and reports successes, skips, and failures. Request
1–20 tags (default 5); fewer may be returned and duplicates are skipped.
This manual batch command is independent of the AI reranking toggle.
It does not monitor imports or process the library in the background.

Clearing relations also removes reciprocal links outside the selection.
Items, attachments, and tags are retained. There is no plugin undo command.

## Settings

Open **Zotero Settings → AI Related Papers**. Chinese and English follow
Zotero's language selection.

- Max candidates: default 10, range 1–50.
- Minimum local score: default 3%. It is not a probability or a hard exclusion
  threshold. With no matches above it, weak matches can be shown; collections
  can also show zero-score candidates. With no eligible collection candidates,
  search falls back to the source library. Review the dialog's actual scope.
- Scope: selected collections, collections and descendants, or library.
  Zotero 10 uses the union of selected collections within the source library.
  With no selected collections, it searches that library.
- Local weights: title 45, abstract 35, authors 15, tags 5; normalized automatically.
- AI reranking: disabled by default; sends local Top N (default 10, range 1–50).
- AI score blend: default 50%.

Local scoring is lexical and cannot find every semantically related paper.
Already related items are excluded from new candidates.

### AI API

Requests go to `POST {baseURL}/chat/completions`. Do not include the final
`/chat/completions` in the base URL. Enter keys only in Zotero settings.

Defaults: `https://api.deepseek.com`, model `deepseek-v4-pro`, thinking enabled,
reasoning effort `high`. Use a model offered by your provider. Disable the
DeepSeek thinking option when your service does not support it.

Requests may incur provider charges. Reranking failures keep local scores with
a warning. Tagging failures are counted. Paid AI calls were not part of the
Zotero compatibility tests.

## Privacy

Local scoring, graph display, and clearing links do not call the AI API.

- Reranking sends source and local Top N metadata: title, abstract, authors,
  tags, year, item ID, and candidate local score. Title/abstract caps are
  300/1,200 characters per item.
- Manual tagging sends only title and abstract, capped at 400/2,400 characters.
- PDF text, attachments, and full-text indexes are not read or uploaded.
- Metadata goes directly to your configured provider under its retention terms.
- Keys are stored in Zotero preferences. A masked field is not an encrypted key
  vault. Remove keys before sharing profiles or logs.

Do not commit keys, personal profiles, databases, or `.env`. `.env.example` is
a development-path template.

## Develop

Use system Node.js **22.8+**, npm, and local Zotero.

```sh
git clone https://github.com/booknary/ai-related-papers.git
cd ai-related-papers
npm ci
npm run build
npm run lint:check
```

Output: `.scaffold/build/ai-related-papers.xpi`, `update.json`, and
`update-beta.json`. Building does not install or publish the plugin.

```powershell
$env:ZOTERO_PLUGIN_ZOTERO_BIN_PATH = 'D:\Zotero\zotero.exe'
npm test -- --no-watch
npm run build
```

Replace the path as needed. Tests use an isolated profile and data directory
under `.scaffold/test`. Rebuild for production afterwards. For live development,
configure a separate profile following `.env.example`, then `npm run start`.

## Release

Pushing `main` runs CI. Publishing is a separate maintainer action:

1. Update both package version files; run build, lint, and local Zotero tests.
2. Commit and push; tag that commit `v<version>` and push the tag.
3. The release workflow uploads the XPI to that version's Release and updates
   manifests on the special `release` Release.

Alternatively, `npm run release` executes `zotero-plugin release`. Avoid
duplicating its version/tag actions with a manual release.

Stable update URL:

```text
https://github.com/booknary/ai-related-papers/releases/download/release/update.json
```

Check the XPI asset, manifest version, download URL, SHA-512, and Zotero version
bounds after publishing. A source push alone does not publish an XPI Release.

## Credits and license

Built from [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
using [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit),
[Zotero Plugin Scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold),
and [Zotero Types](https://github.com/windingwind/zotero-types).

See [LICENSE](../LICENSE). Upstream components retain their respective licenses.
