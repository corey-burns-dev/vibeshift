import { useQuery } from '@tanstack/react-query';
import { Gamepad2, Layers, Spade, Trophy, UserCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const GAME_CATEGORIES = [
	{
		name: 'Classic Board Games',
		icon: <Layers className="w-5 h-5 text-blue-500" />,
		games: [
			{
				id: 'tictactoe',
				name: 'Tic-Tac-Toe',
				description: '3x3 Strategy',
				reward: '+10 VP',
				color: 'primary',
			},
			{
				id: 'connect4',
				name: 'Connect Four',
				description: '7x6 Gravity Match',
				reward: '+15 VP',
				color: 'blue',
			},
			{
				id: 'chess',
				name: 'Chess',
				description: 'The Grandmaster Challenge',
				reward: '+50 VP',
				status: 'coming-soon',
			},
			{
				id: 'checkers',
				name: 'Checkers',
				description: 'Classic Jumps',
				reward: '+20 VP',
				status: 'coming-soon',
			},
			{
				id: 'othello',
				name: 'Othello',
				description: 'Reversi Strategy',
				reward: '+25 VP',
				status: 'coming-soon',
			},
			{
				id: 'battleship',
				name: 'Battleship',
				description: 'Naval Warfare',
				reward: '+30 VP',
				status: 'coming-soon',
			},
		],
	},
	{
		name: 'Card Games',
		icon: <Spade className="w-5 h-5 text-red-500" />,
		games: [
			{
				id: 'blackjack',
				name: 'Blackjack',
				description: 'Beat the Dealer',
				reward: 'Variable',
				status: 'coming-soon',
			},
			{
				id: 'poker',
				name: 'Poker',
				description: 'Holdem & More',
				reward: 'High Stakes',
				status: 'coming-soon',
			},
			{
				id: 'crazy-eights',
				name: 'Crazy Eights',
				description: 'Fast Card Action',
				reward: '+15 VP',
				status: 'coming-soon',
			},
			{
				id: 'hearts',
				name: 'Hearts',
				description: 'Avoid the Queen',
				reward: '+20 VP',
				status: 'coming-soon',
			},
			{
				id: 'president',
				name: 'President',
				description: 'Climb the Hierarchy',
				reward: '+20 VP',
				status: 'coming-soon',
			},
		],
	},
	{
		name: 'Social & Arcades',
		icon: <Gamepad2 className="w-5 h-5 text-purple-500" />,
		games: [
			{
				id: 'trivia',
				name: 'Trivia',
				description: 'Test Your Knowledge',
				reward: '+10/Question',
				status: 'coming-soon',
			},
			{
				id: 'draw-guess',
				name: 'Draw & Guess',
				description: 'Pictionary Style',
				reward: '+15 VP',
				status: 'coming-soon',
			},
			{
				id: 'snake',
				name: 'Snake',
				description: 'High Score Chase',
				reward: '1 VP/Length',
				status: 'coming-soon',
			},
		],
	},
];

export default function Games() {
	const navigate = useNavigate();

	const { data: activeRooms, isLoading } = useQuery({
		queryKey: ['gameRooms', 'active'],
		queryFn: () => apiClient.getActiveGameRooms(),
	});

	const createRoom = async (type: string) => {
		if (type === 'tictactoe' || type === 'connect4') {
			try {
				const room = await apiClient.createGameRoom(type);
				navigate(`/games/${type}/${room.id}`);
			} catch (err) {
				console.error('Failed to create room', err);
			}
		} else {
			const routeMap: Record<string, string> = {
				chess: '/games/chess',
				checkers: '/games/checkers',
				trivia: '/games/trivia',
				blackjack: '/games/blackjack',
				poker: '/games/poker',
				'crazy-eights': '/games/crazy-eights',
				hearts: '/games/hearts',
				president: '/games/president',
				'draw-guess': '/games/draw-guess',
				snake: '/games/snake',
				battleship: '/games/battleship',
				othello: '/games/othello',
			};
			navigate(routeMap[type] || '/games');
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<Navbar />
			<main className="max-w-7xl mx-auto px-4 py-12">
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
					<div>
						<h1 className="text-4xl font-black italic uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
							<Gamepad2 className="w-10 h-10 text-primary" />
							Vibe Arcade
						</h1>
						<p className="text-muted-foreground font-medium">
							Global Multiplayer & Competitive Leaderboards
						</p>
					</div>
					<div className="flex gap-4">
						<Button
							size="lg"
							variant="outline"
							className="gap-2 border-primary text-primary font-bold"
						>
							<Trophy className="w-4 h-4" /> Leaderboards
						</Button>
					</div>
				</div>

				<div className="grid lg:grid-cols-4 gap-8">
					<div className="lg:col-span-3 space-y-12">
						{GAME_CATEGORIES.map((category, idx) => (
							<div
								key={idx}
								className="space-y-6"
							>
								<div className="flex items-center gap-2 border-b pb-2">
									{category.icon}
									<h2 className="text-xl font-bold uppercase tracking-tight">{category.name}</h2>
								</div>
								<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
									{category.games.map(game => (
										<Card
											key={game.id}
											className={`group overflow-hidden border-2 transition-all hover:scale-[1.02] hover:shadow-xl ${game.status === 'coming-soon' ? 'opacity-70 grayscale-[0.5]' : 'border-primary/20 hover:border-primary'}`}
										>
											<CardContent className="p-0">
												<div
													className={`h-32 flex items-center justify-center relative bg-muted/30 overflow-hidden`}
												>
													<span className="text-3xl font-black italic tracking-tighter opacity-10 group-hover:opacity-20 transition-opacity uppercase select-none">
														{game.name}
													</span>
													{game.status === 'coming-soon' ? (
														<div className="absolute top-2 right-2 px-2 py-0.5 bg-muted text-[10px] font-black uppercase rounded border">
															Planned
														</div>
													) : (
														<div className="absolute top-2 right-2 px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-black uppercase rounded">
															Live
														</div>
													)}
												</div>
												<div className="p-5">
													<div className="flex justify-between items-start mb-2">
														<h3 className="font-bold text-lg">{game.name}</h3>
														<span className="text-[10px] font-black text-primary px-2 py-0.5 bg-primary/10 rounded-full">
															{game.reward}
														</span>
													</div>
													<p className="text-sm text-muted-foreground mb-5 h-10 line-clamp-2">
														{game.description}
													</p>
													<Button
														className="w-full font-bold uppercase italic tracking-wider text-xs"
														variant={game.status === 'coming-soon' ? 'secondary' : 'default'}
														onClick={() => createRoom(game.id)}
													>
														{game.status === 'coming-soon' ? 'Preview' : 'Play Now'}
													</Button>
												</div>
											</CardContent>
										</Card>
									))}
								</div>
							</div>
						))}
					</div>

					<div className="space-y-8">
						<section className="bg-card border-2 rounded-2xl p-6 shadow-sm">
							<h3 className="text-xl font-black uppercase italic tracking-tighter mb-6 flex items-center gap-2">
								<Users className="w-5 h-5 text-primary" /> Active Hubs
							</h3>
							{isLoading ? (
								<div className="space-y-4">
									{[1, 2, 3].map(i => (
										<div
											key={i}
											className="h-12 bg-muted animate-pulse rounded-xl"
										/>
									))}
								</div>
							) : activeRooms?.length > 0 ? (
								<div className="space-y-3">
									{activeRooms.map((room: any) => (
										<div
											key={room.id}
											className="flex items-center justify-between p-3 bg-muted/20 border rounded-xl hover:bg-muted/30 transition-colors"
										>
											<div className="flex flex-col">
												<span className="text-xs font-black uppercase tracking-tighter text-primary">
													{room.type}
												</span>
												<span className="text-sm font-bold truncate max-w-[120px]">
													{room.creator.username}'s Room
												</span>
											</div>
											<Button
												size="sm"
												variant="ghost"
												className="h-8 text-[10px] font-black uppercase"
												onClick={() => navigate(`/games/${room.type}/${room.id}`)}
											>
												Join
											</Button>
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-10 border-2 border-dashed rounded-2xl">
									<p className="text-xs font-bold text-muted-foreground uppercase opacity-50">
										No Active Rooms
									</p>
								</div>
							)}
						</section>

						<section className="bg-primary text-primary-foreground rounded-2xl p-6 shadow-lg shadow-primary/20 relative overflow-hidden">
							<div className="relative z-10">
								<h3 className="text-lg font-black uppercase italic tracking-tighter mb-4 flex items-center gap-2">
									<UserCircle className="w-5 h-5" /> Your Identity
								</h3>
								<div className="space-y-4">
									<div className="flex justify-between items-center bg-white/10 p-3 rounded-xl">
										<span className="text-xs font-bold uppercase opacity-80">Rank</span>
										<span className="font-black italic text-xl">#42</span>
									</div>
									<div className="flex justify-between items-center bg-white/10 p-3 rounded-xl">
										<span className="text-xs font-bold uppercase opacity-80">VibePoints</span>
										<span className="font-black italic text-xl">1,250</span>
									</div>
								</div>
							</div>
							<div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/5 rounded-full" />
						</section>
					</div>
				</div>
			</main>
		</div>
	);
}
