import React from 'react'
import { Box, Text } from 'ink'

interface BrainPanelProps {
  title: string
  children?: React.ReactNode
  /** Outer column width including border + padding. */
  width?: number
  marginRight?: number
  /** Box border color. Defaults to 'blackBright' (neutral gray). */
  borderColor?: string
  /** Title text color. Defaults to borderColor. */
  titleColor?: string
  /** Border drawing style. Defaults to 'single'. */
  borderStyle?: 'single' | 'bold' | 'round' | 'double' | 'classic'
}

export function BrainPanel({
  title,
  children,
  width,
  marginRight,
  borderColor = 'blackBright',
  titleColor,
  borderStyle = 'single',
}: BrainPanelProps): JSX.Element {
  const resolvedTitleColor = titleColor ?? borderColor
  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      padding={1}
      flexGrow={width ? 0 : 1}
      flexShrink={1}
      minWidth={0}
      width={width}
      marginRight={marginRight}
    >
      <Text bold color={resolvedTitleColor}>{title}</Text>
      {children}
    </Box>
  )
}
