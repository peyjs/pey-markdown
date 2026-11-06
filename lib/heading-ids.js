// Heading id injection for the pey.markdown plugin
// Runs on the raw micromark output BEFORE sanitizing: every h1-h6 open tag
// gets a stable plugin-owned id — the only slugger lives here, never in a
// consumer — and the returned toc array carries exactly the ids applied to
// the html. Ids stay inside the sanitizer's SAFE_ID_PATTERN charset
// (`user-content-` + Latin/digit/`_ : . -`/percent-encoded runs), so they
// always survive sanitization unchanged. Single linear pass, no DOM, no
// state between calls.
//
// Subtrees the sanitizer will drop (script/style) are skipped with the
// sanitizer's own walker (stepDropContent), region for region — including
// nested same-name tags — so a heading id can never enter the toc while its
// heading is dropped from the sanitized output.

import { ATTR_PATTERN, decodeEntities } from './html-text.js'
import { DROP_CONTENT_TAGS } from './sanitize-policy.js'
import { parseTagHead, stepDropContent } from './sanitize-state.js'

// Open tag head: '<h' + level 1-6 ending on a real boundary, so <h1x> never
// matches. Case-insensitive for raw HTML like <H1>.
const HEADING_OPEN_PATTERN = /^<h([1-6])(?=[\s/>])/i

// Non-ASCII letters and digits of any script (Persian included) are kept in
// the slug as percent-encoded runs; every other non-ASCII character
// (em-dash, ZWNJ, symbols) is dropped like ASCII punctuation.
const LETTER_OR_DIGIT_PATTERN = /[\p{L}\p{N}]/u

// The renderer's footnote section heading keeps its reserved id untouched
// (aria-describedby points at it) and never enters the toc.
const FOOTNOTE_LABEL_ID = 'footnote-label'

/**
 * Assign a deterministic id to every h1-h6 heading in a rendered fragment
 * and collect them as a toc. Headings inside comments and script/style
 * subtrees are skipped; a heading that already carries the reserved
 * footnote-label id is passed through untouched.
 *
 * @param {string} html — raw (pre-sanitize) HTML fragment from micromark
 * @param {string} clobberPrefix — id scope prefix, ends with '-' (e.g. 'user-content-')
 * @returns {{ html: string, toc: Array<{id: string, level: number, text: string}> }} html with ids injected and the matching toc
 */
export function addHeadingIds(html, clobberPrefix) {
  if (typeof html !== 'string' || html.length === 0) return { html: '', toc: [] }
  const out = []
  const toc = []
  const seen = new Set()
  const lower = html.toLowerCase()
  const len = html.length
  // Drop state mirrors the sanitizer's: while active, the same walker
  // (stepDropContent) consumes the region, so both passes skip identical
  // text — a heading inside a dropped subtree can never reach the toc.
  const drop = { depth: 0, tag: null }
  let emitted = 0
  let pos = 0
  while (pos < len) {
    if (drop.depth > 0) {
      pos = stepDropContent(html, pos, drop)
      continue
    }
    const lt = html.indexOf('<', pos)
    if (lt === -1) break
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4)
      pos = close === -1 ? len : close + 3
      continue
    }
    const head = parseTagHead(html, lt)
    if (head !== null && !head.isClosing && DROP_CONTENT_TAGS.has(head.name)) {
      // Complete, non-self-closing open tag: start dropping from just past
      // it, exactly like the sanitizer's emitTag. A bogus head (nested '<')
      // or a truncated tag never drops in the sanitizer either — falling
      // through to the heading scan matches its behavior. A self-closing
      // one drops only the tag itself, so skipping to its end keeps both
      // passes in lockstep.
      const tagEnd = scanTagEnd(html, lt + 1 + head.name.length)
      if (tagEnd === -2) {
        pos = lt + 1
        continue
      }
      if (tagEnd === -1) break
      const raw = html.slice(lt, tagEnd)
      if (raw.length > 2 && raw[raw.length - 2] === '/') {
        pos = tagEnd
        continue
      }
      drop.depth = 1
      drop.tag = head.name
      pos = tagEnd
      continue
    }
    const open = HEADING_OPEN_PATTERN.exec(html.slice(lt, lt + 5))
    if (open === null) {
      pos = lt + 1
      continue
    }
    const level = Number(open[1])
    const tagEnd = scanTagEnd(html, lt + 3)
    if (tagEnd === -2) {
      // Bogus markup (nested '<' outside quotes): leave it verbatim for the
      // sanitizer and rescan from the nested opener.
      pos = lt + 1
      continue
    }
    if (tagEnd === -1) break
    const rawTag = html.slice(lt, tagEnd)
    const idAttrs = collectIdAttrs(rawTag, level)
    if (idAttrs.length > 0 && idAttrs[0].value === FOOTNOTE_LABEL_ID) {
      pos = tagEnd
      continue
    }
    const closeStart = findCloseTag(lower, level, tagEnd)
    const contentEnd = closeStart === -1 ? len : closeStart
    const plainText = toPlainText(html.slice(tagEnd, contentEnd))
    const slug = buildSlug(plainText, seen)
    const id = `${clobberPrefix}h-${slug}`
    out.push(html.slice(emitted, lt), injectIdAttr(rawTag, id, level, idAttrs))
    emitted = tagEnd
    toc.push({ id, level, text: plainText })
    pos = closeStart === -1 ? len : (skipPastGT(html, closeStart) ?? len)
  }
  out.push(html.slice(emitted))
  return { html: out.join(''), toc }
}

