// Tests for lib/markdown-service.js — renderFragment success and error paths.
// Strategy: construct MarkdownService directly (no Core). Persian-extension
// injection is covered separately in parsneshan-injection.test.js.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import MarkdownService from '../lib/markdown-service.js'
import { ERROR_CODES } from '../lib/constants.js'

describe('renderFragment — CommonMark success path', () => {
  it('should_render_heading_and_emphasis_when_markdown_has_basic_blocks', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '# سلام\n\nمتن **مهم** و *کج*' })

    assert.ok(html.includes('<h1>سلام</h1>'), 'heading must render')
    assert.ok(html.includes('<strong>مهم</strong>'), 'strong must render')
    assert.ok(html.includes('<em>کج</em>'), 'emphasis must render')
  })

  it('should_render_plain_code_block_when_fence_has_language', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '```js\nconst a = 1\n```' })

    assert.ok(html.includes('<pre><code class="language-js">'), 'language class must render')
    assert.ok(!html.includes('<span'), 'no highlighting markup must be added')
  })

  it('should_return_empty_fragment_when_markdown_is_empty', () => {
    const service = new MarkdownService()

    assert.deepEqual(service.renderFragment({ markdown: '' }), { html: '' })
  })
})

describe('renderFragment — GFM success path', () => {
  it('should_render_table_when_markdown_has_gfm_table', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '| a | b |\n| - | - |\n| 1 | 2 |' })

    assert.ok(html.includes('<table>'), 'table must render')
    assert.ok(html.includes('<th>a</th>'), 'header cell must render')
    assert.ok(html.includes('<td>1</td>'), 'body cell must render')
  })

  it('should_render_checkbox_when_markdown_has_task_list', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '- [x] done\n- [ ] todo' })

    assert.ok(html.includes('type="checkbox"'), 'checkbox must render')
  })

  it('should_render_del_when_markdown_has_strikethrough', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '~~gone~~' })

    assert.ok(html.includes('<del>gone</del>'), 'strikethrough must render as del')
  })

  it('should_render_link_when_markdown_has_bare_url', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: 'see https://example.com now' })

    assert.ok(html.includes('<a href="https://example.com">'), 'literal autolink must render')
  })
})

describe('renderFragment — output is always sanitized', () => {
  it('should_escape_raw_html_when_source_contains_script_tag', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '<script>alert(1)</script>' })

    assert.ok(!html.includes('<script>'), 'no live script tag must survive')
  })

  it('should_neutralize_dangerous_uri_when_link_uses_javascript_scheme', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '[x](javascript:alert(1))' })

    assert.ok(!html.includes('javascript:'), 'javascript: URI must not survive')
  })
})

describe('renderFragment — error path', () => {
  it('should_throw_render_failed_when_markdown_is_not_a_string', () => {
    const service = new MarkdownService()

    assert.throws(() => service.renderFragment({ markdown: 42 }), (error) => {
      assert.equal(error.code, ERROR_CODES.MARKDOWN_RENDER_FAILED)
      assert.equal(error.source, 'pey.markdown')
      assert.equal(error.type, 'operational')
      return true
    })
  })

  it('should_throw_render_failed_when_markdown_exceeds_configured_limit', () => {
    const service = new MarkdownService({ maxInputChars: 10 })

    assert.throws(() => service.renderFragment({ markdown: '0123456789!' }), (error) => {
      assert.equal(error.code, ERROR_CODES.MARKDOWN_RENDER_FAILED)
      return true
    })
  })

  it('should_throw_render_failed_when_extensions_param_is_not_an_array', () => {
    const service = new MarkdownService()

    assert.throws(() => service.renderFragment({ markdown: 'hi', syntaxExtensions: {} }), (error) => {
      assert.equal(error.code, ERROR_CODES.MARKDOWN_RENDER_FAILED)
      return true
    })
  })

  it('should_throw_service_unavailable_when_called_after_deactivation', () => {
    const service = new MarkdownService()
    service._setDeactivated()

    assert.throws(() => service.renderFragment({ markdown: 'hi' }), (error) => {
      assert.equal(error.code, ERROR_CODES.SERVICE_UNAVAILABLE)
      return true
    })
  })
})
