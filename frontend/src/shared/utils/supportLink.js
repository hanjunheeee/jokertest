// 고객센터 주소 환경값을 링크에 넣어도 되는지 가리는 함수
// 로그인·찾기 화면의 고객센터 링크(PC·모바일 SupportLink)가 씀

// mailto 뒤는 이메일 꼴(빈칸 없음, @ 앞뒤·점 있음)만, ? 뒤 제목 붙이기는 둠
const MAIL_ADDRESS = /^[^\s@?]+@[^\s@?]+\.[^\s@?]+(\?.*)?$/

// https 주소·mailto만 받음 → { href, newTab }, 그 밖(빈 값·javascript:·http·형식 틀림)은 null
// 예: " https://example.com/support " → { href: "https://example.com/support", newTab: true }
export function resolveSupportLink(raw) {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value) return null

  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol === "https:") {
    return url.hostname ? { href: url.href, newTab: true } : null
  }
  // 메일 링크는 새 창이 필요 없음 (메일 프로그램이 열림)
  if (url.protocol === "mailto:") {
    return MAIL_ADDRESS.test(value.slice("mailto:".length)) ? { href: value, newTab: false } : null
  }
  return null
}
