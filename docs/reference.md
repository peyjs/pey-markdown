# pey.markdown — Reference

Self-contained reference for the `pey.markdown` feature plugin. The manifest (`manifest.json`) is always the authoritative contract; in a conflict the manifest wins and this document must be fixed.

## Purpose

Converts Markdown (CommonMark + GFM) into a sanitized HTML fragment, with per-call injection of Persian (Parsneshan) extensions. One Markdown input, one safe fragment output with stable heading ids and the matching `toc` array; no document shell, no theme, no UI logic.

## Structure

- `manifest.json` — plugin contract (identity, service, errors, config).
- `package.json` — ESM package with the `micromark` and `micromark-extension-gfm` dependencies (`parsneshan` is a dev dependency only).
- `index.js` — Bonyan two-phase entry point (`prepare` / `activate`).
- `lib/constants.js` — shared constants (names, version, service, input cap, error codes).
- `lib/error.js` — Bonyan standard error factories (`BonyanError extends Error`).
- `lib/html-text.js` — entity decoder, attribute tokenizer and attribute escaping (shared by the sanitizer and heading-id injection).
- `lib/sanitize.js` — the sanitizer's main state machine: pure-string allowlist, no DOM.
- `lib/sanitize-state.js` — tag state-machine steps (head parsing, assembly, subtree-drop behavior).
- `lib/sanitize-policy.js` — policy tables: allowed tags/attributes, class and id patterns.
- `lib/sanitize-attributes.js` — attribute filtering with safe values.
- `lib/sanitize-uri.js` — the `href`/`src` security policy evaluated on the normalized URI.
- `lib/heading-ids.js` — stable heading ids for `h1`–`h6` and the `toc` array (the only slugger; runs before sanitization; subtree skipping reuses the sanitizer's drop behavior).
- `lib/markdown-service.js` — the render service (`renderFragment`); stateless and synchronous.
- `tests/` — one `node:test` file per source file.
- `docs/requirements.md` — base requirements and acceptance basis.
- `docs/reference.md` — this file.
- `README.md` — short introduction and pointer here.
- `CHANGELOG.md` — version history.

## Dependencies

- **Required:** none.
- **Optional:** none.

npm dependencies: `micromark` and `micromark-extension-gfm` are mandatory (installed automatically); `parsneshan` is a dev dependency only (the test-consumed version is `v0.2.0` from GitHub) — a consumer wanting labels or Persian extensions installs it itself, and since it comes from GitHub, installation depends on GitHub access. `lib` never depends on Parsneshan directly.

## Public API

Service: `pey.markdown.service`, one method `renderFragment`. Formal parameter details live in `manifest.json`; below is how to call it.

```js
// Standard render (GFM always on, no Persian behavior)
const { html, toc } = service.renderFragment({ markdown: '# سلام\n\nمتن **مهم**' })
```

```js
// Persian extensions (the caller supplies the extension, the service only composes)
import { warning, warningHtml } from 'parsneshan'

const { html } = service.renderFragment({
  markdown: '... هشدار\nمتن **مهم**\n...\n',
  syntaxExtensions: [warning()],
  htmlExtensions: [warningHtml()],
})
```

```js
// Footnotes with a unique scope (e.g. a message id in chat); without it the output is stable
const { html } = service.renderFragment({ markdown: 'متن[^1]\n\n[^1]: توضیح', idPrefix: 'msg-42' })
```

```js
// Persian footnotes (default labels are English; Persian is always injected)
import { persianFootnoteOptions } from 'parsneshan'

const { html } = service.renderFragment({ markdown: 'متن[^1]\n\n[^1]: توضیح', footnoteOptions: persianFootnoteOptions })
```

An empty input (`''`) returns an empty fragment (`{ html: '', toc: [] }`), not an error.

### Table of contents and anchors

Every `h1`–`h6` heading receives a stable id in the HTML itself, and `toc` returns exactly those ids with the heading's level and display text (escaping is the consumer's job; see the rules below); the consumer builds anchors as `href="#<id>"` and the list from `toc` (list rendering is the consumer's, the slug never is):

```js
const { html, toc } = service.renderFragment({ markdown: '# مقدمه\n\n## نصب app' })
// html:   <h1 id="user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87">مقدمه</h1>...
// toc: [
//   { id: 'user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87', level: 1, text: 'مقدمه' },
//   { id: 'user-content-h-%D9%86%D8%B5%D8%A8-app', level: 2, text: 'نصب app' },
// ]
```

Heading-id rules:

- The id is built only inside the plugin (one slugger for all consumers; editor and wiki see identical ids).
- Shape: `user-content-h-<slug>`, or `user-content-<prefix>-h-<slug>` with the caller's `idPrefix` — the same domain as footnotes, with the `h-` segment preventing collision with `fn-`/`fnref-`.
- Slug: Latin letters/digits are kept lowercased; spaces and `-` collapse to a single `-`; ASCII punctuation is removed; non-ASCII letter/digit characters (Persian) are percent-encoded (`%D9...`, aligned with the footnote id, safe in a URL hash); everything else (em dash, ZWNJ) is dropped; an empty result becomes `h`, duplicates within the same call get `-1`, `-2`, …
- A pre-existing `id` on a raw-HTML heading is replaced by the plugin's id; the footnote-section heading (`footnote-label`) stays untouched and never enters `toc`; headings inside comments and `script`/`style` subtrees are ignored.
- `toc.text` is the heading's decoded display text — exactly what the sanitizer renders. It can carry raw `<`/`>` characters from dead-markup runs (a stray `<` nesting outside quotes), so "no tags" is not guaranteed: the consumer must escape it without exception when inserting into HTML.
- The close-tag resolution and tag scanning mirror the sanitizer's models: a `</hN>` closes the innermost open `hN`, a closer of any tag opened under a heading closes that heading too, stray closers are no-ops, closers inside `script`/`style` subtrees, comments or dead markup never close a heading, and a `<hN>` inside a quoted attribute value never receives an id or creates a toc entry.
- Injection and text extraction are single-pass: every character costs the same, and performance gates keep the family linear (unclosed headings, deep unclosed-tag bases with many heading closes, stray closers, repeated same-text headings, document-scale comment clamps).

### Browser use

Bare names in a bundler-less browser need an import map — and not just the four direct names, but all 31 transitive packages (from `micromark` and `parsneshan`); this map was tested under headless Chromium and its output is byte-identical with Node's. Relative map paths are resolved against the **HTML page**, not this file:

```json
{
  "imports": {
    "pey.markdown/lib/": "./plugins/pey.markdown/lib/",
    "parsneshan": "./vendor/parsneshan/index.js",
    "parsneshan/extensions/warning": "./vendor/parsneshan/extensions/warning/index.js",
    "parsneshan/extensions/caution": "./vendor/parsneshan/extensions/caution/index.js",
    "parsneshan/extensions/important": "./vendor/parsneshan/extensions/important/index.js",
    "parsneshan/extensions/tip": "./vendor/parsneshan/extensions/tip/index.js",
    "parsneshan/extensions/note": "./vendor/parsneshan/extensions/note/index.js",
    "parsneshan/extensions/persian-list": "./vendor/parsneshan/extensions/persian-list/index.js",
    "parsneshan/extensions/persian-poem": "./vendor/parsneshan/extensions/persian-poem/index.js",
    "parsneshan/extensions/persian-footnote": "./vendor/parsneshan/extensions/persian-footnote/index.js",
    "micromark": "./vendor/micromark@4.0.3/index.js",
    "micromark-core-commonmark": "./vendor/micromark-core-commonmark@2.0.4/index.js",
    "micromark-extension-gfm": "./vendor/micromark-extension-gfm@3.0.0/index.js",
    "micromark-extension-gfm-autolink-literal": "./vendor/micromark-extension-gfm-autolink-literal@2.1.0/index.js",
    "micromark-extension-gfm-footnote": "./vendor/micromark-extension-gfm-footnote@2.1.0/index.js",
    "micromark-extension-gfm-strikethrough": "./vendor/micromark-extension-gfm-strikethrough@2.1.0/index.js",
    "micromark-extension-gfm-table": "./vendor/micromark-extension-gfm-table@2.1.2/index.js",
    "micromark-extension-gfm-tagfilter": "./vendor/micromark-extension-gfm-tagfilter@2.0.0/index.js",
    "micromark-extension-gfm-task-list-item": "./vendor/micromark-extension-gfm-task-list-item@2.1.0/index.js",
    "micromark-factory-destination": "./vendor/micromark-factory-destination@2.0.1/index.js",
    "micromark-factory-label": "./vendor/micromark-factory-label@2.0.1/index.js",
    "micromark-factory-space": "./vendor/micromark-factory-space@2.1.0/index.js",
    "micromark-factory-title": "./vendor/micromark-factory-title@2.0.1/index.js",
    "micromark-factory-whitespace": "./vendor/micromark-factory-whitespace@2.0.1/index.js",
    "micromark-util-character": "./vendor/micromark-util-character@2.1.1/index.js",
    "micromark-util-chunked": "./vendor/micromark-util-chunked@2.0.1/index.js",
    "micromark-util-classify-character": "./vendor/micromark-util-classify-character@2.0.1/index.js",
    "micromark-util-combine-extensions": "./vendor/micromark-util-combine-extensions@2.0.1/index.js",
    "micromark-util-decode-numeric-character-reference": "./vendor/micromark-util-decode-numeric-character-reference@2.0.2/index.js",
    "micromark-util-edit-map": "./vendor/micromark-util-edit-map@1.0.0/index.js",
    "micromark-util-encode": "./vendor/micromark-util-encode@2.0.1/index.js",
    "micromark-util-html-tag-name": "./vendor/micromark-util-html-tag-name@2.0.1/index.js",
    "micromark-util-normalize-identifier": "./vendor/micromark-util-normalize-identifier@2.0.1/index.js",
    "micromark-util-resolve-all": "./vendor/micromark-util-resolve-all@1.0.0/index.js",
    "micromark-util-sanitize-uri": "./vendor/micromark-util-sanitize-uri@2.0.1/index.js",
    "micromark-util-subtokenize": "./vendor/micromark-util-subtokenize@2.1.0/index.js",
    "micromark-util-symbol": "./vendor/micromark-util-symbol@2.0.1/lib/default.js",
    "micromark-util-types": "./vendor/micromark-util-types@2.0.3/index.js",
    "decode-named-character-reference": "./vendor/decode-named-character-reference@1.3.0/index.js",
    "character-entities": "./vendor/character-entities@2.0.2/index.js"
  }
}
```

Notes:

- `parsneshan` is not on npm; put a checkout of that repository next to the project and map it. Write each `extensions/*` subpath individually: a prefix key (`parsneshan/`) does not append `.js` itself and the browser answers with a MIME error (caught by a real test). When Parsneshan grows a new extension, add its subpath here by hand. The Parsneshan map is only needed by a consumer that wants Persian.
- For the final product and offline use (Capacitor/Tauri), put these packages pinned next to the project (`vendor/`): a CDN dies without internet, and a fixed URL does not guarantee the file's immutability either. Build the folder from the installed `node_modules` (tested):

```bash
mkdir -p vendor
for d in node_modules/micromark*/ node_modules/decode-named-character-reference node_modules/character-entities; do
  n=$(basename "$d"); v=$(node -p "require('./$d/package.json').version")
  rm -rf "vendor/$n@$v" && cp -r "$d" "vendor/$n@$v"
done
rm -rf vendor/parsneshan && cp -r node_modules/parsneshan vendor/parsneshan
```

(bash on Linux and macOS only; on Windows use WSL or Git Bash.)

- The map's versions are pinned but `package.json` gives ranges (`^`); after every `npm update`, re-sync the map with the real versions in `package-lock.json`, or the browser and Node load two different versions.

```js
import MarkdownService from 'pey.markdown/lib/markdown-service.js'

const { html } = new MarkdownService().renderFragment({ markdown: '# سلام' })
```

### Footnote-heading CSS

The footnote heading carries the `sr-only` class but no stylesheet ships with it; the consumer provides it, or the heading stays visible. If the host already has `sr-only` (Bootstrap or Tailwind), that suffices:

```css
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
```

## Events

- Publishes: none (`events: []`).
- Listens to: none (no dependencies, so no need for `core:service-unavailable`).

## Errors Reference

All errors follow the Bonyan standard structure (`code/message/source/type/timestamp/detail`) and carry no input content or sensitive data.

| Code | Type | Situation |
|---|---|---|
| `MARKDOWN_RENDER_FAILED` | operational | Invalid input (non-string, non-array extensions), exceeding `maxInputChars`, or an internal render/sanitize failure |
| `SERVICE_UNAVAILABLE` | operational (the shared contract of every service) | Called after the plugin was deactivated |

## Config

| Key | Type | Required | Default |
|---|---|---|---|
| `maxInputChars` | number | No | `200000` |
| `allowExternalImages` | boolean | No | `true` |

Exceeding the cap yields `MARKDOWN_RENDER_FAILED`, not a silent truncation. `allowExternalImages: false` keeps only relative and `data:image` images (by default external images are allowed and the viewer's IP travels to the other site).

## Business Rules

- GFM (tables, task lists, strikethrough, autolinks) is always on and cannot be turned off.
- Persian behavior applies only when the caller passes the extension in the same call; without injection the output is fully standard.
- Extension composition order: GFM first, then the caller's extensions in array order. On conflict the later registration wins (the later construct is tried first and its html handler overwrites), so a caller's extension overrides GFM.
- GFM footnotes keep their full structure; labels default to English and become Persian only through the caller's `footnoteOptions` (e.g. `persianFootnoteOptions` from Parsneshan: `پاورقی`, `بازگشت به ارجاع N`). The Persian strings belong to Parsneshan; this plugin only hands them to GFM. Reference ids become unique with the caller's `idPrefix` (string or plain integer, like a message id) and stay stable without it — but repeat across fragments on one page (invalid HTML; a link jumps to the first occurrence). `idPrefix` accepts only a string or plain integer of Latin letters, digits and `_ : . -`; a Persian id must be transliterated by the caller. The hidden `footnote-label` heading is shared across all fragments (harmless). `tel:` links work.
- The id prefix is predictable: an attacker could pull another message's footnote link onto their own element (low risk); for sensitive content give an unpredictable `idPrefix`. In the theoretical caller-author collusion case (prefix `a-fn-b` with label `c` versus prefix `a` with label `b-fn-c`) the same id is built; negligible.
- `id` (heading and footnote) survives only with the `user-content-` prefix or exactly `footnote-label`; `aria-describedby` points only at `footnote-label`; `aria-label` only carries the `بازگشت به ارجاع N` pattern; `data-footnote-*` stays empty only — so raw HTML cannot forge them.
- Heading ids for `h1`–`h6` are built only inside the plugin, applied with the same `idPrefix` domain, and the `toc` array returns exactly the HTML's ids (list rendering is the consumer's).
- The consumer must provide the `sr-only` CSS, or the footnote heading stays visible.
- The output is always a fragment; no `<html>`, theme or CSS is produced.
- Every output passes the sanitizer; no path returns unsanitized HTML.
- Raw source HTML (block and inline) passes per CommonMark and is then sanitized: an allowed tag stays, a disallowed tag is unwrapped (its content survives), and `script`/`style` never survive (dropped with content or escaped to text).
- Fenced code is plain `<pre><code class="language-x">`; no syntax highlighting.
- The service is stateless and synchronous; nothing is kept between calls except the active/inactive lifecycle flag.

## Constraints

- Full-document assembly, theme, routing, table-of-contents/anchor rendering and file download belong to the consumer; never expect a `<html>` shell from this plugin — take `toc` and the ids inside the HTML and build the rest yourself.
- The `syntaxExtensions`/`htmlExtensions` extensions are executable code; pass only valid, trusted extensions (like Parsneshan), never end-user input.
- Do not count on a disallowed tag staying in the output; only allowlist tags (including `details`/`summary`/`kbd`) survive and the rest are unwrapped.
- The plugin publishes no events; post-render coordination (e.g. UI updates) is the calling service's business.
- **Footnote-heavy input:** the cost of the "distinct footnotes" family (each footnote one reference + one definition — the common chat/wiki pattern) grows quadratically with the definition count inside micromark's gfm-footnote extension itself; both of this plugin's passes are linear, but footnote-heavy input near the `maxInputChars` cap can take several seconds of **synchronous** rendering and block the host's event loop. Lower the input cap for footnote-centric content or chunk such content call by call. (A performance gate in the tests guards the upstream dependency against regressions.)
