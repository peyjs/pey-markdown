// Standard Bonyan error builders for the pey.markdown plugin
// Converts raw errors into the standard Bonyan error structure.

import { ERROR_SOURCE, ERROR_CODES } from './constants.js'

/**
 * Build a render-failure error (invalid input or internal render failure).
 *
 * @param {string} message — human-readable description (no raw markdown contents)
 * @param {object} [detail] — optional safe metadata (never sensitive data)
 * @returns {{ code: string, message: string, source: string, type: string, timestamp: string, detail: object | null }}
 */
export function buildRenderError(message, detail = null) {
  return {
    code: ERROR_CODES.MARKDOWN_RENDER_FAILED,
    message,
    source: ERROR_SOURCE,
    type: 'operational',
    timestamp: new Date().toISOString(),
    detail,
  }
}

/**
 * Build the standard unavailable error for calls after deactivation.
 *
 * @returns {{ code: string, message: string, source: string, type: string, timestamp: string, detail: null }}
 */
export function buildServiceUnavailable() {
  return {
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
    message: 'Markdown service is unavailable',
    source: ERROR_SOURCE,
    type: 'operational',
    timestamp: new Date().toISOString(),
    detail: null,
  }
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
 * @returns {{ code: string, message: string, source: string, type: string, timestamp: string, detail: object | null }}
 */
export function mapError(rawError, context = '') {
  const kind = rawError instanceof Error ? rawError.constructor.name : typeof rawError
  const detail = context ? { context, kind } : { kind }
  return buildRenderError('Markdown render failed', detail)
}
