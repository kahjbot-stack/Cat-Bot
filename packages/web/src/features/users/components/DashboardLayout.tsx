import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Cat,
  Sun,
  Moon,
  ChevronDown,
  LogOut,
  User,
  WifiOff,
  Wifi,
  Menu,
  X,
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useUserAuth } from '@/contexts/UserAuthContext'
import { useSnackbar } from '@/contexts/SnackbarContext'
import { toggleTheme } from '@/utils/theme.util'
import { cn } from '@/utils/cn.util'
import IconButton from '@/components/ui/buttons/IconButton'
import UILink from '@/components/ui/typography/Link'
import { ROUTES } from '@/constants/routes.constants'
import { getSocket } from '@/lib/socket.lib'

// ============================================================================
// Constants
// ============================================================================

interface NavItem {
  label: string
  href: string
}

const navItems: NavItem[] = [
  { label: 'Bot Manager', href: ROUTES.DASHBOARD.ROOT },
  { label: 'Settings', href: ROUTES.DASHBOARD.SETTINGS },
]

// ============================================================================
// NavLink — desktop horizontal nav item
// ============================================================================

function NavLink({ item }: { item: NavItem }) {
  const location = useLocation()

  // Distinguish root dashboard route from specific subsections to prevent
  // multiple nav items from being highlighted simultaneously.
  const isRootRoute = item.href === ROUTES.DASHBOARD.ROOT
  const isSettingsRoute = location.pathname.startsWith(ROUTES.DASHBOARD.SETTINGS)

  const isActive = isRootRoute
    ? location.pathname === item.href ||
      (location.pathname.startsWith(`${item.href}/`) && !isSettingsRoute)
    : location.pathname === item.href ||
      location.pathname.startsWith(`${item.href}/`)

  return (
    <UILink
      as={Link}
      to={item.href}
      aria-current={isActive ? 'page' : undefined}
      variant="unstyled"
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-label-lg font-medium',
        'transition-colors duration-fast',
        isActive
          ? 'text-primary'
          : 'text-on-surface-variant hover:text-on-surface',
      )}
    >
      {item.label}
    </UILink>
  )
}

// ============================================================================
// MobileNavLink — full-width touch-friendly nav item for the mobile drawer
// ============================================================================

