import React from 'react'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      className={
        'inline-flex items-center px-4 py-2 rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 ' +
        className
      }
      {...rest}
    >
      {children}
    </button>
  )
}

export default Button
