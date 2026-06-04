import { MEETING_GAME_SETUP } from "../constants/gameSetupAssets.js"
import SetupTabContent from "./SetupTabContent.jsx"

export default function MeetingGameSetupTab() {
  return <SetupTabContent items={MEETING_GAME_SETUP} />
}
