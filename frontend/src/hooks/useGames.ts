// Game hooks - using TanStack Query with the apiClient

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'

// Query keys
export const gameKeys = {
    all: ['games'] as const,
    rooms: () => [...gameKeys.all, 'rooms'] as const,
    roomsActive: () => [...gameKeys.rooms(), 'active'] as const,
    detail: (id: string) => [...gameKeys.rooms(), 'detail', id] as const,
}

// Get active game rooms
export function useActiveGameRooms(type = 'tictactoe') {
    return useQuery({
        queryKey: gameKeys.roomsActive(),
        queryFn: () => apiClient.getActiveGameRooms(type),
    })
}

// Get single game room
export function useGameRoom(id: string) {
    return useQuery({
        queryKey: gameKeys.detail(id),
        queryFn: () => apiClient.getGameRoom(Number(id)),
        enabled: !!id,
    })
}

// Create game room
export function useCreateGameRoom() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (type: string) => apiClient.createGameRoom(type),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: gameKeys.roomsActive() })
        },
    })
}
