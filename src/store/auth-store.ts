import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  username: string
  password: string
  displayName?: string
  email?: string
}

interface AuthState {
  currentUser: AuthUser | null
  isAuthenticated: boolean
  isAuthRequired: boolean
  trustLocal: boolean
  users: AuthUser[]
  setUser: (user: AuthUser) => void
  logout: () => void
  login: (username: string, password: string) => Promise<boolean>
  registerUser: (user: AuthUser) => void
  updateConfig: (config: Partial<AuthState>) => void
  clearCredentials: () => void
}

const DEFAULT_USERS: AuthUser[] = [
  {
    username: 'admin',
    password: 'admin',
    displayName: 'Administrator',
    email: 'admin@d-rats.app',
  },
  {
    username: 'guest',
    password: 'guest',
    displayName: 'Guest User',
    email: 'guest@example.com',
  },
]

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      isAuthRequired: false,
      trustLocal: true,
      users: DEFAULT_USERS,

      setUser: (user) =>
        set({
          currentUser: user,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          currentUser: null,
          isAuthenticated: false,
        }),

      login: async (username: string, password: string) => {
        const { users } = get()
        const user = users.find(
          (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password,
        )

        if (user) {
          set({
            currentUser: user,
            isAuthenticated: true,
          })
          return true
        }

        return false
      },

      registerUser: (user: AuthUser) =>
        set((state) => ({
          users: [...state.users, user],
        })),

      updateConfig: (config: Partial<AuthState>) =>
        set((state) => ({ ...state, ...config })),

      clearCredentials: () =>
        set({
          currentUser: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'd-rats-auth',
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthRequired: state.isAuthRequired,
        trustLocal: state.trustLocal,
      }),
    },
  ),
)
