// Heading id injection for the pey.markdown plugin
// ONE linear pass over the raw micromark output (pre-sanitize): every h1-h6
// open tag gets a stable plugin-owned id — the only slugger lives here,
// never in a consumer — and the returned toc array carries exactly the ids
// applied to the html. Ids stay inside the sanitizer's SAFE_ID_PATTERN
// charset (`user-content-` + Latin/digit/`_ : . -`/percent-encoded runs), so
// they always survive sanitization unchanged. No DOM, no state between
// calls, and no re-walking: the pass walks the sanitizer's exact model
// position by position, so a heading's close and its rendered text fall out
// of the SAME walk (round-9: per-heading close searches and per-heading text
// extraction were each quadratic on unclosed-heading documents — a 60k-char
// input took ~27s; the single pass keeps every character's cost constant).
//
// Subtrees the sanitizer will drop (script/style) are skipped with the
// sanitizer's own walker (stepDropContent), region for region — including
// nested same-name tags — so a heading id can never enter the toc while its
// heading is dropped from the sanitized output.
//
// The pass also mirrors the sanitizer's open-tag stack (emitTag): a heading
// ends where the sanitizer closes it, which is a stack question — a `</hN>`
// closes the innermost open hN, and a closer of any tag opened below the
// heading pops through and closes it too. Stack entries carry each
// heading's LIVE TEXT SINK: every live character between the tags is
// appended to the topmost open heading exactly once, so a nested heading's
// text belongs to the nested entry (the outer text excludes nested heading
// subtrees) and an unclosed heading costs nothing beyond its own segment.

import { decodeEntities } from './html-text.js'
import { ALLOWED_TAGS, DROP_CONTENT_TAGS, VOID_TAGS } from './sanitize-policy.js'
import { parseTagHead, stepDropContent } from './sanitize-state.js'
import { collectIdAttrs, injectIdAttr, scanTagEnd } from './heading-scan.js'

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
 * footnote-label id is passed through untouched. Slugs are allocated in
 * heading-open order — the toc's order — after the walk, when every
 * heading's text is complete.
 *
 * @param {string} html — raw (pre-sanitize) HTML fragment from micromark
 * @param {string} clobberPrefix — id scope prefix, ends with '-' (e.g. 'user-content-')
 * @returns {{ html: string, toc: Array<{id: string, level: number, text: string}> }} html with ids injected and the matching toc
 */
