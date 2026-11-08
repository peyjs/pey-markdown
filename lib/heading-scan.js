// Low-level tag scanning for the heading-id injector of pey.markdown.
// These helpers only locate and rewrite tag spans; the heading policy
// (which headings get ids, slug rules) lives in heading-ids.js.

// Attribute tokenizer: name plus optional quoted or bare value. Used only
// to locate existing id attributes on a heading open tag.
import { ATTR_PATTERN } from './html-text.js'

/**
 * Index just past the first '>' at or after the position, or null.
 *
 * @param {string} html — full input
 * @param {number} from — index to search from
 * @returns {number|null} index past '>'
 */
export function skipPastGT(html, from) {
  const gt = html.indexOf('>', from)
  return gt === -1 ? null : gt + 1
}

/**
 * Scan for the end of an open tag, quote-aware. Every malformed shape stays
 * linear and deterministic: -2 means a nested '<' appeared outside quotes
 * before any close (bogus head), -1 means input ended first.
 *
 * @param {string} html — full input
 * @param {number} from — index just past the tag name
 * @returns {number} index past '>', or -1/-2
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
      return -2
    } else if (char === '>') {
      return i + 1
    }
  }
  return -1
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

/**
 * Find the heading's close tag ('</hN' + optional whitespace + '>') at or
 * after the position, case-insensitively. A candidate sitting inside a
 * comment does not close the heading: the sanitizer skips the whole
 * comment, so the search resumes past its `-->`.
 *
 * @param {string} lower — lowercased html (same indices as the original)
 * @param {number} level — heading level
 * @param {number} from — index to search from
 * @returns {number} index of the close '<', or -1
 */
export function findCloseTag(lower, level, from) {
  const closeName = `</h${level}`
  let search = from
  while (true) {
    const index = lower.indexOf(closeName, search)
    if (index === -1) return -1
    const open = lower.lastIndexOf('<!--', index - 1)
    if (open !== -1 && open >= from) {
      const close = lower.indexOf('-->', open + 4)
      if (close !== -1 && close + 3 > index) {
        search = close + 3
        continue
      }
    }
    const after = lower[index + 4]
    if (after === undefined || after === '>' || after === ' ' || after === '\t' || after === '\n' || after === '\r') return index
    search = index + 4
  }
}
