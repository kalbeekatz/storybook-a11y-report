import type { Meta, StoryObj } from '@storybook/react'

import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Example/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    backgroundColor: {
      control: 'color',
    },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Inaccessible: Story = {
  args: {
    primary: true,
    label: 'Button',
  },
}

export const Accessible: Story = {
  args: {
    label: 'Button',
  },
}

export const InaccessibleButIgnoreColorContrastRule: Story = {
  args: {
    primary: true,
    label: 'Button',
  },
  parameters: {
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: false,
          },
        ],
      },
    },
  },
}
