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

  it('should_render_language_class_when_fence_uses_plus_or_hash', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '```c++\nint x;\n```' })

    assert.ok(html.includes('class="language-c++"'), 'c++ language class must survive')
  })

  it('should_keep_query_string_when_link_has_ampersand', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '[a](https://x.test/?a=1&b=2)' })

    assert.ok(html.includes('?a=1&amp;b=2'), 'entity must stay single-escaped')
    assert.ok(!html.includes('&amp;amp;'), 'no double escaping')
  })

  it('should_render_text_without_crash_when_source_has_prototype_names', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '<constructor> and <toString> here' })

    assert.ok(!html.includes('<constructor>'), 'no live unknown tag must survive')
    assert.ok(!html.includes('<toString>'), 'no live unknown tag must survive')
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
  it('should_remove_raw_html_when_source_contains_script_tag', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '<script>alert(1)</script>' })

    assert.ok(!html.includes('<script>'), 'no live script tag must survive')
  })

  it('should_neutralize_dangerous_uri_when_link_uses_javascript_scheme', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '[x](javascript:alert(1))' })

    assert.ok(!html.includes('javascript:'), 'javascript: URI must not survive')
  })

  it('should_neutralize_raw_link_when_href_uses_entity_obfuscation', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '<a href="&#106;avascript:alert(1)">x</a>' })

    assert.ok(!html.includes('&#106;'), 'entity must be escaped so it cannot resolve in the browser')
  })
})

describe('renderFragment — raw HTML passthrough', () => {
  it('should_keep_allowed_raw_tags_when_source_has_details_and_kbd', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '<details><summary>more</summary><p>text</p></details>\n\n<kbd>Ctrl</kbd>',
    })

    assert.ok(html.includes('<details><summary>more</summary>'), 'details must pass through')
    assert.ok(html.includes('<kbd>Ctrl</kbd>'), 'kbd must pass through')
  })

  it('should_keep_raw_div_when_source_has_div_with_safe_class', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '<div class="parsneshan-note">hi</div>',
    })

    assert.ok(html.includes('<div class="parsneshan-note">'), 'safe raw div must pass through')
  })
})

describe('renderFragment — error path', () => {
  it('should_throw_render_failed_when_input_is_null', () => {
    const service = new MarkdownService()

    assert.throws(() => service.renderFragment(null), (error) => {
      assert.equal(error.code, ERROR_CODES.MARKDOWN_RENDER_FAILED)
      assert.equal(error.type, 'operational')
      return true
    })
  })

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

  it('should_throw_render_failed_when_extension_throws_during_render', () => {
    const service = new MarkdownService()
    const throwing = {
      text: { 104: { tokenize() { throw new Error('boom') } } },
    }

    assert.throws(() => service.renderFragment({ markdown: 'hi', syntaxExtensions: [throwing] }), (error) => {
      assert.equal(error.code, ERROR_CODES.MARKDOWN_RENDER_FAILED)
      return true
    })
  })

  it('should_enforce_limit_when_config_uses_numeric_string', () => {
    const service = new MarkdownService({ maxInputChars: '10' })

    assert.throws(() => service.renderFragment({ markdown: '0123456789!' }), (error) => {
      assert.equal(error.code, ERROR_CODES.MARKDOWN_RENDER_FAILED)
      return true
    })
    assert.ok(service.renderFragment({ markdown: '0123456789' }).html.length > 0)
  })

  it('should_render_large_input_when_within_configured_limit', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: `${'lorem ipsum dolor sit amet. '.repeat(5000)}\n` })

    assert.ok(html.includes('<p>'), 'large input must render')
  })

  it('should_balance_tags_when_source_has_unclosed_div', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '<div><p>hi' })

    assert.ok(html.endsWith('</p></div>'), 'fragment must be balanced')
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

