// Standard Bonyan error builders for the pey.markdown plugin
// Converts raw errors into the standard Bonyan error structure. Errors are
// real `Error` instances (BonyanError) carrying the six standard fields, so
// callers keep `instanceof Error`, stack traces and field-based handling
// alike.

import { ERROR_SOURCE, ERROR_CODES } from './constants.js'

/**
 * Base error class for every error crossing the plugin boundary: an Error
 * with the standard Bonyan fields attached.
 */
export class BonyanError extends Error {
  /**
   * @param {string} code — stable machine-readable code
   * @param {string} message — human-readable description (no raw input content)
   * @param {string} type — error type (e.g. 'operational')
   * @param {object|null} detail — optional safe metadata (never sensitive data)
   */
  constructor(code, message, type, detail) {
    super(message)
    this.name = 'BonyanError'
    this.code = code
    this.source = ERROR_SOURCE
    this.type = type
    this.timestamp = new Date().toISOString()
    this.detail = detail
  }
}

/**
 * Build a render-failure error (invalid input or internal render failure).
 *
 * @param {string} message — human-readable description (no raw markdown contents)
 * @param {object} [detail] — optional safe metadata (never sensitive data)
 * @returns {BonyanError} error with code MARKDOWN_RENDER_FAILED
 */
export function buildRenderError(message, detail = null) {
  return new BonyanError(ERROR_CODES.MARKDOWN_RENDER_FAILED, message, 'operational', detail)
}

/**
 * Build the standard unavailable error for calls after deactivation.
 *
 * @returns {BonyanError} error with code SERVICE_UNAVAILABLE
 */
export function buildServiceUnavailable() {
  return new BonyanError(ERROR_CODES.SERVICE_UNAVAILABLE, 'Markdown service is unavailable', 'operational', null)
}

/**
 * Map a raw render error to a standard Bonyan error.
 * The message is static on purpose: raw messages may carry user markdown
 * (e.g. thrown by a caller-passed extension), and errors must never leak
 * input content. The error class name is kept as a safe debugging hint —
 * it is engine-defined and carries no user data.
 *
 * @param {Error|unknown} rawError — the raw error from the render pipeline
 * @param {string} [context] — short description of where the error occurred
 * @returns {BonyanError} error with code MARKDOWN_RENDER_FAILED
 */
export function mapError(rawError, context = '') {
  const kind = rawError instanceof Error ? rawError.constructor.name : typeof rawError
  const detail = context ? { context, kind } : { kind }
  return buildRenderError('Markdown render failed', detail)
}
