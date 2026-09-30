# Changelog — pey.markdown

## 1.0.0

- Initial release: `renderFragment` (CommonMark + GFM to sanitized HTML fragment).
- Injectable micromark extensions per call (Persian via `parsneshan`).
- Allowlist pure-JS sanitizer, no DOM dependency.
- Standard Bonyan shell: `manifest.json` + two-phase `index.js`, architecture `0.11`, type `feature`.
- Manifest declares `SERVICE_UNAVAILABLE` alongside `MARKDOWN_RENDER_FAILED` for `renderFragment`.
- Raw inline/block HTML passes through per CommonMark and is gated by the sanitizer; allowlist extended with `details`, `summary`, `kbd`.
- Fixed: `&` in URLs double-escaped, `<constructor>`/`<toString>` failed renders, `null` input leaked `TypeError`, unbalanced tags passed through, `SERVICE_UNAVAILABLE` declared in manifest, string `maxInputChars` accepted, `language-c++`/`c#` kept, raw checkboxes forced `disabled`, static error messages, per-prepare lifecycle hooks, linear-time sanitizer, `exports` map.
