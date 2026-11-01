// 위아래로 쌓은 투명 영상 재생 도우미: 타이머·프레임 끄기, 합쳐 그리기, 소리 맞추기
// 밤 성공 사망 영상 훅(useNightSuccessKillVideo)이 사용 (lifetime = 재생 한 번의 기록)

// 재생 감시 타이머 끄기
export function cancelPlaybackWatchdog(lifetime) {
  if (!lifetime || lifetime.watchdogId === null || lifetime.watchdogId === undefined) return
  clearTimeout(lifetime.watchdogId)
  lifetime.watchdogId = null
}

// 프레임 반복 끄기 (영상 프레임 콜백이면 그걸로, 아니면 애니메이션 프레임으로 끔)
export function cancelFrameLoop(lifetime, video) {
  if (!lifetime || lifetime.frameHandle === null || lifetime.frameHandle === undefined) return
  const handle = lifetime.frameHandle
  const kind = lifetime.frameKind
  lifetime.frameHandle = null
  if (kind === "video-frame" && video && typeof video.cancelVideoFrameCallback === "function") {
    try {
      video.cancelVideoFrameCallback(handle)
    } catch {
      // 프레임 콜백 끄기 실패는 무시함 (이미 끝난 콜백일 수 있음)
    }
    return
  }
  if (typeof cancelAnimationFrame === "function") {
    try {
      cancelAnimationFrame(handle)
    } catch {
      // 애니메이션 프레임 끄기 실패는 무시함
    }
  }
}

// 브라우저가 자동 재생을 막았을 때의 거절인지
export function isAutoplayBlockedRejection(err) {
  return err !== null && typeof err === "object" && err.name === "NotAllowedError"
}

// 지금 프레임 한 장: 위 절반(색)과 아래 절반(마스크)을 합쳐 화면 캔버스에 그림
// 아직 그릴 준비가 안 됐으면 넘어가고, 높이가 홀수거나 캔버스가 없거나 그리다 터지면 onError
export function drawStackedFrame(lifetime, onError) {
  const video = lifetime.video
  if (!video) return
  const width = video.videoWidth
  const height = video.videoHeight
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
  if (!Number.isFinite(video.readyState) || video.readyState < 2) return
  if (height % 2 !== 0) {
    onError()
    return
  }
  const halfHeight = height / 2
  try {
    const { workCanvas, workCtx, displayCanvas, displayCtx } = lifetime
    if (!workCanvas || !workCtx || !displayCanvas || !displayCtx) {
      onError()
      return
    }
    workCanvas.width = width
    workCanvas.height = height
    workCtx.drawImage(video, 0, 0, width, height)
    const colorImage = workCtx.getImageData(0, 0, width, halfHeight)
    const maskImage = workCtx.getImageData(0, halfHeight, width, halfHeight)
    const composed = composeStackedAlpha(colorImage.data, maskImage.data)
    displayCanvas.width = width
    displayCanvas.height = halfHeight
    const outImage = displayCtx.createImageData(width, halfHeight)
    outImage.data.set(composed)
    displayCtx.putImageData(outImage, 0, 0)
  } catch {
    onError()
  }
}

// 효과음 설정을 영상에 맞춤 (먼저 음소거로 두고 바꿈, 실패하면 음소거만이라도)
// 음소거조차 못 하면 false
export function applyMixToVideo(video, mix, forceMuted) {
  if (!video) return true
  try {
    video.muted = true
    video.volume = mix.gain
    video.muted = forceMuted ? true : mix.muted
    return true
  } catch {
    try {
      video.muted = true
      return true
    } catch {
      return false
    }
  }
}

// 색 픽셀에 가림 픽셀 밝기 평균을 투명도로 넣어 한 장으로 합침
export function composeStackedAlpha(colorPixels, maskPixels) {
  // 두 배열이 있고 길이가 같고 4의 배수여야 함 (아니면 던짐)
  if (colorPixels === null || maskPixels === null || colorPixels === undefined || maskPixels === undefined) {
    throw new TypeError("composeStackedAlpha: colorPixels와 maskPixels는 모두 있어야 한다")
  }
  if (colorPixels.length !== maskPixels.length) {
    throw new RangeError("composeStackedAlpha: colorPixels와 maskPixels의 길이가 같아야 한다")
  }
  if (colorPixels.length % 4 !== 0) {
    throw new RangeError("composeStackedAlpha: 픽셀 배열 길이는 4(RGBA)의 배수여야 한다")
  }

  const result = new Uint8ClampedArray(colorPixels.length)
  for (let i = 0; i < colorPixels.length; i += 4) {
    result[i] = colorPixels[i]
    result[i + 1] = colorPixels[i + 1]
    result[i + 2] = colorPixels[i + 2]
    result[i + 3] = Math.round((maskPixels[i] + maskPixels[i + 1] + maskPixels[i + 2]) / 3)
  }
  return result
}
