import React from 'react'
import { Text } from 'ink'
import type { IntentCategory } from '../../types/index.js'

interface IntentBadgeProps {
  category: IntentCategory
  mirrored: boolean
}

export function IntentBadge({ category, mirrored }: IntentBadgeProps): JSX.Element {
  return (
    <Text>
      <Text backgroundColor={mirrored ? 'blue' : 'blackBright'} color="white">
        {` ${mirrored ? 'MIRRORING' : 'DIRECT'} `}
      </Text>
      <Text color="gray"> {category}</Text>
    </Text>
  )
}
