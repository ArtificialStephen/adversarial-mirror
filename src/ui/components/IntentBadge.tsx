import React from 'react'
import { Text } from 'ink'
import type { IntentCategory } from '../../types/index.js'

interface IntentBadgeProps {
  category: IntentCategory
  mirrored: boolean
  confidence?: number
}

const CATEGORY_COLOR: Record<IntentCategory, string> = {
  factual_lookup:   '#a6e3a1',  // pastel green
  math_computation: '#a6e3a1',  // pastel green
  code_task:        '#89b4fa',  // pastel blue
  conversational:   '#6c7086',  // muted gray
  opinion_advice:   '#cba6f7',  // pastel lavender
  analysis:         '#f9e2af',  // pastel amber
  interpretation:   '#f9e2af',  // pastel amber
  prediction:       '#f38ba8',  // pastel rose
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
  const modeColor = mirrored ? '#cba6f7' : '#a6e3a1'
  const pct = confidence !== undefined ? `  ${Math.round(confidence * 100)}%` : ''

  return (
    <Text>
      <Text bold color={modeColor}>{modeIcon} {modeLabel}</Text>
      <Text color={color}>  {label}</Text>
      <Text dimColor color="blackBright">{pct}</Text>
    </Text>
  )
}
