// Low-level tag scanning for the heading-id injector of pey.markdown.
// These helpers only locate and rewrite tag spans; the heading policy
// (which headings get ids, slug rules) lives in heading-ids.js.

// Attribute tokenizer: name plus optional quoted or bare value. Used only
// to locate existing id attributes on a heading open tag.
import { ATTR_PATTERN } from './html-text.js'
import { ALLOWED_TAGS, DROP_CONTENT_TAGS, VOID_TAGS } from './sanitize-policy.js'
import { parseTagHead, stepDropContent } from './sanitize-state.js'

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
 * Find where the sanitizer actually closes the heading opened just before
 * `from`, case-insensitively. The model mirrors the sanitizer's emitTag
 * exactly, because "which close tag ends a heading" is a STACK question:
 * a `</hN>` closes the innermost open hN (a nested same-level heading
 * closes first, not ours), a closer of any tag opened below the heading
 * pops through and closes it (`</b>` under `<b><h1>a</b>`), a closer of a
 * tag never opened is a no-op, and tags inside dropped subtrees (script/
 * style) or comments or dead aborted slices never affect anything.
 *
 * The walk shares the sanitizer's primitives (parseTagHead, scanTagEnd,
 * stepDropContent) so both passes stay in lockstep tag for tag. An invalid
 * tag head (`<b'`) is one escaped character of live text to the sanitizer,
 * so the walk consumes exactly one character — never scanning into it.
 *
 * `commentCloseLimit` is the document-wide `lastIndexOf('-->')` computed
 * once per call chain: any comment opener past it can never close, so the
 * per-opener probe disappears (probing the whole remaining input per
 * heading was quadratic across thousands of headings). It is monotonic and
 * valid for every opener at or after `from`.
 *
 * @param {string} lower — lowercased html (same indices as the original)
 * @param {number} level — heading level
 * @param {number} from — index just past the heading's open tag
 * @param {string[]} seedStack — names of tags the sanitizer still has open
 *   below this heading (the caller's own stack mirror)
 * @param {number} commentCloseLimit — last index of '-->' in the scanned
 *   string, or -1 when none exists
 * @returns {{index: number, stack: string[]}} index of the closing '<' (or
 *   -1 when the heading never closes) and the open-tag stack as it stands
 *   right after that close — the caller adopts it to stay in lockstep
 */
export function findCloseTag(lower, level, from, seedStack, commentCloseLimit) {
  const stack = seedStack.slice()
  stack.push(`h${level}`)
  const ourIndex = stack.length - 1
  const drop = { depth: 0, tag: null }
  let pos = from
  const len = lower.length
  while (pos < len) {
    if (drop.depth > 0) {
      pos = stepDropContent(lower, pos, drop)
      continue
    }
    const lt = lower.indexOf('<', pos)
    if (lt === -1) break
    if (lower.startsWith('<!--', lt)) {
      // Closed comments are skipped whole. Past the limit no `-->` exists
      // ahead at all, so the opener is unclosed: the sanitizer escapes only
      // the opener and keeps the rest live — the walk continues past the
      // four opener characters.
      pos = lt + 4 <= commentCloseLimit ? lower.indexOf('-->', lt + 4) + 3 : lt + 4
      continue
    }
    const head = parseTagHead(lower, lt)
    if (head === null) {
      // Not a tag: one escaped character of live text to the sanitizer.
      pos = lt + 1
      continue
    }
    const scan = scanTagEnd(lower, lt + 1 + (head.isClosing ? 1 : 0) + head.name.length)
    if (scan.abortedAt !== -1) {
      // Dead markup the sanitizer escapes and never re-examines — resume
      // at the nested '<' instead of rewinding into it.
      pos = scan.abortedAt
      continue
    }
    if (scan.end === -1) break
    if (head.isClosing) {
      if (!VOID_TAGS.has(head.name)) {
        const openIndex = stack.lastIndexOf(head.name)
        if (openIndex !== -1) {
          // emitTag's pop-through: everything above the matched entry
          // closes with it — ours included when it sits at or above it.
          stack.length = openIndex
          if (openIndex <= ourIndex) return { index: lt, stack }
        }
      }
      pos = scan.end
      continue
    }
    if (DROP_CONTENT_TAGS.has(head.name)) {
      // Mirrors the sanitizer's drop start: a self-closing one drops only
      // itself and never starts a subtree drop; neither reaches the stack.
      const raw = lower.slice(lt, scan.end)
      if (raw.length > 2 && raw[raw.length - 2] === '/') {
        pos = scan.end
        continue
      }
      drop.depth = 1
      drop.tag = head.name
      pos = scan.end
      continue
    }
    // emitTag pushes every allowed non-void open (self-closing included —
    // it still emits an open element); disallowed names never reach it.
    if (Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, head.name) && !VOID_TAGS.has(head.name)) {
      stack.push(head.name)
    }
    pos = scan.end
  }
  return { index: -1, stack }
}
