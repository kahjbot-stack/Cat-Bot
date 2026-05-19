import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Bot,
  LogOut,
  Cat,
  Menu,
  Settings,
  Sun,
  Moon,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/utils/cn.util'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { toggleTheme } from '@/utils/theme.util'
import IconButton from '@/components/ui/buttons/IconButton'
import { ROUTES } from '@/constants/routes.constants'

// Map navigation items directly to route paths
const NAV_ITEMS = [
  { path: ROUTES.ADMIN.DASHBOARD, label: 'Overview', icon: LayoutDashboard },
  { path: ROUTES.ADMIN.USERS, label: 'Users', icon: Users },
  { path: ROUTES.ADMIN.BOTS, label: 'Bot Sessions', icon: Bot },
  { path: ROUTES.ADMIN.SETTINGS, label: 'Settings', icon: Settings },
] as const

// ============================================================================
// SidebarNav
// ============================================================================
// Shared between the desktop sidebar and the mobile slide-in drawer.
// Theme toggle lives here so it appears in the sidebar area on all breakpoints.
// Logout has been moved to the AdminAvatarMenu in the page header.

function SidebarNav({
  activePath,
  onNavClick,
}: {
  activePath: string
  onNavClick?: () => void
}) {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col h-full">
      {/* ── Sidebar header — h-16 matches the main content header exactly ── */}
      {/* The border-b separator uses the same token as the page header so the
          two regions form a visually unified horizontal band on desktop. */}
      <div className="h-16 flex items-center px-6 border-b border-outline-variant shrink-0">
        <Link
          to={ROUTES.ADMIN.DASHBOARD}
          onClick={onNavClick}
          className="flex items-center gap-2 text-title-lg font-semibold text-primary hover:opacity-80 transition-opacity duration-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-sm"
        >
          <Cat className="h-5 w-5" />
          Cat-Bot Admin
        </Link>
      </div>

      {/* ── Primary navigation — flex-1 so it fills space between header and footer ── */}
      <nav
        className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto"
        aria-label="Admin navigation"
      >
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive = activePath === path
          return (
            <Link
              key={path}
              to={path}
              onClick={onNavClick}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-label-lg font-medium',
                'transition-colors duration-fast',
                isActive
                  ? 'bg-primary/[var(--state-hover-opacity)] text-primary'
                  : 'text-on-surface-variant hover:bg-on-surface/[var(--state-hover-opacity)] hover:text-on-surface',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* ── Sidebar footer — theme toggle anchored to the bottom ── */}
      {/* The theme toggle lives in the sidebar area as specified, presented as
          a full-width nav-style row item for visual consistency with nav links. */}
      <div className="px-3 py-4 border-t border-outline-variant">
        <button
          type="button"
          onClick={() => setTheme(toggleTheme(theme))}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
            'text-label-lg font-medium text-on-surface-variant text-left',
            'transition-colors duration-fast',
            'hover:bg-on-surface/[var(--state-hover-opacity)] hover:text-on-surface',
          )}
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// AdminAvatarMenu
// ============================================================================
// Profile avatar displayed in the main content header. Shows the first letter
// of the admin's name. Clicking opens a dropdown that contains user info and
// the logout action (moved here from the sidebar bottom section).

