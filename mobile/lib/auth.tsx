import * as SecureStore from "expo-secure-store"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { api, type User } from "./api"
import { clearCache } from "./cache"

const TOKEN_KEY = "reason_session_token"

type AuthContextValue = {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    SecureStore.getItemAsync(TOKEN_KEY)
      .then(async (storedToken) => {
        if (!storedToken) return
        const currentUser = await api.me(storedToken)
        if (!active) return
        tokenRef.current = storedToken
        setToken(storedToken)
        setUser(currentUser)
      })
      .catch(() => SecureStore.deleteItemAsync(TOKEN_KEY))
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const value: AuthContextValue = {
    user,
    token,
    loading,
    async login(email, password) {
      const response = await api.login({ email, password })
      await SecureStore.setItemAsync(TOKEN_KEY, response.token)
      tokenRef.current = response.token
      setToken(response.token)
      setUser(response.user)
    },
    async logout() {
      const currentToken = tokenRef.current
      await SecureStore.deleteItemAsync(TOKEN_KEY)
      await clearCache()
      tokenRef.current = null
      setToken(null)
      setUser(null)
      if (currentToken) await api.logout(currentToken).catch(() => undefined)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
