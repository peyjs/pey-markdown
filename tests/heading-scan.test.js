// Unit tests for lib/heading-scan.js — the low-level tag scanning helpers.
// The heading-id injector depends on these staying in lockstep with the
// sanitizer's tag parsing; the boundaries are pinned directly here so a
// rewrite of this module cannot silently drift (the round-6 comment
// regression is the proof that indirect coverage was not enough).

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findCloseTag, injectIdAttr, scanTagEnd, skipPastGT } from '../lib/heading-scan.js'

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

describe('skipPastGT — plain greater-than skip', () => {
  it('should_return_just_past_the_first_gt_when_one_exists', () => {
    assert.equal(skipPastGT('<p>a</p>', 5), 8)
  })

  it('should_return_null_when_no_gt_remains', () => {
    assert.equal(skipPastGT('<p>a', 5), null)
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

describe('findCloseTag — close-tag acceptance boundaries', () => {
  it('should_accept_a_candidate_when_a_real_gt_follows', () => {
    assert.equal(findCloseTag('<h1>a</h1>b', 1, 3), 5)
  })

  it('should_accept_whitespace_boundaries_and_the_self_closing_slash_when_they_follow_the_name', () => {
    assert.equal(findCloseTag('<h1>a</h1 >b', 1, 3), 5)
    assert.equal(findCloseTag('<h1>a</h1/>b', 1, 3), 5)
  })

  it('should_reject_a_truncated_close_tag_at_the_end_of_input_when_no_gt_ever_comes', () => {
    // The sanitizer renders `</h1` at EOF as dead text INSIDE the heading:
    // the content region must stay open, so this is not a close tag.
    assert.equal(findCloseTag('<h1>a</h1', 1, 3), -1)
  })

  it('should_reject_candidates_with_a_different_level_or_name_extension', () => {
    assert.equal(findCloseTag('<h1>a</h2></h1x></h1>', 1, 3), 16)
  })

  it('should_skip_a_candidate_inside_a_quoted_attribute_value_when_it_is_dead_markup', () => {
        const lower = '<h1><a title="</h1>"> x</h1>'
    assert.equal(findCloseTag(lower, 1, 3), lower.lastIndexOf('</h1>'))
  })

  it('should_skip_candidates_inside_a_closed_comment_and_resume_after_it', () => {
        const lower = '<h1>a <!-- </h1> --> b</h1>'
    assert.equal(findCloseTag(lower, 1, 3), lower.lastIndexOf('</h1>'))
  })

  it('should_close_the_heading_after_an_unclosed_comment_when_the_sanitizer_keeps_the_rest_live', () => {
    // The sanitizer escapes only the opener and keeps the rest live: the
    // close tag after an unclosed comment is real (round-6 P1-1).
    const lower = '<h1>a<!-- x</h1>b'
    assert.equal(findCloseTag(lower, 1, 3), lower.indexOf('</h1>'))
  })

  it('should_return_minus_one_when_no_usable_candidate_exists', () => {
    assert.equal(findCloseTag('<h1>a', 1, 3), -1)
  })
})
