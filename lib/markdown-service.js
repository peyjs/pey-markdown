// Markdown rendering service for the pey.markdown plugin
// Stateless and synchronous: Markdown string -> sanitized HTML fragment.
// GFM is always on; Persian (parsneshan) extensions apply only when the
// caller passes them per call. Raw HTML in the source passes through per
// CommonMark and every output is gated by the allowlist sanitizer — raw
// HTML is never trusted, only filtered.

import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

import { DEFAULT_ALLOW_EXTERNAL_IMAGES, DEFAULT_MAX_INPUT_CHARS, ERROR_SOURCE } from './constants.js'
import { buildRenderError, buildServiceUnavailable, mapError } from './error.js'
import { sanitizeHtml } from './sanitize.js'

/** Stable footnote id prefix when the caller passes no idPrefix. */
const DEFAULT_CLOBBER_PREFIX = 'user-content-'

// Characters allowed inside a caller-passed id prefix: the composed clobber
// prefix must keep passing the sanitizer's user-content-* id rule.
const ID_PREFIX_PATTERN = /^[\w:.-]+$/

/**
 * Persian footnote rendering strings live in parsneshan
 * (`persianFootnoteOptions`); this plugin only passes them through to GFM.
 */

export default class MarkdownService {
  /**
   * Create the service. Config carries only plugin-owned fields.
   *
   * @param {object} [config] — plugin config
   * @param {number} [config.maxInputChars] — max input length per call
   * @param {boolean} [config.allowExternalImages] — allow absolute http(s) img src (default true)
   */
  constructor(config = {}) {
    this.maxInputChars = normalizeMaxInputChars(config.maxInputChars)
    this.allowExternalImages = normalizeFlag(config.allowExternalImages, DEFAULT_ALLOW_EXTERNAL_IMAGES)
    this.active = true
  }

  /**
   * Render Markdown to a sanitized HTML fragment.
   *
   * @param {object} [input] — render input
   * @param {string} input.markdown — Markdown source text
   * @param {Array|null} [input.syntaxExtensions] — extra micromark syntax extensions
   * @param {Array|null} [input.htmlExtensions] — extra micromark HTML extensions
   * @param {object|null} [input.footnoteOptions] — GFM footnote rendering
   *   strings (`{ label, backLabel }`, e.g. parsneshan's
   *   `persianFootnoteOptions`); omit for standard English labels, so the
   *   core stays Persian-agnostic without any injection.
   * @param {string|number|null} [input.idPrefix] — caller-owned footnote id scope
   *   (e.g. a message id); keeps footnote links unique across fragments
   *   sharing one host page. Same input plus same prefix always renders
   *   the same output. Omit for the stable default.
   * @returns {{ html: string }} sanitized HTML fragment
   * @throws {object} standard Bonyan error (MARKDOWN_RENDER_FAILED / SERVICE_UNAVAILABLE)
   */
  renderFragment(input = {}) {
    if (!this.active) throw buildServiceUnavailable()
    const source = input !== null && typeof input === 'object' ? input : {}
    const markdown = source.markdown
    if (typeof markdown !== 'string') {
      throw buildRenderError('markdown must be a string', { reason: 'INVALID_INPUT' })
    }
    // Validate everything before the empty-input shortcut so invalid input
    // always fails the same way, even when there is nothing to render.
    const syntaxExtensions = normalizeExtensions(source.syntaxExtensions, 'syntaxExtensions')
    const htmlExtensions = normalizeExtensions(source.htmlExtensions, 'htmlExtensions')
    const footnoteOptions = normalizeFootnoteOptions(source.footnoteOptions)
    const clobberPrefix = normalizeIdPrefix(source.idPrefix)
    if (markdown.length === 0) return { html: '' }
    if (markdown.length > this.maxInputChars) {
      throw buildRenderError('markdown exceeds maxInputChars', { maxInputChars: this.maxInputChars })
    }
    try {
      const rawHtml = micromark(markdown, {
        // allowDangerousHtml lets raw HTML reach the sanitizer (CommonMark
        // passthrough); sanitizeHtml below is the real security boundary.
        allowDangerousHtml: true,
        // allowDangerousProtocol lets tel: links through; dangerous schemes
        // stay dead because the sanitizer neutralizes them (see its tests).
        allowDangerousProtocol: true,
        extensions: [gfm(), ...syntaxExtensions],
        htmlExtensions: [
          // Footnote strings come from the caller (e.g. parsneshan); GFM
          // owns the syntax. No options means standard English labels.
          gfmHtml({ ...footnoteOptions, clobberPrefix }),
          ...htmlExtensions,
        ],
      })
      return { html: sanitizeHtml(rawHtml, { allowExternalImages: this.allowExternalImages }) }
    } catch (rawError) {
      if (isStructuredError(rawError)) throw rawError
      throw mapError(rawError, 'renderFragment')
    }
  }

