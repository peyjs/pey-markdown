// Tests for lib/error.js and the service error contract.
// Strategy: assert the standard Bonyan error structure on every builder and
// on every error path of renderFragment — never on raw error text.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import MarkdownService from '../lib/markdown-service.js'
import { ERROR_CODES } from '../lib/constants.js'
import { buildRenderError, buildServiceUnavailable, mapError } from '../lib/error.js'

/**
 * Assert the standard Bonyan error structure.
 *
 * @param {object} error — error under test
 * @param {string} code — expected code
 * @param {string} type — expected type
 */
function assertStandardError(error, code, type) {
  assert.equal(error.code, code)
  assert.equal(error.source, 'pey.markdown')
  assert.equal(error.type, type)
  assert.equal(typeof error.message, 'string')
  assert.ok(error.message.length > 0, 'message must be human-readable')
  assert.ok(!Number.isNaN(Date.parse(error.timestamp)), 'timestamp must be a valid date')
}

describe('error builders', () => {
  it('should_build_structured_error_when_render_fails', () => {
    assertStandardError(buildRenderError('bad input', { reason: 'INVALID_INPUT' }), ERROR_CODES.MARKDOWN_RENDER_FAILED, 'operational')
  })

  it('should_build_unavailable_error_when_service_is_deactivated', () => {
    assertStandardError(buildServiceUnavailable(), ERROR_CODES.SERVICE_UNAVAILABLE, 'operational')
  })

  it('should_truncate_message_when_raw_error_is_too_long', () => {
    const error = mapError(new Error('x'.repeat(500)), 'renderFragment')

    assertStandardError(error, ERROR_CODES.MARKDOWN_RENDER_FAILED, 'operational')
    assert.ok(error.message.length < 500, 'raw message must not leak in full')
  })

  it('should_keep_detail_safe_when_mapping_raw_error', () => {
    const error = mapError(new Error('boom'), 'renderFragment')

    assert.deepEqual(error.detail, { context: 'renderFragment' })
  })
})

describe('service error contract', () => {
  it('should_return_standard_error_when_input_is_missing', () => {
    const service = new MarkdownService()

    assert.throws(() => service.renderFragment({}), (error) => {
      assertStandardError(error, ERROR_CODES.MARKDOWN_RENDER_FAILED, 'operational')
      return true
    })
  })

  it('should_return_standard_error_when_input_is_not_an_object', () => {
    const service = new MarkdownService()

    assert.throws(() => service.renderFragment({ markdown: null }), (error) => {
      assertStandardError(error, ERROR_CODES.MARKDOWN_RENDER_FAILED, 'operational')
      return true
    })
  })

  it('should_carry_no_input_content_when_input_is_invalid', () => {
    const service = new MarkdownService()
    const secret = 'secret-token-123'

    assert.throws(() => service.renderFragment({ markdown: { token: secret } }), (error) => {
      assertStandardError(error, ERROR_CODES.MARKDOWN_RENDER_FAILED, 'operational')
      assert.ok(!error.message.includes(secret), 'input content must not leak into errors')
      return true
    })
  })
})
