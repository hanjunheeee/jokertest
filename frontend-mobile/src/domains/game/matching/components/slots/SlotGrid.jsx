// 대기방 자리 격자: 폰 세로 2열(8명까지 한 화면), 폰 가로 5열·태블릿 4열
// MatchingBoard가 씀, 파티 방 기다리는 중이면 기다림 문구
import SlotCard from "./SlotCard.jsx"

// 자리 격자 + 기다림 문구
export default function SlotGrid({ cards, waitingMessage = "" }) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      {cards.length > 0 ? (
        <ul
          aria-label="참가자 자리"
          className="grid grid-cols-2 gap-2 land:grid-cols-5 md:grid-cols-4 md:gap-3 lg:grid-cols-5"
        >
          {cards.map((slot) => (
            <SlotCard key={slot.id} slot={slot} />
          ))}
        </ul>
      ) : null}

      {/* 파티 방 기다리는 중일 때만 */}
      {waitingMessage ? (
        <p
          role="status"
          className="rounded-md bg-[#1a1008]/10 px-3 py-3 text-center font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-snug text-[#3a1a0c]"
        >
          {waitingMessage}
        </p>
      ) : null}
    </div>
  )
}
