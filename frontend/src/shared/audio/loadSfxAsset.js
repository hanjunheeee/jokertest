// 효과음 파일을 받아 해시 확인 뒤 blob 주소로 만들기 (시간 제한·취소 확인)
// useSfxRuntime이 플레이어 불러오기 함수로 넣고, 시험이 가짜 fetch·해시로 부름
import { SFX_LOAD_TIMEOUT_MS } from "./sfxManifest.js"

// 해시 바이트 → 16진 글자 (목록 해시와 비교용)
export function toHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let hex = ""
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return hex
}

// 브라우저 기능(fetch·해시·blob)은 io로 바꿔 끼울 수 있게 받음 (시험용)
export function createSfxAssetLoader(io = {}) {
  const {
    fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null,
    digest = (bytes) => globalThis.crypto.subtle.digest("SHA-256", bytes),
    createObjectUrl = (blob) => URL.createObjectURL(blob),
    revokeObjectUrl = (url) => URL.revokeObjectURL(url),
    createBlob = (bytes, type) => new Blob([bytes], { type }),
    timeoutMs = SFX_LOAD_TIMEOUT_MS,
  } = io

  // 목록 항목 하나 불러오기, 해시가 다르면 src 없이 돌려줌 (플레이어가 거절)
  return async function loadSfxAsset(entry, control) {

    // 항목 모양·fetch 있는지 먼저 봄
    if (entry === null || typeof entry !== "object") throw new Error("sfx-asset-entry-invalid")
    if (typeof entry.src !== "string" || entry.src.length === 0) throw new Error("sfx-asset-src-missing")
    if (typeof entry.sha256 !== "string" || entry.sha256.length === 0) throw new Error("sfx-asset-hash-missing")
    if (typeof fetchImpl !== "function") throw new Error("sfx-asset-fetch-unavailable")

    // 그사이 범위가 바뀌어 취소됐으면 안 받음
    if (control?.isCancelled?.() === true) throw new Error("sfx-asset-cancelled")

    // 시간 넘기면 받기를 끊음
    const controller = typeof AbortController === "function" ? new AbortController() : null
    const abortTimer = controller === null ? null : setTimeout(() => controller.abort(), timeoutMs)

    let bytes
    try {
      const response = await fetchImpl(entry.src, controller === null ? undefined : { signal: controller.signal })
      if (!response?.ok) throw new Error("sfx-asset-http-error")
      bytes = await response.arrayBuffer()
    } finally {
      // 성공·실패 상관없이 타이머 지움
      if (abortTimer !== null) clearTimeout(abortTimer)
    }

    // 받는 사이 취소됐으면 버림
    if (control?.isCancelled?.() === true) throw new Error("sfx-asset-cancelled")

    const sha256 = toHex(await digest(bytes))
    // 해시가 다르면 blob 안 만듦
    if (sha256 !== entry.sha256) {
      return { sha256, src: null,release: () => {
} }
    }

    // 확인한 바이트 그대로 재생 (주소로 다시 받으면 내용이 바뀔 수 있음)
    const blob = createBlob(bytes, typeof entry.mimeType === "string" ? entry.mimeType : "audio/mpeg")
    const objectUrl = createObjectUrl(blob)
    let released = false
    return {
      sha256,
      src: objectUrl,
      release: () => {
        // 한 번만 풂
        if (released) return
        released = true
        revokeObjectUrl(objectUrl)
      },
    }
  }
}
