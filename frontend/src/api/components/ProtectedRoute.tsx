import { Navigate, useLocation } from 'react-router-dom'
import { useIsAuthenticated, useValidateToken } from '@/hooks/useUsers'

interface ProtectedRouteProps {
    children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const isAuthenticated = useIsAuthenticated()
    const { data: tokenValid, isLoading } = useValidateToken()
    const location = useLocation()

    // Show loading while validating token
    if (isLoading && isAuthenticated) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Validating session...</p>
                </div>
            </div>
        )
    }

    // If not authenticated or token is invalid, redirect to login
    if (!isAuthenticated || tokenValid === false) {
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    return <>{children}</>
}
