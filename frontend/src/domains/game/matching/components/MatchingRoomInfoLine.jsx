// 대기방 방 정보 줄: 방 이름("○○의 방") + 앉은 수/정원(예 3/8)
// MatchingPopupContent가 안내 문구 아래에 씀, 값이 없는 쪽은 안 그림(둘 다 없으면 줄째 안 그림)

// 높이 0인 칸에 띄워 그림 (자리 그림·아래 단추 줄이 안 밀리게 안내 문구와 자리 사이 빈 곳에 둠)
const LINE_WRAP_CLASS = "relative h-0 shrink-0"
const LINE_CLASS =
  "absolute inset-x-0 top-[clamp(0.35rem,0.9vh,0.7rem)] flex items-baseline justify-center gap-[0.6em] font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.3vw,1.18rem)] font-bold leading-tight text-[#1a1008]"
// 긴 방 이름은 한 줄에서 말줄임, 글자색은 직접 줌(전역 h1 빨강이 양피지 위에서 안 보임)
const TITLE_CLASS = "min-w-0 max-w-[70%] truncate text-[#1a1008]"
const COUNT_CLASS = "shrink-0 font-display font-medium tabular-nums"

// 방 정보 줄 (화면 읽기엔 "앉은 사람 3명, 정원 8명"으로 풀어 읽힘)
export default function MatchingRoomInfoLine({ roomTitle = null, partyCount = 0, partyMax = null }) {
  if (!roomTitle && partyMax === null) return null

  return (
    <div className={LINE_WRAP_CLASS}>
      <div className={LINE_CLASS} data-testid="matching-room-info">
        {roomTitle ? (
          <h1 className={TITLE_CLASS} data-testid="matching-room-title">{roomTitle}</h1>
        ) : null}
        {partyMax !== null ? (
          <span className={COUNT_CLASS} data-testid="matching-party-capacity">
            <span aria-hidden="true">{partyCount}/{partyMax}</span>
            <span className="sr-only">앉은 사람 {partyCount}명, 정원 {partyMax}명</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
