/**
 * F-16 AC-02 · 효과음 자산 로더.
 *
 * manifest의 허용 metadata만으로는 "이 경로의 파일이 검토한 그 파일"임을 보장하지 못한다 —
 * 경로는 같고 내용만 바뀐 자산이 그대로 재생될 수 있다. 그래서 이 로더는
 *
 *   1) 중단 가능한 fetch로 **실제 바이트**를 받고,
 *   2) 그 바이트의 SHA-256을 직접 계산해,
 *   3) 검토 기록(entry.sha256)과 대조한 뒤,
 *   4) **같은 바이트**로 만든 blob URL만 매체에 넘긴다.
 *
 * 4번이 중요하다. 해시를 확인한 다음 원래 URL을 다시 매체에 주면 브라우저가 그 URL을 한 번
 * 더 받아오므로, 그 사이 내용이 바뀌면 검증한 바이트와 재생한 바이트가 달라진다. 검증한
 * 바로 그 바이트를 그대로 재생하기 위해 Blob을 쓴다.
 *
 * 반환하는 release()는 blob URL을 해제한다 — 재생기가 cleanup에서 호출한다(정착 경로 전부).
 * 호출하지 않으면 문서 수명 동안 URL이 남는다.
 *
 * 이 로더는 자산이 승인되기 전에는 호출되지도 않는다(재생기가 checkSfxAssetAllowed에서 먼저
 * 거부한다). 그래도 여기서 src/sha256을 다시 확인한다 — 로더 단독으로도 계약이 성립해야
 * 시험이 이 함수만 떼어내 검사할 수 있다.
 */
import { SFX_LOAD_TIMEOUT_MS } from "./sfxManifest.js"

/** ArrayBuffer → 소문자 hex 문자열. 검토 기록의 sha256과 같은 표기다. */
export function toHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let hex = ""
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return hex
}

/**
 * @param {object} [io] 주입(시험용). 생략하면 브라우저 전역을 쓴다.
 * @param {typeof fetch} [io.fetchImpl]
 * @param {(bytes:ArrayBuffer) => Promise<ArrayBuffer>} [io.digest] SHA-256 다이제스트
 * @param {(blob:Blob) => string} [io.createObjectUrl]
 * @param {(url:string) => void} [io.revokeObjectUrl]
 * @param {(bytes:ArrayBuffer, type:string) => Blob} [io.createBlob]
 * @param {number} [io.timeoutMs]
 * @returns {(entry:object, control:{isCancelled:() => boolean}) => Promise<{sha256:string, src:string, release:() => void}>}
 */
export function createSfxAssetLoader(io = {}) {
  const {
    fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null,
    digest = (bytes) => globalThis.crypto.subtle.digest("SHA-256", bytes),
    createObjectUrl = (blob) => URL.createObjectURL(blob),
    revokeObjectUrl = (url) => URL.revokeObjectURL(url),
    createBlob = (bytes, type) => new Blob([bytes], { type }),
    timeoutMs = SFX_LOAD_TIMEOUT_MS,
  } = io

  return async function loadSfxAsset(entry, control) {
    if (entry === null || typeof entry !== "object") throw new Error("sfx-asset-entry-invalid")
    if (typeof entry.src !== "string" || entry.src.length === 0) throw new Error("sfx-asset-src-missing")
    if (typeof entry.sha256 !== "string" || entry.sha256.length === 0) throw new Error("sfx-asset-hash-missing")
    if (typeof fetchImpl !== "function") throw new Error("sfx-asset-fetch-unavailable")

    // 범위가 이미 바뀐 뒤라면 네트워크 요청 자체를 시작하지 않는다.
    if (control?.isCancelled?.() === true) throw new Error("sfx-asset-cancelled")

    const controller = typeof AbortController === "function" ? new AbortController() : null
    // 재생기의 로드 제한(3초)과 별개로 로더 자신도 요청을 끊는다 — 제한 시간이 지나면
    // 재생기는 completion을 timed-out으로 정착시키지만, 끊지 않으면 네트워크 요청은 계속
    // 살아 있다.
    const abortTimer = controller === null ? null : setTimeout(() => controller.abort(), timeoutMs)

    let bytes
    try {
      const response = await fetchImpl(entry.src, controller === null ? undefined : { signal: controller.signal })
      if (!response?.ok) throw new Error("sfx-asset-http-error")
      bytes = await response.arrayBuffer()
    } finally {
      if (abortTimer !== null) clearTimeout(abortTimer)
    }

    // 받아오는 동안 계정·게임이 바뀌었으면 blob URL을 만들지 않는다(만들면 해제 책임만 남는다).
    if (control?.isCancelled?.() === true) throw new Error("sfx-asset-cancelled")

    const sha256 = toHex(await digest(bytes))
    // 여기서 던지지 않고 그대로 돌려준다 — 불일치 판정과 무음 사유 기록은 재생기의
    // verifyLoadedSfxAsset가 한 곳에서 담당한다. 다만 **불일치면 blob URL을 만들지 않는다**:
    // 검증되지 않은 바이트로는 매체 소스 자체가 존재하지 않아야 한다.
    if (sha256 !== entry.sha256) {
      return { sha256, src: null, release: () => {} }
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
