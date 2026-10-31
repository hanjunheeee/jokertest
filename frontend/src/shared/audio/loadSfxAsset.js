// loadSfxAsset.js: 소리 재생에 사용하는 실행·설정·공통 코드를 정의한다.
// 모듈 사용처: frontend/src/shared/hooks/useSfxRuntime.js

import { SFX_LOAD_TIMEOUT_MS } from "./sfxManifest.js"

// 전달받은 16진수를 검사·변환해 이후 코드에서 일관된 형태로 사용하게 한다.
// buffer: 바이트 버퍼 값
export function toHex(buffer) {
  // bytes: Uint8Array 객체
  const bytes = new Uint8Array(buffer)
  // hex: 16진수 값
  let hex = ""
  // i: 반복 처리의 현재 위치
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return hex
}

// 주입된 다운로드·해시·Blob 실행 함수로 효과음 로더를 만든다. 실제 로더는 파일을 받은 뒤 명세의 SHA-256과 비교하고 재생 가능한 리소스를 제공한다.
// io: 방 참가자 전체나 특정 사용자에게 소켓 이벤트를 보내는 서버 객체
export function createSfxAssetLoader(io = {}) {
  // fetchImpl: 조건에 따라 선택한 값
  // timeoutMs: 밀리초 단위 대기 제한 시간
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

    // controller: 조건에 따라 선택한 값
    const controller = typeof AbortController === "function" ? new AbortController() : null
    // abortTimer: 조건에 따라 선택한 값
    const abortTimer = controller === null ? null : setTimeout(() => controller.abort(), timeoutMs)

    // bytes: 바이트 값
    let bytes
    try {
      // response: 응답 처리 결과
      const response = await fetchImpl(entry.src, controller === null ? undefined : { signal: controller.signal })
      if (!response?.ok) throw new Error("sfx-asset-http-error")
      bytes = await response.arrayBuffer()
    } finally {
      if (abortTimer !== null) clearTimeout(abortTimer)
    }

    if (control?.isCancelled?.() === true) throw new Error("sfx-asset-cancelled")

    // sha256: 호출한 toHex에서 받은 처리 결과
    const sha256 = toHex(await digest(bytes))
    // 여기서 던지지 않고 그대로 돌려준다 — 불일치 판정과 무음 사유 기록은 재생기의 verifyLoadedSfxAsset가 한 곳에서 담당한다.
    if (sha256 !== entry.sha256) {
      return { sha256, src: null, /* 더는 사용하지 않을 해제를 정리하거나 해제한다. */ release: () => {
} }
    }

    // blob: 호출한 createBlob에서 받은 처리 결과
    const blob = createBlob(bytes, typeof entry.mimeType === "string" ? entry.mimeType : "audio/mpeg")
    // objectUrl: 호출한 createObjectUrl에서 받은 처리 결과
    const objectUrl = createObjectUrl(blob)
    let released = false
    return {
      sha256,
      src: objectUrl,
      // 더는 사용하지 않을 해제를 정리하거나 해제한다.
      release: () => {
        if (released) return
        released = true
        revokeObjectUrl(objectUrl)
      },
    }
  }
}
