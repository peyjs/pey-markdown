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
  // Single forward sweep: candidate search and structural skipping share
  // one monotonic cursor, so every character between `from` and the accepted
  // candidate is examined once — the pass stays linear even for inputs with
  // thousands of rejected candidates (quoted `</hN>`, comment-held ones).
  let pos = from
  while (true) {
    const index = lower.indexOf(closeName, pos)
    if (index === -1) return -1
    // Walk the structure between `pos` and the candidate; if a comment or a
    // tag span swallows it, resume after that span. The cursor never moves
    // backwards, and the next candidate search starts past the previous one.
    let cursor = pos
    let covered = false
    while (cursor <= index) {
      const lt = lower.indexOf('<', cursor)
      if (lt === -1 || lt >= index) break
      if (lower.startsWith('<!--', lt)) {
        const close = lower.indexOf('-->', lt + 4)
        const end = close === -1 ? lower.length : close + 3
        if (end > index) {
          cursor = end
          covered = true
          break
        }
        cursor = end
        continue
      }
      const scan = scanTagEnd(lower, lt + 1)
      if (scan.abortedAt !== -1) {
        if (scan.abortedAt > index) {
          cursor = scan.abortedAt
          covered = true
          break
        }
        cursor = scan.abortedAt
        continue
      }
      if (scan.end === -1) return -1
      if (scan.end > index) {
        cursor = scan.end
        covered = true
        break
      }
      cursor = scan.end
    }
    if (covered) {
      pos = cursor
      continue
    }
    const after = lower[index + 4]
    if (after === undefined || after === '>' || after === ' ' || after === '\t' || after === '\n' || after === '\r') return index
    pos = index + 4
  }
}
