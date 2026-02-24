import React from 'react'
import { Text } from 'ink'
import type { IntentCategory } from '../../types/index.js'

interface IntentBadgeProps {
  category: IntentCategory
  mirrored: boolean
}

export function IntentBadge({ category, mirrored }: IntentBadgeProps): JSX.Element {
  const label = mirrored ? 'MIRRORING' : 'DIRECT'
  return <Text>[{label}] {category}</Text>
}
