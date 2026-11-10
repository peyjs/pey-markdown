// Tests for lib/heading-ids.js — heading id injection and toc extraction.
// Strategy: pure unit tests on the pre-sanitize raw HTML string (micromark
// shapes plus hand-written raw-HTML shapes), then service-level behavior in
// render-fragment.test.js.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { addHeadingIds } from '../lib/heading-ids.js'
import { sanitizeHtml } from '../lib/sanitize.js'

const PREFIX = 'user-content-'

describe('addHeadingIds — id assignment', () => {
  it('should_assign_percent_encoded_ids_when_heading_text_is_persian', () => {
    const { html, toc } = addHeadingIds('<h1>مقدمه</h1>', PREFIX)

    assert.equal(html, '<h1 id="user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87">مقدمه</h1>')
    assert.deepEqual(toc, [{ id: 'user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87', level: 1, text: 'مقدمه' }])
  })

  it('should_keep_latin_slug_when_heading_text_is_ascii', () => {
    const { html, toc } = addHeadingIds('<h3>Settings &amp; Config</h3>', PREFIX)

    assert.equal(html, '<h3 id="user-content-h-settings-config">Settings &amp; Config</h3>')
    assert.equal(toc[0].id, 'user-content-h-settings-config')
    assert.equal(toc[0].level, 3)
  })

  it('should_scope_ids_when_clobber_prefix_carries_caller_scope', () => {
    const { html } = addHeadingIds('<h2>install</h2>', 'user-content-msg-42-')

    assert.equal(html, '<h2 id="user-content-msg-42-h-install">install</h2>')
  })

  it('should_fallback_to_h_when_heading_text_is_empty', () => {
    const { html, toc } = addHeadingIds('<h2></h2>', PREFIX)

    assert.equal(html, '<h2 id="user-content-h-h"></h2>')
    assert.deepEqual(toc, [{ id: 'user-content-h-h', level: 2, text: '' }])
  })
})

describe('addHeadingIds — slug rules', () => {
  it('should_suffix_duplicates_when_same_slug_recurs', () => {
    const { html } = addHeadingIds('<h2>install</h2><h2>install</h2>', PREFIX)

    assert.ok(html.includes('id="user-content-h-install"'))
    assert.ok(html.includes('id="user-content-h-install-1"'))
  })

  it('should_not_collide_when_literal_slug_matches_a_suffixed_one', () => {
    const { html } = addHeadingIds('<h2>install-1</h2><h2>install</h2><h2>install</h2>', PREFIX)

    assert.ok(html.includes('id="user-content-h-install-1"'))
    assert.ok(html.includes('id="user-content-h-install"'))
    assert.ok(html.includes('id="user-content-h-install-2"'))
  })

  it('should_collapse_dashes_and_drop_punctuation_when_heading_has_symbols', () => {
    const { toc } = addHeadingIds('<h1>a - b! @ c…</h1>', PREFIX)

    assert.equal(toc[0].id, 'user-content-h-a-b-c')
  })

  it('should_percent_encode_any_script_letters_when_text_is_non_ascii', () => {
    const { toc } = addHeadingIds('<h2>سلام ۲</h2>', PREFIX)

    assert.equal(toc[0].id, 'user-content-h-%D8%B3%D9%84%D8%A7%D9%85-%DB%B2')
  })

  it('should_decode_entities_when_building_text_and_slug', () => {
    const { toc } = addHeadingIds('<h2>a &amp; &#1662;</h2>', PREFIX)

    assert.equal(toc[0].text, 'a & پ')
    assert.equal(toc[0].id, 'user-content-h-a-%D9%BE')
  })

  it('should_strip_inline_markup_when_heading_contains_tags', () => {
    const { toc } = addHeadingIds('<h2>نصب در <code>app</code></h2>', PREFIX)

    assert.equal(toc[0].text, 'نصب در app')
  })
})

