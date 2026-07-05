/** R2 버킷 루트에 올린 객체 이름과 동일해야 합니다. 한글·공백 포함 가능 */
const R2_BACKGROUND_OBJECT_KEY = "대기실 배경 이미지2.png"

/** VITE_ASSETS_BASE_URL + R2_BACKGROUND_OBJECT_KEY로 R2 배경 이미지 URL 조립 (base 없으면 undefined) */
function backgroundImageUrl() {
  const base = import.meta.env.VITE_ASSETS_BASE_URL?.replace(/\/$/, "")
  if (!base) return undefined
  return `${base}/${encodeURIComponent(R2_BACKGROUND_OBJECT_KEY)}`
}

/** 서비스 첫 진입 화면(랜딩 페이지). 배경 이미지와 안내 문구만 보여주는 정적 페이지 */
export default function HomePage() {
  // 매 렌더링마다 환경변수 기반으로 배경 이미지 URL을 계산 (컴포넌트 상태는 아님)
  const bgUrl = backgroundImageUrl()

  return (
    <div
      className="min-h-svh bg-cover bg-center bg-no-repeat"
      style={
        bgUrl
          ? { backgroundImage: `url("${bgUrl}")` }
          : undefined
      }
    >
      <div className="flex min-h-svh items-start justify-center px-6 py-16">
        <main className="w-full max-w-xl rounded-lg bg-white/90 p-8 shadow-lg backdrop-blur-sm">
          <h1 className="text-4xl">대제목</h1>
          <h2 className="mt-4 text-2xl">중제목</h2>
          <p className="mt-6 text-base leading-relaxed">
            본문 텍스트는 검정색으로 표시됩니다. 강조가 필요한 제목은 적붉은색을
            사용합니다.
          </p>
          {!import.meta.env.VITE_ASSETS_BASE_URL && (
            <p className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              배경 이미지를 쓰려면{" "}
              <code className="rounded bg-amber-100 px-1">frontend/.env</code> 에{" "}
              <code className="rounded bg-amber-100 px-1">
                VITE_ASSETS_BASE_URL
              </code>
              에 Public Bucket URL 을 넣고 개발 서버를 다시 켜세요.
            </p>
          )}
        </main>
      </div>
    </div>
  )
}
