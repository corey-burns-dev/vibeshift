import { Navbar } from "@/components/Navbar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { routePrefetchMap } from "@/utils/prefetch";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Compass, Lock, MessageSquare, Moon } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import {
	Route,
	BrowserRouter as Router,
	Routes,
	useLocation,
} from "react-router-dom";

// Lazy load pages for code splitting
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const Posts = lazy(() => import("@/pages/Posts"));
const Chat = lazy(() => import("@/pages/Chat"));
const Profile = lazy(() => import("@/pages/Profile"));
const Friends = lazy(() => import("@/pages/Friends"));
const Messages = lazy(() => import("@/pages/Messages"));
const Users = lazy(() => import("@/pages/Users"));

// Loading component
function PageLoader() {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center">
			<div className="text-center">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
				<p className="text-muted-foreground">Loading...</p>
			</div>
		</div>
	);
}

// HomePage component (keeping it inline since it's lightweight)
function HomePage() {
	return (
		<div className="min-h-screen bg-background">
			<Navbar />
			{/* Hero Section */}
			<section className="max-w-6xl mx-auto px-4 py-20">
				<div className="text-center mb-16">
					<h1 className="text-5xl font-bold text-foreground mb-4">
						Welcome to Vibeshift
					</h1>
					<p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
						A modern full-stack application with a Go backend and React
						frontend, powered by TanStack Query and Tailwind CSS.
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
					<h2 className="text-3xl font-bold text-card-foreground mb-8">
						System Status
					</h2>
					<div className="grid md:grid-cols-3 gap-6">
						<div className="bg-card rounded-lg border p-6 shadow-sm">
							<h3 className="text-lg font-semibold mb-4">Features</h3>
							<ul className="space-y-3 text-muted-foreground">
								<li className="flex gap-2 items-center">
									<Check className="w-4 h-4 text-primary flex-shrink-0" />
									<span>Real-time health checks</span>
								</li>
								<li className="flex gap-2 items-center">
									<Check className="w-4 h-4 text-primary flex-shrink-0" />
									<span>Redis integration</span>
								</li>
								<li className="flex gap-2 items-center">
									<Check className="w-4 h-4 text-primary flex-shrink-0" />
									<span>PostgreSQL support</span>
								</li>
								<li className="flex gap-2 items-center">
									<Check className="w-4 h-4 text-primary flex-shrink-0" />
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
								<p className="flex items-center gap-2">
									<Compass className="w-4 h-4 text-primary flex-shrink-0" />
									<span>
										<strong>Posts:</strong> Browse and create posts
									</span>
								</p>
								<p className="flex items-center gap-2">
									<MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
									<span>
										<strong>Chat:</strong> Real-time messaging
									</span>
								</p>
								<p className="flex items-center gap-2">
									<Lock className="w-4 h-4 text-primary flex-shrink-0" />
									<span>
										<strong>Auth:</strong> Login/Signup system
									</span>
								</p>
								<p className="flex items-center gap-2">
									<Moon className="w-4 h-4 text-primary flex-shrink-0" />
									<span>
										<strong>Theme:</strong> Dark mode enabled
									</span>
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
	);
}

function RoutesWithPrefetch() {
	const location = useLocation();
	const queryClient = useQueryClient();

	useEffect(() => {
		const prefetchFn = routePrefetchMap[location.pathname];
		if (prefetchFn) {
			prefetchFn(queryClient).catch(console.error);
		}
	}, [location.pathname, queryClient]);

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
					path="/messages"
					element={
						<ProtectedRoute>
							<Messages />
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
			</Routes>
		</Suspense>
	);
}

export default function App() {
	return (
		<Router>
			<RoutesWithPrefetch />
		</Router>
	);
}
