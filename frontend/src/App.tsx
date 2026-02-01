import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect } from 'react'
import { Link, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Sidebar } from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useIsAuthenticated } from '@/hooks'
import { routePrefetchMap } from '@/utils/prefetch'

const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const Posts = lazy(() => import('@/pages/Posts'))
const Profile = lazy(() => import('@/pages/Profile'))
const Friends = lazy(() => import('@/pages/Friends'))
const Messages = lazy(() => import('@/pages/Messages'))
const Chat = lazy(() => import('@/pages/Chat'))
const Users = lazy(() => import('@/pages/Users'))
const Games = lazy(() => import('@/pages/Games'))
const TicTacToe = lazy(() => import('@/pages/games/TicTacToe'))
const ConnectFour = lazy(() => import('@/pages/games/ConnectFour'))

const Chess = lazy(() => import('@/pages/games/Chess'))
const Checkers = lazy(() => import('@/pages/games/Checkers'))
const Trivia = lazy(() => import('@/pages/games/Trivia'))
const Blackjack = lazy(() => import('@/pages/games/Blackjack'))
const Poker = lazy(() => import('@/pages/games/Poker'))
const CrazyEights = lazy(() => import('@/pages/games/CrazyEights'))
const Hearts = lazy(() => import('@/pages/games/Hearts'))
const President = lazy(() => import('@/pages/games/President'))
const DrawAndGuess = lazy(() => import('@/pages/games/DrawAndGuess'))
const Snake = lazy(() => import('@/pages/games/Snake'))
const Battleship = lazy(() => import('@/pages/games/Battleship'))
const Othello = lazy(() => import('@/pages/games/Othello'))

function PageLoader() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading...</p>
            </div>
        </div>
    )
}

function HomePage() {
    const isAuthenticated = useIsAuthenticated()
    if (isAuthenticated) {
        return <Posts />
    }
    return (
        <div className="flex items-center justify-center min-h-screen px-4 bg-background">
            <div className="max-w-2xl text-center">
                <h1 className="text-6xl font-extrabold tracking-tight mb-4 bg-linear-to-tr from-primary to-primary/60 bg-clip-text text-transparent">
                    Vibeshift
                </h1>
                <p className="text-xl text-muted-foreground mb-8">
                    The next generation of social gaming and connection.
                </p>
                <div className="flex gap-4 justify-center">
                    <Button size="lg" asChild>
                        <Link to="/signup">Get Started</Link>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                        <Link to="/login">Login</Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}

function RoutesWithPrefetch() {
    const location = useLocation()
    const queryClient = useQueryClient()

    useEffect(() => {
        const prefetchFn = routePrefetchMap[location.pathname]
        if (prefetchFn) {
            prefetchFn(queryClient).catch(console.error)
        }
    }, [location.pathname, queryClient])

    return (
        <Suspense fallback={<PageLoader />}>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/posts" element={<Posts />} />
                <Route
                    path="/chat"
                    element={
                        <ProtectedRoute>
                            <Chat />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/chat/:id"
                    element={
                        <ProtectedRoute>
                            <Chat />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/messages"
                    element={
                        <ProtectedRoute>
                            <Messages />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/messages/:id"
                    element={
                        <ProtectedRoute>
                            <Messages />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute>
                            <Profile />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/friends"
                    element={
                        <ProtectedRoute>
                            <Friends />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/users"
                    element={
                        <ProtectedRoute>
                            <Users />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games"
                    element={
                        <ProtectedRoute>
                            <Games />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/tictactoe/:id"
                    element={
                        <ProtectedRoute>
                            <TicTacToe />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/connect4/:id"
                    element={
                        <ProtectedRoute>
                            <ConnectFour />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/chess"
                    element={
                        <ProtectedRoute>
                            <Chess />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/checkers"
                    element={
                        <ProtectedRoute>
                            <Checkers />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/trivia"
                    element={
                        <ProtectedRoute>
                            <Trivia />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/blackjack"
                    element={
                        <ProtectedRoute>
                            <Blackjack />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/poker"
                    element={
                        <ProtectedRoute>
                            <Poker />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/crazy-eights"
                    element={
                        <ProtectedRoute>
                            <CrazyEights />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/hearts"
                    element={
                        <ProtectedRoute>
                            <Hearts />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/president"
                    element={
                        <ProtectedRoute>
                            <President />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/draw-guess"
                    element={
                        <ProtectedRoute>
                            <DrawAndGuess />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/snake"
                    element={
                        <ProtectedRoute>
                            <Snake />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/battleship"
                    element={
                        <ProtectedRoute>
                            <Battleship />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/games/othello"
                    element={
                        <ProtectedRoute>
                            <Othello />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </Suspense>
    )
}

function MainLayout({ children }: { children: ReactNode }) {
    const isAuthenticated = useIsAuthenticated()
    return (
        <div className="flex h-screen w-screen bg-background text-foreground transition-all duration-300">
            {isAuthenticated && <Sidebar />}
            <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 overflow-hidden">
                {children}
            </div>
        </div>
    )
}

export default function App() {
    return (
        <Router>
            <MainLayout>
                <RoutesWithPrefetch />
            </MainLayout>
            <Toaster />
        </Router>
    )
}
