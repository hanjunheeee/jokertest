import { SFX_LOAD_TIMEOUT_MS } from "./sfxManifest.js"

export function toHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let hex = ""
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return hex
}

export function createSfxAssetLoader(io = {}) {
  const {
    fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null,
    digest = (bytes) => globalThis.crypto.subtle.digest("SHA-256", bytes),
    createObjectUrl = (blob) => URL.createObjectURL(blob),
    revokeObjectUrl = (url) => URL.revokeObjectURL(url),
    createBlob = (bytes, type) => new Blob([bytes], { type }),
    timeoutMs = SFX_LOAD_TIMEOUT_MS,
  } = io

  return /* 저장된 데이터나 현재 상태에서 효과음 리소스를 찾아 호출한 코드가 사용할 수 있게 한다. | entry: 항목 값 | control: 조작 값 */ async function loadSfxAsset(entry, control) {

    if (entry === null || typeof entry !== "object") throw new Error("sfx-asset-entry-invalid")
    if (typeof entry.src !== "string" || entry.src.length === 0) throw new Error("sfx-asset-src-missing")
    if (typeof entry.sha256 !== "string" || entry.sha256.length === 0) throw new Error("sfx-asset-hash-missing")
    if (typeof fetchImpl !== "function") throw new Error("sfx-asset-fetch-unavailable")

    if (control?.isCancelled?.() === true) throw new Error("sfx-asset-cancelled")

    const controller = typeof AbortController === "function" ? new AbortController() : null
    const abortTimer = controller === null ? null : setTimeout(() => controller.abort(), timeoutMs)

    let bytes
    try {
      const response = await fetchImpl(entry.src, controller === null ? undefined : { signal: controller.signal })
      if (!response?.ok) throw new Error("sfx-asset-http-error")
      bytes = await response.arrayBuffer()
    } finally {
      if (abortTimer !== null) clearTimeout(abortTimer)
    }

    if (control?.isCancelled?.() === true) throw new Error("sfx-asset-cancelled")

    const sha256 = toHex(await digest(bytes))
    if (sha256 !== entry.sha256) {
      return { sha256, src: null, /* 더는 사용하지 않을 해제를 정리하거나 해제한다. */ release: () => {
} }
    }

    const blob = createBlob(bytes, typeof entry.mimeType === "string" ? entry.mimeType : "audio/mpeg")
    const objectUrl = createObjectUrl(blob)
    let released = false
    return {
      sha256,
      src: objectUrl,
      release: () => {
        if (released) return
        released = true
        revokeObjectUrl(objectUrl)
      },
    }
  }
}
