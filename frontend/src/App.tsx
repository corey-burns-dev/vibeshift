import { useQueryClient } from '@tanstack/react-query'
import { Gamepad2, Radio, Users as UsersIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { BottomBar } from '@/components/BottomBar'
import { ChatDock } from '@/components/chat/ChatDock'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { GameCapsuleDock } from '@/components/games/GameCapsuleDock'
import { MobileHeader } from '@/components/MobileHeader'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { TopBar } from '@/components/TopBar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useIsAuthenticated, useSignup } from '@/hooks'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'
import { parseGameRoomPath } from '@/lib/game-routes'
import { cn } from '@/lib/utils'
import { ChatProvider } from '@/providers/ChatProvider'
import { routePrefetchMap } from '@/utils/prefetch'

const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const Posts = lazy(() => import('@/pages/Posts'))
const PostDetail = lazy(() => import('@/pages/PostDetail'))
const PostEdit = lazy(() => import('@/pages/PostEdit'))
const CreatePost = lazy(() => import('@/pages/CreatePost'))
const Profile = lazy(() => import('@/pages/Profile'))
const Friends = lazy(() => import('@/pages/Friends'))
const Chat = lazy(() => import('@/pages/Chat'))
const UsersPage = lazy(() => import('@/pages/Users'))
const UserProfilePage = lazy(() => import('@/pages/UserProfile'))
const Games = lazy(() => import('@/pages/Games'))
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
const Streams = lazy(() => import('@/pages/Streams'))
const Stream = lazy(() => import('@/pages/Stream'))
const VideoChat = lazy(() => import('@/pages/VideoChat'))
const Sanctums = lazy(() => import('@/pages/Sanctums'))
const SanctumDetail = lazy(() => import('@/pages/SanctumDetail'))
const SanctumRequestForm = lazy(() => import('@/pages/SanctumRequestForm'))
const MySanctumRequests = lazy(() => import('@/pages/MySanctumRequests'))
const AdminSanctumRequests = lazy(() => import('@/pages/AdminSanctumRequests'))
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'))
const AdminReports = lazy(() => import('@/pages/admin/AdminReports'))
const AdminBanRequests = lazy(() => import('@/pages/admin/AdminBanRequests'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('@/pages/admin/AdminUserDetail'))
const AdminRoomMutes = lazy(() => import('@/pages/admin/AdminRoomMutes'))
const AdminPlaceholder = lazy(() => import('@/pages/admin/AdminPlaceholder'))
const OnboardingSanctums = lazy(() => import('@/pages/OnboardingSanctums'))
const SanctumFeed = lazy(() => import('@/pages/SanctumFeed'))
const SearchPage = lazy(() => import('@/pages/Search'))

function PageLoader() {
  return (
    <div className='min-h-screen flex items-center justify-center bg-background'>
      <div className='text-center'>
        <div className='mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary'></div>
        <p className='text-muted-foreground'>Loading...</p>
      </div>
    </div>
  )
}

function HomePage() {
  const isAuthenticated = useIsAuthenticated()
  const signupMutation = useSignup()
  const [isQuickStarting, setIsQuickStarting] = useState(false)

  if (isAuthenticated) {
    return <Posts mode='all' />
  }

  function handleQuickStart() {
    const id = Math.random().toString(36).slice(2, 8)
    setIsQuickStarting(true)
    signupMutation.mutate(
      {
        username: `dev_${id}`,
        email: `dev_${id}@test.local`,
        password: `DevTest1_${id}`,
      },
      { onSettled: () => setIsQuickStarting(false) }
    )
  }

  const highlights = [
    {
      icon: UsersIcon,
      title: 'Built for real communities',
      description:
        'Move from post to chat to game room without switching platforms.',
    },
    {
      icon: Radio,
      title: 'Streaming where your friends are',
      description:
        'Jump into live channels while conversations stay connected.',
    },
    {
      icon: Gamepad2,
      title: 'Play-first social graph',
      description:
        'Invite friends directly into quick matches and shared lobbies.',
    },
  ]

  return (
    <div className='min-h-screen px-4 py-8 md:px-8 md:py-10'>
      <div className='mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]'>
        <section className='rounded-xl border border-border/70 bg-card p-6 md:p-8'>
          <p className='mb-2 inline-flex rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary'>
            Social Gaming Hub
          </p>
          <h1 className='mb-3 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl'>
            Sanctum keeps your people, play, and live moments in one place.
          </h1>
          <p className='max-w-2xl text-sm text-muted-foreground md:text-base'>
            Scroll, chat, and queue games from a single workspace. No tab maze,
            no context switching.
          </p>
          <div className='mt-6 flex flex-wrap items-center gap-2.5'>
            <Button size='lg' className='rounded-lg px-6' asChild>
              <Link to='/signup'>Get Started</Link>
            </Button>
            <Button
              size='lg'
              variant='outline'
              className='rounded-lg px-6'
              asChild
            >
              <Link to='/login'>Login</Link>
            </Button>
            <Button
              size='lg'
              variant='secondary'
              className='rounded-lg px-6'
              onClick={handleQuickStart}
              disabled={isQuickStarting}
            >
              {isQuickStarting ? 'Creating...' : 'Quick Start'}
            </Button>
          </div>
        </section>

        <section className='rounded-xl border border-border/70 bg-card p-6'>
          <h2 className='mb-2 text-lg font-bold text-foreground'>
            Quick Start
          </h2>
          <p className='mb-3 text-sm text-muted-foreground'>
            A cleaner flow for new users to get value fast.
          </p>
          <ol className='space-y-2 text-sm'>
            <li className='rounded-lg border border-border/60 bg-background p-3'>
              Create your profile and set your status.
            </li>
            <li className='rounded-lg border border-border/60 bg-background p-3'>
              Join a stream or hop into chatrooms.
            </li>
            <li className='rounded-lg border border-border/60 bg-background p-3'>
              Challenge friends in quick games.
            </li>
          </ol>
        </section>
      </div>

      <section className='mx-auto mt-5 grid max-w-6xl gap-4 md:grid-cols-3'>
        {highlights.map(item => (
          <article
            key={item.title}
            className='rounded-xl border border-border/70 bg-card p-5'
          >
            <item.icon className='mb-2 h-5 w-5 text-primary' />
            <h3 className='mb-1 text-base font-bold'>{item.title}</h3>
            <p className='text-sm text-muted-foreground'>{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

function RedirectMessagesToChat() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={id ? `/chat/${id}` : '/chat'} replace />
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
        <Route path='/' element={<HomePage />} />
        <Route path='/messages' element={<Navigate to='/chat' replace />} />
        <Route path='/messages/:id' element={<RedirectMessagesToChat />} />
        <Route path='/login' element={<Login />} />
        <Route path='/signup' element={<Signup />} />
        <Route path='/posts' element={<Navigate to='/' replace />} />
        <Route
          path='/feed'
          element={
            <ProtectedRoute>
              <Posts mode='membership' />
            </ProtectedRoute>
          }
        />
        <Route
          path='/submit'
          element={
            <ProtectedRoute>
              <CreatePost />
            </ProtectedRoute>
          }
        />
        <Route
          path='/posts/:id/edit'
          element={
            <ProtectedRoute>
              <PostEdit />
            </ProtectedRoute>
          }
        />
        <Route path='/posts/:id' element={<PostDetail />} />
        <Route
          path='/chat'
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path='/chat/:id'
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path='/profile'
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path='/friends'
          element={
            <ProtectedRoute>
              <Friends />
            </ProtectedRoute>
          }
        />
        <Route
          path='/users'
          element={
            <ProtectedRoute>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path='/users/:id'
          element={
            <ProtectedRoute>
              <UserProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games'
          element={
            <ProtectedRoute>
              <Games />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/connect4/:id'
          element={
            <ProtectedRoute>
              <ConnectFour />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/chess'
          element={
            <ProtectedRoute>
              <Chess />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/checkers'
          element={
            <ProtectedRoute>
              <Checkers />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/trivia'
          element={
            <ProtectedRoute>
              <Trivia />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/blackjack'
          element={
            <ProtectedRoute>
              <Blackjack />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/poker'
          element={
            <ProtectedRoute>
              <Poker />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/crazy-eights'
          element={
            <ProtectedRoute>
              <CrazyEights />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/hearts'
          element={
            <ProtectedRoute>
              <Hearts />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/president'
          element={
            <ProtectedRoute>
              <President />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/draw-guess'
          element={
            <ProtectedRoute>
              <DrawAndGuess />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/snake'
          element={
            <ProtectedRoute>
              <Snake />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/battleship/:id'
          element={
            <ProtectedRoute>
              <Battleship />
            </ProtectedRoute>
          }
        />
        <Route
          path='/games/othello/:id'
          element={
            <ProtectedRoute>
              <Othello />
            </ProtectedRoute>
          }
        />
        <Route
          path='/streams'
          element={
            <ProtectedRoute>
              <Streams />
            </ProtectedRoute>
          }
        />
        <Route
          path='/streams/:id'
          element={
            <ProtectedRoute>
              <Stream />
            </ProtectedRoute>
          }
        />
        <Route
          path='/videochat'
          element={
            <ProtectedRoute>
              <VideoChat />
            </ProtectedRoute>
          }
        />
        <Route
          path='/search'
          element={
            <ProtectedRoute>
              <SearchPage />
            </ProtectedRoute>
          }
        />
        <Route path='/sanctums' element={<Sanctums />} />
        <Route path='/s/:slug' element={<SanctumFeed />} />
        <Route path='/sanctums/:slug/manage' element={<SanctumDetail />} />
        <Route
          path='/sanctums/request'
          element={
            <ProtectedRoute>
              <SanctumRequestForm />
            </ProtectedRoute>
          }
        />
        <Route
          path='/sanctums/requests'
          element={
            <ProtectedRoute>
              <MySanctumRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path='/onboarding/sanctums'
          element={
            <ProtectedRoute>
              <OnboardingSanctums />
            </ProtectedRoute>
          }
        />
        <Route
          path='/admin'
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminOverview />} />
          <Route path='reports' element={<AdminReports />} />
          <Route
            path='reports/posts'
            element={<AdminReports fixedTargetType='post' />}
          />
          <Route
            path='reports/messages'
            element={<AdminReports fixedTargetType='message' />}
          />
          <Route
            path='reports/users'
            element={<AdminReports fixedTargetType='user' />}
          />
          <Route path='ban-requests' element={<AdminBanRequests />} />
          <Route path='users' element={<AdminUsers />} />
          <Route path='users/:id' element={<AdminUserDetail />} />
          <Route path='room-mutes' element={<AdminRoomMutes />} />
          <Route path='sanctum-requests' element={<AdminSanctumRequests />} />
          <Route
            path='user-lists'
            element={
              <AdminPlaceholder
                title='User Lists'
                description='Custom cohorts, trust tiers, and watchlists.'
              />
            }
          />
          <Route
            path='user-info'
            element={
              <AdminPlaceholder
                title='User Info'
                description='Cross-user lookup and quick moderation audit details.'
              />
            }
          />
          <Route
            path='feature-flags'
            element={
              <AdminPlaceholder
                title='Feature Flags'
                description='Global rollout controls and toggles.'
              />
            }
          />
        </Route>
        <Route
          path='*'
          element={
            <div className='min-h-screen flex items-center justify-center'>
              <div className='text-center'>
                <h1 className='text-4xl font-bold mb-2'>404</h1>
                <p className='text-muted-foreground mb-4'>Page not found</p>
                <Button asChild>
                  <Link to='/'>Go home</Link>
                </Button>
              </div>
            </div>
          }
        />
      </Routes>
    </Suspense>
  )
}

function MainLayout({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated()
  useRealtimeNotifications(isAuthenticated)
  const location = useLocation()
  const isChatRoute =
    location.pathname === '/chat' || location.pathname.startsWith('/chat/')
  const isGameRoomRoute = parseGameRoomPath(location.pathname) !== null
  const isViewportLockedRoute = isChatRoute || isGameRoomRoute

  return (
    <div
      className={cn(
        'relative flex w-full text-foreground',
        isAuthenticated && isViewportLockedRoute
          ? 'h-dvh overflow-hidden'
          : 'min-h-screen'
      )}
    >
      {isAuthenticated && <MobileHeader />}
      {isAuthenticated && <TopBar />}

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          isAuthenticated && isViewportLockedRoute
            ? 'overflow-hidden'
            : 'overflow-visible',
          isAuthenticated ? 'pb-20 pt-20 md:pb-0 md:pt-16' : 'pt-0'
        )}
      >
        <div
          className={cn(
            isAuthenticated && isViewportLockedRoute
              ? 'min-h-0 flex-1'
              : 'flex-1'
          )}
        >
          {children}
        </div>
      </div>

      {isAuthenticated && <BottomBar />}
      {isAuthenticated && <ChatDock />}
      {isAuthenticated && <GameCapsuleDock />}
    </div>
  )
}

export default function App() {
  return (
    <Router>
      <ChatProvider>
        <MainLayout>
          <ErrorBoundary>
            <RoutesWithPrefetch />
          </ErrorBoundary>
        </MainLayout>
        <Toaster />
      </ChatProvider>
    </Router>
  )
}
