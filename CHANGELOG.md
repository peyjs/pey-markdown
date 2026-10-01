# Changelog — pey.markdown

## 1.0.0

- Initial release: `renderFragment` (CommonMark + GFM to sanitized HTML fragment).
- Injectable micromark extensions per call (Persian via `parsneshan`).
- Allowlist pure-JS sanitizer, no DOM dependency.
- Standard Bonyan shell: `manifest.json` + two-phase `index.js`, architecture `0.11`, type `feature`.
- Manifest declares `SERVICE_UNAVAILABLE` alongside `MARKDOWN_RENDER_FAILED` for `renderFragment`.
- Raw inline/block HTML passes through per CommonMark and is gated by the sanitizer; allowlist extended with `details`, `summary`, `kbd`.
- Fixed: `&` in URLs double-escaped, `<constructor>`/`<toString>` failed renders, `null` input leaked `TypeError`, unbalanced tags passed through, `SERVICE_UNAVAILABLE` declared in manifest, string `maxInputChars` accepted, `language-c++`/`c#` kept, raw checkboxes forced `disabled`, static error messages, per-prepare lifecycle hooks, linear-time sanitizer, `exports` map.
- Fixed: dashed tag names misread (`<script-x>` swallowed content, `<a-b>` rewrote as link), non-checkbox `<input>` stayed editable, footnotes mangled, `tel:` broken, worst-case sanitizer input stalled seconds, `parsneshan` in `dependencies` clarified as npm-only, browser bare imports need an import map.
- Added: `allowExternalImages` config (default `true`), footnote `sup`/`section`/`id`/`data-footnote-*`/`aria-*` allowlist, `tel:` scheme, `engines: node >= 22`, `./manifest.json` export, error `kind` hint, extension order rule documented.
- Fixed: control-entity scheme smuggling via normalized URI checks, protocol-relative/entity/backslash external images, arbitrary `id`/`aria-describedby` scoping, missing `class` on footnote backref links, Persian footnote labels, redundant autolink-literal dependency removed.
- Fixed: backslash-host image bypass, later-wins extension precedence documented, per-call footnote id prefix, spoofable `aria-label`/`data-footnote-*` pinned to renderer shapes, direct sanitizer image tests, syntax-overlap test.
