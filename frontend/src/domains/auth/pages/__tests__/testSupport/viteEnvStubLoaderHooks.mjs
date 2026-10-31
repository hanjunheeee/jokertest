const ENV_MODULE_SUFFIX = "/shared/env.js"

const STUB_SOURCE = `export const API_BASE_URL = ""
export const DISCORD_SUPPORT_URL = undefined
`

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(ENV_MODULE_SUFFIX)) {
    return { format: "module", source: STUB_SOURCE, shortCircuit: true }
  }
  return nextLoad(url, context)
}
