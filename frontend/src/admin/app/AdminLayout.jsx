// 관리자 화면 틀 파일, PC는 왼쪽 메뉴 + 본문, 휴대폰(768px 아래)은 위 막대 + 메뉴 서랍
// AdminApp이 로그인 뒤 모든 영역 화면을 이 틀 안(Outlet)에 그림
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { adminRoutes } from '@/admin/app/adminRoutes'
import { useWideScreen } from '@/admin/shared/hooks/useWideScreen'

const MENU_ID = 'admin-menu'
const ITEM = 'flex min-h-11 items-center rounded px-3 text-sm md:min-h-9'
const itemClass = ({ isActive }) => (isActive ? `${ITEM} bg-accent font-semibold text-accent-ink` : `${ITEM} hover:bg-page`)

function MenuList({ onPick }) {
  return (
    <nav id={MENU_ID} aria-label="관리자 메뉴">
      <ul className="flex flex-col gap-0.5">
        {adminRoutes.map((route) => (
          <li key={route.path}>
            <NavLink to={route.path} className={itemClass} onClick={onPick}>{route.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function AccountBox({ admin, onLogout }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
      <span className="truncate text-muted">{admin?.loginId}</span>
      <button type="button" onClick={onLogout} className="min-h-11 rounded border border-line px-3 hover:bg-page">로그아웃</button>
    </div>
  )
}

// 휴대폰 서랍: 메뉴 버튼으로 열고, 닫기·Esc·메뉴 누르면 닫힘
function PhoneBar({ admin, onLogout }) {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)

  // 닫으면 초점을 메뉴 버튼으로 돌려 둠 (키보드로 쓰는 사람이 길 잃지 않게)
  const close = () => {
    setOpen(false)
    toggleRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-panel px-2">
        <button ref={toggleRef} type="button" aria-expanded={open} aria-controls={MENU_ID} onClick={() => setOpen(true)}
          className="min-h-11 min-w-11 rounded border border-line px-3 text-sm font-semibold hover:bg-page">
          메뉴 열기
        </button>
        <span className="text-sm font-semibold">MMC 관리자</span>
      </header>
      {open ? (
        <div className="fixed inset-0 z-30 flex">
          <div className="flex w-72 max-w-[85vw] flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-3">
            <button type="button" autoFocus onClick={close} className="min-h-11 self-end rounded border border-line px-3 text-sm">
              메뉴 닫기
            </button>
            <MenuList onPick={close} />
            <AccountBox admin={admin} onLogout={onLogout} />
          </div>
          {/* 바깥 어두운 곳 눌러도 닫힘 (키보드는 Esc·닫기 버튼) */}
          <div aria-hidden="true" className="flex-1 bg-black/40" onClick={close} />
        </div>
      ) : null}
    </>
  )
}

function SideBar({ admin, onLogout }) {
  return (
    <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-3">
      <p className="px-3 py-2 text-sm font-semibold">MMC 관리자</p>
      <div className="flex-1"><MenuList /></div>
      <AccountBox admin={admin} onLogout={onLogout} />
    </aside>
  )
}

// admin: { loginId }, onLogout: 로그아웃 누르면
export default function AdminLayout({ admin, onLogout }) {
  const wide = useWideScreen()
  return (
    <div className={`min-h-dvh bg-page text-ink ${wide ? 'flex' : ''}`}>
      {wide ? <SideBar admin={admin} onLogout={onLogout} /> : <PhoneBar admin={admin} onLogout={onLogout} />}
      <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6">
        <Outlet />
      </main>
    </div>
  )
}
