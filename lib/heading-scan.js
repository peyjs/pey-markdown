// Low-level tag scanning for the heading-id injector of pey.markdown.
// These helpers only locate and rewrite tag spans; the heading policy
// (which headings get ids, slug rules) lives in heading-ids.js.

// Attribute tokenizer: name plus optional quoted or bare value. Used only
// to locate existing id attributes on a heading open tag.
import { ATTR_PATTERN } from './html-text.js'
import { ALLOWED_TAGS, DROP_CONTENT_TAGS, VOID_TAGS } from './sanitize-policy.js'
import { parseTagHead, stepDropContent } from './sanitize-state.js'

/**
 * Scan for the end of an open tag, quote-aware. Mirrors the sanitizer's
 * scanTagBoundary semantics: exactly one of the two positions is valid.
 * `abortedAt` is the index of the nested '<' that appeared outside quotes
 * before any close — the consumed slice up to it is DEAD markup the
 * sanitizer escapes and never re-examines, so callers resume there instead
 * of rewinding into it. `end === -1 && abortedAt === -1` means input ended
 * inside the tag.
 *
 * @param {string} html — full input
 * @param {number} from — index just past the tag name
 * @returns {{end: number, abortedAt: number}} end past '>', or the abort position, or -1/-1
 */
export function scanTagEnd(html, from) {
  let quote = null
  for (let i = from; i < html.length; i += 1) {
    const char = html[i]
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '<') {
      return { end: -1, abortedAt: i }
    } else if (char === '>') {
      return { end: i + 1, abortedAt: -1 }
    }
  }
  return { end: -1, abortedAt: -1 }
}

/**
 * Collect the spans of every id attribute on a heading open tag, in order.
 * The tag-name token itself is skipped so `<h2` is never read as an attr.
 *
 * @param {string} rawTag — full open tag text, e.g. '<h2 id="x" class="y">'
 * @param {number} level — heading level (for the tag-name token)
 * @returns {{index: number, length: number, value: string|null}[]} id attr spans
 */
export function collectIdAttrs(rawTag, level) {
  const tagName = `h${level}`
  const attrs = []
  for (const match of rawTag.matchAll(ATTR_PATTERN)) {
    if (match[1].toLowerCase() === tagName) continue
    if (match[1].toLowerCase() !== 'id') continue
    attrs.push({ index: match.index, length: match[0].length, value: match[2] ?? match[3] ?? match[4] ?? null })
  }
  return attrs
}

/**
 * Rebuild a heading open tag carrying our id: the first existing id attr is
 * replaced, any further ones removed (browsers honor the first), and a tag
 * without one gets the id inserted right after the name. Everything else
 * stays byte-identical — the sanitizer filters the remaining attrs.
 *
 * @param {string} rawTag — full open tag text
 * @param {string} id — plugin-built id (SAFE_ID_PATTERN-safe by construction)
 * @param {number} level — heading level
 * @param {{index: number, length: number}[]} idAttrs — existing id spans in rawTag
 * @returns {string} rebuilt open tag
 */
export function injectIdAttr(rawTag, id, level, idAttrs) {
  if (idAttrs.length === 0) {
    const nameLength = 1 + 1 + String(level).length // '<' + 'h' + digit
    return `${rawTag.slice(0, nameLength)} id="${id}"${rawTag.slice(nameLength)}`
  }
  let result = rawTag
  for (let i = idAttrs.length - 1; i >= 0; i -= 1) {
    const attr = idAttrs[i]
    const replacement = i === 0 ? `id="${id}"` : ''
    result = result.slice(0, attr.index) + replacement + result.slice(attr.index + attr.length)
  }
  return result
}
