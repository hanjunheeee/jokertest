// 관리자 페이지를 못 여는 까닭 화면 파일, 메일 확인 안 됨 · 페이지 꺼짐 · 권한 확인 서버 못 닿음 (로그인 칸 없음)
// AdminApp이 세션 상태가 noAccess·off·unavailable일 때 씀
const TEXT = Object.freeze({
  noAccess: {
    title: '접근 권한 없음',
    body: '관리자 메일 확인을 거친 사람만 이 페이지를 열 수 있어요. 관리자라면 브라우저를 새로 열고 관리자 메일로 다시 확인해 주세요.',
  },
  off: {
    title: '관리자 페이지가 꺼져 있어요',
    body: '서버에 관리자 설정이 아직 없어요. 서버 담당에게 관리자 설정 값을 넣어 달라고 알려 주세요.',
  },
  unavailable: {
    title: '권한을 확인하지 못했어요',
    body: '권한 확인 서버에 닿지 않아요. 잠시 뒤 다시 확인해 주세요.',
  },
})

// reason: 'noAccess' | 'off' | 'unavailable', onRetry 있으면 다시 확인 버튼
export default function NoAccessPage({ reason = 'noAccess', onRetry }) {
  const text = TEXT[reason] ?? TEXT.noAccess
  return (
    <main className="flex min-h-dvh items-start justify-center bg-page px-4 py-12 text-ink sm:items-center">
      <section className="flex w-full max-w-md flex-col gap-3 rounded border border-line bg-panel p-6">
        <h1 className="text-xl font-bold">{text.title}</h1>
        <p className="text-sm text-muted">{text.body}</p>
        {reason === 'unavailable' && onRetry ? (
          <button type="button" onClick={onRetry} className="min-h-11 self-start rounded border border-line px-4 font-semibold hover:bg-page">
            다시 확인
          </button>
        ) : null}
      </section>
    </main>
  )
}
