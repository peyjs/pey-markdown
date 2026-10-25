// Tests for lib/heading-ids.js — heading id injection and toc extraction.
// Strategy: pure unit tests on the pre-sanitize raw HTML string (micromark
// shapes plus hand-written raw-HTML shapes), then service-level behavior in
// render-fragment.test.js.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { addHeadingIds } from '../lib/heading-ids.js'

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

  it('should_skip_headings_inside_comments_and_script_subtrees', () => {
    const raw = '<!-- <h1>hidden</h1> --><script><h1>dropped</h1></script><h2>live</h2>'

    const { html, toc } = addHeadingIds(raw, PREFIX)

    assert.ok(!html.includes('user-content-h-hidden'))
    assert.ok(!html.includes('user-content-h-dropped'))
    assert.ok(html.includes('id="user-content-h-live"'))
    assert.deepEqual(toc.map((entry) => entry.text), ['live'])
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
})

describe('addHeadingIds — determinism and emptiness', () => {
  it('should_return_empty_result_when_html_is_empty', () => {
    assert.deepEqual(addHeadingIds('', PREFIX), { html: '', toc: [] })
    assert.deepEqual(addHeadingIds(undefined, PREFIX), { html: '', toc: [] })
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
