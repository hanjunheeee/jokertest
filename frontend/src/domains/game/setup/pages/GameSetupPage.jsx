import GameSetupBackground from "../components/GameSetupBackground.jsx"
import GameSetupPanel from "../components/GameSetupPanel.jsx"
import GameSetupPageControls from "../components/GameSetupPageControls.jsx"
import { useGameSetupPage } from "../hooks/useGameSetupPage.js"

const RESTORE_NOTICE_CLASS =
  "pointer-events-none absolute inset-x-0 top-[2.5%] z-30 mx-auto max-w-[min(48rem,92vw)] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.8rem,1.1vw,0.95rem)] font-semibold leading-snug text-[#ffb3a7] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

export default function GameSetupPage() {
  const {
    uiVisible, isCreating, goBackToMultiplay, createGame,
    initialFormState, formResetKey, restoreNotice,
  } = useGameSetupPage()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <GameSetupBackground />
      {restoreNotice ? (
        <p role="alert" className={RESTORE_NOTICE_CLASS}>
          {restoreNotice}
        </p>
      ) : null}
      <GameSetupPanel
        visible={uiVisible}
        isCreating={isCreating}
        onCreateGame={createGame}
        initialFormState={initialFormState}
        formResetKey={formResetKey}
      />
      <GameSetupPageControls visible={uiVisible} onBack={goBackToMultiplay} />
    </div>
  )
}