function AdminAvatarMenu({
  user,
  onLogout,
}: {
  user: { name?: string | null; email?: string | null } | null
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside the menu container.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const displayName = user?.name ?? 'Admin'
  // First letter of the user's name displayed inside the circular avatar.
  const firstLetter = displayName[0].toUpperCase()

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger — circular button showing the first letter of the name */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${displayName} — account menu`}
        className={cn(
          'flex items-center gap-1.5 rounded-full',
          'transition-opacity duration-fast hover:opacity-80',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          open && 'opacity-80',
        )}
      >
        {/* Circular avatar with primary brand colour */}
        <span
          className={cn(
            'h-9 w-9 flex items-center justify-center rounded-full shrink-0',
            'bg-primary text-on-primary text-label-lg font-semibold select-none',
          )}
        >
          {firstLetter}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-on-surface-variant transition-transform duration-fast hidden sm:block',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown — positioned below the avatar, aligned to the right edge */}
      {open && (
        <div
          role="menu"
          aria-label="Admin account menu"
          className={cn(
            'absolute right-0 top-full mt-2 z-dropdown min-w-[220px]',
            'rounded-xl border border-outline-variant bg-surface',
            'shadow-elevation-2 py-1 overflow-hidden',
            '[animation:fade-in-down_150ms_var(--easing-standard-decelerate)_both]',
          )}
        >
          {/* User identity header — non-interactive, provides context */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant">
            {/* Repeated avatar in the menu header for visual continuity */}
            <span
              className={cn(
                'h-9 w-9 flex items-center justify-center rounded-full shrink-0',
                'bg-primary text-on-primary text-label-lg font-semibold select-none',
              )}
            >
              {firstLetter}
            </span>
            <div className="min-w-0">
              <p className="text-label-lg font-medium text-on-surface truncate">
                {displayName}
              </p>
              {user?.email && (
                <p className="text-label-sm text-on-surface-variant truncate">
                  {user.email}
                </p>
              )}
            </div>
          </div>

          {/* Logout — destructive action; inherits error colour for clear intent */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5',
              'text-label-lg text-left text-error',
              'transition-colors duration-fast',
              'hover:bg-error/[var(--state-hover-opacity)]',
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// AdminSidebarLayout
// ============================================================================

/**
 * Persistent shell for all authenticated admin pages.
 *
 * Layout structure (desktop md+):
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ [sidebar: h-16 Cat-Bot Admin brand + border-b] │ [header: h-16     │
 * │                                                │  page title + avt]│
 * ├────────────────────────────────────────────────┤─────────────────── │
 * │ [sidebar: nav items]                           │ [main content]    │
 * │ [sidebar: theme toggle]                        │                   │
 * └────────────────────────────────────────────────┴───────────────────┘
 *
 * The sidebar header (h-16 + border-b) and the main content header (h-16 +
 * border-b) share the same height token and separator style so they form one
 * visually unified horizontal band across the full viewport width.
 *
 * Mobile (<md): sidebar is hidden; a slide-in drawer is triggered by the
 * hamburger in the main content header. When the drawer is open, body scroll
 * is locked so background content cannot scroll behind the overlay.
 *
 * Profile avatar (right of header):
 *  - Displays the first letter of the admin's name
 *  - Clicking opens a dropdown with user info + logout
 *  - Logout has been removed from the sidebar bottom section
 *
 * Theme toggle is placed in the sidebar footer area (both desktop sidebar and
 * mobile drawer) as specified in the design system.
 */
export default function AdminSidebarLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAdminAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const activePath = location.pathname

  const [prevPath, setPrevPath] = useState(activePath)
  if (activePath !== prevPath) {
    setPrevPath(activePath)
    setMobileOpen(false)
  }

  // Keyboard accessibility — Escape dismisses the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mobileOpen])

  // Body scroll lock — when the mobile sidebar is open, prevent the page
  // content behind the overlay from scrolling. Feels professional and stable.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    // Always restore on unmount so no stale lock persists after navigation.
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Invalidate server session before navigating to prevent cookie replay.
  const handleLogout = () => {
    logout()
      .catch(() => {})
      .finally(() => {
        navigate(ROUTES.ADMIN.ROOT)
      })
  }

  // Resolve the human-readable label for the currently active route.
  const currentLabel =
    NAV_ITEMS.find((i) => i.path === activePath)?.label ?? 'Admin'

  return (
    <div className="min-h-screen flex bg-surface-container-high">
      {/* ── Desktop sidebar (md+) ── */}
      {/* sticky top-0 h-screen: pins the sidebar to the viewport top and caps it at
          exactly one viewport height so it never grows with the main content column.
          overflow-y-hidden on the outer element; the inner nav uses overflow-y-auto. */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-surface border-r border-outline-variant sticky top-0 h-screen overflow-y-hidden">
        <SidebarNav activePath={activePath} />
      </aside>

      {/* ── Mobile: dim scrim backdrop ── */}
      {/* Positioned behind the drawer but above page content; clicking dismisses */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-drawer bg-scrim/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile: slide-in drawer (<md) ── */}
      {/* Animated with CSS transform so layout is not recalculated on toggle. */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-modal w-64 flex flex-col bg-surface border-r border-outline-variant md:hidden',
          'transition-transform duration-normal',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Mobile admin navigation"
        aria-modal={mobileOpen}
      >
        <SidebarNav
          activePath={activePath}
          onNavClick={() => setMobileOpen(false)}
        />
      </aside>

      {/* ── Main content column ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Page header — always visible on all breakpoints ── */}
        {/* h-16 and border-b match the sidebar header exactly, creating one
            continuous horizontal band across the full viewport on desktop. */}
        <header className="sticky top-0 z-sticky bg-surface border-b border-outline-variant h-16 flex items-center px-6">
          {/* Mobile hamburger — hidden on md+ where the desktop sidebar is visible.
              Uses the same IconButton component and size="md" prop as DashboardLayout
              so the tap target, icon scale, and hover state are pixel-identical. */}
          <IconButton
            icon={<Menu />}
            aria-label="Open navigation menu"
            variant="text"
            size="md"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
          />

          {/* ── Centre: current page title — absolutely centred within the header ── */}
          {/* pointer-events-none on the wrapper so it never blocks the hamburger
              or avatar; the text itself is non-interactive display only. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-title-sm font-semibold text-on-surface select-none tracking-wide">
              {currentLabel}
            </span>
          </div>

          {/* ── Right: profile avatar with dropdown ── */}
          {/* ml-auto pushes the avatar to the trailing edge regardless of whether
              the hamburger is rendered (mobile) or hidden (desktop). */}
          <div className="ml-auto">
            <AdminAvatarMenu user={user} onLogout={handleLogout} />
          </div>
        </header>

        {/* ── Routed section content ── */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}