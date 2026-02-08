import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthLayoutProps {
    title: string
    description: string
    children: ReactNode
}

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
    return (
        <div className="flex items-center justify-center min-h-screen px-4 py-8 bg-background">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl text-center">{title}</CardTitle>
                    <CardDescription className="text-center">{description}</CardDescription>
                </CardHeader>
                <CardContent>{children}</CardContent>
            </Card>
        </div>
    )
}
