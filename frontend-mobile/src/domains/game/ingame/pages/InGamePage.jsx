// 인게임 화면 (/ingame): 폰 세로는 카톡형(TalkLayout), 폰 가로·태블릿은 위 줄·진행 바·카드 판·채팅·행동 줄 칸 배치, 연출·시트는 위에 띄움
// app/routes/index.jsx가 씀, 로직은 useInGamePage (데스크톱 InGamePage와 같은 순서·조건), Provider도 데스크톱과 같게 감쌈
import { InGamePlayerSessionProvider } from "@/domains/game/ingame/components/InGamePlayerSessionProvider.jsx"
import { InGameChatSessionProvider } from "@/domains/game/ingame/components/chat/InGameChatSessionProvider.jsx"
import ActionRow from "@m/domains/game/ingame/components/actions/ActionRow.jsx"
import Board from "@m/domains/game/ingame/components/board/Board.jsx"
import ChatPanel from "@m/domains/game/ingame/components/chat/ChatPanel.jsx"
import OverlayLayer from "@m/domains/game/ingame/components/overlays/OverlayLayer.jsx"
import RecordSheet from "@m/domains/game/ingame/components/sheets/RecordSheet.jsx"
import SettingsSheet from "@m/domains/game/ingame/components/sheets/SettingsSheet.jsx"
import ActionProvider from "@m/domains/game/ingame/components/shell/ActionProvider.jsx"
import Background from "@m/domains/game/ingame/components/shell/Background.jsx"
import TopBar from "@m/domains/game/ingame/components/shell/TopBar.jsx"
import Timebar from "@m/domains/game/ingame/components/timebar/Timebar.jsx"
import TalkLayout from "@m/domains/game/ingame/components/talk/TalkLayout.jsx"
import { useWideChat } from "@m/domains/game/ingame/hooks/chat/useWideChat.js"
import { useCompactTyping } from "@m/domains/game/ingame/hooks/page/useCompactTyping.js"
import { useInGamePage } from "@m/domains/game/ingame/hooks/page/useInGamePage.js"
import { useRecordEmojiHistory } from "@m/domains/game/ingame/hooks/talk/useEmojiHistory.js"

// 칸 배치: 세로는 한 줄로 쌓고, 폰 가로·태블릿 가로(lg)는 왼쪽 위 줄·판 / 오른쪽 진행 바·채팅·행동
// 가로에서 진행 바는 위 두 줄에 걸쳐 둬서 위 줄 높이가 진행 바만큼 커지지 않게 함
// 판 줄은 minmax(0,auto)라 공간이 모자라면 판 칸이 줄고 안에서 스크롤 (Tailwind가 글자 그대로 찾아서 class를 조각내 합치지 않음)
const GRID_CLASS = [
  "relative grid h-full min-h-0 w-full grid-cols-1",
  "grid-rows-[auto_auto_minmax(0,auto)_minmax(0,1fr)_auto]",
  "[grid-template-areas:'top'_'time'_'board'_'chat'_'actions']",
  "land:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] land:grid-rows-[auto_auto_minmax(0,1fr)_auto]",
  "land:[grid-template-areas:'top_time'_'board_time'_'board_chat'_'board_actions']",
  "md:px-3",
  "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)_auto] lg:gap-x-3",
  "lg:[grid-template-areas:'top_time'_'board_time'_'board_chat'_'board_actions']",
].join(" ")

// 칸 하나 공통 (가로 스크롤 없게 min-w-0), 판·채팅만 줄어들 수 있게 min-h-0 따로 붙임
const SLOT_CLASS = "relative min-w-0"

// 낮은 화면에서 입력 중: 세로는 진행 바·판을 잠깐 접어 채팅 목록 자리 냄 (키보드 내리면 다시 보임)
// 가로는 판이 왼쪽이고 접힌 진행 바가 오른쪽 위 한 줄이라 둘 다 둠 (가로는 늘 높이가 낮아 입력만 해도 접혀 버림)
const TYPING_TIME_CLASS = "hidden land:block"
const TYPING_BOARD_CLASS = "hidden land:block"

// 넓은 배치 (폰 가로·태블릿): 위 줄·진행 바·카드 판·채팅·행동 줄 칸 배치, 폰 세로는 TalkLayout
// page: useInGamePage 값, compactTyping: 낮은 화면에서 입력 중이면 세로 칸 몇 개 접음
function WideLayout({ page, compactTyping }) {
  const { sidePanel, surfaceLocked } = page

  return (
    <div
      className={`${GRID_CLASS} ${surfaceLocked ? "pointer-events-none" : ""}`.trim()}
      inert={surfaceLocked || undefined}
    >
      <div className={`${SLOT_CLASS} [grid-area:top]`} data-slot="top">
        <TopBar
          onExit={page.requestExit}
          onRecords={sidePanel.openRecords}
          onSettings={sidePanel.openSettings}
          onRoleReveal={page.reopenRoleReveal}
          roleRevealAvailable={page.roleRevealAvailable && Boolean(page.reopenRoleReveal)}
        />
      </div>
      <div className={`${SLOT_CLASS} px-2 land:pt-1 [grid-area:time] ${compactTyping ? TYPING_TIME_CLASS : ""}`} data-slot="timebar">
        <Timebar />
      </div>
      <div
        className={`${SLOT_CLASS} min-h-0 overflow-y-auto overscroll-contain px-1.5 [grid-area:board] ${compactTyping ? TYPING_BOARD_CLASS : ""}`}
        data-slot="board"
      >
        <Board />
      </div>
      <div className={`${SLOT_CLASS} flex min-h-0 flex-col px-1.5 [grid-area:chat]`} data-slot="chat">
        <ChatPanel />
      </div>
      <div className={`${SLOT_CLASS} px-1.5 pb-1 [grid-area:actions]`} data-slot="actions">
        <ActionRow />
      </div>
    </div>
  )
}

// 화면 (맞는 판이 아니면 아무것도 안 그림, 밖으로 보내기는 훅이 함)
export default function InGamePage() {
  const page = useInGamePage()
  const compactTyping = useCompactTyping()
  // 폰 세로만 카톡형 (폰 가로·태블릿은 아래 칸 배치 그대로)
  const wide = useWideChat()
  // 받은 이모티콘 기록은 배치와 상관없이 늘 (가로로 돌린 동안 온 것도 채팅방에 남게)
  useRecordEmojiHistory()

  if (!page.isValidGameSession) return null

  const { sidePanel, surfaceLocked, interactionBlocked } = page

  return (
    <div className="relative h-full w-full overflow-hidden bg-black" data-compact-typing={compactTyping || undefined}>
      <Background />

      <InGamePlayerSessionProvider>
        <InGameChatSessionProvider>
          <ActionProvider interactionBlocked={interactionBlocked}>
            {wide ? null : <TalkLayout page={page} compactTyping={compactTyping} locked={surfaceLocked} />}
            {wide ? <WideLayout page={page} compactTyping={compactTyping} /> : null}

            {/* 기록 시트는 플레이어 세션 컨텍스트를 읽어서 Provider 안에 둠 */}
            <RecordSheet open={sidePanel.recordsOpen} onClose={sidePanel.close} />
            <SettingsSheet open={sidePanel.settingsOpen} onClose={sidePanel.close} />
            {/* 재판 연출이 행동·채팅 컨텍스트를 읽어서 Provider 안에 둠 */}
            <OverlayLayer />
          </ActionProvider>
        </InGameChatSessionProvider>
      </InGamePlayerSessionProvider>
    </div>
  )
}
