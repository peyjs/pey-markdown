// Attribute sanitizing for the pey.markdown sanitizer
// Keeps only allowlisted attributes with safe values, per tag. Returns null
// for a value that must be dropped; the caller drops the whole tag when an
// `input` is not a checkbox.

import { ATTR_PATTERN, escapeAttr } from './html-text.js'
import {
  ARIA_BACK_LABEL_PATTERN,
  ALLOWED_TAGS,
  CLASS_PATTERNS,
  FOOTNOTE_LABEL_ID,
  SAFE_ID_PATTERN,
} from './sanitize-policy.js'
import { isSafeUri } from './sanitize-uri.js'

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
export function sanitizeAttributes(name, raw, settings) {
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
