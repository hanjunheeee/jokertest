/**
 * 게임 결과 화면 — prototype 게임 결과창 시안-승리/패배.png
 *
 * 개발: /gameresult?outcome=win | /gameresult?outcome=lose
 */
import GameResultShell from "../components/GameResultShell.jsx"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"

export default function GameResultPage() {
  return <GameResultShell {...useGameResultPreview()} />
}
