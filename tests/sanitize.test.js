// Tests for lib/sanitize.js — allowlist HTML sanitizer.
// Strategy: pure function, no fakes needed. Each test passes a renderer-style
// HTML fragment and asserts on the sanitized output only (manifest-visible
// behavior), never on private helpers.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeHtml } from '../lib/sanitize.js'

describe('sanitizeHtml — safe content preserved', () => {
  it('should_keep_basic_formatting_when_fragment_has_allowed_tags', () => {
    const out = sanitizeHtml('<p>Hello <strong>bold</strong> and <em>italic</em></p>')

    assert.equal(out, '<p>Hello <strong>bold</strong> and <em>italic</em></p>')
  })

  it('should_keep_gfm_table_when_fragment_has_table_markup', () => {
    const html = '<table><thead><tr><th align="center">h</th></tr></thead>'
      + '<tbody><tr><td>c</td></tr></tbody></table>'

    assert.equal(sanitizeHtml(html), html)
  })

  it('should_keep_task_checkbox_when_fragment_has_task_list_item', () => {
    const html = '<ul><li><input type="checkbox" disabled=""> done</li></ul>'

    assert.equal(sanitizeHtml(html), '<ul><li><input type="checkbox" disabled> done</li></ul>')
  })

  it('should_keep_language_class_when_code_block_has_language', () => {
    const html = '<pre><code class="language-js">const a = 1</code></pre>'

    assert.equal(sanitizeHtml(html), html)
  })

  it('should_keep_parsneshan_class_when_div_uses_parsneshan_prefix', () => {
    const html = '<div class="parsneshan-warning"><p>note</p></div>'

    assert.equal(sanitizeHtml(html), html)
  })

  it('should_keep_safe_links_when_href_uses_http_or_relative_uri', () => {
    assert.equal(
      sanitizeHtml('<p><a href="https://example.com">a</a> <a href="/docs">b</a></p>'),
      '<p><a href="https://example.com">a</a> <a href="/docs">b</a></p>',
    )
  })

  it('should_keep_disclosure_and_kbd_when_fragment_has_details_markup', () => {
    const html = '<details><summary>more</summary><p>text</p></details><p><kbd>Ctrl</kbd></p>'

    assert.equal(sanitizeHtml(html), html)
  })
})

