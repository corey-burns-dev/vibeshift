import { useState } from 'react'

export function PostCaption({
  title,
  content,
  username,
}: {
  title?: string
  content: string
  username?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const maxLength = 120
  const shouldTruncate = content.length > maxLength

  return (
    <div className='space-y-1 text-sm'>
      {username && (
        <span className='font-bold mr-2 hover:underline cursor-pointer'>
          {username}
        </span>
      )}

      {title && <span className='font-bold mr-2'>{title}</span>}

      <span>
        {shouldTruncate && !isExpanded
          ? `${content.slice(0, maxLength)}...`
          : content}
      </span>

      {shouldTruncate && (
        <button
          type='button'
          onClick={event => {
            event.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
          className='text-muted-foreground ml-1 hover:text-foreground font-medium'
        >
          {isExpanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  )
}
