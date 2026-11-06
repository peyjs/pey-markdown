// Shared raw-HTML text helpers for the pey.markdown plugin
// Single home for the entity decoder, the attribute tokenizer and attribute
// escaping — both the sanitizer and the heading-id injector decode and
// tokenize the same way, so the rules live here once instead of drifting
// apart between two files.

// Attribute tokenizer: name plus optional quoted or bare value. Callers skip
// the tag-name token themselves (they know its exact shape).
export const ATTR_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const ENTITY_PATTERN = /&(?:#(\d+);?|#[xX]([\da-fA-F]+);?|([a-zA-Z]+);)/g
const LEGACY_ENTITY_PATTERN = /&(amp|AMP|lt|LT|gt|GT|quot|QUOT)(?![a-zA-Z0-9=])/g
const BARE_AMP_PATTERN = /&(?!(?:#\d+;?|#[xX][\da-fA-F]+;?|[a-zA-Z]+;))/g

// Named entities decoded for the URI safety check and heading text. Numeric
// references are decoded generically; this table covers the named ones that
// matter for scheme obfuscation plus the common text entities.
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  semi: ';',
  tab: '\t',
  newline: '\n',
  sol: '/',
  bsol: '\\',
  excl: '!',
  quest: '?',
  num: '#',
  period: '.',
  comma: ',',
  lpar: '(',
  rpar: ')',
  space: ' ',
  nbsp: ' ',
}

/**
 * Decode numeric (semicolon optional, like browsers) and known named
 * character references, plus the legacy no-semicolon set in attributes.
 *
 * @param {string} value — raw text or attribute value
 * @returns {string} decoded value for safety checking or text extraction
 */
export function decodeEntities(value) {
  return value
    .replace(
      ENTITY_PATTERN,
      (match, decimal, hex, named) => {
        if (decimal !== undefined) return codePointToChar(Number(decimal))
        if (hex !== undefined) return codePointToChar(Number.parseInt(hex, 16))
        const known = NAMED_ENTITIES[named.toLowerCase()]
        return known !== undefined ? known : match
      },
    )
    .replace(LEGACY_ENTITY_PATTERN, (match, named) => NAMED_ENTITIES[named.toLowerCase()] ?? match)
}

/**
 * Convert a code point to a character, safely.
 *
 * @param {number} codePoint — numeric code point
 * @returns {string} character or the replacement character
 */
export function codePointToChar(codePoint) {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return '�'
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return '�'
  }
}

/**
 * Escape an attribute value. Valid character references are preserved so
 * renderer-escaped URLs (like `?a=1&amp;b=2`) survive intact; a bare `&`
 * is escaped so no new reference can be smuggled in.
 *
 * @param {string} value — raw value
 * @returns {string} escaped value
 */
export function escapeAttr(value) {
  return value
    .replace(BARE_AMP_PATTERN, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
