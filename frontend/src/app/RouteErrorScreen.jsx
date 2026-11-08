// 라우트 오류·없는 주소 화면 (화면 하나가 터져도 앱 전체가 라우터 기본 글자 화면이 되지 않게, FE-013)
// app/routes/index.jsx가 최상위 errorElement와 path "*"에 씀
import { isRouteErrorResponse, useRouteError } from "react-router-dom"

const WRAP_CLASS =
  "flex min-h-svh w-full flex-col items-center justify-center gap-4 bg-[#14110e] px-4 text-center text-[#f5f0e6]"
const TITLE_CLASS = "app-text-scaled [--app-text-size:22px] font-semibold"
const BODY_CLASS = "app-text-scaled [--app-text-size:15px] text-white/70"
const BUTTON_CLASS =
  "cursor-pointer rounded border border-[#6b5a44] bg-black/40 px-4 py-2 app-text-scaled [--app-text-size:15px] hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f5f0e6]"

// 오류 화면에선 라우터 상태를 믿지 않고 주소째 다시 엶 (상태 꼬임까지 비움)
const goTo = (path) => {
  window.location.assign(path)
}

// errorElement로 쓰일 땐 useRouteError가 오류를 줌, path "*"로 쓰일 땐 notFound
export default function RouteErrorScreen({ notFound = false }) {
  return notFound ? <ErrorBody notFound /> : <RouteErrorBody />
}

// errorElement 안에서만 useRouteError를 부름
function RouteErrorBody() {
  const error = useRouteError()
  const missing = isRouteErrorResponse(error) && error.status === 404
  if (!missing) console.error("[화면 오류]", error)
  return <ErrorBody notFound={missing} />
}

function ErrorBody({ notFound }) {
  return (
    <main className={WRAP_CLASS} role="alert" data-route-error={notFound ? "not-found" : "crash"}>
      <h1 className={TITLE_CLASS}>{notFound ? "없는 주소입니다." : "화면을 그리다 문제가 생겼습니다."}</h1>
      <p className={BODY_CLASS}>
        {notFound ? "주소를 다시 확인해 주세요." : "잠시 뒤 다시 시도해 주세요. 계속되면 로비로 돌아가 주세요."}
      </p>
      <div className="flex gap-3">
        {!notFound ? (
          <button type="button" className={BUTTON_CLASS} onClick={() => window.location.reload()}>
            다시 불러오기
          </button>
        ) : null}
        <button type="button" className={BUTTON_CLASS} onClick={() => goTo("/lobby")}>
          로비로 가기
        </button>
      </div>
    </main>
  )
}
