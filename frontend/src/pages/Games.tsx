import { Play, Trophy, Users } from 'lucide-react'
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameRoom } from '@/api/types'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { useActiveGameRooms, useCreateGameRoom } from '@/hooks/useGames'

export default function Games() {
    const navigate = useNavigate()

    const { data: activeRooms, isLoading } = useActiveGameRooms('tictactoe')
    const { mutate: createRoom, isPending } = useCreateGameRoom()
    const creatingRef = useRef(false)

    const handleCreateRoom = async () => {
        if (creatingRef.current || isPending) return
        creatingRef.current = true

        createRoom('tictactoe', {
            onSuccess: (room: GameRoom) => {
                creatingRef.current = false
                navigate(`/games/tictactoe/${room.id}`)
            },
            onError: () => {
                creatingRef.current = false
            },
        })
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-12">
                <div className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">Game Zone</h1>
                        <p className="text-muted-foreground">
                            Challenge your friends and earn VibePoints!
                        </p>
                    </div>
                    <Button
                        size="lg"
                        onClick={handleCreateRoom}
                        disabled={isPending}
                        className="gap-2"
                    >
                        <Play className="w-4 h-4" /> {isPending ? 'Creating...' : 'Create New Game'}
                    </Button>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {/* Tic Tac Toe Card */}
                    <div className="md:col-span-2">
                        <div className="bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="aspect-video bg-linear-to-br from-primary/20 to-purple-500/20 flex items-center justify-center border-b">
                                <span className="text-6xl font-bold tracking-tighter text-primary">
                                    TIC TAC TOE
                                </span>
                            </div>
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h2 className="text-2xl font-bold">Classic Tic-Tac-Toe</h2>
                                        <p className="text-muted-foreground">
                                            Traditional 3x3 multiplayer competition.
                                        </p>
                                    </div>
                                    <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                                        +10 VP per Win
                                    </div>
                                </div>

                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Available Games
                                </h3>

                                {isLoading ? (
                                    <div className="animate-pulse space-y-2">
                                        <div className="h-10 bg-muted rounded"></div>
                                        <div className="h-10 bg-muted rounded"></div>
                                    </div>
                                ) : activeRooms && activeRooms.length > 0 ? (
                                    <div className="space-y-2">
                                        {activeRooms.map((room: GameRoom) => (
                                            <div
                                                key={room.id}
                                                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
                                            >
                                                <span className="font-medium">
                                                    {room.creator.username}'s Room
                                                </span>
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        navigate(`/games/tictactoe/${room.id}`)
                                                    }
                                                >
                                                    Join
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/10">
                                        <p className="text-muted-foreground">
                                            No active games. Start one!
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Stats/Leaderboard Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-card border rounded-xl p-6 shadow-sm">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-yellow-500" /> Your Stats
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-muted/30 p-4 rounded-lg text-center">
                                    <div className="text-2xl font-bold">--</div>
                                    <div className="text-xs text-muted-foreground uppercase">
                                        Wins
                                    </div>
                                </div>
                                <div className="bg-muted/30 p-4 rounded-lg text-center">
                                    <div className="text-2xl font-bold">--</div>
                                    <div className="text-xs text-muted-foreground uppercase">
                                        Points
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-linear-to-br from-indigo-600 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                            <h3 className="font-bold mb-2 uppercase text-xs tracking-wider opacity-80">
                                Pro Tip
                            </h3>
                            <p className="text-sm font-medium">
                                Winning 5 matches in a row unlocks the "Vibe Master" badge! (Coming
                                Soon)
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
