import React from 'react'
import { useHealth } from './hooks/useHealth'

export default function App() {
  const { data, isLoading, refetch } = useHealth()

  return (
    <div className="app">
      <h1>Vibeshift</h1>
      <button onClick={() => refetch()} disabled={isLoading}>
        Refresh
      </button>
      <pre>{isLoading ? 'Loading...' : JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