  /** Mark the service unavailable after plugin deactivation. */
  _setDeactivated() {
    this.active = false
  }
}

/**
 * Normalize the max-input config value to a positive finite number.
 * Numeric strings are accepted because the Core delivers environment
 * values as strings (see configuration.md).
 *
 * @param {number|string|undefined} value — configured value
 * @returns {number} effective limit
 */
function normalizeMaxInputChars(value) {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof numeric === 'number' && Number.isFinite(numeric) && numeric > 0) return numeric
  return DEFAULT_MAX_INPUT_CHARS
}

/**
 * Normalize a boolean config flag. String forms are accepted because the
 * Core delivers environment values as strings (see configuration.md).
 *
 * @param {boolean|string|undefined} value — configured value
 * @param {boolean} fallback — default when the value is unusable
 * @returns {boolean} effective flag
 */
function normalizeFlag(value, fallback) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (lowered === 'true') return true
    if (lowered === 'false') return false
  }
  return fallback
}

/**
 * Normalize the optional footnote rendering options to an object usable by
 * GFM. Only plain objects are accepted; the caller owns the strings (e.g.
 * parsneshan's preset for Persian, nothing for standard English).
 *
 * @param {object|null|undefined} footnoteOptions — caller-passed options
 * @returns {object} options object (may be empty)
 * @throws {object} standard Bonyan error when the value is not an object
 */
function normalizeFootnoteOptions(footnoteOptions) {
  if (footnoteOptions === null || footnoteOptions === undefined) return {}
  if (typeof footnoteOptions !== 'object' || Array.isArray(footnoteOptions)) {
    throw buildRenderError('footnoteOptions must be an object', { reason: 'INVALID_INPUT', field: 'footnoteOptions' })
  }
  return footnoteOptions
}

/**
 * Normalize the caller-owned footnote id scope to a clobber prefix that
 * keeps passing the sanitizer's user-content-* id rule. Nullish means the
 * stable default. Finite integers are coerced (message ids are usually
 * numeric); anything else must be id-safe Latin text — Persian prefixes
 * would break silently, so they are rejected and the caller transliterates.
 *
 * @param {string|number|null|undefined} idPrefix — caller-passed scope
 * @returns {string} clobber prefix for gfmFootnoteHtml
 * @throws {object} standard Bonyan error when the value is unusable
 */
function normalizeIdPrefix(idPrefix) {
  if (idPrefix === null || idPrefix === undefined) return DEFAULT_CLOBBER_PREFIX
  const text = typeof idPrefix === 'number' && Number.isInteger(idPrefix) && Number.isFinite(idPrefix)
    ? String(idPrefix)
    : idPrefix
  if (typeof text !== 'string' || text.length === 0 || !ID_PREFIX_PATTERN.test(text)) {
    throw buildRenderError('idPrefix must be a non-empty id-safe string', { reason: 'INVALID_INPUT', field: 'idPrefix' })
  }
  return `user-content-${text}-`
}

/**
 * Normalize an optional extensions param to an array.
 *
 * @param {Array|null|undefined} extensions — caller-passed extensions
 * @param {string} field — field name for error detail
 * @returns {Array} extension list (may be empty)
 * @throws {object} standard Bonyan error when the value is not an array
 */
function normalizeExtensions(extensions, field) {
  if (extensions === null || extensions === undefined) return []
  if (!Array.isArray(extensions)) {
    throw buildRenderError(`${field} must be an array`, { reason: 'INVALID_INPUT', field })
  }
  return extensions
}

/**
 * Check whether an error already uses the standard Bonyan structure.
 *
 * @param {unknown} error — caught error
 * @returns {boolean} true when the error must pass through unchanged
 */
function isStructuredError(error) {
  return Boolean(error && typeof error === 'object' && error.source === ERROR_SOURCE && error.code)
}
