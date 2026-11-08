// 없는 주소·화면 오류 때 보일 화면 (라우터 기본 영문 오류 화면 대신, 돌아갈 버튼 있음)
// app/routes/index.jsx가 errorElement·나머지 경로(*)에 씀
import { isRouteErrorResponse, useRouteError } from "react-router-dom"

const BTN_CLASS =
    "min-h-11 cursor-pointer rounded-lg border border-[#c9b892]/60 bg-black/60 px-5 font-subheading font-bold text-[#f5f0e6] active:scale-95"

// 오류 없이 왔으면(* 경로) 없는 주소로 봄, 화면 새로 받기 실패(배포 뒤 옛 조각)도 새로 읽기로 풀림
export default function RouteErrorPage() {
    const error = useRouteError()
    const notFound = !error || (isRouteErrorResponse(error) && error.status === 404)

    return (
        <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-black px-6 text-center text-[#f5f0e6]">
            <h1 className="font-subheading text-xl font-bold">{notFound ? "없는 화면입니다" : "화면을 여는 중 문제가 생겼습니다"}</h1>
            <p className="text-sm text-white/70">{notFound ? "주소를 다시 확인해 주세요." : "다시 읽거나 처음 화면으로 돌아가 주세요."}</p>
            <div className="flex gap-2">
                {notFound ? null : (
                    <button type="button" className={BTN_CLASS} onClick={() => window.location.reload()}>다시 읽기</button>
                )}
                {/* 라우터가 깨졌을 수 있어 주소를 새로 읽음 (로그인 안 됐으면 로그인 화면으로 감) */}
                <button type="button" className={BTN_CLASS} onClick={() => window.location.assign("/lobby")}>처음 화면으로</button>
            </div>
        </main>
    )
}
