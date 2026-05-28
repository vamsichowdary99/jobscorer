'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { syncPrimaryResumeIdFromDb } from '@/lib/api'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type AuthContextType = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  // getUser() and onAuthStateChange both resolve on mount; without this guard
  // they each fire syncPrimaryResumeIdFromDb and we send two identical
  // `resumes is_primary=true` queries to Supabase per page load.
  const lastSyncedUserId = useRef<string | null>(null)
  const syncPrimaryOnce = (u: User) => {
    if (lastSyncedUserId.current === u.id) return
    lastSyncedUserId.current = u.id
    void syncPrimaryResumeIdFromDb(u.id)
  }

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        setUser(user)
        setLoading(false)
        // Mirror the user's DB-stored primary resume into localStorage so
        // pages that read the sync cache (search, matches, research) see it
        // even on a fresh browser or after a session was reset.
        if (user) syncPrimaryOnce(user)
      })
      .catch((err) => {
        // Supabase uses navigator.locks to coordinate auth across tabs/HMR.
        // When another request steals the lock, the in-flight one aborts —
        // benign because onAuthStateChange fires with the latest session.
        if (err?.name === 'AbortError' || /Lock/.test(err?.message ?? '')) {
          setLoading(false)
          return
        }
        throw err
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null
        setUser(u)
        setLoading(false)
        if (u) syncPrimaryOnce(u)
        else lastSyncedUserId.current = null
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
