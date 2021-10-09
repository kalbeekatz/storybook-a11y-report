import React from 'react'

import { Button } from './Button'

export default {
  title: 'Example/Button',
  component: Button,
}

const Template = (args) => <Button {...args} />

export const Inaccessible = Template.bind({})
Inaccessible.args = {
  primary: true,
  label: 'Button',
}

export const Accessible = Template.bind({})
Accessible.args = {
  label: 'Button',
}

export const InaccessibleButIgnoreColorContrastRule = Template.bind({})
InaccessibleButIgnoreColorContrastRule.args = {
  primary: true,
  label: 'Button',
}
InaccessibleButIgnoreColorContrastRule.parameters = {
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
}
