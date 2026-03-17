import React from 'react'
import { Text } from 'ink'
import type { IntentCategory } from '../../types/index.js'

interface IntentBadgeProps {
  category: IntentCategory
  mirrored: boolean
}

const CATEGORY_COLOR: Record<IntentCategory, string> = {
  factual_lookup:   'green',
  math_computation: 'green',
  code_task:        'blue',
  conversational:   'blackBright',
  opinion_advice:   'magenta',
  analysis:         'yellow',
  interpretation:   'yellow',
  prediction:       'red',
}

const CATEGORY_LABEL: Record<IntentCategory, string> = {
  factual_lookup:   'FACTUAL',
  math_computation: 'MATH',
  code_task:        'CODE',
  conversational:   'CHAT',
  opinion_advice:   'OPINION',
  analysis:         'ANALYSIS',
  interpretation:   'INTERPRET',
  prediction:       'PREDICT',
}

export function IntentBadge({ category, mirrored }: IntentBadgeProps): JSX.Element {
  const color = CATEGORY_COLOR[category] ?? 'white'
  const label = CATEGORY_LABEL[category] ?? category.toUpperCase()
  return (
    <Text>
      <Text backgroundColor={mirrored ? color : 'blackBright'} color="white" bold>
        {` ${mirrored ? 'MIRROR' : 'DIRECT'} `}
      </Text>
      <Text color={color}>{` ${label}`}</Text>
    </Text>
  )
}
