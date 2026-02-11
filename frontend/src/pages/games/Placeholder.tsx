import { ArrowLeft, Construction } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function GamePlaceholder({ title }: { title: string }) {
  const navigate = useNavigate()

  return (
    <div className='min-h-screen bg-background'>
      <div className='max-w-4xl mx-auto px-4 py-12'>
        <Button
          variant='ghost'
          onClick={() => navigate('/games')}
          className='mb-8 gap-2'
        >
          <ArrowLeft className='w-4 h-4' /> Back to Games
        </Button>

        <Card className='border-2 border-dashed bg-muted/30'>
          <CardHeader className='text-center pb-8 border-b border-dashed'>
            <div className='w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6'>
              <Construction className='w-10 h-10 text-primary animate-pulse' />
            </div>
            <CardTitle className='text-4xl font-bold tracking-tight uppercase italic text-primary'>
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent className='py-12 text-center'>
            <h2 className='text-2xl font-bold mb-4'>Coming Soon!</h2>
            <p className='text-muted-foreground max-w-md mx-auto mb-8'>
              We're currently building the {title} experience. This feature will
              include real-time matchmaking, live chat, and a competitive
              ranking system.
            </p>
            <div className='flex justify-center gap-4'>
              <div className='w-12 h-1 bg-primary/20 rounded-full' />
              <div className='w-12 h-1 bg-primary rounded-full' />
              <div className='w-12 h-1 bg-primary/20 rounded-full' />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
