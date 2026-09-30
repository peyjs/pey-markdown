// Pure-string HTML sanitizer for the pey.markdown plugin
// Allowlist-based, no DOM, synchronous — safe in browser, Node, Capacitor, Tauri.
// Single linear scan (indexOf-based, no global backtracking regex), so even
// adversarial inputs stay fast. Unbalanced tags are auto-closed at the end so
// a fragment can never break the host page layout.

const ALLOWED_TAGS = {
  p: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  ul: [],
  ol: ['start'],
  li: [],
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
  a: ['href', 'title'],
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
  details: [],
  summary: [],
  kbd: [],
}

// Elements whose whole subtree is dropped (code/CSS must not leak as text).
const DROP_CONTENT_TAGS = new Set(['script', 'style'])

// Void elements — never have a closing tag and never join the open stack.
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input'])

const TAG_NAME_PATTERN = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/
const ATTR_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const PARSNESHAN_CLASS_PATTERN = /^parsneshan-[\w-]+$/
const CODE_CLASS_PATTERN = /^language-[\w#+.:-]+$/
const SAFE_URI_PATTERN = /^(https?:|mailto:|#|\/|[^:/?#]*([/?#]|$))/i
const ENTITY_PATTERN = /&(?:#(\d+)|#[xX]([\da-fA-F]+)|([a-zA-Z]+));/g
const BARE_AMP_PATTERN = /&(?!(?:#\d+|#[xX][\da-fA-F]+|[a-zA-Z]+);)/g

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
 * @returns {string} sanitized HTML fragment
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return ''
  const out = []
  const openStack = []
  let dropDepth = 0
  let dropTag = null
  // Once an end-of-input scan fails, every later position fails the same way
  // (the input never changes), so the failing scan runs exactly once: this
  // keeps adversarial inputs linear instead of quadratic.
  let noCommentClose = false
  let pos = 0
  while (pos < html.length) {
    const lt = html.indexOf('<', pos)
    if (lt === -1) {
      if (dropDepth === 0) out.push(html.slice(pos))
      break
    }
    if (dropDepth === 0 && lt > pos) out.push(html.slice(pos, lt))
    if (html.startsWith('<!--', lt)) {
      pos = skipComment(html, lt, out, dropDepth, noCommentClose, (flag) => {
        noCommentClose = flag
      })
      continue
    }
    const tag = parseTagAt(html, lt)
    if (tag === null) {
      if (dropDepth === 0) {
        if (html.indexOf('>', lt) === -1) {
          // No tag can start anymore: emit the pending text and the rest
          // with '<' escaped, then stop. One bounded scan, no loop.
          out.push(html.slice(lt).replace(/</g, '&lt;'))
          break
        }
        out.push('&lt;')
      }
      pos = lt + 1
      continue
    }
    if (dropDepth > 0) {
      dropDepth = trackDropContent(tag, dropTag, dropDepth)
      if (dropDepth === 0) dropTag = null
      pos = tag.end
      continue
    }
    pos = tag.end
    emitTag(tag, out, openStack, (nextDropTag) => {
      dropDepth = 1
      dropTag = nextDropTag
    })
  }
  while (openStack.length > 0) out.push(`</${openStack.pop()}>`)
  return out.join('')
}

/**
 * Skip an HTML comment starting at the given position.
 *
 * @param {string} html — full input
 * @param {number} lt — index of '<'
 * @param {string[]} out — output parts
 * @param {number} dropDepth — current drop depth
 * @param {boolean} noCommentClose — true when no '-->' exists ahead anymore
 * @param {Function} setNoCommentClose — called once with true when the scan fails
 * @returns {number} index to continue scanning from
 */
function skipComment(html, lt, out, dropDepth, noCommentClose, setNoCommentClose) {
  if (!noCommentClose) {
    const close = html.indexOf('-->', lt + 4)
    if (close === -1) {
      setNoCommentClose(true)
    } else {
      return close + 3
    }
  }
  if (dropDepth === 0) out.push('&lt;!--')
  return lt + 4
}

/**
 * Parse the tag starting at the given '<', quote-aware.
 *
 * @param {string} html — full input
 * @param {number} lt — index of '<'
 * @returns {{ name: string, isClosing: boolean, isSelfClosing: boolean, raw: string, end: number }|null}
 */
function parseTagAt(html, lt) {
  const head = TAG_NAME_PATTERN.exec(html.slice(lt, lt + 32))
  if (!head) return null
  const name = head[1].toLowerCase()
  const isClosing = html[lt + 1] === '/'
  let quote = null
  let i = lt + head[0].length
  while (i < html.length) {
    const char = html[i]
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      const raw = html.slice(lt, i + 1)
      return { name, isClosing, isSelfClosing: /\/>$/.test(raw.trim()), raw, end: i + 1 }
    }
    i += 1
  }
  return null
}

/**
 * Emit one parsed tag (or start dropping), handling the open-tag stack.
 *
 * @param {{ name: string, isClosing: boolean, isSelfClosing: boolean, raw: string, end: number }} tag — parsed tag
 * @param {string[]} out — output parts
 * @param {string[]} openStack — currently open tag names
 * @param {Function} startDrop — called with the tag name to start dropping content
 */
function emitTag(tag, out, openStack, startDrop) {
  const { name, isClosing, isSelfClosing } = tag
  if (!Object.hasOwn(ALLOWED_TAGS, name)) {
    if (!isClosing && !isSelfClosing && DROP_CONTENT_TAGS.has(name)) startDrop(name)
    return
  }
  if (isClosing) {
    if (VOID_TAGS.has(name)) return
    const openIndex = openStack.lastIndexOf(name)
    if (openIndex === -1) return
    while (openStack.length > openIndex) out.push(`</${openStack.pop()}>`)
    return
  }
  const attrs = sanitizeAttributes(name, tag)
  out.push(attrs ? `<${name} ${attrs}>` : `<${name}>`)
  if (!VOID_TAGS.has(name)) openStack.push(name)
}

/**
 * Track nesting depth inside a dropped element's subtree.
 *
 * @param {{ name: string, isClosing: boolean, isSelfClosing: boolean }} tag — parsed tag
 * @param {string} dropTag — dropped element name
 * @param {number} depth — current depth
 * @returns {number} updated depth
 */
function trackDropContent(tag, dropTag, depth) {
  if (tag.name !== dropTag) return depth
  if (tag.isClosing) return depth - 1
  if (!tag.isSelfClosing) return depth + 1
  return depth
}

/**
 * Keep only allowlisted attributes with safe values.
 *
 * @param {string} name — lowercase tag name
 * @param {{ raw: string }} tag — parsed tag carrying the raw tag text
 * @returns {string} sanitized attribute string (may be empty)
 */
function sanitizeAttributes(name, tag) {
  const allowed = ALLOWED_TAGS[name]
  const kept = []
  const raw = tag.raw
  for (const match of raw.matchAll(ATTR_PATTERN)) {
    const attrName = match[1].toLowerCase()
    if (attrName === name) continue
    if (attrName.startsWith('on')) continue
    if (!allowed.includes(attrName)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? null
    const clean = sanitizeAttributeValue(name, attrName, value)
    if (clean !== null) kept.push(clean)
  }
  if (name === 'input' && kept.includes('type="checkbox"') && !kept.includes('disabled')) {
    kept.push('disabled')
  }
  return kept.join(' ')
}

/**
 * Validate one attribute value; returns null when it must be dropped.
 *
 * @param {string} tag — lowercase tag name
 * @param {string} attr — lowercase attribute name
 * @param {string|null} value — raw value (null for boolean attributes)
 * @returns {string|null} clean `name="value"` or bare name, or null
 */
function sanitizeAttributeValue(tag, attr, value) {
  if (attr === 'checked' || attr === 'disabled') return attr
  if (attr === 'type') return value === 'checkbox' ? 'type="checkbox"' : null
  if (attr === 'class') return sanitizeClass(tag, value)
  if (attr === 'align') {
    return value === 'left' || value === 'center' || value === 'right' ? `align="${value}"` : null
  }
  if (attr === 'href' || attr === 'src') {
    if (value === null || !isSafeUri(tag, attr, value)) return attr === 'href' ? 'href="#"' : null
    return `${attr}="${escapeAttr(value)}"`
  }
  if (value === null) return attr
  return `${attr}="${escapeAttr(value)}"`
}

/**
 * Allow only renderer-generated class names.
 *
 * @param {string} tag — lowercase tag name
 * @param {string|null} value — raw class value
 * @returns {string|null} clean class attribute or null
 */
function sanitizeClass(tag, value) {
  if (value === null) return null
  const pattern = tag === 'code' ? CODE_CLASS_PATTERN : PARSNESHAN_CLASS_PATTERN
  const kept = value.split(/\s+/).filter((part) => pattern.test(part))
  if (kept.length === 0) return null
  return `class="${kept.join(' ')}"`
}

/**
 * Check a link/resource URI against the safe scheme policy. The value is
 * normalized first (control whitespace stripped, entities decoded) exactly
 * because browsers apply the same normalization before parsing the scheme.
 *
 * @param {string} tag — lowercase tag name
 * @param {string} attr — href or src
 * @param {string} value — raw URI
 * @returns {boolean} true when the URI is safe to keep
 */
function isSafeUri(tag, attr, value) {
  const normalized = decodeEntities(value).replace(/[\t\n\r\f]/g, '').trim().toLowerCase()
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return false
  if (normalized.startsWith('data:')) {
    return tag === 'img' && attr === 'src' && normalized.startsWith('data:image/')
  }
  return SAFE_URI_PATTERN.test(value.trim())
}

/**
 * Decode numeric and known named character references.
 *
 * @param {string} value — raw attribute value
 * @returns {string} decoded value for safety checking (never emitted directly)
 */
function decodeEntities(value) {
  return value.replace(ENTITY_PATTERN, (match, decimal, hex, named) => {
    if (decimal !== undefined) return codePointToChar(Number(decimal))
    if (hex !== undefined) return codePointToChar(Number.parseInt(hex, 16))
    const known = NAMED_ENTITIES[named.toLowerCase()]
    return known !== undefined ? known : match
  })
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
