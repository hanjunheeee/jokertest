// 인증 화면 배경: Playwright Chromium이 mp4 코덱 미지원(MEDIA_ERR_SRC_NOT_SUPPORTED) → video 검정
// + 스크린샷 파이프라인이 <video> 픽셀을 비우는 경우 → canvas 베이크 또는 ffmpeg 정지화 주입
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const loginVideo = path.join(root, "..", "frontend", "public", "bg", "로그인_뒷배경_무한루프.mp4")
const posterJpg = path.join(root, "docs", "screenshots", "assets", "auth-backdrop-poster.jpg")

/** ffmpeg으로 mp4에서 한 프레임 추출 (seek 초는 환경변수와 맞춤) */
export function ensureAuthBackdropPoster(seekSeconds = 4.5) {
  fs.mkdirSync(path.dirname(posterJpg), { recursive: true })
  if (!fs.existsSync(loginVideo)) return false

  const videoMtime = fs.statSync(loginVideo).mtimeMs
  const posterFresh =
    fs.existsSync(posterJpg) && fs.statSync(posterJpg).mtimeMs >= videoMtime
  if (posterFresh) return true

  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-ss", String(seekSeconds), "-i", loginVideo, "-frames:v", "1", "-q:v", "2", posterJpg],
      { stdio: "pipe" },
    )
    return fs.existsSync(posterJpg)
  } catch {
    return false
  }
}

async function injectPosterDataUrl(page, dataUrl) {
  await page.evaluate((url) => {
    const video = document.querySelector("video")
    const parent = video?.parentElement
    if (!parent) return
    video.style.visibility = "hidden"
    video.style.pointerEvents = "none"
    let img = parent.querySelector("[data-screenshot-standin]")
    if (!img) {
      img = document.createElement("img")
      img.dataset.screenshotStandin = "true"
      img.alt = ""
      img.className = video.className
      img.setAttribute("aria-hidden", "true")
      parent.insertBefore(img, video)
    }
    img.src = url
  }, dataUrl)
}

/** 재생·seek 후 video 프레임을 canvas → img로 교체 (스크린샷에 실제 픽셀이 포함됨) */
export async function bakeVideoFrameStandin(page, seekSeconds) {
  const result = await page.evaluate(async (t) => {
    const video = document.querySelector("video")
    if (!video) return { ok: false, step: "no-video" }

    const diag = {
      currentSrc: video.currentSrc,
      readyState: video.readyState,
      networkState: video.networkState,
      error: video.error?.code ?? null,
    }

    video.muted = true
    video.playsInline = true
    try {
      await video.play()
    } catch (e) {
      diag.playError = String(e)
    }

    await new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const seek = () => {
        const target = Math.min(t, Math.max(0.5, (video.duration || t + 1) - 0.05))
        video.currentTime = target
        video.addEventListener("seeked", done, { once: true })
      }
      if (video.readyState >= 2) seek()
      else video.addEventListener("canplay", seek, { once: true })
      window.setTimeout(done, 4000)
    })

    diag.videoWidth = video.videoWidth
    diag.videoHeight = video.videoHeight
    diag.currentTime = video.currentTime

    if (video.videoWidth < 2 || video.videoHeight < 2) {
      return { ok: false, step: "no-decoded-frame", diag }
    }

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return { ok: false, step: "no-canvas", diag }

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    } catch (e) {
      return { ok: false, step: "drawImage", diag, err: String(e) }
    }

    let dataUrl
    try {
      dataUrl = canvas.toDataURL("image/jpeg", 0.92)
    } catch (e) {
      return { ok: false, step: "toDataURL", diag, err: String(e) }
    }

    const parent = video.parentElement
    if (!parent) return { ok: false, step: "no-parent", diag }

    video.style.visibility = "hidden"
    video.style.pointerEvents = "none"

    let img = parent.querySelector("[data-screenshot-standin]")
    if (!img) {
      img = document.createElement("img")
      img.dataset.screenshotStandin = "true"
      img.alt = ""
      img.className = video.className
      img.setAttribute("aria-hidden", "true")
      parent.insertBefore(img, video)
    }
    img.src = dataUrl
    return { ok: true, diag }
  }, seekSeconds)

  return result
}

/**
 * 인증 배경을 스크린샷용 정지 이미지로 맞춤.
 * 1) video 프레임 베이크  2) 실패 시 ffmpeg 포스터  3) 진단 로그
 */
export async function prepareAuthBackdropForScreenshot(page, seekSeconds, { debug = false } = {}) {
  await page.waitForSelector("video", { timeout: 10000 }).catch(() => null)

  // 자동화 Chromium에서 코덱이 막히면 베이크는 건너뛰고 포스터만 써도 됨
  if (ensureAuthBackdropPoster(seekSeconds) && fs.existsSync(posterJpg)) {
    const quickPoster = process.env.SCREENSHOT_AUTH_POSTER_ONLY === "1"
    if (quickPoster) {
      const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(posterJpg).toString("base64")}`
      await injectPosterDataUrl(page, dataUrl)
      if (debug) console.log("auth backdrop: poster only (SCREENSHOT_AUTH_POSTER_ONLY)")
      return "poster"
    }
  }

  const baked = await bakeVideoFrameStandin(page, seekSeconds)
  if (baked?.ok) {
    if (debug) console.log("auth backdrop: baked video frame", baked.diag)
    return "baked"
  }

  if (debug || process.env.SCREENSHOT_DEBUG_VIDEO === "1") {
    console.warn("auth backdrop bake 실패:", JSON.stringify(baked, null, 2))
  }

  if (ensureAuthBackdropPoster(seekSeconds) && fs.existsSync(posterJpg)) {
    const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(posterJpg).toString("base64")}`
    await injectPosterDataUrl(page, dataUrl)
    if (debug) console.log("auth backdrop: ffmpeg poster injected", posterJpg)
    return "poster"
  }

  console.warn("auth backdrop: 베이크·포스터 모두 실패 (parent bg-black만 보일 수 있음)")
  return "failed"
}
