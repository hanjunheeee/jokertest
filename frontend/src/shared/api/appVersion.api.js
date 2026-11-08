// 지금 배포된 화면 버전 받기 (같은 주소의 version.json, 캐시 안 씀)
// 새 버전 확인 훅(useAppVersionCheck)이 씀, 데스크톱·모바일 같이
// 서버 api가 아니라 화면 주소라 공통 client 대신 바로 fetch

// → 버전 글자, 못 받으면 null
export const fetchServedAppVersion = async ({ baseUrl = import.meta.env?.BASE_URL ?? "/" } = {}) => {
  try {
    const response = await fetch(`${baseUrl}version.json?t=${Date.now()}`, { cache: "no-store" })
    if (!response.ok) return null
    const body = await response.json()
    return typeof body?.version === "string" && body.version ? body.version : null
  } catch {
    return null
  }
}
