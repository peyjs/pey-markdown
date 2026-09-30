// Shared constants for the pey.markdown plugin

/** Plugin name — matches manifest.json `name` */
export const PLUGIN_NAME = 'pey.markdown'

/** Plugin version — matches manifest.json `version` */
export const PLUGIN_VERSION = '1.0.0'

/** Service name — matches manifest.json `provides[0].name` */
export const SERVICE_NAME = 'pey.markdown.service'

/** Bonyan architecture version — matches manifest.json `architecture` */
export const ARCHITECTURE_VERSION = '0.11'

/** Default maximum input length per renderFragment call */
export const DEFAULT_MAX_INPUT_CHARS = 200000

/** Standard Bonyan error source */
export const ERROR_SOURCE = 'pey.markdown'

/** Error codes */
export const ERROR_CODES = {
  MARKDOWN_RENDER_FAILED: 'MARKDOWN_RENDER_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
}