/**
 * Index just past the first '>' at or after the position, or null.
 *
 * @param {string} html — full input
 * @param {number} from — index to search from
 * @returns {number|null} index past '>'
 */
function skipPastGT(html, from) {
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
function scanTagEnd(html, from) {
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
function collectIdAttrs(rawTag, level) {
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
function injectIdAttr(rawTag, id, level, idAttrs) {
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
 * after the position, case-insensitively.
 *
 * @param {string} lower — lowercased html (same indices as the original)
 * @param {number} level — heading level
 * @param {number} from — index to search from
 * @returns {number} index of the close '<', or -1
 */
function findCloseTag(lower, level, from) {
  const closeName = `</h${level}`
  let search = from
  while (true) {
    const index = lower.indexOf(closeName, search)
    if (index === -1) return -1
    const after = lower[index + 4]
    if (after === undefined || after === '>' || after === ' ' || after === '\t' || after === '\n' || after === '\r') return index
    search = index + 4
  }
}

/**
 * Heading text for the toc: inline tags stripped and character references
 * decoded (numeric plus the common named set). Unknown named entities stay
 * literal — the consumer escapes the text anyway.
 *
 * @param {string} rawText — html between the heading tags
 * @returns {string} plain text
 */
function toPlainText(rawText) {
  return decodeEntities(rawText.replace(/<[^>]*>/g, ''))
}

/**
 * Build a unique, deterministic slug for one heading. Latin letters and
 * digits survive lowercased, spaces (and dashes) become single dashes,
 * `_: .` stay, non-ASCII letters/digits of any script are percent-encoded
 * (uppercase hex, like the footnote safeIds), everything else drops. Empty
 * results fall back to 'h'; repeats get -1, -2 suffixes computed only from
 * this call's own state.
 *
 * @param {string} text — plain heading text
 * @param {Set<string>} seen — slugs already used in this call
 * @returns {string} unique slug
 */
function buildSlug(text, seen) {
  let slug = ''
  for (const char of text.toLowerCase()) {
    const code = char.codePointAt(0)
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57) || char === '_' || char === ':' || char === '.') {
      slug += char
    } else if (char === ' ' || char === '-') {
      slug += '-'
    } else if (code > 127 && LETTER_OR_DIGIT_PATTERN.test(char)) {
      slug += encodeURIComponent(char)
    }
  }
  slug = slug.replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  if (slug === '') slug = 'h'
  let unique = slug
  let count = 0
  while (seen.has(unique)) {
    count += 1
    unique = `${slug}-${count}`
  }
  seen.add(unique)
  return unique
}
