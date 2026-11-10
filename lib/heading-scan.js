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
    // A candidate inside a tag span (a `</h1>` in a quoted attribute of a
    // host tag) is dead markup, never a close: skip past the covering tag,
    // exactly like the sanitizer's quote-aware consumption.
    const covering = coveringTagEnd(lower, from, index)
    if (covering !== null) {
      if (covering.eof) return -1
      search = covering.end
      continue
    }
    const after = lower[index + 4]
    if (after === undefined || after === '>' || after === ' ' || after === '\t' || after === '\n' || after === '\r') return index
    search = index + 4
  }
}

/**
 * Walks the tag spans between `from` and `index`. Returns the position to
 * resume from when a tag span covers `index` (`{end}`), `{eof:true}` when a
 * tag runs to the end of input (no live candidate can follow), or null when
 * `index` sits outside every tag span.
 * @param {string} lower — lowercased html
 * @param {number} from — region start
 * @param {number} index — candidate position
 * @returns {{end: number}|{eof: boolean}|null} covering span outcome
 */
function coveringTagEnd(lower, from, index) {
  let pos = from
  while (pos <= index) {
    const lt = lower.indexOf('<', pos)
    if (lt === -1 || lt >= index) return null
    const scan = scanTagEnd(lower, lt + 1)
    if (scan.abortedAt !== -1) {
      if (scan.abortedAt > index) return { end: scan.abortedAt }
      pos = scan.abortedAt
      continue
    }
    if (scan.end === -1) return { eof: true }
    if (scan.end > index) return { end: scan.end }
    pos = scan.end
  }
  return null
}
