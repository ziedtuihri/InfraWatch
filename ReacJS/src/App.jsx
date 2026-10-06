import React, { useEffect } from 'react'
import { useStore } from './hooks/useStore'
import SetupWizard from './components/wizard/SetupWizard'
import MainPortal  from './components/portal/MainPortal'
import LoginPage from './pages/LoginPage'

export default function App() {
  const { state, act } = useStore()

  // Apply theme to <html> element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  if (state.screen === 'login') {
    return <LoginPage state={state} act={act} />
  }

  return state.screen === 'setup'
    ? <SetupWizard state={state} act={act} />
    : <MainPortal  state={state} act={act} />
}
