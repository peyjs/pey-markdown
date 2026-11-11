// Tag-level state machine of the pey.markdown sanitizer
// The scanning steps used by sanitizeHtml: tag-head parsing, quote-aware tag
// assembly, dropped-subtree walking, comment skipping and tag emission.

import { ALLOWED_TAGS, DROP_CONTENT_TAGS, NAME_BOUNDARY_PATTERN, TAG_HEAD_PATTERN, VOID_TAGS } from './sanitize-policy.js'
import { sanitizeAttributes } from './sanitize-attributes.js'

/**
 * Escape every '<' in a dead tag slice so it can only ever render as text.
 *
 * @param {string} text — raw slice
 * @returns {string} text with no tag openers left
 */
export function escapeBrackets(text) {
  return text.replace(/</g, '&lt;')
}

/**
 * Normalize sanitizer options to effective settings.
 *
 * @param {object} [options] — caller-passed options
 * @returns {{ allowExternalImages: boolean }} effective settings
 */
export function normalizeOptions(options) {
  const flag = options !== null && typeof options === 'object' ? options.allowExternalImages : undefined
  // Mirrors the service's normalizeFlag: numeric-string environment values
  // and the exported sanitizeHtml entry share one parameter contract.
  if (typeof flag === 'boolean') {
    return { allowExternalImages: flag }
  }
  if (typeof flag === 'string') {
    const lowered = flag.trim().toLowerCase()
    if (lowered === 'true') {
      return { allowExternalImages: true }
    }
    if (lowered === 'false') {
      return { allowExternalImages: false }
    }
  }
  return { allowExternalImages: true }
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
export function parseTagHead(html, lt) {
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
export function scanTagBoundary(html, lt, head) {
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
export function stepDropContent(html, pos, drop) {
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
    // A self-closing same-name tag ends its own element and must not
    // deepen the drop — mirroring emitTag, which never starts a drop for
    // one. Counting it would swallow everything up to the next closer,
    // including content a browser would render.
    const gt = html.indexOf('>', lt)
    const selfClosing = gt !== -1 && html[gt - 1] === '/'
    if (!selfClosing) {
      drop.depth += 1
    }
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
export function skipComment(html, lt, out, noCommentClose, setNoCommentClose) {
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
 * `openCounts` mirrors openStack (name → count of open entries): a closer
 * with no open match is a no-op WITHOUT scanning the stack — deep stacks
 * fed by unclosed-tag documents × stray closers were quadratic.
 *
 * @param {{ name: string, isClosing: boolean, raw: string, isSelfClosing: boolean }} tag — assembled tag
 * @param {{ allowExternalImages: boolean }} settings — effective settings
 * @param {string[]} out — output parts
 * @param {string[]} openStack — currently open tag names
 * @param {{ depth: number, tag: string|null }} drop — drop state (mutated)
 * @param {Map<string, number>} openCounts — name → open-entry count mirror of openStack
 */
export function emitTag(tag, settings, out, openStack, drop, openCounts) {
  const { name, isClosing, raw, isSelfClosing } = tag
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, name)) {
    if (!isClosing && !isSelfClosing && DROP_CONTENT_TAGS.has(name)) {
      drop.depth = 1
      drop.tag = name
    }
    return
  }
  if (isClosing) {
    if (VOID_TAGS.has(name)) return
    if ((openCounts.get(name) ?? 0) === 0) return
    const openIndex = openStack.lastIndexOf(name)
    if (openIndex === -1) return
    while (openStack.length > openIndex) {
      const closed = openStack.pop()
      out.push(`</${closed}>`)
      const remaining = openCounts.get(closed) - 1
      if (remaining === 0) openCounts.delete(closed)
      else openCounts.set(closed, remaining)
    }
    return
  }
  const attrs = sanitizeAttributes(name, raw, settings)
  if (attrs === null) return
  out.push(attrs ? `<${name} ${attrs}>` : `<${name}>`)
  if (!VOID_TAGS.has(name)) {
    openStack.push(name)
    openCounts.set(name, (openCounts.get(name) ?? 0) + 1)
  }
}