export function addHeadingIds(html, clobberPrefix) {
  if (typeof html !== 'string' || html.length === 0) return { html: '', toc: [] }
  const len = html.length
  // Output tokens: html strings and heading records awaiting their id (the
  // record's open tag is rewritten at the end, after its text is known).
  const out = []
  const records = []
  const seen = new Map()
  // Document-wide comment throttle: an opener past the last `-->` can
  // never close, so no per-opener probing (quadratic across headings).
  const commentCloseLimit = html.lastIndexOf('-->')
  // One entry per sanitizer-open tag: allowed non-void opens push (self-
  // closing included — emitTag still opens an element), closers pop through
  // their last match, stray/void closers are no-ops. A heading's entry
  // carries its record (text sink); a footnote heading carries a DISCARD
  // barrier — text stops there (its whole subtree belongs to no toc entry),
  // which is what keeps the footnote section's label and body out of an
  // outer heading's text.
  const stack = []
  // name → count of open entries with that name: a closer with no open
  // match is a no-op WITHOUT scanning the stack (deep stacks × stray
  // closers were quadratic — pure-markdown `<span>` lines + `</i>` lines).
  const stackCounts = new Map()
  const drop = { depth: 0, tag: null }
  let emitted = 0
  let pos = 0

  // The sanitizer renders every live character between the tags as text of
  // the innermost heading that is open there — tags contribute none, dead
  // slices render escaped, unclosed comments keep their opener live. The
  // active sink is a POINTER, not a search: it follows pushes (a record or
  // a discard barrier becomes the active sink) and pops (when the popped
  // range removed it, the new sink is read from the nearestSink field the
  // entry below already carries — computed at that entry's push, so restore
  // is O(1) and never rescans the entries below; a deep unclosed base under
  // many heading closes stays linear too).
  let sinkIndex = -1
  const emitText = (text) => {
    if (text === '' || sinkIndex < 0) return
    const entry = stack[sinkIndex]
    if (entry.record !== null) entry.record.text += text
  }

  while (pos < len) {
    if (drop.depth > 0) {
      pos = stepDropContent(html, pos, drop)
      continue
    }
    const lt = html.indexOf('<', pos)
    if (lt === -1) {
      emitText(html.slice(pos))
      break
    }
    emitText(html.slice(pos, lt))
    if (html.startsWith('<!--', lt)) {
      if (lt + 4 <= commentCloseLimit) {
        // A closed comment is skipped by both passes.
        pos = html.indexOf('-->', lt + 4) + 3
        continue
      }
      // An UNCLOSED comment is escaped to text by the sanitizer (`&lt;!--`)
      // which then keeps scanning the rest as live content.
      emitText(html.slice(lt, lt + 4))
      pos = lt + 4
      continue
    }
    const head = parseTagHead(html, lt)
    if (head === null) {
      // Not a tag: one escaped character of live text.
      emitText(html.slice(lt, lt + 1))
      pos = lt + 1
      continue
    }
    const scan = scanTagEnd(html, lt + 1 + (head.isClosing ? 1 : 0) + head.name.length)
    if (scan.abortedAt !== -1) {
      // Dead markup the sanitizer escapes and never re-examines: the
      // consumed slice renders as text INSIDE the current heading — resume
      // at the nested '<' without rewinding into the attributes.
      emitText(html.slice(lt, scan.abortedAt))
      pos = scan.abortedAt
      continue
    }
    if (scan.end === -1) {
      // Truncated at EOF: the sanitizer escapes the whole rest as text.
      emitText(html.slice(lt))
      break
    }
    if (head.isClosing) {
      if ((stackCounts.get(head.name) ?? 0) > 0) {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i].name === head.name) {
            // emitTag's pop-through: everything above the matched entry
            // closes with it — the headings above it included, their text
            // complete with the walk.
            for (let j = i; j < stack.length; j += 1) {
              const removed = stackCounts.get(stack[j].name) - 1
              if (removed === 0) stackCounts.delete(stack[j].name)
              else stackCounts.set(stack[j].name, removed)
            }
            stack.length = i
            if (sinkIndex >= i) {
              // The active sink was removed: the entry just below the pop
              // already carries its nearest sink (a record or a discard
              // barrier) as a push-time field — restoring is O(1), no
              // rescan of the entries below.
              sinkIndex = i > 0 ? stack[i - 1].nearestSink : -1
            }
            break
          }
        }
      }
      pos = scan.end
      continue
    }
    if (DROP_CONTENT_TAGS.has(head.name)) {
      // Mirrors the sanitizer's drop start: a self-closing one drops only
      // itself and never starts a subtree drop; neither reaches the stack.
      const raw = html.slice(lt, scan.end)
      if (raw.length > 2 && raw[raw.length - 2] === '/') {
        pos = scan.end
        continue
      }
      drop.depth = 1
      drop.tag = head.name
      pos = scan.end
      continue
    }
    const open = HEADING_OPEN_PATTERN.exec(html.slice(lt, lt + 5))
    if (open === null) {
      // Host tag: allowed non-void opens push; everything else passes.
      if (Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, head.name) && !VOID_TAGS.has(head.name)) {
        stack.push({ name: head.name, record: null, discard: false, nearestSink: stack.length > 0 ? stack[stack.length - 1].nearestSink : -1 })
        stackCounts.set(head.name, (stackCounts.get(head.name) ?? 0) + 1)
      }
      pos = scan.end
      continue
    }
    // Heading open: its record joins the stack as a text sink; the id is
    // injected after the walk, when the text (and so the slug) is known.
    const level = Number(open[1])
    const tagEnd = scan.end
    const rawTag = html.slice(lt, tagEnd)
    const idAttrs = collectIdAttrs(rawTag, level)
    const footnote = idAttrs.length > 0 && idAttrs[0].value === FOOTNOTE_LABEL_ID
    const record = { level, rawTag, idAttrs, text: '' }
    // A footnote heading is a real DISCARD barrier: text stops there until
    // its close pops it — the footnote section's label and body belong to
    // no toc entry and must never leak into an outer heading's text. Either
    // way the heading entry is itself a sink, so it carries its own index.
    stack.push({ name: `h${level}`, record: footnote ? null : record, discard: footnote, nearestSink: stack.length })
    stackCounts.set(`h${level}`, (stackCounts.get(`h${level}`) ?? 0) + 1)
    sinkIndex = stack.length - 1
    if (!footnote) {
      out.push(html.slice(emitted, lt), record)
      records.push(record)
      emitted = tagEnd
    }
    pos = tagEnd
  }

  // Slugs in open order — identical allocation order to every release
  // before this one, so identical documents render identical ids.
  for (const record of records) {
    const plainText = decodeEntities(record.text)
    record.id = `${clobberPrefix}h-${buildSlug(plainText, seen)}`
    record.plainText = plainText
  }
  const htmlOut = out
    .map((token) => (typeof token === 'string' ? token : injectIdAttr(token.rawTag, token.id, token.level, token.idAttrs)))
    .join('') + html.slice(emitted)
  return { html: htmlOut, toc: records.map((record) => ({ id: record.id, level: record.level, text: record.plainText })) }
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
 * @param {Map<string, number>} seen — slugs already used in this call,
 *   mapped to the highest `-<n>` suffix already allocated from that base
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
  // The per-base suffix counter keeps duplicate allocation amortized O(1):
  // re-deriving the free suffix by probing from 1 for every same-text
  // heading was quadratic on real documents with many identical headings.
  // A suffix skipped because another heading's text occupied it is checked
  // once and never revisited — each probe either allocates or retires a
  // slug, so the total probe count stays linear in the call.
  const highest = seen.get(slug)
  if (highest === undefined) {
    seen.set(slug, 0)
    return slug
  }
  let count = highest + 1
  while (seen.has(`${slug}-${count}`)) {
    count += 1
  }
  seen.set(slug, count)
  seen.set(`${slug}-${count}`, 0)
  return `${slug}-${count}`
}
