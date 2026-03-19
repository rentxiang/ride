import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

export function useUser() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return user
}