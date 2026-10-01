// Manifest/code agreement tests for pey.markdown.
// Strategy: read the authoritative manifest.json (static JSON import —
// deterministic, no network) and assert the code honors the same contract:
// identity constants, service name, method errors, and default config.

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

  it('should_match_service_contract_when_provides_are_compared_to_code', () => {
    const [service] = manifest.provides

    assert.equal(SERVICE_NAME, service.name)
    assert.deepEqual(
      service.methods[0].errors.sort(),
      [ERROR_CODES.MARKDOWN_RENDER_FAILED, ERROR_CODES.SERVICE_UNAVAILABLE].sort(),
    )
  })

  it('should_match_default_config_when_manifest_config_is_compared_to_code', () => {
    assert.equal(manifest.config.maxInputChars, DEFAULT_MAX_INPUT_CHARS)
    assert.equal(manifest.config.allowExternalImages, DEFAULT_ALLOW_EXTERNAL_IMAGES)
    assert.deepEqual(manifest.dependencies, { required: [], optional: [] })
    assert.deepEqual(manifest.events, [])
  })
})
