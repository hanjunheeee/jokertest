import { SFX_MANIFEST } from "../../../../shared/audio/sfxManifest.js"

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
