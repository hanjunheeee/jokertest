// 파일 역할: resolveNightSuccessVideo.js - night_action_success 사건의 type·perspectives를
// SFX_MANIFEST["night-success-video"].embeddedVideos 선택표에 대조해 재생할 영상 하나를 고른다.
import { SFX_MANIFEST } from "../../../../shared/audio/sfxManifest.js"

/**
 * F-27c(AC-01): 사건 하나(type + perspectives)에서 재생할 역할 영상을 고른다.
 *
 * 관점은 USER를 TARGET보다 먼저 본다 — 자기 치료(HEAL)처럼 perspectives에 USER·TARGET이
 * 함께 있는 사건도 결과 하나만 돌려준다(같은 사건에 영상 두 개를 붙이지 않는다, AC-02).
 * 선택표에 없는 조합(전용 영상이 없는 TARGET, 알 수 없는 type·perspectives)은 null이다 —
 * 이때 USER 경로를 대신 조회하지 않는다(대상자 화면이 행위자 자산을 요청하면 안 된다).
 *
 * @param {{type?: string, perspectives?: string[]}|null} entry
 * @returns {{kind: string, src: string}|null}
 */
export function resolveNightSuccessVideo(entry) {
  if (entry === null || typeof entry !== "object") return null
  const { type, perspectives } = entry
  if (typeof type !== "string" || type.length === 0) return null
  if (!Array.isArray(perspectives)) return null

  const perspective = perspectives.includes("USER")
    ? "USER"
    : perspectives.includes("TARGET")
      ? "TARGET"
      : null
  if (perspective === null) return null

  const table = SFX_MANIFEST["night-success-video"]?.embeddedVideos
  if (table === null || typeof table !== "object") return null

  const src = table[`${type}-${perspective}`]
  if (typeof src !== "string" || src.length === 0) return null

  return { kind: "night-success-video", src }
}
