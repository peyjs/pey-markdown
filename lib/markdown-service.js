// Markdown rendering service for the pey.markdown plugin
// Stateless and synchronous: Markdown string -> sanitized HTML fragment.
// GFM is always on; Persian (parsneshan) extensions apply only when the
// caller passes them per call. Raw HTML in the source passes through per
// CommonMark and every output is gated by the allowlist sanitizer — raw
// HTML is never trusted, only filtered.

import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'
import { gfmAutolinkLiteral, gfmAutolinkLiteralHtml } from 'micromark-extension-gfm-autolink-literal'

import { DEFAULT_MAX_INPUT_CHARS, ERROR_SOURCE } from './constants.js'
import { buildRenderError, buildServiceUnavailable, mapError } from './error.js'
import { sanitizeHtml } from './sanitize.js'

export default class MarkdownService {
  /**
   * Create the service. Config carries only plugin-owned fields.
   *
   * @param {object} [config] — plugin config
   * @param {number} [config.maxInputChars] — max input length per call
   */
  constructor(config = {}) {
    this.maxInputChars = normalizeMaxInputChars(config.maxInputChars)
    this.active = true
  }

  /**
   * Render Markdown to a sanitized HTML fragment.
   *
   * @param {object} [input] — render input
   * @param {string} input.markdown — Markdown source text
   * @param {Array|null} [input.syntaxExtensions] — extra micromark syntax extensions
   * @param {Array|null} [input.htmlExtensions] — extra micromark HTML extensions
   * @returns {{ html: string }} sanitized HTML fragment
   * @throws {object} standard Bonyan error (MARKDOWN_RENDER_FAILED / SERVICE_UNAVAILABLE)
   */
  renderFragment(input = {}) {
    if (!this.active) throw buildServiceUnavailable()
    const markdown = input.markdown
    if (typeof markdown !== 'string') {
      throw buildRenderError('markdown must be a string', { reason: 'INVALID_INPUT' })
    }
    if (markdown.length === 0) return { html: '' }
    if (markdown.length > this.maxInputChars) {
      throw buildRenderError('markdown exceeds maxInputChars', { maxInputChars: this.maxInputChars })
    }
    const syntaxExtensions = normalizeExtensions(input.syntaxExtensions, 'syntaxExtensions')
    const htmlExtensions = normalizeExtensions(input.htmlExtensions, 'htmlExtensions')
    try {
      const rawHtml = micromark(markdown, {
        // allowDangerousHtml lets raw HTML reach the sanitizer (CommonMark
        // passthrough); sanitizeHtml below is the real security boundary.
        allowDangerousHtml: true,
        extensions: [gfm(), gfmAutolinkLiteral(), ...syntaxExtensions],
        htmlExtensions: [gfmHtml(), gfmAutolinkLiteralHtml(), ...htmlExtensions],
      })
      return { html: sanitizeHtml(rawHtml) }
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
 *
 * @param {number|undefined} value — configured value
 * @returns {number} effective limit
 */
function normalizeMaxInputChars(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  return DEFAULT_MAX_INPUT_CHARS
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
