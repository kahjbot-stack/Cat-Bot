import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Cat, Moon, Sun, Menu, X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { toggleTheme } from '@/utils/theme.util'
import Button from '@/components/ui/buttons/Button'
import IconButton from '@/components/ui/buttons/IconButton'
import UILink from '@/components/ui/typography/Link'
import { cn } from '@/utils/cn.util'
import { useUserAuth } from '@/contexts/UserAuthContext'
import { ROUTES } from '@/constants/routes.constants'

/**
 * Public shell rendered on marketing and auth routes (/, /login, /signup).
 *
 * Kept separate from DashboardLayout so authenticated operators see only
 * the dashboard chrome — no public nav leaks through via nesting.
 *
 * Header structure (unified with DashboardLayout — both share h-16):
 *  - Left:   Cat icon logo (fixed, links to home)
 *  - Centre: "Cat-Bot" text absolutely centred in the nav container
 *  - Right:  Auth buttons + theme toggle (desktop) | hamburger → drawer (mobile)
 *
 * The theme toggle is co-located with the navigation button section on every
 * breakpoint: trailing position on desktop, inside the mobile drawer.
 */
export default function Layout() {
  const { theme, setTheme } = useTheme()
  const location = useLocation()
  const { isAuthenticated } = useUserAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [prevPath, setPrevPath] = useState(location.pathname)

  const isLogin = location.pathname === '/login'
  const isSignup = location.pathname === '/signup'

  // Collapse the mobile drawer on route change (during render to avoid cascading updates).
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname)
    setMobileOpen(false)
  }

  // Keyboard accessibility — Escape dismisses the menu per ARIA modal pattern.
  useEffect(() => {
    if (!mobileOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mobileOpen])

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface">
      {/* ── Header ── */}
      <header className="sticky top-0 z-fixed bg-surface/80 backdrop-blur border-b border-outline-variant">
        {/* ── Main nav bar — h-16 matches DashboardLayout and AdminSidebarLayout ── */}
        <nav
          className="relative max-w-6xl mx-auto px-6 h-16 flex items-center"
          aria-label="Main navigation"
        >
          {/* ── Left: Cat icon — fixed to the leading edge ── */}
          <UILink
            as={Link}
            to="/"
            variant="unstyled"
            aria-label="Cat-Bot home"
            className="flex items-center text-primary hover:opacity-80 transition-opacity duration-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-sm shrink-0"
          >
            <Cat className="h-5 w-5" />
          </UILink>

          {/* ── Centre: "Cat-Bot" brand text — absolutely centred within the nav ── */}
          {/* pointer-events-none on the wrapper so it never blocks clicks on controls
              sitting at the same z-plane; the inner Link restores pointer events. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <Link
              to="/"
              className="pointer-events-auto text-title-lg font-semibold text-primary hover:opacity-80 transition-opacity duration-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-sm"
            >
              Cat-Bot
            </Link>
          </div>

          {/* ── Right: Desktop controls — auth buttons then theme toggle (md+) ── */}
          {/* Theme toggle is the trailing item so it anchors the right edge of
              the navigation button group on every desktop breakpoint. */}
          <div className="hidden md:flex items-center gap-3 ml-auto">
            {isAuthenticated ? (
              <Button
                as={Link}
                to={ROUTES.DASHBOARD.ROOT}
                variant="filled"
                color="primary"
                size="sm"
              >
                Go to Dashboard
              </Button>
            ) : (
              <>
                {/* Tonal/outline variant on the active auth link signals "current page" */}
                <Button
                  as={Link}
                  to="/login"
                  variant={isLogin ? 'tonal' : 'outline'}
                  color="primary"
                  size="sm"
                >
                  Log in
                </Button>

                {/* Filled for maximum visual weight on the primary acquisition CTA */}
                <Button
                  as={Link}
                  to="/signup"
                  variant={isSignup ? 'tonal' : 'filled'}
                  color="primary"
                  size="sm"
                >
                  Sign up
                </Button>
              </>
            )}

            {/* Theme toggle — trailing position in the navigation button section */}
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
          </div>

          {/* ── Right: Mobile — hamburger only (<md) ── */}
          {/* Theme toggle is inside the mobile drawer so it stays co-located
              with the navigation buttons on every screen size. */}
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

        {/* ── Mobile dropdown drawer ── */}
        {/* Rendered inside <header> so it participates in the sticky region
            and never floats over page content as the user scrolls. */}
        {mobileOpen && (
          <div
            role="navigation"
            aria-label="Mobile navigation"
            className={cn(
              'md:hidden border-t border-outline-variant bg-surface/95 backdrop-blur',
              '[animation:fade-in-down_150ms_var(--easing-standard-decelerate)_both]',
            )}
          >
            <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3">
              {/* Full-width buttons give generous touch targets on narrow viewports */}
              {isAuthenticated ? (
                <Button
                  as={Link}
                  to={ROUTES.DASHBOARD.ROOT}
                  variant="filled"
                  color="primary"
                  size="md"
                  className="w-full justify-center"
                >
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button
                    as={Link}
                    to="/login"
                    variant={isLogin ? 'tonal' : 'outline'}
                    color="primary"
                    size="md"
                    className="w-full justify-center"
                  >
                    Log in
                  </Button>
                  <Button
                    as={Link}
                    to="/signup"
                    variant={isSignup ? 'tonal' : 'filled'}
                    color="primary"
                    size="md"
                    className="w-full justify-center"
                  >
                    Sign up
                  </Button>
                </>
              )}

              {/* Separator before theme toggle — maintains visual rhythm */}
              <div className="border-t border-outline-variant" />

              {/* Theme toggle — full-width row item inside the navigation section */}
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

      {/* ── Page content ── */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}