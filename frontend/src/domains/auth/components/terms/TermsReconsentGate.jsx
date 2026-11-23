// 약관 재동의 창 (새 필수 약관 목록·보기·동의, 동의 전엔 닫히지 않음)
// 데스크톱 App이 라우터 옆에 띄움, 상태는 useTermsReconsent
import { useState } from "react"
import TermsReconsentDialog from "@/domains/auth/components/terms/TermsReconsentDialog.jsx"
import TermsViewDialog from "@/domains/auth/components/terms/TermsViewDialog.jsx"
import { useTermsReconsent } from "@/domains/auth/hooks/terms/useTermsReconsent.js"

export default function TermsReconsentGate() {
  const { pending, required, agree, submitting, error } = useTermsReconsent()
  const [viewingId, setViewingId] = useState(null)
  const viewing = pending.find((item) => item.id === viewingId) ?? null

  return (
    <>
      <TermsReconsentDialog
        open={required && !viewing}
        pending={pending}
        error={error}
        submitting={submitting}
        onAgree={agree}
        onView={setViewingId}
      />
      <TermsViewDialog terms={viewing} onClose={() => setViewingId(null)} />
    </>
  )
}