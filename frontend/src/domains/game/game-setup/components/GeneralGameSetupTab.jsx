import { GENERAL_GAME_SETUP } from "../constants/gameSetupAssets.js"
import SetupTabContent from "./SetupTabContent.jsx"

export default function GeneralGameSetupTab() {
  return <SetupTabContent items={GENERAL_GAME_SETUP} />
}
