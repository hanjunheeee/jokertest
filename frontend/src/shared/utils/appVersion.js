// 화면 버전 판정 (지금 화면 버전·새 버전인지·지금 띄워도 되는지)
// 새 버전 확인 훅·안내 띠가 씀, 버전은 빌드 때 appVersionPlugin이 넣음 (개발 서버는 null)

// 지금 열린 화면의 버전 (개발·시험은 null → 확인 안 함)
export const CURRENT_APP_VERSION = import.meta.env?.VITE_APP_VERSION ?? null

// 몇 분마다 확인 (탭으로 돌아올 때도)
export const APP_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000

// 판 도중 화면 (여기선 안내를 안 띄우고 판 끝나면 띄움)
const IN_GAME_PATHS = ["/ingame"]

export function isInGamePath(pathname) {
  return typeof pathname === "string" && IN_GAME_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

// 배포된 버전이 지금 것과 다른지 (둘 중 하나라도 모르면 거짓)
// 예: "a1-1" vs "b2-2" → 참, "a1-1" vs null → 거짓
export function isNewVersionServed(current, served) {
  return typeof current === "string" && current !== ""
    && typeof served === "string" && served !== ""
    && current !== served
}

// 안내 띠를 지금 보일지: 새 버전 있고 · 닫지 않았고 · 판 도중 아님
export function shouldShowUpdateNotice({ servedVersion, currentVersion = CURRENT_APP_VERSION, dismissedVersion = null, pathname }) {
  if (!isNewVersionServed(currentVersion, servedVersion)) return false
  if (dismissedVersion === servedVersion) return false
  return !isInGamePath(pathname)
}
