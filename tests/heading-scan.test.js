// Unit tests for lib/heading-scan.js — the low-level tag scanning helpers.
// The heading-id injector depends on these staying in lockstep with the
// sanitizer's tag parsing; the boundaries are pinned directly here so a
// rewrite of this module cannot silently drift (the round-6 comment
// regression is the proof that indirect coverage was not enough).
// (Round 9: findCloseTag and skipPastGT are gone — close detection and text
// extraction live in the single main pass now, and their contract coverage
// moved to the addHeadingIds tests.)

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { injectIdAttr, scanTagEnd } from '../lib/heading-scan.js'

const PREFIX = 'user-content-'

describe('scanTagEnd — tag-end scanning', () => {
  it('should_return_the_end_index_when_the_tag_closes_normally', () => {
    assert.deepEqual(scanTagEnd('<p class="a">x', 1), { end: 13, abortedAt: -1 })
  })

  it('should_consume_quoted_attribute_values_through_their_closing_quote', () => {
    // A '<' inside a quoted value is dead markup, not a tag start.
    assert.deepEqual(scanTagEnd('<img alt="<h2>t">', 1), { end: 17, abortedAt: -1 })
  })

  it('should_return_the_abort_position_when_a_nested_tag_opens_outside_quotes', () => {
    assert.deepEqual(scanTagEnd('<div b="c" <z>x', 1), { end: -1, abortedAt: 11 })
  })

  it('should_return_minus_ones_when_the_input_ends_inside_the_tag', () => {
    assert.deepEqual(scanTagEnd('<p class="a', 1), { end: -1, abortedAt: -1 })
  })
})

describe('injectIdAttr — id attribute rewriting', () => {
  it('should_insert_the_id_right_after_the_tag_name_when_none_exists', () => {
    assert.equal(injectIdAttr('<h2 class="x">', 'user-content-h-a', 2, []), '<h2 id="user-content-h-a" class="x">')
  })

  it('should_replace_the_first_id_and_drop_the_rest_when_several_exist', () => {
    const rawTag = '<h2 id="old" title="t" id="newer">'
    const attrs = [
      { index: 4, length: 8, value: 'old' },
      { index: 23, length: 10, value: 'newer' },
    ]
    assert.equal(injectIdAttr(rawTag, 'user-content-h-b', 2, attrs), '<h2 id="user-content-h-b" title="t" >', 'the dropped attr leaves its separating space, matching the real pass')
  })
})