function MobileNavLink({
  item,
  onClick,
}: {
  item: NavItem
  onClick: () => void
}) {
  const location = useLocation()

  const isRootRoute = item.href === ROUTES.DASHBOARD.ROOT
  const isSettingsRoute = location.pathname.startsWith(ROUTES.DASHBOARD.SETTINGS)

  const isActive = isRootRoute
    ? location.pathname === item.href ||
      (location.pathname.startsWith(`${item.href}/`) && !isSettingsRoute)
    : location.pathname === item.href ||
      location.pathname.startsWith(`${item.href}/`)

  return (
    <UILink
      as={Link}
      to={item.href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      variant="unstyled"
      className={cn(
        // Generous padding for thumb-reachable touch targets (min 44px height)
        'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-body-md font-medium',
        'transition-colors duration-fast',
        isActive
          ? 'bg-primary/[var(--state-hover-opacity)] text-primary'
          : 'text-on-surface hover:bg-on-surface/[var(--state-hover-opacity)]',
      )}
    >
      {item.label}
    </UILink>
  )
}

// ============================================================================
// UserMenu — desktop dropdown with name + logout
// ============================================================================

function UserMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  // Pulls the authenticated user's name from the live better-auth session
  const { user, logout } = useUserAuth()

  // Close the dropdown when the user clicks anywhere outside it.
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

  const handleLogout = async () => {
    setOpen(false)
    try {
      // Invalidates the server-side session token before navigating away.
      await logout()
    } catch (err) {
      console.error('Logout failed:', err)
    }
    navigate(ROUTES.HOME)
  }

  const displayName = user?.name ?? 'User'

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger button — shows name + chevron */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-3 py-2',
          'text-label-lg font-medium text-on-surface',
          'transition-colors duration-fast',
          'hover:bg-on-surface/[var(--state-hover-opacity)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          open && 'bg-on-surface/[var(--state-hover-opacity)]',
        )}
      >
        <span>{displayName}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-on-surface-variant transition-transform duration-fast',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="menu"
          aria-label="User menu"
          className={cn(
            'absolute right-0 top-full mt-1 z-dropdown min-w-[180px]',
            'rounded-xl border border-outline-variant bg-surface',
            'shadow-elevation-2 py-1',
            '[animation:fade-in-down_150ms_var(--easing-standard-decelerate)_both]',
          )}
        >
          {/* User info row — non-interactive display header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant">
            <User className="h-4 w-4 shrink-0 text-on-surface-variant" />
            <div className="min-w-0">
              <p className="text-label-lg font-medium text-on-surface truncate">
                {displayName}
              </p>
            </div>
          </div>

          {/* Logout action */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void handleLogout()
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
// DashboardLayout
// ============================================================================

/**
 * Dashboard shell with a top navbar.
 *
 * Header structure (unified height h-16 with Layout and AdminSidebarLayout):
 *  - Left:   Cat icon (fixed) + nav links (Bot Manager, Settings)
 *  - Centre: "Cat-Bot" brand text — absolutely centred in the nav container
 *  - Right:  Theme toggle + UserMenu (desktop) | hamburger → drawer (mobile)
 *
 * The theme toggle is the leading item in the right-side navigation button
 * section, consistent with the landing-page Layout shell.
 *
 * Mobile drawer: nav links → separator → user identity → logout → separator → theme toggle
 */
export default function DashboardLayout() {
  const { theme, setTheme } = useTheme()
  const { snackbar, setPosition } = useSnackbar()
  const { user, logout } = useUserAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isDisconnectedRef = useRef(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [prevPath, setPrevPath] = useState(location.pathname)

  const displayName = user?.name ?? 'User'

  // Collapse the mobile drawer whenever the active route changes.
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname)
    setMobileOpen(false)
  }

  // Keyboard accessibility — Escape closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mobileOpen])

  // Socket connectivity — ensure the transport is alive while in the dashboard
  // and surface connection loss as a persistent snackbar (duration: 0).
  useEffect(() => {
    const socket = getSocket()
    if (!socket.connected) socket.connect()

    const handleDisconnect = () => {
      if (isDisconnectedRef.current) return
      isDisconnectedRef.current = true
      setPosition('bottom-right')
      snackbar({
        message: 'You are currently offline.',
        duration: 0,
        icon: <WifiOff className="w-5 h-5" />,
      })
    }

    const handleConnect = () => {
      if (!isDisconnectedRef.current) return
      isDisconnectedRef.current = false
      setPosition('bottom-right')
      snackbar({
        message: 'Your internet connection was restored.',
        duration: 4000,
        icon: <Wifi className="w-5 h-5" />,
      })
    }

    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleDisconnect)
    socket.on('connect', handleConnect)

    return () => {
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleDisconnect)
      socket.off('connect', handleConnect)
    }
  }, [snackbar, setPosition])

  // Logout handler for the mobile drawer — mirrors UserMenu's logout.
  const handleMobileLogout = async () => {
    setMobileOpen(false)
    try {
      await logout()
    } catch (err) {
      console.error('Logout failed:', err)
    }
    navigate(ROUTES.HOME)
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-container-high text-on-surface">
      {/* ── Header ── */}
      <header className="sticky top-0 z-sticky bg-surface border-b border-outline-variant backdrop-blur">
        {/* ── Main nav bar — h-16 unified across all three shells ── */}
        <nav
          className="relative max-w-7xl mx-auto px-6 h-16 flex items-center"
          aria-label="Dashboard navigation"
        >
          {/* ── Left: Cat icon (fixed anchor) + desktop nav links ── */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Cat icon — links to dashboard root; icon only so the brand text
                can float independently to the horizontal centre. */}
            <UILink
              as={Link}
              to={ROUTES.DASHBOARD.ROOT}
              variant="unstyled"
              aria-label="Cat-Bot dashboard"
              className="flex items-center text-primary hover:opacity-80 transition-opacity duration-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-sm"
            >
              <Cat className="h-5 w-5" />
            </UILink>

            {/* Desktop nav links — inline with the icon group, hidden on mobile */}
            <div className="hidden md:flex items-center gap-1 ml-2">
              {navItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>

          {/* ── Centre: "Cat-Bot" brand text — absolutely centred in the nav ── */}
          {/* pointer-events-none on wrapper so it never occludes nav links or
              controls that share the same layer; inner Link restores events. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <Link
              to={ROUTES.DASHBOARD.ROOT}
              className="pointer-events-auto text-title-lg font-semibold text-primary hover:opacity-80 transition-opacity duration-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-sm"
            >
              Cat-Bot
            </Link>
          </div>

          {/* ── Right: Desktop — theme toggle + user dropdown (md+) ── */}
          {/* Theme toggle is the leading item in the navigation button section,
              directly preceding the UserMenu per the unified design system. */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <IconButton
              icon={theme === 'dark' ? <Sun /> : <Moon />}
              aria-label={
                theme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              variant="text"
              size="md"
              onClick={() => setTheme(toggleTheme(theme))}
            />
            <UserMenu />
          </div>

          {/* ── Right: Mobile — hamburger only (<md) ── */}
          {/* Theme toggle lives in the drawer alongside the nav buttons. */}
          <div className="flex md:hidden items-center ml-auto">
            <IconButton
              icon={mobileOpen ? <X /> : <Menu />}
              aria-label={
                mobileOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              variant="text"
              size="md"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
            />
          </div>
        </nav>

        {/* ── Mobile drawer ── */}
        {/* Part of the sticky header element so it scrolls with the sticky region. */}
        {mobileOpen && (
          <div
            role="navigation"
            aria-label="Mobile navigation"
            className={cn(
              'md:hidden border-t border-outline-variant bg-surface',
              '[animation:fade-in-down_150ms_var(--easing-standard-decelerate)_both]',
            )}
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col">
              {/* Nav links — full-width with large touch targets */}
              {navItems.map((item) => (
                <MobileNavLink
                  key={item.href}
                  item={item}
                  onClick={() => setMobileOpen(false)}
                />
              ))}

              {/* Separator before user section */}
              <div className="my-2 mx-4 border-t border-outline-variant" />

              {/* User identity row — display context before logout */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <User className="h-4 w-4 text-on-surface-variant" />
                </div>
                <p className="text-label-lg font-medium text-on-surface truncate">
                  {displayName}
                </p>
              </div>

              {/* Logout — destructive action gets error colour so intent is clear */}
              <button
                type="button"
                onClick={() => {
                  void handleMobileLogout()
                }}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-xl mb-1',
                  'text-body-md font-medium text-left text-error',
                  'transition-colors duration-fast',
                  'hover:bg-error/[var(--state-hover-opacity)]',
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Log out
              </button>

              {/* Separator before theme toggle */}
              <div className="my-2 mx-4 border-t border-outline-variant" />

              {/* Theme toggle — lives in the navigation button section on mobile */}
              <button
                type="button"
                onClick={() => {
                  setTheme(toggleTheme(theme))
                  setMobileOpen(false)
                }}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-xl',
                  'text-body-md font-medium text-left text-on-surface',
                  'transition-colors duration-fast',
                  'hover:bg-on-surface/[var(--state-hover-opacity)]',
                )}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 shrink-0 text-on-surface-variant" />
                ) : (
                  <Moon className="h-4 w-4 shrink-0 text-on-surface-variant" />
                )}
                {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── Page content rendered by child routes ── */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  )
}