describe('sanitizeHtml — dangerous content removed', () => {
  it('should_remove_script_with_content_when_fragment_has_script_element', () => {
    assert.equal(sanitizeHtml('<script>alert(1)</script><p>ok</p>'), '<p>ok</p>')
  })

  it('should_remove_nested_script_content_when_script_contains_tags', () => {
    assert.equal(
      sanitizeHtml('<script><p>evil</p></script><p>ok</p>'),
      '<p>ok</p>',
    )
  })

  it('should_remove_event_handler_when_tag_has_on_attribute', () => {
    assert.equal(sanitizeHtml('<img src="x.png" onerror="alert(1)">'), '<img src="x.png">')
  })

  it('should_neutralize_href_when_link_uses_javascript_uri', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')

    assert.ok(!out.includes('javascript:'), 'javascript: URI must not survive')
    assert.ok(out.includes('>x</a>'), 'link text must be preserved')
  })

  it('should_remove_iframe_when_fragment_has_embedded_frame', () => {
    assert.equal(sanitizeHtml('<iframe src="https://evil.test"></iframe><p>t</p>'), '<p>t</p>')
  })

  it('should_unwrap_content_when_tag_is_not_allowlisted', () => {
    assert.equal(sanitizeHtml('<div class="evil"><p>t</p></div>'), '<div><p>t</p></div>')
    assert.equal(sanitizeHtml('<form><p>t</p></form>'), '<p>t</p>')
  })

  it('should_remove_comments_when_fragment_has_html_comments', () => {
    assert.equal(sanitizeHtml('<!-- secret --><p>t</p>'), '<p>t</p>')
  })

  it('should_remove_style_attribute_when_tag_has_inline_style', () => {
    assert.equal(sanitizeHtml('<p style="color:red">t</p>'), '<p>t</p>')
  })

  it('should_drop_image_when_src_uses_data_text_html', () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">')

    assert.ok(!out.includes('data:text/html'), 'data:text/html must not survive')
  })

  it('should_escape_entity_when_href_uses_entity_obfuscation', () => {
    const out = sanitizeHtml('<p><a href="&#106;avascript:alert(1)">x</a></p>')

    assert.ok(!out.includes('&#106;'), 'entity must be escaped so it cannot resolve in the browser')
    assert.ok(out.includes('>x</a>'), 'link text must be preserved')
  })

  it('should_drop_case_variant_tags_when_script_uses_mixed_case', () => {
    assert.equal(sanitizeHtml('<ScRiPt>alert(1)</ScRiPt><p>t</p>'), '<p>t</p>')
  })

  it('should_keep_entity_when_href_has_escaped_ampersand', () => {
    assert.equal(
      sanitizeHtml('<p><a href="https://x.test/?a=1&amp;b=2">a</a></p>'),
      '<p><a href="https://x.test/?a=1&amp;b=2">a</a></p>',
    )
  })

  it('should_unwrap_prototype_names_when_tags_use_them', () => {
    assert.equal(sanitizeHtml('<p><constructor>hi</p>'), '<p>hi</p>')
    assert.equal(sanitizeHtml('<p><toString>hi</p>'), '<p>hi</p>')
  })

  it('should_balance_open_tags_when_fragment_is_unclosed', () => {
    assert.equal(sanitizeHtml('<div><p>hi'), '<div><p>hi</p></div>')
  })

  it('should_drop_stray_closer_when_no_opener_exists', () => {
    assert.equal(sanitizeHtml('<p>t</p></div>'), '<p>t</p>')
  })

  it('should_escape_stray_bracket_when_text_has_bare_less_than', () => {
    assert.equal(sanitizeHtml('a < b'), 'a &lt; b')
  })

  it('should_disable_checkbox_when_raw_input_lacks_disabled', () => {
    assert.equal(sanitizeHtml('<input type="checkbox">'), '<input type="checkbox" disabled>')
  })

  it('should_keep_footnote_markup_when_fragment_has_footnotes', () => {
    const html = '<p>a<sup><a href="#fn-1" id="fr-1" data-footnote-ref="" aria-describedby="fl">1</a></sup></p>'
      + '<section data-footnotes="" class="footnotes">'
      + '<h2 id="fl" class="sr-only">F</h2>'
      + '<ol><li id="fn-1"><p>t <a href="#fr-1" data-footnote-backref="" aria-label="Back">x</a></p></li></ol>'
      + '</section>'

    assert.equal(sanitizeHtml(html), html)
  })

  it('should_unwrap_dashed_tags_when_names_have_suffixes', () => {
    assert.equal(sanitizeHtml('<script-x>hello'), 'hello')
    assert.equal(sanitizeHtml('<a-b>hi</a-b>'), 'hi')
    assert.equal(sanitizeHtml('<pre-x>hi</pre-x>'), 'hi')
  })

  it('should_drop_input_when_type_is_not_checkbox', () => {
    assert.equal(sanitizeHtml('<p><input></p>'), '<p></p>')
    assert.equal(sanitizeHtml('<p><input type="text"></p>'), '<p></p>')
  })

  it('should_normalize_checkbox_when_type_uses_uppercase', () => {
    assert.equal(sanitizeHtml('<input type="CHECKBOX">'), '<input type="checkbox" disabled>')
  })

  it('should_finish_quickly_when_input_is_adversarial', () => {
    const start = Date.now()
    sanitizeHtml('<!--'.repeat(66666))
    sanitizeHtml('<a '.repeat(50000))
    sanitizeHtml(`<div>${'x'.repeat(150000)}`)
    sanitizeHtml(`${'<a '.repeat(40000)}">`)
    sanitizeHtml('<a title="x> <b>'.repeat(20000))

    assert.ok(Date.now() - start < 5000, 'adversarial input must not stall')
  })
})

describe('sanitizeHtml — edge cases', () => {
  it('should_return_empty_string_when_input_is_empty', () => {
    assert.equal(sanitizeHtml(''), '')
  })

  it('should_return_empty_string_when_input_is_not_a_string', () => {
    assert.equal(sanitizeHtml(null), '')
    assert.equal(sanitizeHtml(undefined), '')
    assert.equal(sanitizeHtml(42), '')
  })
})
