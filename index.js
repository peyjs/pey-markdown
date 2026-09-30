// Entry point for the pey.markdown plugin
// Two-phase lifecycle per Bonyan architecture 0.11:
//   prepare()   — build and return the declared markdown service; no other
//                 plugin's service is available yet.
//   activate()  — no declared dependencies and no published events, so local
//                 activation is a no-op by design.

import { SERVICE_NAME } from './lib/constants.js'
import MarkdownService from './lib/markdown-service.js'

// Module-level closure: prepare()'s context is the same object reference the
// Core reads back later (e.g. for onShutdown), and the lifecycle hooks need
// the service instance without reaching into its internals.
let savedContext = null
let serviceRef = null

/**
 * Phase 1 — preparation.
 *
 * Build and return the declared service instances. No other plugin's service
 * is available yet; do not call one. Must return an array.
 *
 * @param {object} prepareContext — PrepareContext from the Core
 * @returns {Promise<{ name: string, object: MarkdownService }[]>}
 */
export async function prepare(prepareContext) {
  savedContext = prepareContext

  const service = new MarkdownService({
    maxInputChars: prepareContext.config?.maxInputChars,
  })
  serviceRef = service

  // Assign lifecycle hooks here (in prepare) rather than in activate(). If
  // activation never runs — e.g. the plugin is skipped at settlement — hooks
  // assigned in activate() would be lost and the service would stay usable
  // after deactivation instead of reporting SERVICE_UNAVAILABLE.
  savedContext.onShutdown = async () => {
    serviceRef._setDeactivated()
  }

  savedContext.onDeactivated = async () => {
    serviceRef._setDeactivated()
  }

  return [
    { name: SERVICE_NAME, object: service },
  ]
}

/**
 * Phase 2 — binding + local activation.
 *
 * Receives ONLY the resolved services object. This plugin declares no
 * required/optional dependency and publishes no events, so there is nothing
 * to wire: `services` is intentionally ignored — do not read any key from it.
 * Lifecycle hooks are assigned in prepare(), not here.
 *
 * @param {object} _services — resolved declared dependencies (none for this plugin)
 * @returns {Promise<void>}
 */
export async function activate(_services) {
  // No-op by design: nothing to bind, no ready event declared in the manifest.
}
