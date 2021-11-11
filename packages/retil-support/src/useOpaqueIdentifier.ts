import React from 'react'

// This can be removed once it stabilizes with types in React proper
export const useOpaqueIdentifier = ((React as any)
  .unstable_useOpaqueIdentifier || (React as any).useId) as () => any
