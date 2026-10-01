// Tests for parsneshan (Persian) extension injection through renderFragment.
// Strategy: the plugin never imports parsneshan itself — the caller passes
// syntax/html extensions per call and the service only composes them. These
// tests assert that contract: Persian behavior appears only when injected,
// standard behavior is untouched without it, and output stays sanitized.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  warning,
  warningHtml,
  caution,
  cautionHtml,
  important,
  importantHtml,
  tip,
  tipHtml,
  note,
  noteHtml,
  persianListExtension,
  persianListHtml,
  persianPoem,
  persianPoemHtml,
} from 'parsneshan'

import MarkdownService from '../lib/markdown-service.js'

describe('parsneshan injection — admonition blocks', () => {
  it('should_render_warning_div_when_warning_extension_is_passed', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '... هشدار\nمتن **مهم**\n...\n',
      syntaxExtensions: [warning()],
      htmlExtensions: [warningHtml()],
    })

    assert.ok(html.includes('<div class="parsneshan-warning">'), 'warning div must render')
    assert.ok(html.includes('<strong>مهم</strong>'), 'inner Markdown must render')
  })

  it('should_render_note_div_when_note_extension_is_passed', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '... نکته\nیادداشت ساده\n...\n',
      syntaxExtensions: [note()],
      htmlExtensions: [noteHtml()],
    })

    assert.ok(html.includes('<div class="parsneshan-note">'), 'note div must render')
  })

  it('should_render_plain_paragraph_when_no_extension_is_passed', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({ markdown: '... هشدار\nplain\n...\n' })

    assert.ok(!html.includes('parsneshan-'), 'no Persian markup without injection')
    assert.ok(html.includes('هشدار'), 'source text must stay visible')
  })
})

describe('parsneshan injection — list and poem', () => {
  it('should_render_ordered_list_when_persian_list_extension_is_passed', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '۲. الف\n۳. ب\n',
      syntaxExtensions: [persianListExtension()],
      htmlExtensions: [persianListHtml()],
    })

    assert.ok(html.includes('<ol start="2">'), 'start must come from Persian digits')
    assert.ok(html.includes('<li>الف</li>'), 'items must render')
  })

  it('should_render_verses_when_poem_extension_is_passed', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '...شعر\nمصرع اول     مصرع دوم\n...\n',
      syntaxExtensions: [persianPoem()],
      htmlExtensions: [persianPoemHtml()],
    })

    assert.ok(html.includes('parsneshan-poem'), 'poem container must render')
    assert.ok(html.includes('parsneshan-hemistich'), 'hemistiches must render')
  })
})

describe('parsneshan injection — composition and safety', () => {
  it('should_render_all_admonitions_when_each_extension_is_passed', () => {
    const service = new MarkdownService()
    const cases = [
      ['... احتیاط\nx\n...\n', [caution()], [cautionHtml()], 'parsneshan-caution'],
      ['... مهم\nx\n...\n', [important()], [importantHtml()], 'parsneshan-important'],
      ['... راهنما\nx\n...\n', [tip()], [tipHtml()], 'parsneshan-tip'],
    ]
    for (const [markdown, syntaxExtensions, htmlExtensions, marker] of cases) {
      const { html } = service.renderFragment({ markdown, syntaxExtensions, htmlExtensions })
      assert.ok(html.includes(marker), `${marker} must render`)
    }
  })

  it('should_combine_extensions_when_warning_and_list_are_passed_together', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '... هشدار\nتوجه\n...\n\n۱. الف\n۲. ب\n',
      syntaxExtensions: [warning(), persianListExtension()],
      htmlExtensions: [warningHtml(), persianListHtml()],
    })

    assert.ok(html.includes('<div class="parsneshan-warning">'), 'warning must render')
    assert.ok(html.includes('<ol'), 'list must render alongside')
  })

  it('should_combine_extensions_when_order_is_reversed', () => {
    const service = new MarkdownService()
    const markdown = '... هشدار\nتوجه\n...\n\n۱. الف\n۲. ب\n'
    const first = service.renderFragment({
      markdown,
      syntaxExtensions: [warning(), persianListExtension()],
      htmlExtensions: [warningHtml(), persianListHtml()],
    }).html
    const second = service.renderFragment({
      markdown,
      syntaxExtensions: [persianListExtension(), warning()],
      htmlExtensions: [persianListHtml(), warningHtml()],
    }).html

    assert.equal(second, first, 'disjoint extensions must render identically in any order')
  })

  it('should_sanitize_output_when_injected_content_has_script', () => {
    const service = new MarkdownService()

    const { html } = service.renderFragment({
      markdown: '... هشدار\n<script>alert(1)</script>\n...\n',
      syntaxExtensions: [warning()],
      htmlExtensions: [warningHtml()],
    })

    assert.ok(!html.includes('<script>'), 'no live script even inside injected blocks')
    assert.ok(html.includes('<div class="parsneshan-warning">'), 'block itself must survive')
  })
})
