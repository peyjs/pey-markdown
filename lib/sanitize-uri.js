// URI safety policy for the pey.markdown sanitizer
// Checks a link/resource URI against the safe scheme policy. Both the scheme
// test and the shape test run on the normalized value (entities decoded,
// browser-equivalent whitespace stripped) — never on the raw text, which may
// hide the scheme behind `&#1;`-style obfuscation that the `&`-`#` prefix
// would otherwise let through.

import { decodeEntities } from './html-text.js'

const SAFE_URI_PATTERN = /^(https?:|mailto:|tel:|#|\/|[^:/?#]*([/?#]|$))/i

/**
 * Check a link/resource URI against the safe scheme policy.
 *
 * @param {string} tag — lowercase tag name
 * @param {string} attr — href or src
 * @param {string} value — raw URI
 * @param {{ allowExternalImages: boolean }} settings — effective settings
 * @returns {boolean} true when the URI is safe to keep
 */
export function isSafeUri(tag, attr, value, settings) {
  const normalized = normalizeUri(value)
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return false
  if (normalized.startsWith('data:')) {
    return tag === 'img' && attr === 'src' && normalized.startsWith('data:image/')
  }
  if (tag === 'img' && attr === 'src' && !settings.allowExternalImages && isExternalUri(normalized)) {
    return false
  }
  return SAFE_URI_PATTERN.test(normalized)
}

/**
 * Normalize a URI the way browsers do before parsing its scheme: decode
 * character references (numeric with or without semicolon, known named, and
 * the legacy no-semicolon set), drop ASCII tab/newline everywhere, strip
 * leading/trailing C0 controls and spaces, and lowercase.
 *
 * @param {string} value — raw URI
 * @returns {string} normalized URI for safety checking (never emitted directly)
 */
function normalizeUri(value) {
  return decodeEntities(value.trim())
    .replace(/[\t\n\r]/g, '')
    .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
    .toLowerCase()
}

/**
 * Check whether a normalized URI points off-site. Backslashes are folded to
 * slashes first (browsers read them that way), so `http:/`, `/\`, `\/` and
 * `\\` all count as remote. Relative paths, anchors, and data:image are local.
 *
 * @param {string} normalized — normalized URI
 * @returns {boolean} true when loading it contacts another site
 */
function isExternalUri(normalized) {
  const slashed = normalized.replace(/\\/g, '/')
  return slashed.startsWith('http:') || slashed.startsWith('https:') || slashed.startsWith('//')
}