describe('renderFragment — footnotes, schemes and images', () => {
  it('should_render_footnotes_when_markdown_has_footnote_syntax', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: 'متن[^1]\n\n[^1]: توضیح' })

    assert.ok(html.includes('data-footnotes'), 'footnote section must survive')
    assert.ok(html.includes('data-footnote-backref'), 'backref must survive')
    assert.ok(!html.includes('href=""'), 'footnote links must stay live')
  })

  it('should_keep_tel_link_when_markdown_has_tel_scheme', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '[call](tel:+123)' })

    assert.ok(html.includes('href="tel:+123"'), 'tel: link must work')
  })

  it('should_neutralize_dangerous_schemes_when_protocol_is_risky', () => {
    const service = new MarkdownService()

    for (const scheme of ['javascript', 'vbscript', 'file']) {
      const { html } = service.renderFragment({ markdown: `[x](${scheme}:alert(1))` })

      assert.ok(!html.includes(`${scheme}:`), `${scheme}: must not survive`)
    }
  })

  it('should_neutralize_control_entity_when_href_hides_scheme_behind_it', () => {
    const service = new MarkdownService()

    for (const href of ['&#1;javascript:alert(1)', '&#x1;javascript:alert(1)', 'javascript&#58alert(1)']) {
      const { html } = service.renderFragment({ markdown: `<a href="${href}">x</a>` })

      assert.ok(!html.includes('javascript'), `control/entity smuggling must not survive: ${href}`)
    }
  })

  it('should_keep_footnote_intact_when_using_real_renderer_output', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: 'متن[^1]\n\n[^1]: توضیح' })

    assert.ok(html.includes('<h2 id="footnote-label" class="sr-only">پاورقی</h2>'), 'Persian heading must survive')
    assert.ok(html.includes('id="user-content-fn-1"'), 'definition id must survive')
    assert.ok(html.includes('id="user-content-fnref-1"'), 'reference id must survive')
    assert.ok(html.includes('class="data-footnote-backref"'), 'backref class must survive')
    assert.ok(html.includes('aria-label="بازگشت به ارجاع 1"'), 'Persian back label must survive')
    assert.ok(!html.includes('href=""'), 'footnote links must stay live')
  })

  it('should_block_protocol_relative_when_images_are_restricted', () => {
    const service = new MarkdownService({ allowExternalImages: false })

    const { html } = service.renderFragment({ markdown: '![a](//site.com/x.png)' })

    assert.ok(!html.includes('//site.com'), 'protocol-relative src must go')
    assert.ok(html.includes('alt="a"'), 'alt text must stay')
  })

  it('should_block_entity_http_when_images_are_restricted', () => {
    const service = new MarkdownService({ allowExternalImages: false })

    const { html } = service.renderFragment({ markdown: '![a](&#104;ttps://site.com/x.png)' })

    assert.ok(!html.includes('site.com'), 'obfuscated external src must go')
  })

  it('should_prefer_later_extension_when_html_handlers_overlap', () => {
    const service = new MarkdownService()
    const first = { enter: { strong() { this.tag('<del>') } }, exit: { strong() { this.tag('</del>') } } }
    const second = { enter: { strong() { this.tag('<s>') } }, exit: { strong() { this.tag('</s>') } } }

    const { html } = service.renderFragment({ markdown: '**x**', htmlExtensions: [first, second] })

    assert.ok(html.includes('<s>x</s>'), 'later html handler must win')
  })

  it('should_strip_external_src_when_images_are_restricted', () => {
    const service = new MarkdownService({ allowExternalImages: false })

    const blocked = service.renderFragment({ markdown: '![a](https://e.test/x.png)' }).html
    const local = service.renderFragment({ markdown: '![a](/local/x.png)' }).html

    assert.ok(!blocked.includes('https://e.test'), 'external src must go')
    assert.ok(blocked.includes('alt="a"'), 'alt text must stay')
    assert.ok(local.includes('src="/local/x.png"'), 'relative src must stay')
  })

  it('should_unwrap_dashed_tags_when_source_has_suffix_names', () => {
    const service = new MarkdownService()

    assert.equal(service.renderFragment({ markdown: '<script-x>hello' }).html, '<p>hello</p>')
  })

  it('should_render_hostile_mix_when_input_is_near_limit', () => {
    const service = new MarkdownService()
    const hostile = `<!--${'x'.repeat(10000)}\n<a \n<div><p>unclosed\n<a href="&#106;avascript:alert(1)">x</a>\n`

    const { html } = service.renderFragment({ markdown: hostile })

    assert.ok(!html.includes('<script'), 'no live dangerous tag')
    assert.ok(!html.includes('javascript:'), 'no dangerous scheme')
  })
})
