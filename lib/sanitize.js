// Pure-string HTML sanitizer for the pey.markdown plugin
// Allowlist-based, no DOM, synchronous — safe in browser, Node, Capacitor, Tauri.
// True single-pass state machine: text runs jump with indexOf, tag assembly
// consumes each character at most twice and never rescans, so even adversarial
// inputs stay linear. Unbalanced tags are auto-closed at the end so a fragment
// can never break the host page layout.

const ALLOWED_TAGS = {
  p: [],
  h1: [],
  h2: ['class', 'id'],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
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
const DROP_CONTENT_TAGS = new Set(['script', 'style'])

// Void elements — never have a closing tag and never join the open stack.
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input'])

// Tag head: '<', optional '/', then a full element name. Dashes and colons
// belong to the name (custom elements like <script-x> must not misread as
// <script>), and the boundary is verified separately by parseTagHead.
const TAG_HEAD_PATTERN = /^<\/?([a-zA-Z][a-zA-Z0-9-:]*)/

// A name boundary: the character ending the name must open attributes,
// close the tag, or end it — never continue it.
const NAME_BOUNDARY_PATTERN = /[\s/>]/

const ATTR_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const PARSNESHAN_CLASS_PATTERN = /^parsneshan-[\w-]+$/
const CODE_CLASS_PATTERN = /^language-[\w#+.:-]+$/

// Class policy per tag: only renderer-generated class names survive.
const CLASS_PATTERNS = {
  code: CODE_CLASS_PATTERN,
  div: PARSNESHAN_CLASS_PATTERN,
  span: PARSNESHAN_CLASS_PATTERN,
  section: /^footnotes$/,
  h2: /^sr-only$/,
  a: /^data-footnote-backref$/,
}

const SAFE_URI_PATTERN = /^(https?:|mailto:|tel:|#|\/|[^:/?#]*([/?#]|$))/i
const ENTITY_PATTERN = /&(?:#(\d+);?|#[xX]([\da-fA-F]+);?|([a-zA-Z]+);)/g
const LEGACY_ENTITY_PATTERN = /&(amp|AMP|lt|LT|gt|GT|quot|QUOT)(?![a-zA-Z0-9=])/g
const BARE_AMP_PATTERN = /&(?!(?:#\d+;?|#[xX][\da-fA-F]+;?|[a-zA-Z]+;))/g
const SAFE_ID_PATTERN = /^(?:user-content-[\w:.-]+|footnote-label)$/
const FOOTNOTE_LABEL_ID = 'footnote-label'

// Accessible name shape our own renderer emits for footnote backrefs — the
// only aria-label allowed on links, so raw HTML cannot spoof screen readers.
const ARIA_BACK_LABEL_PATTERN = /^بازگشت به ارجاع \d+(-\d+)?$/

// Named entities decoded for the URI safety check. Numeric references are
// decoded generically; this table covers the named ones that matter for
// scheme obfuscation plus the common text entities.
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  semi: ';',
  tab: '\t',
  newline: '\n',
  sol: '/',
  bsol: '\\',
  excl: '!',
  quest: '?',
  num: '#',
  period: '.',
  comma: ',',
  lpar: '(',
  rpar: ')',
  space: ' ',
  nbsp: ' ',
}

/**
 * Sanitize an HTML fragment: keep allowlisted tags/attributes, drop the rest.
 * Disallowed tags are unwrapped (content kept), except script/style whose
 * whole subtree is removed. Comments are removed. Unbalanced tags are
 * auto-closed so the fragment is always well-formed.
 *
 * @param {string} html — raw HTML fragment from the markdown renderer
 * @param {object} [options] — sanitizer options
 * @param {boolean} [options.allowExternalImages] — allow absolute http(s) img src (default true)
 * @returns {string} sanitized HTML fragment
 */
export function sanitizeHtml(html, options = {}) {
  if (typeof html !== 'string' || html.length === 0) return ''
  const settings = normalizeOptions(options)
  const out = []
  const openStack = []
  const drop = { depth: 0, tag: null }
  let noCommentClose = false
  let pos = 0
  const len = html.length
  while (pos < len) {
    if (drop.depth > 0) {
      pos = stepDropContent(html, pos, drop)
      continue
    }
    const lt = html.indexOf('<', pos)
    if (lt === -1) {
      out.push(html.slice(pos))
      break
    }
    if (lt > pos) out.push(html.slice(pos, lt))
    if (html.startsWith('<!--', lt)) {
      pos = skipComment(html, lt, out, noCommentClose, (flag) => {
        noCommentClose = flag
      })
      continue
    }
    const head = parseTagHead(html, lt)
    if (head === null) {
      out.push('&lt;')
      pos = lt + 1
      continue
    }
    const boundary = scanTagBoundary(html, lt, head)
    if (boundary.abortedAt !== -1) {
      // Nested '<' outside quotes before any close: the head was bogus
      // markup. The consumed slice may itself hide '<' inside quotes, so
      // escape them all (never emit live tags from a dead tag), then
      // restart at the nested '<'. Consumed characters are never
      // re-examined, so adversarial nesting stays linear.
      out.push('&lt;')
      out.push(escapeBrackets(html.slice(lt + 1, boundary.abortedAt)))
      pos = boundary.abortedAt
      continue
    }
    if (boundary.end === -1) {
      // Hit end of input without a close: escape the whole rest (it may
      // hide live-looking tags inside quotes) and stop. Single bounded pass.
      out.push('&lt;')
      out.push(escapeBrackets(html.slice(lt + 1)))
      break
    }
    pos = boundary.end
    emitTag(boundary, settings, out, openStack, drop)
  }
  while (openStack.length > 0) out.push(`</${openStack.pop()}>`)
  return out.join('')
}

/**
 * Escape every '<' in a dead tag slice so it can only ever render as text.
 *
 * @param {string} text — raw slice
 * @returns {string} text with no tag openers left
 */
function escapeBrackets(text) {
  return text.replace(/</g, '&lt;')
}

/**
 * Normalize sanitizer options to effective settings.
 *
 * @param {object} [options] — caller-passed options
 * @returns {{ allowExternalImages: boolean }} effective settings
 */
function normalizeOptions(options) {
  const flag = options !== null && typeof options === 'object' ? options.allowExternalImages : undefined
  return { allowExternalImages: flag !== false }
}

/**
 * Parse a tag head at the given '<': name plus open/close shape.
 * The name is munched maximally (dashes/colons included) and must end on a
 * real boundary, so <script-x> never misreads as <script>.
 *
 * @param {string} html — full input
 * @param {number} lt — index of '<'
 * @returns {{ name: string, isClosing: boolean }|null} head or null when not a tag
 */
function parseTagHead(html, lt) {
  const match = TAG_HEAD_PATTERN.exec(html.slice(lt, lt + 34))
  if (!match) return null
  const after = html[lt + match[0].length]
  if (after !== undefined && !NAME_BOUNDARY_PATTERN.test(after)) return null
  return { name: match[1].toLowerCase(), isClosing: html[lt + 1] === '/' }
}

/**
 * Scan the tag starting at a valid head, quote-aware. Stops at the first
 * unquoted '>', at a nested '<' outside quotes (abort), or at input end.
 * Every character is consumed at most once across all scans.
 *
 * @param {string} html — full input
 * @param {number} lt — index of '<'
 * @param {{ name: string, isClosing: boolean }} head — parsed head
 * @returns {{ name: string, isClosing: boolean, raw: string, end: number, abortedAt: number, isSelfClosing: boolean }|{ abortedAt: number, end: number }}
 */
function scanTagBoundary(html, lt, head) {
  let quote = null
  let i = lt + 1 + (head.isClosing ? 1 : 0) + head.name.length
  const len = html.length
  while (i < len) {
    const char = html[i]
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '<') {
      return { abortedAt: i, end: -1 }
    } else if (char === '>') {
      const raw = html.slice(lt, i + 1)
      return {
        name: head.name,
        isClosing: head.isClosing,
        raw,
        end: i + 1,
        abortedAt: -1,
        isSelfClosing: raw.length > 2 && raw[raw.length - 2] === '/',
      }
    }
    i += 1
  }
  return { abortedAt: -1, end: -1 }
}

/**
 * Advance through dropped content: only exact open/close heads of the dropped
 * tag affect depth, everything else is skipped one '<' at a time. The closer
 * is consumed through its '>' so no tag tail ever leaks as text. No tag-end
 * scan is ever needed here, so this stays linear too.
 *
 * @param {string} html — full input
 * @param {number} pos — index to continue from
 * @param {{ depth: number, tag: string|null }} drop — drop state (mutated)
 * @returns {number} index to continue scanning from
 */
function stepDropContent(html, pos, drop) {
  const lt = html.indexOf('<', pos)
  if (lt === -1) return html.length
  if (html.startsWith('<!--', lt)) {
    const close = html.indexOf('-->', lt + 4)
    return close === -1 ? html.length : close + 3
  }
  const head = parseTagHead(html, lt)
  if (head !== null && head.name === drop.tag) {
    if (head.isClosing) {
      drop.depth -= 1
      if (drop.depth === 0) drop.tag = null
      const gt = html.indexOf('>', lt)
      return gt === -1 ? html.length : gt + 1
    }
    drop.depth += 1
  }
  return lt + 1
}

/**
 * Skip an HTML comment starting at the given position.
 *
 * @param {string} html — full input
 * @param {number} lt — index of '<'
 * @param {string[]} out — output parts
 * @param {boolean} noCommentClose — true when no '-->' exists ahead anymore
 * @param {Function} setNoCommentClose — called once with true when the scan fails
 * @returns {number} index to continue scanning from
 */
function skipComment(html, lt, out, noCommentClose, setNoCommentClose) {
  if (!noCommentClose) {
    const close = html.indexOf('-->', lt + 4)
    if (close === -1) {
      setNoCommentClose(true)
    } else {
      return close + 3
    }
  }
  out.push('&lt;!--')
  return lt + 4
}

/**
 * Emit one assembled tag (or start dropping), handling the open-tag stack.
 * Stray closers are dropped; unclosed tags are closed at the end of input.
 * A self-closing script/style never starts dropping: it is a typo-shaped
 * edge, and dropping the tag alone is both safe and friendlier.
 *
 * @param {{ name: string, isClosing: boolean, raw: string, isSelfClosing: boolean }} tag — assembled tag
 * @param {{ allowExternalImages: boolean }} settings — effective settings
 * @param {string[]} out — output parts
 * @param {string[]} openStack — currently open tag names
 * @param {{ depth: number, tag: string|null }} drop — drop state (mutated)
 */
function emitTag(tag, settings, out, openStack, drop) {
  const { name, isClosing, raw, isSelfClosing } = tag
  if (!Object.hasOwn(ALLOWED_TAGS, name)) {
    if (!isClosing && !isSelfClosing && DROP_CONTENT_TAGS.has(name)) {
      drop.depth = 1
      drop.tag = name
    }
    return
  }
  if (isClosing) {
    if (VOID_TAGS.has(name)) return
    const openIndex = openStack.lastIndexOf(name)
    if (openIndex === -1) return
    while (openStack.length > openIndex) out.push(`</${openStack.pop()}>`)
    return
  }
  const attrs = sanitizeAttributes(name, raw, settings)
  if (attrs === null) return
  out.push(attrs ? `<${name} ${attrs}>` : `<${name}>`)
  if (!VOID_TAGS.has(name)) openStack.push(name)
}

/**
 * Keep only allowlisted attributes with safe values. Returns null when the
 * whole tag must go (an input that is not a checkbox has no legitimate
 * renderer origin and must not stay clickable or typeable).
 *
 * @param {string} name — lowercase tag name
 * @param {string} raw — raw tag text
 * @param {{ allowExternalImages: boolean }} settings — effective settings
 * @returns {string|null} sanitized attribute string, empty string, or null
 */
function sanitizeAttributes(name, raw, settings) {
  const allowed = ALLOWED_TAGS[name]
  const kept = []
  for (const match of raw.matchAll(ATTR_PATTERN)) {
    const attrName = match[1].toLowerCase()
    if (attrName === name) continue
    if (attrName.startsWith('on')) continue
    if (!allowed.includes(attrName)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? null
    const clean = sanitizeAttributeValue(name, attrName, value, settings)
    if (clean !== null) kept.push(clean)
  }
  if (name === 'input') {
    if (!kept.includes('type="checkbox"')) return null
    if (!kept.includes('disabled')) kept.push('disabled')
  }
  return kept.join(' ')
}

/**
 * Validate one attribute value; returns null when it must be dropped.
 *
 * @param {string} tag — lowercase tag name
 * @param {string} attr — lowercase attribute name
 * @param {string|null} value — raw value (null for boolean attributes)
 * @param {{ allowExternalImages: boolean }} settings — effective settings
 * @returns {string|null} clean `name="value"` or bare name, or null
 */
function sanitizeAttributeValue(tag, attr, value, settings) {
  if (attr === 'checked' || attr === 'disabled') return attr
  if (attr === 'type') {
    return value !== null && value.toLowerCase() === 'checkbox' ? 'type="checkbox"' : null
  }
  if (attr === 'class') return sanitizeClass(tag, value)
  if (attr === 'align') {
    return value === 'left' || value === 'center' || value === 'right' ? `align="${value}"` : null
  }
  if (attr === 'id') {
    return value !== null && SAFE_ID_PATTERN.test(value) ? `id="${escapeAttr(value)}"` : null
  }
  if (
    attr === 'data-footnote-ref'
    || attr === 'data-footnote-backref'
    || attr === 'data-footnotes'
  ) {
    if (value === null) return attr
    if (value === '') return `${attr}=""`
    return null
  }
  if (attr === 'aria-label') {
    // Only our own back-reference wording: any other accessible name could
    // be a spoofed screen-reader label on attacker HTML.
    if (value !== null && ARIA_BACK_LABEL_PATTERN.test(value)) return `${attr}="${escapeAttr(value)}"`
    return null
  }
  if (attr === 'aria-describedby') {
    // Pinned to the footnote heading so crafted ids cannot point at and
    // describe-by host page elements.
    return value === FOOTNOTE_LABEL_ID ? `aria-describedby="${FOOTNOTE_LABEL_ID}"` : null
  }
  if (attr === 'href' || attr === 'src') {
    if (value === null || !isSafeUri(tag, attr, value, settings)) {
      return attr === 'href' ? 'href="#"' : null
    }
    return `${attr}="${escapeAttr(value)}"`
  }
  if (value === null) return attr
  return `${attr}="${escapeAttr(value)}"`
}

/**
 * Allow only renderer-generated class names, per tag.
 *
 * @param {string} tag — lowercase tag name
 * @param {string|null} value — raw class value
 * @returns {string|null} clean class attribute or null
 */
function sanitizeClass(tag, value) {
  if (value === null) return null
  const pattern = CLASS_PATTERNS[tag] ?? null
  if (pattern === null) return null
  const kept = value.split(/\s+/).filter((part) => pattern.test(part))
  if (kept.length === 0) return null
  return `class="${kept.join(' ')}"`
}

/**
 * Check a link/resource URI against the safe scheme policy. Both the scheme
 * test and the shape test run on the normalized value (entities decoded,
 * browser-equivalent whitespace stripped) — never on the raw text, which may
 * hide the scheme behind `&#1;`-style obfuscation that the `&`-`#` prefix
 * would otherwise let through.
 *
 * @param {string} tag — lowercase tag name
 * @param {string} attr — href or src
 * @param {string} value — raw URI
 * @param {{ allowExternalImages: boolean }} settings — effective settings
 * @returns {boolean} true when the URI is safe to keep
 */
function isSafeUri(tag, attr, value, settings) {
  const normalized = normalizeUri(value)
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return false
  if (normalized.startsWith('data:')) {
    return tag === 'img' && attr === 'src' && normalized.startsWith('data:image/')
  }
  if (tag === 'img' && attr === 'src' && !settings.allowExternalImages && isExternalUri(normalized)) {
    return false
  }
  return SAFE_URI_PATTERN.test(normalized)
}

/**
 * Normalize a URI the way browsers do before parsing its scheme: decode
 * character references (numeric with or without semicolon, known named, and
 * the legacy no-semicolon set), drop ASCII tab/newline everywhere, strip
 * leading/trailing C0 controls and spaces, and lowercase.
 *
 * @param {string} value — raw URI
 * @returns {string} normalized URI for safety checking (never emitted directly)
 */
function normalizeUri(value) {
  return decodeEntities(value.trim())
    .replace(/[\t\n\r]/g, '')
    .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
    .toLowerCase()
}

/**
 * Check whether a normalized URI points off-site: absolute http(s) in any
 * slash shape, or protocol-relative. Browsers read backslashes as slashes,
 * so `http:/`, `/\` and `\\` count as remote too. Relative paths, anchors,
 * and data:image are local.
 *
 * @param {string} normalized — normalized URI
 * @returns {boolean} true when loading it contacts another site
 */
function isExternalUri(normalized) {
  return (
    normalized.startsWith('http:')
    || normalized.startsWith('https:')
    || normalized.startsWith('//')
    || normalized.startsWith('\\\\')
    || normalized.startsWith('/\\')
  )
}

/**
 * Decode numeric (semicolon optional, like browsers) and known named
 * character references, plus the legacy no-semicolon set in attributes.
 *
 * @param {string} value — raw attribute value
 * @returns {string} decoded value for safety checking (never emitted directly)
 */
function decodeEntities(value) {
  return value
    .replace(
      ENTITY_PATTERN,
      (match, decimal, hex, named) => {
        if (decimal !== undefined) return codePointToChar(Number(decimal))
        if (hex !== undefined) return codePointToChar(Number.parseInt(hex, 16))
        const known = NAMED_ENTITIES[named.toLowerCase()]
        return known !== undefined ? known : match
      },
    )
    .replace(LEGACY_ENTITY_PATTERN, (match, named) => NAMED_ENTITIES[named.toLowerCase()] ?? match)
}

/**
 * Convert a code point to a character, safely.
 *
 * @param {number} codePoint — numeric code point
 * @returns {string} character or the replacement character
 */
function codePointToChar(codePoint) {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return '�'
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return '�'
  }
}

/**
 * Escape an attribute value. Valid character references are preserved so
 * renderer-escaped URLs (like `?a=1&amp;b=2`) survive intact; a bare `&`
 * is escaped so no new reference can be smuggled in.
 *
 * @param {string} value — raw value
 * @returns {string} escaped value
 */
function escapeAttr(value) {
  return value
    .replace(BARE_AMP_PATTERN, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
