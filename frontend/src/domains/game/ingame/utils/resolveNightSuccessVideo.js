// 밤 성공 연출 항목 → 재생할 영상 주소 고르기 (쓴 사람 시점을 먼저)
// 밤 성공 연출 화면·밤 성공 연출 훅이 사용
import { SFX_MANIFEST } from "../../../../shared/audio/sfxManifest.js"

// 종류·시점으로 영상 표에서 찾기 (모양이 틀리거나 없으면 null)
export function resolveNightSuccessVideo(entry) {
  // 항목 모양: 종류 이름·시점 목록
  if (entry === null || typeof entry !== "object") return null
  const { type, perspectives } = entry
  if (typeof type !== "string" || type.length === 0) return null
  if (!Array.isArray(perspectives)) return null

  // 쓴 사람 시점이 있으면 그것, 없으면 대상 시점
  const perspective = perspectives.includes("USER")
    ? "USER"
    : perspectives.includes("TARGET")
      ? "TARGET"
      : null
  if (perspective === null) return null

  // 효과음 목록의 밤 성공 영상 표에서 종류-시점 키로 찾음
  const table = SFX_MANIFEST["night-success-video"]?.embeddedVideos
  if (table === null || typeof table !== "object") return null

  const src = table[`${type}-${perspective}`]
  if (typeof src !== "string" || src.length === 0) return null

  return { kind: "night-success-video", src }
}
