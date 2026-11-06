// Sanitizer policy tables for the pey.markdown plugin
// The allowlist data behind sanitizeHtml: which tags and attributes survive,
// which class names are renderer-generated, and the pinned shapes for ids
// and accessible names. Pure data — no logic.

export const ALLOWED_TAGS = {
  p: [],
  h1: ['id'],
  h2: ['class', 'id'],
  h3: ['id'],
  h4: ['id'],
  h5: ['id'],
  h6: ['id'],
  ul: [],
  ol: ['start'],
  li: ['id'],
  blockquote: [],
  pre: [],
  code: ['class'],
  hr: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  s: [],
  strike: [],
  del: [],
  sup: [],
  mark: [],
  a: ['href', 'title', 'id', 'class', 'data-footnote-ref', 'data-footnote-backref', 'aria-describedby', 'aria-label'],
  img: ['src', 'alt', 'title'],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['align'],
  td: ['align'],
  input: ['type', 'checked', 'disabled'],
  div: ['class'],
  span: ['class'],
  section: ['class', 'data-footnotes'],
  details: [],
  summary: [],
  kbd: [],
}

// Elements whose whole subtree is dropped (code/CSS must not leak as text).
export const DROP_CONTENT_TAGS = new Set(['script', 'style'])

// Void elements — never have a closing tag and never join the open stack.
export const VOID_TAGS = new Set(['br', 'hr', 'img', 'input'])

// Tag head: '<', optional '/', then a full element name. Dashes and colons
// belong to the name (custom elements like <script-x> must not misread as
// <script>), and the boundary is verified separately by parseTagHead.
export const TAG_HEAD_PATTERN = /^<\/?([a-zA-Z][a-zA-Z0-9-:]*)/

// A name boundary: the character ending the name must open attributes,
// close the tag, or end it — never continue it.
export const NAME_BOUNDARY_PATTERN = /[\s/>]/

const PARSNESHAN_CLASS_PATTERN = /^parsneshan-[\w-]+$/
const CODE_CLASS_PATTERN = /^language-[\w#+.:-]+$/

// Class policy per tag: only renderer-generated class names survive.
export const CLASS_PATTERNS = {
  code: CODE_CLASS_PATTERN,
  div: PARSNESHAN_CLASS_PATTERN,
  span: PARSNESHAN_CLASS_PATTERN,
  section: /^footnotes$/,
  h2: /^sr-only$/,
  a: /^data-footnote-backref$/,
}

export const SAFE_ID_PATTERN = /^(?:user-content-(?:[\w:.-]|%[0-9A-Fa-f]{2})+|footnote-label)$/
export const FOOTNOTE_LABEL_ID = 'footnote-label'

// Accessible name shapes the renderer emits for footnote backrefs — the only
// aria-labels allowed on links, so raw HTML cannot spoof screen readers.
// Covers both GFM's standard English labels and parsneshan's Persian preset.
// Must stay in sync with both sources; the real-output footnote tests guard it.
export const ARIA_BACK_LABEL_PATTERN = /^(?:بازگشت به ارجاع \d+(-\d+)?|Back to reference \d+(-\d+)?)$/
