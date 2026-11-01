// 아직 안 만든 화면의 빈 자리: 제목과 경로만 보여 줌
// 0단계에서 모든 경로에 걸어 둠, 1단계에서 영역별로 바꿔 끼우기
export default function PlaceholderPage({ title, path }) {
    return (
        <section className="flex min-h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <h1 className="text-2xl">{title}</h1>
            <p className="text-sm text-white/60">{path}</p>
        </section>
    )
}
