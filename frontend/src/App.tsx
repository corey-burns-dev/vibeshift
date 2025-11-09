import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import Chat from '@/pages/Chat'
import Friends from '@/pages/Friends'
import Login from '@/pages/Login'
import Messages from '@/pages/Messages'
import Posts from '@/pages/Posts'
import Profile from '@/pages/Profile'
import Signup from '@/pages/Signup'
import Users from '@/pages/Users'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-foreground mb-4">Welcome to Vibeshift</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            A modern full-stack application with a Go backend and React frontend, powered by
            TanStack Query and Tailwind CSS.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button size="lg">Get Started</Button>
            <Button size="lg" variant="outline">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Status Section */}
      <section id="status" className="bg-card py-16 border-t">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-card-foreground mb-8">System Status</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-card rounded-lg border p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Features</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Real-time health checks</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Redis integration</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>PostgreSQL support</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Modern UI with Tailwind</span>
                </li>
              </ul>
            </div>
            <div className="bg-card rounded-lg border p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Stack</h3>
              <div className="space-y-2 text-muted-foreground text-sm">
                <p>
                  <strong>Frontend:</strong> React 19, TypeScript, Vite
                </p>
                <p>
                  <strong>Styling:</strong> Tailwind CSS, shadcn/ui
                </p>
                <p>
                  <strong>Data:</strong> TanStack Query
                </p>
                <p>
                  <strong>Backend:</strong> Go, Redis, PostgreSQL
                </p>
              </div>
            </div>
            <div className="bg-card rounded-lg border p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Navigation</h3>
              <div className="space-y-2 text-muted-foreground text-sm">
                <p>
                  🧭 <strong>Posts:</strong> Browse and create posts
                </p>
                <p>
                  💬 <strong>Chat:</strong> Real-time messaging
                </p>
                <p>
                  🔐 <strong>Auth:</strong> Login/Signup system
                </p>
                <p>
                  🌙 <strong>Theme:</strong> Dark mode enabled
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/50 text-muted-foreground py-8 border-t">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p>© 2025 Vibeshift. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/posts" element={<Posts />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/users" element={<Users />} />
      </Routes>
    </Router>
  )
}
