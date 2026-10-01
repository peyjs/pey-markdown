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

/** Persian footnote section heading (replaces GFM's "Footnotes"). */
const FOOTNOTE_LABEL = 'پاورقی'

// Per-call footnote id counter. Footnote ids must be unique across fragments
// sharing one host page (chat, wiki); a process-wide counter is the only
// shape that stays unique even for identical messages. The prefix keeps the
// sanitizer's user-content-* id rule working unchanged.
let footnoteCounter = 0

/**
 * Persian back-reference label, mirroring GFM's defaultBackLabel shape.
 *
 * @param {number} referenceIndex — definition index, 0-based
 * @param {number} rereferenceIndex — repeat-call index, 0-based
 * @returns {string} accessible label
 */
function footnoteBackLabel(referenceIndex, rereferenceIndex) {
  return `بازگشت به ارجاع ${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ''}`
}

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
    if (markdown.length === 0) return { html: '' }
    if (markdown.length > this.maxInputChars) {
      throw buildRenderError('markdown exceeds maxInputChars', { maxInputChars: this.maxInputChars })
    }
    const syntaxExtensions = normalizeExtensions(source.syntaxExtensions, 'syntaxExtensions')
    const htmlExtensions = normalizeExtensions(source.htmlExtensions, 'htmlExtensions')
    try {
      footnoteCounter += 1
      const rawHtml = micromark(markdown, {
        // allowDangerousHtml lets raw HTML reach the sanitizer (CommonMark
        // passthrough); sanitizeHtml below is the real security boundary.
        allowDangerousHtml: true,
        // allowDangerousProtocol lets tel: links through; dangerous schemes
        // stay dead because the sanitizer neutralizes them (see its tests).
        allowDangerousProtocol: true,
        extensions: [gfm(), ...syntaxExtensions],
        htmlExtensions: [
          gfmHtml({
            label: FOOTNOTE_LABEL,
            backLabel: footnoteBackLabel,
            clobberPrefix: `user-content-${footnoteCounter}-`,
          }),
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
