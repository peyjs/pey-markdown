// Pure-string HTML sanitizer for the pey.markdown plugin
// Allowlist-based, no DOM, synchronous — safe in browser, Node, Capacitor, Tauri.

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
}

// Elements whose whole subtree is dropped (code/CSS must not leak as text).
const DROP_CONTENT_TAGS = new Set(['script', 'style'])

// Void elements — never have a closing tag.
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input'])

const TOKEN_PATTERN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g
const TAG_NAME_PATTERN = /^<\/?([a-zA-Z][a-zA-Z0-9]*)\b/
const ATTR_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const PARSNESHAN_CLASS_PATTERN = /^parsneshan-[\w-]+$/
const CODE_CLASS_PATTERN = /^language-[\w-]+$/
const SAFE_URI_PATTERN = /^(https?:|mailto:|#|\/|[^:/?#]*([/?#]|$))/i

/**
 * Sanitize an HTML fragment: keep allowlisted tags/attributes, drop the rest.
 * Disallowed tags are unwrapped (content kept), except script/style whose
 * whole subtree is removed. Comments are removed.
 *
 * @param {string} html — raw HTML fragment from the markdown renderer
 * @returns {string} sanitized HTML fragment
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return ''
  const tokens = html.match(TOKEN_PATTERN) || []
  const out = []
  let dropDepth = 0
  let dropTag = null
  for (const token of tokens) {
    if (token.startsWith('<!--')) continue
    if (dropDepth > 0) {
      dropDepth = trackDropContent(token, dropTag, dropDepth)
      if (dropDepth === 0) dropTag = null
      continue
    }
    if (!token.startsWith('<')) {
      out.push(token)
      continue
    }
    const name = parseTagName(token)
    if (name === null) {
      out.push(escapeText(token))
      continue
    }
    if (DROP_CONTENT_TAGS.has(name)) {
      if (!isClosingTag(token) && !isSelfClosing(token)) {
        dropDepth = 1
        dropTag = name
      }
      continue
    }
    const clean = sanitizeTag(token, name)
    if (clean !== null) out.push(clean)
  }
  return out.join('')
}

/**
 * Track nesting depth inside a dropped element's subtree.
 *
 * @param {string} token — current token
 * @param {string} dropTag — dropped element name
 * @param {number} depth — current depth
 * @returns {number} updated depth
 */
function trackDropContent(token, dropTag, depth) {
  const name = parseTagName(token)
  if (name !== dropTag) return depth
  if (isClosingTag(token)) return depth - 1
  if (!isSelfClosing(token)) return depth + 1
  return depth
}

/**
 * Sanitize a single tag; returns null when the tag must be removed.
 *
 * @param {string} token — raw tag token
 * @param {string} name — lowercase tag name
 * @returns {string|null} clean tag or null
 */
function sanitizeTag(token, name) {
  if (!(name in ALLOWED_TAGS)) return null
  if (isClosingTag(token)) {
    return VOID_TAGS.has(name) ? null : `</${name}>`
  }
  const attrs = sanitizeAttributes(token, name)
  if (VOID_TAGS.has(name)) return attrs ? `<${name} ${attrs}>` : `<${name}>`
  if (isSelfClosing(token) && name !== 'input' && name !== 'img' && name !== 'br' && name !== 'hr') {
    return attrs ? `<${name} ${attrs}>` : `<${name}>`
  }
  return attrs ? `<${name} ${attrs}>` : `<${name}>`
}

/**
 * Keep only allowlisted attributes with safe values.
 *
 * @param {string} token — raw tag token
 * @param {string} name — lowercase tag name
 * @returns {string} sanitized attribute string (may be empty)
 */
function sanitizeAttributes(token, name) {
  const allowed = ALLOWED_TAGS[name]
  const kept = []
  for (const match of token.matchAll(ATTR_PATTERN)) {
    const attrName = match[1].toLowerCase()
    if (attrName === name) continue
    if (attrName.startsWith('on')) continue
    if (!allowed.includes(attrName)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? null
    const clean = sanitizeAttributeValue(name, attrName, value)
    if (clean !== null) kept.push(clean)
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
 * Check a link/resource URI against the safe scheme policy.
 *
 * @param {string} tag — lowercase tag name
 * @param {string} attr — href or src
 * @param {string} value — raw URI
 * @returns {boolean} true when the URI is safe to keep
 */
function isSafeUri(tag, attr, value) {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) return false
  if (trimmed.startsWith('data:')) {
    return tag === 'img' && attr === 'src' && trimmed.startsWith('data:image/')
  }
  return SAFE_URI_PATTERN.test(value.trim())
}

/**
 * Extract the lowercase tag name from a tag token.
 *
 * @param {string} token — raw tag token
 * @returns {string|null} tag name or null when not a valid tag
 */
function parseTagName(token) {
  const match = TAG_NAME_PATTERN.exec(token)
  return match ? match[1].toLowerCase() : null
}

/**
 * Check whether a tag token is a closing tag.
 *
 * @param {string} token — raw tag token
 * @returns {boolean} true for `</name>`
 */
function isClosingTag(token) {
  return token.startsWith('</')
}

/**
 * Check whether a tag token is self-closing (`/>`).
 *
 * @param {string} token — raw tag token
 * @returns {boolean} true for self-closing tags
 */
function isSelfClosing(token) {
  return /\/>$/.test(token.trim())
}

/**
 * Escape text that looked like a tag but was not valid.
 *
 * @param {string} text — raw text
 * @returns {string} escaped text
 */
function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Escape an attribute value.
 *
 * @param {string} value — raw value
 * @returns {string} escaped value
 */
function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
