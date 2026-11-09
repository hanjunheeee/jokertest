// 채팅 증거 보기 파일, 신고 때 저장한 그 판 채팅을 시각순으로 + 채널(낮·죽은 사람·직업 채널)로 골라 보기
// ReportDetailPage가 씀, 증거가 없으면 "증거 없음"
import { useState } from 'react'
import { formatKst } from '@/admin/shared/utils/time'

// 채널 글자 → 쉬운 이름 (직업 채널은 이름 그대로 + 채널)
const channelLabel = (channel) => {
  if (channel === 'DAY') return '낮 대화'
  if (channel === 'DEAD') return '죽은 사람'
  if (!channel) return '알 수 없음'
  return `${channel} 채널`
}

// 채널 목록 (나온 순서, 겹침 없이) 예: [{channel:'DAY'},{channel:'DEAD'},{channel:'DAY'}] → ['DAY','DEAD']
const channelsOf = (messages) => [...new Set(messages.map((message) => message.channel ?? null))]

const TAB = 'min-h-11 rounded border px-3 text-sm aria-pressed:border-accent aria-pressed:font-semibold'

// targetUuid: 신고 대상 (대상이 쓴 줄은 굵게)
export default function EvidenceView({ evidence, targetUuid }) {
  const [channel, setChannel] = useState('ALL')
  if (!evidence) {
    return <p className="rounded border border-dashed border-line px-4 py-6 text-sm text-muted">증거 없음 — 이 신고엔 저장된 채팅이 없어요.</p>
  }
  const channels = channelsOf(evidence.messages)
  const shown = channel === 'ALL' ? evidence.messages : evidence.messages.filter((message) => (message.channel ?? null) === channel)

  return (
    <div>
      <p className="mb-2 text-sm text-muted">저장한 시각 {formatKst(evidence.savedAt)} · {evidence.messages.length}줄</p>
      <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="채널 고르기">
        <button type="button" className={`${TAB} border-line`} aria-pressed={channel === 'ALL'} onClick={() => setChannel('ALL')}>전부</button>
        {channels.map((name) => (
          <button key={name ?? 'none'} type="button" className={`${TAB} border-line`} aria-pressed={channel === name} onClick={() => setChannel(name)}>
            {channelLabel(name)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted">이 채널엔 채팅이 없어요.</p> : (
        <ol className="flex max-h-96 flex-col gap-1 overflow-y-auto rounded border border-line bg-panel p-3 text-sm" aria-label="채팅 증거">
          {shown.map((message, index) => (
            <li key={`${message.at}-${index}`} className={message.senderUuid === targetUuid ? 'font-semibold' : ''}>
              <span className="text-muted">{formatKst(message.at)} [{channelLabel(message.channel)}]</span>{' '}
              <span>{message.nickname ?? '이름 없음'}:</span> <span className="break-words">{message.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
