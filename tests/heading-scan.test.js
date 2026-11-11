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

describe('findCloseTag — close acceptance through the sanitizer stack model', () => {
  // The sanitizer's stack at a heading's open point is empty in these
  // inputs unless a seed says otherwise; the comment limit is derived from
  // the scanned string itself, exactly like the callers derive theirs.
  const close = (lower, level, from, seed = [], limit = lower.lastIndexOf('-->')) =>
    findCloseTag(lower, level, from, seed, limit)

  it('should_accept_a_candidate_when_a_real_gt_follows', () => {
    assert.equal(close('<h1>a</h1>b', 1, 3).index, 5)
  })

  it('should_accept_whitespace_boundaries_and_the_self_closing_slash_when_they_follow_the_name', () => {
    assert.equal(close('<h1>a</h1 >b', 1, 3).index, 5)
    assert.equal(close('<h1>a</h1/>b', 1, 3).index, 5)
  })

  it('should_reject_a_truncated_close_tag_at_the_end_of_input_when_no_gt_ever_comes', () => {
    // The sanitizer renders `</h1` at EOF as dead text INSIDE the heading:
    // the content region must stay open, so this is not a close tag.
    assert.equal(close('<h1>a</h1', 1, 3).index, -1)
  })

  it('should_reject_candidates_with_a_different_level_or_name_extension', () => {
    assert.equal(close('<h1>a</h2></h1x></h1>', 1, 3).index, 16)
  })

  it('should_skip_a_candidate_inside_a_quoted_attribute_value_when_it_is_dead_markup', () => {
    const lower = '<h1><a title="</h1>"> x</h1>'
    assert.equal(close(lower, 1, 3).index, lower.lastIndexOf('</h1>'))
  })

  it('should_skip_candidates_inside_a_closed_comment_and_resume_after_it', () => {
    const lower = '<h1>a <!-- </h1> --> b</h1>'
    assert.equal(close(lower, 1, 3).index, lower.lastIndexOf('</h1>'))
  })

  it('should_close_the_heading_after_an_unclosed_comment_when_the_sanitizer_keeps_the_rest_live', () => {
    // The sanitizer escapes only the opener and keeps the rest live: the
    // close tag after an unclosed comment is real (round-6 P1-1).
    const lower = '<h1>a<!-- x</h1>b'
    assert.equal(close(lower, 1, 3).index, lower.indexOf('</h1>'))
  })

  it('should_treat_an_unclosed_comment_as_live_markup_when_the_limit_says_no_close_exists_ahead', () => {
    // limit -1 (no '-->' anywhere): the opener is unclosed without probing,
    // and the close tag right after the opener is real.
    assert.equal(findCloseTag('<h1>a<!-- x</h1>b', 1, 3, [], -1).index, 11)
  })

  it('should_not_close_on_a_nested_same_level_heading_when_its_own_close_comes_first', () => {
    // emitTag closes the innermost open hN: the outer heading ends at the
    // SECOND close tag (round-8 P2-2, nested same-level shape).
    const lower = '<h1><h1></h1>x</h1>y'
    assert.equal(close(lower, 1, 3).index, 14)
  })

  it('should_close_the_heading_when_a_closer_of_a_seeded_tag_pops_through_it', () => {
    // emitTag pops through the matched entry: `</b>` under seed [b] closes
    // everything above b — the heading included (round-8 P2-2 shape).
    const lower = '<h1>a</b>c</h1>'
    assert.equal(close(lower, 1, 3, ['b']).index, 5)
  })

  it('should_ignore_a_closer_of_a_tag_never_opened_when_it_is_a_stray', () => {
    // Stray closers are dropped by emitTag: no seed entry, no pop-through.
    const lower = '<h1>a</i>c</h1>'
    assert.equal(close(lower, 1, 3).index, 10)
  })

  it('should_not_see_a_close_tag_inside_a_dropped_subtree_when_the_subtree_is_consumed_whole', () => {
    // The sanitizer's drop walker consumes the script subtree whole: a
    // `</h1>` inside it never closes the heading.
    const lower = '<h1>a<script></h1></script>b</h1>'
    assert.equal(close(lower, 1, 3).index, 28)
  })

  it('should_consume_an_invalid_tag_head_as_one_escaped_character_like_the_sanitizer', () => {
    // `<b'` is not a tag to the sanitizer (parseTagHead rejects the head):
    // one escaped '<' of live text, no ghost quote swallowing the real
    // close tag (round-8 P2-1).
    const lower = "<h1>a<b'c</h1>d"
    assert.equal(close(lower, 1, 3).index, 9)
  })

  it('should_return_minus_one_when_no_usable_candidate_exists', () => {
    assert.equal(close('<h1>a', 1, 3).index, -1)
  })

  it('should_return_the_stack_minus_the_popped_entries_when_the_close_pops_through', () => {
    // The caller adopts the post-close stack: seed [b, i] and `</i>` pops
    // i and the heading while b — below the match — stays open.
    const result = close('<h1>a</i>c', 1, 3, ['b', 'i'])
    assert.equal(result.index, 5)
    assert.deepEqual(result.stack, ['b'])
  })
})
