// Pure-string HTML sanitizer for the pey.markdown plugin
// Allowlist-based, no DOM, synchronous — safe in browser, Node, Capacitor, Tauri.
// True single-pass state machine: text runs jump with indexOf, tag assembly
// consumes each character at most twice and never rescans, so even adversarial
// inputs stay linear. Unbalanced tags are auto-closed at the end so a fragment
// can never break the host page layout.
//
// The policy tables, attribute filtering and URI checks live in their own
// modules (sanitize-policy / sanitize-attributes / sanitize-uri); this file
// is the tag-level state machine only.

import { parseTagHead, scanTagBoundary, stepDropContent, skipComment, emitTag, escapeBrackets, normalizeOptions } from './sanitize-state.js'

/**
 * Sanitize an HTML fragment: keep allowlisted tags/attributes, drop the rest.
 * Disallowed tags are unwrapped (content kept), except script/style whose
 * whole subtree is removed. Comments are removed. Unbalanced tags are
 * auto-closed so the fragment is always well-formed.
 *
 * @param {string} html — raw HTML fragment from the markdown renderer
 * @param {object} [options] — sanitizer options
 * @param {boolean} [options.allowExternalImages] — allow absolute http(s) img src (default true)
 * @returns {string} sanitized HTML fragment
 */
export function sanitizeHtml(html, options = {}) {
  if (typeof html !== 'string' || html.length === 0) return ''
  const settings = normalizeOptions(options)
  const out = []
  const openStack = []
  const openCounts = new Map()
  const drop = { depth: 0, tag: null }
  let noCommentClose = false
  let pos = 0
  const len = html.length
  while (pos < len) {
    if (drop.depth > 0) {
      pos = stepDropContent(html, pos, drop)
      continue
    }
    const lt = html.indexOf('<', pos)
    if (lt === -1) {
      out.push(html.slice(pos))
      break
    }
    if (lt > pos) out.push(html.slice(pos, lt))
    if (html.startsWith('<!--', lt)) {
      pos = skipComment(html, lt, out, noCommentClose, (flag) => {
        noCommentClose = flag
      })
      continue
    }
    const head = parseTagHead(html, lt)
    if (head === null) {
      out.push('&lt;')
      pos = lt + 1
      continue
    }
    const boundary = scanTagBoundary(html, lt, head)
    if (boundary.abortedAt !== -1) {
      // Nested '<' outside quotes before any close: the head was bogus
      // markup. The consumed slice may itself hide '<' inside quotes, so
      // escape them all (never emit live tags from a dead tag), then
      // restart at the nested '<'. Consumed characters are never
      // re-examined, so adversarial nesting stays linear.
      out.push('&lt;')
      out.push(escapeBrackets(html.slice(lt + 1, boundary.abortedAt)))
      pos = boundary.abortedAt
      continue
    }
    if (boundary.end === -1) {
      // Hit end of input without a close: escape the whole rest (it may
      // hide live-looking tags inside quotes) and stop. Single bounded pass.
      out.push('&lt;')
      out.push(escapeBrackets(html.slice(lt + 1)))
      break
    }
    pos = boundary.end
    emitTag(boundary, settings, out, openStack, drop, openCounts)
  }
  while (openStack.length > 0) out.push(`</${openStack.pop()}>`)
  return out.join('')
}
