// 공개 방 카드 목록 (폰 세로 한 열, 폰 가로·태블릿 두 열), 방이 없으면 안내 문구
// MultiplayEntryPage가 씀
import RoomCard from "@m/domains/game/mode/components/roomList/RoomCard.jsx"

// 방 카드 목록
export default function RoomCardList({ rooms, selectedRoomId, onSelectRoom }) {
  return (
    <section
      className="rounded-sm border border-[#2a2218]/90 bg-[#0a0806]/72 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.45)]"
      aria-label="공개 방 목록"
    >
      {rooms.length === 0 ? (
        <p className="py-10 text-center font-subheading app-text-scaled [--app-text-size:0.95rem] font-semibold !text-[#e8d5a8]/80">
          열린 방이 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 land:grid-cols-2 md:grid-cols-2">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              selected={room.id === selectedRoomId}
              onSelect={() => onSelectRoom(room.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
