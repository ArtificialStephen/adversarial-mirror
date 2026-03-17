import React from 'react'
import { Text } from 'ink'
import type { IntentCategory } from '../../types/index.js'

interface IntentBadgeProps {
  category: IntentCategory
  mirrored: boolean
  confidence?: number
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

export function IntentBadge({ category, mirrored, confidence }: IntentBadgeProps): JSX.Element {
  const color = CATEGORY_COLOR[category] ?? 'white'
  const label = CATEGORY_LABEL[category] ?? category.toUpperCase()
  const modeIcon = mirrored ? '⇄' : '→'
  const modeLabel = mirrored ? 'MIRROR' : 'DIRECT'
  const modeColor = mirrored ? 'magenta' : 'green'
  const pct = confidence !== undefined ? `  ${Math.round(confidence * 100)}%` : ''

  return (
    <Text>
      <Text bold color={modeColor}>{modeIcon} {modeLabel}</Text>
      <Text color={color}>  {label}</Text>
      <Text dimColor color="blackBright">{pct}</Text>
    </Text>
  )
}
