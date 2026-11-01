// 공개 방 카드 목록 (폰 세로 한 열, 폰 가로·태블릿 두 열), 방이 없으면 데스크톱처럼 빈 판만
// MultiplayEntryPage가 씀, footer 자리에 쪽 넘기기
import RoomCard from "@m/domains/game/mode/components/roomList/RoomCard.jsx"

// 방 카드 목록 (빈 판도 최소 높이 둬서 방이 생겨도 덜 출렁임)
export default function RoomCardList({ rooms, selectedRoomId, onSelectRoom, footer = null }) {
  return (
    <section
      className="flex min-h-[40svh] flex-col rounded-sm border border-[#2a2218]/90 bg-[#0a0806]/72 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.45)] land:min-h-[50svh]"
      aria-label="공개 방 목록"
    >
      <ul className="grid flex-1 grid-cols-1 content-start gap-2 land:grid-cols-2 md:grid-cols-2">
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            selected={room.id === selectedRoomId}
            onSelect={() => onSelectRoom(room.id)}
          />
        ))}
      </ul>
      {/* 쪽 넘기기는 데스크톱처럼 판 안 아래 */}
      {footer}
    </section>
  )
}
