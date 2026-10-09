import React, { useEffect } from 'react'
import { useStore } from './hooks/useStore'
import SetupWizard from './components/wizard/SetupWizard'
import MainPortal from './components/portal/MainPortal'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

export default function App() {
  const { state, act } = useStore()

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  // Sync URL when screen changes
  useEffect(() => {
    const path = window.location.pathname
    if (state.screen === 'login' && path !== '/') {
      window.history.replaceState({}, '', '/')
    } else if (state.screen === 'signup' && path !== '/signup') {
      window.history.replaceState({}, '', '/signup')
    } else if (state.screen === 'setup' && !path.startsWith('/setup')) {
      window.history.replaceState({}, '', `/setup/${state.step}`)
    } else if (state.screen === 'portal' && !path.startsWith('/portal')) {
      window.history.replaceState({}, '', '/portal')
    }
  }, [state.screen])

  // Handle browser back/forward at the screen level
  useEffect(() => {
    function onPopState() {
      const path = window.location.pathname
      if (path === '/' || path === '') {
        act('SET_SCREEN', { screen: 'login' })
      } else if (path.startsWith('/signup')) {
        act('SET_SCREEN', { screen: 'signup' })
      } else if (path.startsWith('/setup')) {
        const n = parseInt(path.split('/')[2], 10)
        // Only switch screen if we're not already on setup
        if (state.screen !== 'setup') act('SET_SCREEN', { screen: 'setup' })
        if (n >= 1 && n <= 5) act('SET_STEP', { step: n })
      } else if (path.startsWith('/portal')) {
        // Only switch screen if we're not already on portal
        // (tab/resource back/forward is handled inside SessionPanel's popstate)
        if (state.screen !== 'portal') act('SET_SCREEN', { screen: 'portal' })
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [act, state.screen])

  if (state.screen === 'login')  return <LoginPage  state={state} act={act} />
  if (state.screen === 'signup') return <SignupPage state={state} act={act} />
  if (state.screen === 'setup')  return <SetupWizard state={state} act={act} />
  return <MainPortal state={state} act={act} />
}
