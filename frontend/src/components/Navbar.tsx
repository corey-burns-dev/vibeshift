import ModeToggle from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

export function Navbar() {
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-2xl font-bold text-primary">
            Vibeshift
          </Link>
          <div className="hidden md:flex gap-6">
            <Link
              to="/posts"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Posts
            </Link>
            <Link
              to="/chat"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Chat
            </Link>
            <Link
              to="/profile"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Profile
            </Link>
            <Link
              to="/friends"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Friends
            </Link>
            <Link
              to="/messages"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Messages
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Sign Up</Link>
            </Button>
          </div>
          <ModeToggle />
        </div>
      </div>
    </nav>
  )
}
