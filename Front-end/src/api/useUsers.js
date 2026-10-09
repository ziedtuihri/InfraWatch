/**
 * useUsers — React hook
 * ---------------------
 * Fetches Morpheus users for the RBAC tab.
 * Falls back to mock data when VITE_USE_LIVE_DATA=false.
 */
import { useState, useEffect } from 'react'
import { fetchUsers, USE_LIVE } from './morpheus'
import { RBAC_USERS } from '../data'

export function useUsers() {
  const [users,   setUsers]   = useState(RBAC_USERS)
  const [loading, setLoading] = useState(USE_LIVE)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!USE_LIVE) return

    setLoading(true)
    fetchUsers()
      .then(data => {
        setUsers(data.length ? data : RBAC_USERS)
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        console.error('[InfraWatch] fetchUsers failed:', err)
        setError(err.message)
        setUsers(RBAC_USERS)
        setLoading(false)
      })
  }, [])

  return { users, loading, error }
}
