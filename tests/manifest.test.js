// Manifest/code agreement tests for pey.markdown.
// Strategy: read the authoritative manifest.json (static JSON import —
// deterministic, no network) and assert the code honors the same contract:
// identity constants, service name, method errors, and default config.
//
// CONSCIOUS DEVIATION from the Bonyan testing standard's "no real
// filesystem" rule (round 8): the version-lock test below reads README.md
// and docs/requirements.md with readFile at runtime. The subject under test
// IS the byte content of those markdown files — a JSON import cannot carry
// prose, and this repo has no build step that could snapshot them into a
// fixture. The reads are of the repo's own committed files, so the test
// stays deterministic, offline and hermetic in every other respect; this
// comment records the trade-off as a decision, not an oversight.

import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import manifest from '../manifest.json' with { type: 'json' }
import packageJson from '../package.json' with { type: 'json' }
import {
  PLUGIN_NAME,
  PLUGIN_VERSION,
  SERVICE_NAME,
  DEFAULT_ALLOW_EXTERNAL_IMAGES,
  DEFAULT_MAX_INPUT_CHARS,
  ERROR_CODES,
} from '../lib/constants.js'

describe('manifest / code agreement', () => {
  it('should_match_identity_when_constants_are_compared_to_manifest', () => {
    assert.equal(PLUGIN_NAME, manifest.name)
    assert.equal(PLUGIN_VERSION, manifest.version)
    assert.equal(packageJson.version, manifest.version)
    assert.equal(manifest.architecture, '0.11')
    assert.equal(manifest.type, 'feature')
  })

  it('should_match_the_readme_badge_and_doc_headers_when_the_manifest_declares_the_version', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
    const requirements = await readFile(new URL('../docs/requirements.md', import.meta.url), 'utf8')

    const badge = readme.match(/version-([\d.]+)-blue/)
    assert.notEqual(badge, null, 'the README carries a version badge')
    assert.equal(badge[1], manifest.version, 'the badge never drifts from the manifest')
    assert.ok(readme.includes(`"version": "${manifest.version}"`), 'the README manifest sample mirrors the version')
    assert.ok(requirements.includes(`نسخه افزونه: \`${manifest.version}\``), 'the requirements header mirrors the version')
  })

  it('should_match_service_contract_when_provides_are_compared_to_code', () => {
    const [service] = manifest.provides

    assert.equal(SERVICE_NAME, service.name)
    assert.deepEqual(
      service.methods[0].errors.sort(),
      [ERROR_CODES.MARKDOWN_RENDER_FAILED, ERROR_CODES.SERVICE_UNAVAILABLE].sort(),
    )
    assert.deepEqual(
      service.methods[0].params.map((param) => param.name),
      ['markdown', 'syntaxExtensions', 'htmlExtensions', 'idPrefix', 'footnoteOptions'],
    )
    assert.deepEqual(
      Object.fromEntries(service.methods[0].params.map((param) => [param.name, param.type])),
      {
        markdown: 'string',
        syntaxExtensions: 'MicromarkExtension[] | null',
        htmlExtensions: 'MicromarkHtmlExtension[] | null',
        idPrefix: 'string | number | null',
        footnoteOptions: 'object | null',
      },
    )
    assert.equal(
      service.methods[0].returns,
      '{ html: string, toc: Array<{ id: string, level: number, text: string }> }',
    )
  })

  it('should_match_default_config_when_manifest_config_is_compared_to_code', () => {
    assert.equal(manifest.config.maxInputChars, DEFAULT_MAX_INPUT_CHARS)
    assert.equal(manifest.config.allowExternalImages, DEFAULT_ALLOW_EXTERNAL_IMAGES)
    assert.deepEqual(manifest.dependencies, { required: [], optional: [] })
    assert.deepEqual(manifest.events, [])
  })
})
