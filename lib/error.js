// Standard Bonyan error builders for the pey.markdown plugin
// Converts raw errors into the standard Bonyan error structure.

import { ERROR_SOURCE, ERROR_CODES } from './constants.js'

const MAX_SAFE_MESSAGE_CHARS = 200

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
 * Never exposes the raw markdown input or stack traces.
 *
 * @param {Error|unknown} rawError — the raw error from the render pipeline
 * @param {string} [context] — short description of where the error occurred
 * @returns {{ code: string, message: string, source: string, type: string, timestamp: string, detail: object | null }}
 */
export function mapError(rawError, context = '') {
  const rawMessage = rawError instanceof Error ? rawError.message : String(rawError)
  const safeMessage = toSafeMessage(rawMessage)
  const message = context ? `${context}: ${safeMessage}` : `Markdown render failed: ${safeMessage}`
  return buildRenderError(message, context ? { context } : null)
}

/**
 * Truncate a raw message to a safe length for error output.
 *
 * @param {string} message — raw message text
 * @returns {string} truncated message safe for error output
 */
function toSafeMessage(message) {
  if (message.length > MAX_SAFE_MESSAGE_CHARS) {
    return `${message.slice(0, MAX_SAFE_MESSAGE_CHARS)}…`
  }
  return message
}
