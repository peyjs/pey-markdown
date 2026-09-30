// Tests for the pey.markdown entry point (index.js) — two-phase shape
// (prepare / activate) per Bonyan architecture 0.11.
//
// Strategy: no adapter and no dependencies, so no module mocking is needed.
// Each test calls prepare() with its own context first; module-level closure
// state (savedContext/serviceRef) is overwritten per call, keeping tests
// independent. Only manifest-visible behavior is asserted.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ERROR_CODES } from '../lib/constants.js'
import MarkdownService from '../lib/markdown-service.js'
import { prepare, activate } from '../index.js'

/**
 * Build a minimal PrepareContext matching core-api-reference.md shape.
 *
 * @param {object} [overrides]
 * @returns {{ config: object, events: object, onShutdown: null, onDeactivated: null }}
 */
function createPrepareContext(overrides = {}) {
  return {
    config: { maxInputChars: 200000, ...(overrides.config || {}) },
    events: {
      published: [],
      publish(type, data) { this.published.push({ type, data }) },
      subscribe() {},
    },
    onShutdown: null,
    onDeactivated: null,
  }
}

describe('pey.markdown entry point', () => {
  describe('prepare() — success path', () => {
    it('should_return_array_with_service_instance_when_prepare_runs', async () => {
      const ctx = createPrepareContext()

      const services = await prepare(ctx)

      assert.ok(Array.isArray(services), 'prepare() must return an array')
      assert.equal(services.length, 1)
      assert.equal(services[0].name, 'pey.markdown.service')
      assert.ok(services[0].object instanceof MarkdownService)
    })

    it('should_render_markdown_when_service_from_prepare_is_called', async () => {
      const ctx = createPrepareContext()
      const services = await prepare(ctx)

      const { html } = services[0].object.renderFragment({ markdown: '# hi' })

      assert.ok(html.includes('<h1>hi</h1>'))
    })

    it('should_apply_config_limit_when_prepare_receives_custom_maxInputChars', async () => {
      const ctx = createPrepareContext({ config: { maxInputChars: 5 } })
      const services = await prepare(ctx)

      assert.throws(() => services[0].object.renderFragment({ markdown: '012345' }), (error) => {
        assert.equal(error.code, ERROR_CODES.MARKDOWN_RENDER_FAILED)
        return true
      })
    })

    it('should_assign_lifecycle_hooks_when_prepare_succeeds', async () => {
      const ctx = createPrepareContext()

      await prepare(ctx)

      assert.equal(typeof ctx.onShutdown, 'function')
      assert.equal(typeof ctx.onDeactivated, 'function')
    })
  })

  describe('prepare() — lifecycle hooks assigned in prepare phase', () => {
    it('should_make_service_unavailable_when_onShutdown_runs_without_activate', async () => {
      const ctx = createPrepareContext()
      const services = await prepare(ctx)

      await ctx.onShutdown()

      assert.throws(() => services[0].object.renderFragment({ markdown: 'hi' }), (error) => {
        assert.equal(error.code, ERROR_CODES.SERVICE_UNAVAILABLE)
        return true
      })
    })

    it('should_make_service_unavailable_when_onDeactivated_runs_without_activate', async () => {
      const ctx = createPrepareContext()
      const services = await prepare(ctx)

      await ctx.onDeactivated()

      assert.throws(() => services[0].object.renderFragment({ markdown: 'hi' }), (error) => {
        assert.equal(error.code, ERROR_CODES.SERVICE_UNAVAILABLE)
        return true
      })
    })
  })

  describe('activate() — no-op by design', () => {
    it('should_resolve_without_events_when_called_after_prepare_succeeds', async () => {
      const ctx = createPrepareContext()
      await prepare(ctx)

      await activate({})

      assert.equal(ctx.events.published.length, 0)
    })

    it('should_ignore_unexpected_service_keys_when_activate_runs', async () => {
      const ctx = createPrepareContext()
      await prepare(ctx)

      const trappedServices = new Proxy({}, {
        get(_target, prop) {
          throw new Error(`activate() must not read services.${String(prop)}`)
        },
      })

      await activate(trappedServices)

      assert.equal(ctx.events.published.length, 0)
    })
  })

  describe('manifest / code agreement', () => {
    it('should_expose_exactly_the_declared_service_name_when_prepare_succeeds', async () => {
      const ctx = createPrepareContext()
      const services = await prepare(ctx)

      assert.equal(services[0].name, 'pey.markdown.service')
    })
  })
})
