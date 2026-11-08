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

import { decodeEntities } from './html-text.js'
import { DROP_CONTENT_TAGS } from './sanitize-policy.js'
import { parseTagHead, stepDropContent } from './sanitize-state.js'
import { collectIdAttrs, findCloseTag, injectIdAttr, scanTagEnd, skipPastGT } from './heading-scan.js'

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
      // A closed comment is skipped by both passes. An UNCLOSED one is
      // escaped to text by the sanitizer (`&lt;!--`), which then keeps
      // scanning the rest as live content — so id injection must keep
      // scanning too, or headings after an unclosed comment would render
      // without ids while missing from the toc.
      pos = close === -1 ? lt + 4 : close + 3
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
      // A parsed non-heading tag is consumed quote-aware through its '>',
      // exactly like the sanitizer's scanTagBoundary — a `<h2>` inside a
      // quoted attribute value of a host tag must never be visited, or it
      // would get an id injected into the attribute (breaking FR-13).
      if (head !== null) {
        const hostTagEnd = scanTagEnd(html, lt + 1 + (head.isClosing ? 1 : 0) + head.name.length)
        if (hostTagEnd === -1) break
        if (hostTagEnd !== -2) {
          pos = hostTagEnd
          continue
        }
      }
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
    // The outer heading's toc text excludes nested heading subtrees: a
    // nested `<h2>` inside inline raw HTML is its own heading with its own
    // id and toc entry, not part of the outer text.
    const plainText = toPlainText(cutHeadingSubtrees(html.slice(tagEnd, contentEnd)))
    const slug = buildSlug(plainText, seen)
    const id = `${clobberPrefix}h-${slug}`
    out.push(html.slice(emitted, lt), injectIdAttr(rawTag, id, level, idAttrs))
    emitted = tagEnd
    toc.push({ id, level, text: plainText })
    // Scanning continues INSIDE the heading so nested heading open tags
    // are visited and given their own ids.
    pos = tagEnd
  }
  out.push(html.slice(emitted))
  return { html: out.join(''), toc }
}

/**
 * Removes everything the sanitizer would not render as text from a heading's
 * content region: closed comments (an unclosed one stays live, like the
 * sanitizer), nested heading subtrees (a nested `<h2>` is its own heading,
 * not words of the outer heading's toc text) and script/style subtrees the
 * sanitizer drops — so the toc text always matches the rendered text.
 *
 * @param {string} content — html between the outer heading tags
 * @returns {string} content with the invisible regions cut out
 */
function cutHeadingSubtrees(content) {
  const lower = content.toLowerCase()
  const spans = []
  const drop = { depth: 0, tag: null }
  let dropStart = 0
  let pos = 0
  while (pos < content.length) {
    if (drop.depth > 0) {
      const next = stepDropContent(content, pos, drop)
      if (drop.depth === 0) {
        spans.push([dropStart, next])
      }
      pos = next
      continue
    }
    const lt = content.indexOf('<', pos)
    if (lt === -1) break
    if (content.startsWith('<!--', lt)) {
      const close = content.indexOf('-->', lt + 4)
      if (close === -1) {
        // Unclosed comment: the sanitizer escapes the opener and keeps the
        // rest live, so the text after it stays part of the heading.
        pos = lt + 4
        continue
      }
      spans.push([lt, close + 3])
      pos = close + 3
      continue
    }
    const head = parseTagHead(content, lt)
    if (head !== null && !head.isClosing && DROP_CONTENT_TAGS.has(head.name)) {
      const tagEnd = scanTagEnd(content, lt + 1 + head.name.length)
      if (tagEnd === -2) {
        pos = lt + 1
        continue
      }
      if (tagEnd === -1) break
      const raw = content.slice(lt, tagEnd)
      if (raw.length > 2 && raw[raw.length - 2] === '/') {
        // A self-closing dropped tag drops only itself (see the sanitizer).
        spans.push([lt, tagEnd])
        pos = tagEnd
        continue
      }
      drop.depth = 1
      drop.tag = head.name
      dropStart = lt
      pos = tagEnd
      continue
    }
    const open = HEADING_OPEN_PATTERN.exec(content.slice(lt, lt + 5))
    if (open === null) {
      pos = lt + 1
      continue
    }
    const level = Number(open[1])
    const innerTagEnd = scanTagEnd(content, lt + 3)
    if (innerTagEnd === -1 || innerTagEnd === -2) break
    const close = findCloseTag(lower, level, innerTagEnd)
    const end = close === -1 ? content.length : (skipPastGT(content, close) ?? content.length)
    spans.push([lt, end])
    pos = end
  }
  let cut = ''
  let emitted = 0
  for (const [start, end] of spans) {
    cut += content.slice(emitted, start)
    emitted = end
  }
  return cut + content.slice(emitted)
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
