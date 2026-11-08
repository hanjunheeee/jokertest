// 새 화면 버전 확인 (몇 분마다·탭으로 돌아올 때 version.json 받아 비교, 판 도중엔 안내 미룸)
// 데스크톱·모바일 App의 새 버전 안내 띠가 씀, 지금 경로는 라우터에서 받음
import { useEffect, useState } from "react"
import { fetchServedAppVersion } from "../api/appVersion.api.js"
import {
  APP_VERSION_CHECK_INTERVAL_MS, CURRENT_APP_VERSION, shouldShowUpdateNotice,
} from "../utils/appVersion.js"

// 라우터 경로 따라가기 (RouterProvider 바깥이라 router.subscribe로)
function useRouterPathname(router) {
  const [pathname, setPathname] = useState(() => router?.state?.location?.pathname ?? "/")
  useEffect(() => {
    if (!router?.subscribe) return undefined
    return router.subscribe((state) => setPathname(state.location.pathname))
  }, [router])
  return pathname
}

export function useAppVersionCheck({
  router,
  currentVersion = CURRENT_APP_VERSION,
  fetchVersion = fetchServedAppVersion,
  intervalMs = APP_VERSION_CHECK_INTERVAL_MS,
} = {}) {
  const pathname = useRouterPathname(router)
  const [servedVersion, setServedVersion] = useState(null)
  const [dismissedVersion, setDismissedVersion] = useState(null)

  useEffect(() => {
    // 버전 없는 화면(개발 서버)은 확인 안 함
    if (!currentVersion) return undefined
    let cancelled = false
    const check = () => {
      fetchVersion().then((version) => { if (!cancelled && version) setServedVersion(version) })
    }
    const onVisible = () => { if (document.visibilityState === "visible") check() }
    const timer = setInterval(check, intervalMs)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", check)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", check)
    }
  }, [currentVersion, fetchVersion, intervalMs])

  return {
    showNotice: shouldShowUpdateNotice({ servedVersion, currentVersion, dismissedVersion, pathname }),
    reload: () => window.location.reload(),
    dismiss: () => setDismissedVersion(servedVersion),
  }
}
