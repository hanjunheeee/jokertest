// 쿠폰 화면 파일, 쿠폰 목록(쓴 수/횟수·기간·켜짐) + 새 쿠폰 + 켜고 끄기 + 쓴 사람 보기
// 메뉴 표(adminRoutes)가 /coupons에 붙임, 보상 지급은 플레이어가 코드를 넣을 때 게임 서버가 장부로 함
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { adminErrorText } from '@/admin/shared/api/errorText'
import CouponForm from '@/admin/domains/coupons/components/CouponForm'
import { fetchCoupons, fetchRedemptions, setCouponActive } from '@/admin/domains/coupons/api/coupons.api'

const ROW_BUTTON = 'min-h-11 rounded border border-line px-3 disabled:opacity-50'

// 기간 글자 (예: 둘 다 없음 → '언제나', 끝만 → '~ 2026-11-30 23:59')
const periodText = (row) => {
  if (!row.startsAt && !row.endsAt) return '언제나'
  return `${row.startsAt ? formatKst(row.startsAt) : ''} ~ ${row.endsAt ? formatKst(row.endsAt) : ''}`.trim()
}

function Redemptions({ coupon, onClose }) {
  const [list, setList] = useState({ state: 'loading', items: [], nextBefore: null, error: null })

  const load = useCallback(async (before) => {
    try {
      const page = await fetchRedemptions(coupon.id, { before })
      setList((old) => ({ state: 'ready', items: before ? [...old.items, ...page.items] : page.items, nextBefore: page.nextBefore, error: null }))
    } catch (error) {
      setList((old) => ({ ...old, state: 'error', error }))
    }
  }, [coupon.id])

  useEffect(() => { void load() }, [load])

  const columns = [
    { key: 'nickname', label: '회원', render: (row) => <Link to={`/members/${row.userUuid}`} className="text-accent underline">{row.nickname ?? row.userUuid}</Link> },
    { key: 'redeemedAt', label: '쓴 시각', render: (row) => formatKst(row.redeemedAt) },
  ]
  return (
    <section aria-labelledby="redemptions-title" className="mt-6 rounded border border-line bg-panel p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="redemptions-title" className="font-semibold">{coupon.code} 쓴 사람 ({coupon.usedCount}명)</h2>
        <button type="button" onClick={onClose} className={ROW_BUTTON}>닫기</button>
      </div>
      {list.state === 'loading' ? <StatusNote state="loading" /> : null}
      {list.state === 'error' ? <StatusNote state="error" error={list.error} onRetry={() => load()} /> : null}
      {list.state === 'ready' ? <DataList columns={columns} rows={list.items} caption="쓴 사람 목록" empty="아직 쓴 사람이 없어요." /> : null}
      {list.state === 'ready' && list.nextBefore ? (
        <button type="button" onClick={() => load(list.nextBefore)} className={`mt-3 ${ROW_BUTTON}`}>더 보기</button>
      ) : null}
    </section>
  )
}

// 쿠폰 목록 불러오기 (before 있으면 뒤에 붙임)
function useCouponList() {
  const [list, setList] = useState({ state: 'loading', items: [], nextBefore: null, error: null })

  const load = useCallback(async (before) => {
    try {
      const page = await fetchCoupons({ before })
      setList((old) => ({ state: 'ready', items: before ? [...old.items, ...page.items] : page.items, nextBefore: page.nextBefore, error: null }))
    } catch (error) {
      setList((old) => ({ ...old, state: 'error', error }))
    }
  }, [])

  useEffect(() => { void load() }, [load])
  return { list, load }
}

// 목록 칸: 코드·보상·쓴 수·기간·상태·바꾸기 버튼(켜고 끄기·쓴 사람)
function couponColumns({ toggle, busyId, setViewing }) {
  return [
    { key: 'code', label: '코드' },
    { key: 'reward', label: '보상', render: (row) => `${row.rewardType === 'DIAMOND' ? '다이아' : '골드'} ${row.rewardAmount.toLocaleString('ko-KR')}` },
    { key: 'used', label: '쓴 수', render: (row) => `${row.usedCount} / ${row.maxUses ?? '제한 없음'}` },
    { key: 'period', label: '기간', render: periodText },
    { key: 'isActive', label: '상태', render: (row) => (row.isActive ? '켜짐' : '꺼짐') },
    {
      key: 'actions', label: '바꾸기', render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => toggle(row)} disabled={busyId === row.id} aria-label={`${row.code} ${row.isActive ? '끄기' : '켜기'}`}
            className={ROW_BUTTON}>{row.isActive ? '끄기' : '켜기'}</button>
          <button type="button" onClick={() => setViewing(row)} aria-label={`${row.code} 쓴 사람`} className={ROW_BUTTON}>쓴 사람</button>
        </div>
      ),
    },
  ]
}

// 목록 칸: 불러오는 중·오류·목록·더 보기
function CouponListArea({ list, columns, load }) {
  return (
    <>
      {list.state === 'loading' ? <StatusNote state="loading" /> : null}
      {list.state === 'error' ? <StatusNote state="error" error={list.error} onRetry={() => load()} /> : null}
      {list.state === 'ready' ? (
        <DataList columns={columns} rows={list.items} caption="쿠폰 목록" empty="아직 쿠폰이 없어요. 새 쿠폰을 만들어 주세요." />
      ) : null}
      {list.state === 'ready' && list.nextBefore ? (
        <button type="button" onClick={() => load(list.nextBefore)} className={`mt-3 ${ROW_BUTTON}`}>더 보기</button>
      ) : null}
    </>
  )
}

export default function CouponsPage() {
  const { list, load } = useCouponList()
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [notice, setNotice] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const toggle = async (row) => {
    setBusyId(row.id)
    setActionError(null)
    try {
      const { coupon } = await setCouponActive(row.id, !row.isActive)
      setNotice(`${coupon.code} 쿠폰을 ${coupon.isActive ? '켰어요' : '껐어요'}.`)
      void load()
    } catch (error) {
      setActionError(error)
    } finally {
      setBusyId(null)
    }
  }

  const afterCreate = (coupon) => {
    setCreating(false)
    setNotice(`${coupon.code} 쿠폰을 만들었어요.`)
    void load()
  }

  const columns = couponColumns({ toggle, busyId, setViewing })

  return (
    <section>
      <PageHeader title="쿠폰" description="만든 코드를 플레이어가 상점에서 넣으면 보상을 받아요. 지우는 대신 꺼요."
        actions={creating ? null : (
          <button type="button" onClick={() => setCreating(true)} className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink">새 쿠폰</button>
        )} />
      {creating ? <CouponForm onCreated={afterCreate} onCancel={() => setCreating(false)} /> : null}
      {notice ? <p role="status" className="mb-4 text-sm">{notice}</p> : null}
      {actionError ? <p role="alert" className="mb-4 text-sm text-danger">{adminErrorText(actionError)}</p> : null}
      <CouponListArea list={list} columns={columns} load={load} />
      {viewing ? <Redemptions key={viewing.id} coupon={viewing} onClose={() => setViewing(null)} /> : null}
    </section>
  )
}