describe('addHeadingIds — raw HTML shapes', () => {
  it('should_preserve_other_attributes_when_injecting_id', () => {
    const { html } = addHeadingIds('<h2 class="x" data-y="1">t</h2>', PREFIX)

    assert.equal(html, '<h2 id="user-content-h-t" class="x" data-y="1">t</h2>')
  })

  it('should_replace_existing_id_when_raw_heading_carries_one', () => {
    const { html, toc } = addHeadingIds('<h2 id="evil">raw</h2>', PREFIX)

    assert.equal(html, '<h2 id="user-content-h-raw">raw</h2>')
    assert.deepEqual(toc, [{ id: 'user-content-h-raw', level: 2, text: 'raw' }])
  })

  it('should_remove_extra_id_attrs_when_raw_heading_has_duplicates', () => {
    const { html } = addHeadingIds('<h2 id="a" id="b">t</h2>', PREFIX)

    assert.equal(html.match(/id="/g).length, 1)
    assert.ok(html.includes('id="user-content-h-t"'))
  })

  it('should_handle_uppercase_tag_when_raw_heading_is_capitalized', () => {
    const { html } = addHeadingIds('<H1 CLASS="x">up</H1>', PREFIX)

    assert.equal(html, '<H1 id="user-content-h-up" CLASS="x">up</H1>')
  })

  it('should_skip_footnote_label_heading_when_id_is_reserved', () => {
    const { html, toc } = addHeadingIds('<h2 id="footnote-label" class="sr-only">Footnotes</h2>', PREFIX)

    assert.equal(html, '<h2 id="footnote-label" class="sr-only">Footnotes</h2>')
    assert.deepEqual(toc, [])
  })

  it('should_skip_headings_inside_comments_and_script_subtrees_when_content_is_dropped', () => {
    const raw = '<!-- <h1>hidden</h1> --><script><h1>dropped</h1></script><h2>live</h2>'

    const { html, toc } = addHeadingIds(raw, PREFIX)

    assert.ok(!html.includes('user-content-h-hidden'))
    assert.ok(!html.includes('user-content-h-dropped'))
    assert.ok(html.includes('id="user-content-h-live"'))
    assert.deepEqual(toc.map((entry) => entry.text), ['live'])
  })

  it('should_keep_toc_matching_sanitized_html_when_script_nests_same_name_tags', () => {
    // The sanitizer counts nested same-name opens/closes; the id injector
    // walks the exact same drop regions, so the nested heading must not
    // reach the toc either.
    const raw = '<script><script></script><h1>ghost</h1></script><h2>live</h2>'
    const { html, toc } = addHeadingIds(raw, PREFIX)
    const sanitized = sanitizeHtml(html)

    assert.ok(!html.includes('user-content-h-ghost'))
    assert.ok(!toc.some((entry) => entry.text === 'ghost'))
    // Contract invariant: every toc id also exists in the sanitized output.
    for (const entry of toc) {
      assert.ok(sanitized.includes(`id="${entry.id}"`), `toc id ${entry.id} must survive sanitization`)
    }
  })

  it('should_keep_toc_matching_sanitized_html_when_script_tag_is_self_closing', () => {
    const raw = '<script/><h1>live</h1>'
    const { html, toc } = addHeadingIds(raw, PREFIX)
    const sanitized = sanitizeHtml(html)

    assert.ok(html.includes('id="user-content-h-live"'))
    assert.deepEqual(toc.map((entry) => entry.text), ['live'])
    for (const entry of toc) {
      assert.ok(sanitized.includes(`id="${entry.id}"`))
    }
  })

  it('should_not_match_similar_names_when_tag_extends_heading_name', () => {
    const { html, toc } = addHeadingIds('<h1x>t</h1x><h7>t</h7>', PREFIX)

    assert.equal(html, '<h1x>t</h1x><h7>t</h7>')
    assert.deepEqual(toc, [])
  })

  it('should_assign_id_when_raw_heading_is_unclosed', () => {
    const { html, toc } = addHeadingIds('<p>a</p><h1>tail', PREFIX)

    assert.ok(html.includes('<h1 id="user-content-h-tail">tail'))
    assert.deepEqual(toc, [{ id: 'user-content-h-tail', level: 1, text: 'tail' }])
  })

  it('should_give_ids_to_headings_after_an_unclosed_comment_when_the_sanitizer_keeps_them', () => {
    // The sanitizer escapes an unclosed comment and keeps scanning the rest
    // as live content; the toc must match that, not skip to end of input.
    const raw = '<!--\n<h1>hello</h1>\n'
    const { html, toc } = addHeadingIds(raw, PREFIX)

    assert.ok(html.includes('id="user-content-h-hello"'), 'the heading after an unclosed comment gets an id')
    assert.deepEqual(toc.map((entry) => entry.text), ['hello'])
    const sanitized = sanitizeHtml(html)
    for (const entry of toc) {
      assert.ok(sanitized.includes(`id="${entry.id}"`), `toc id ${entry.id} must survive sanitization`)
    }
  })

  it('should_give_nested_headings_their_own_ids_when_inline_html_nests_a_heading', () => {
    const raw = '<h1>a<h2>inner</h2></h1>'
    const { html, toc } = addHeadingIds(raw, PREFIX)

    assert.ok(html.includes('<h1 id="user-content-h-a">'), 'outer heading keeps its id')
    assert.ok(html.includes('<h2 id="user-content-h-inner">'), 'the nested heading gets its own id')
    assert.deepEqual(toc.map((entry) => [entry.level, entry.text]), [[1, 'a'], [2, 'inner']], 'the outer text must not swallow the nested heading')
  })

  it('should_leave_host_tag_untouched_when_a_heading_tag_sits_inside_an_attribute_value', () => {
    // FR-13: a `<hN>` inside a quoted attribute value of a host tag is not
    // a heading — no id may be injected into the attribute and no ghost toc
    // entry may appear.
    const raw = '<img alt="<h2>t">x'
    const { html, toc } = addHeadingIds(raw, PREFIX)

    assert.equal(html, raw, 'the host tag stays byte-identical')
    assert.deepEqual(toc, [])
  })

  it('should_not_create_toc_entries_when_headings_sit_inside_attribute_values', () => {
    const { html, toc } = addHeadingIds('<a title="<h4>q">w</a><p title="<h1>fake">real</p>', PREFIX)

    assert.ok(!html.includes('id='), 'no id anywhere in the html')
    assert.deepEqual(toc, [])
  })

  it('should_use_the_rendered_text_when_a_closed_comment_carries_a_gt', () => {
    // The sanitizer removes the whole closed comment, including its `>`;
    // the toc text must not keep the `-->` tail the naive tag strip leaves.
    const { toc } = addHeadingIds('<h1>a <!-- c > b --> d</h1>', PREFIX)

    assert.deepEqual(toc.map((entry) => entry.text), ['a  d'])
  })

  it('should_keep_content_after_a_comment_holding_a_close_tag_when_heading_text_is_extracted', () => {
    // A `</h1>` inside a comment does not close the heading: the sanitizer
    // skips comments, so the content region extends to the real close tag.
    const { html, toc } = addHeadingIds('<h1>a <!-- </h1> --> b</h1>tail', PREFIX)

    assert.ok(html.includes('<h1 id="user-content-h-a-b">'))
    assert.deepEqual(toc.map((entry) => entry.text), ['a  b'])
  })

  it('should_not_create_toc_entries_when_a_heading_sits_in_an_attribute_of_a_dead_tag', () => {
    // An aborted tag head (nested '<' outside quotes) is dead markup the
    // sanitizer escapes and never re-examines: the injector must resume at
    // the abort position, not rewind into the quoted attributes.
    const { html, toc } = addHeadingIds('<div alt="<h2>t" <z>x\n\n<h1>real</h1>', PREFIX)

    assert.ok(html.includes('<h1 id="user-content-h-real">'), 'the live heading gets its id')
    assert.deepEqual(toc.map((entry) => [entry.level, entry.text]), [[1, 'real']], 'no ghost entry for the dead tag')
  })

  it('should_not_start_a_document_wide_drop_when_a_dropped_tag_sits_in_an_attribute_of_a_dead_tag', () => {
    // A `<style>` inside a quoted attribute of a dead tag is dead text, not
    // a drop start: headings after it stay live and get their ids.
    const { html, toc } = addHeadingIds('<div style="<style>" <z>\n<h1>after</h1>\n', PREFIX)

    assert.ok(html.includes('<h1 id="user-content-h-after">'))
    assert.deepEqual(toc.map((entry) => entry.text), ['after'])
  })

  it('should_keep_heading_text_matching_the_render_when_the_close_tag_sits_in_an_attribute', () => {
    // A `</h1>` inside a quoted attribute value does not close the heading.
    const { html, toc } = addHeadingIds('<h1><a title="</h1>"> x</h1>tail', PREFIX)

    assert.ok(html.includes('<h1 id="user-content-h-x">'))
    assert.deepEqual(toc.map((entry) => entry.text), [' x'])
  })

  it('should_close_the_heading_after_an_unclosed_comment_when_the_rest_still_renders_live', () => {
    // Round-6 regression: the sanitizer escapes only the opener of an
    // unclosed comment and keeps the rest live — the close tag after it is
    // real, and the text after it must not leak into the toc text.
    const { html, toc } = addHeadingIds('<h1>a<!-- x</h1>b', PREFIX)

    assert.ok(html.includes('<h1 id="user-content-h-a-x">'), 'the id comes from the rendered heading text only')
    assert.deepEqual(toc.map((entry) => entry.text), ['a<!-- x'], 'text after the real close stays out of the toc')
  })

  it('should_not_leak_content_after_the_real_close_when_a_nested_heading_follows_an_unclosed_comment', () => {
    const { toc } = addHeadingIds('<h1>a<!-- x</h1>b<h2>c</h2>d', PREFIX)

    assert.deepEqual(toc.map((entry) => [entry.level, entry.text]), [[1, 'a<!-- x'], [2, 'c']])
  })

  it('should_treat_a_self_closing_close_tag_as_the_real_close_when_extracting_toc_text', () => {
    // `</h1/>` closes the heading in the sanitizer: content after it renders
    // outside the heading and must stay out of the toc text.
    const { toc } = addHeadingIds('<h1>a</h1/>b', PREFIX)

    assert.deepEqual(toc.map((entry) => entry.text), ['a'])
  })

  it('should_keep_a_truncated_close_tag_as_dead_text_when_the_input_ends_inside_it', () => {
    // `</h1` at EOF renders as dead text INSIDE the heading (the sanitizer
    // auto-closes it): the toc text must carry it, not drop it.
    const { toc } = addHeadingIds('<h1>a</h1', PREFIX)

    assert.deepEqual(toc.map((entry) => entry.text), ['a</h1'])
  })

  it('should_keep_dead_tag_segments_as_text_when_the_nested_heading_head_aborts', () => {
    // The sanitizer renders an aborted tag head as escaped dead text and
    // keeps the rest live; the toc text must match that, not drop the tail.
    const { toc } = addHeadingIds('<h1>a<h2 b="c" <z>inner</h2></h1>', PREFIX)

    assert.deepEqual(toc.map((entry) => entry.text), ['a<h2 b="c" inner'])
  })

  it('should_exclude_dropped_script_content_when_heading_text_is_extracted', () => {
    // The sanitizer drops the whole script subtree; the toc text must not
    // keep the script body the naive tag strip leaves behind.
    const { html, toc } = addHeadingIds('<h1>a<script>var x = 1;</script>b</h1>', PREFIX)
    const sanitized = sanitizeHtml(html)

    assert.ok(!sanitized.includes('var x'), 'the sanitizer drops the script subtree')
    assert.deepEqual(toc.map((entry) => entry.text), ['ab'])
  })
})

describe('addHeadingIds — determinism and emptiness', () => {
  it('should_return_empty_result_when_html_is_empty', () => {
    assert.deepEqual(addHeadingIds('', PREFIX), { html: '', toc: [] })
    assert.deepEqual(addHeadingIds(undefined, PREFIX), { html: '', toc: [] })
  })

  it('should_stay_linear_when_a_document_has_thousands_of_headings_and_dead_candidates', () => {
    // Complexity gate: the id injection is advertised as single-pass linear.
    // Thousands of same-text headings used to trip a quadratic suffix probe
    // and a backward comment scan, and thousands of quoted `</h1>` candidates
    // a quadratic coverage walk — a generous wall (milliseconds, not seconds)
    // keeps any of them from regressing past this gate.
    const html = '<h1>x</h1>' + '<h2>a</h2>'.repeat(10000) + '<h1>' + '<a b="</h1>">'.repeat(5000) + 'y</h1>';
    const started = performance.now();
    const { toc } = addHeadingIds(html, PREFIX);
    const elapsed = performance.now() - started;

    assert.equal(toc.length, 10002, 'every real heading gets an entry, none of the quoted candidates');
    assert.ok(elapsed < 2000, `the linear pass must not degrade (took ${elapsed.toFixed(0)}ms)`);
  })

  it('should_produce_identical_output_when_same_html_is_processed_twice', () => {
    const raw = '<h2>install</h2><h2>install</h2><h1>مقدمه</h1>'

    const first = addHeadingIds(raw, PREFIX)
    const second = addHeadingIds(raw, PREFIX)

    assert.deepEqual(second, first)
  })

  it('should_toc_ids_match_html_when_mixed_document_is_processed', () => {
    const { html, toc } = addHeadingIds('<h1>a</h1><p>x</p><h3>مقدمه</h3>', PREFIX)

    for (const entry of toc) {
      assert.ok(html.includes(`id="${entry.id}"`), `toc id must appear in html: ${entry.id}`)
    }
    assert.equal(toc.length, 2)
  })
})
