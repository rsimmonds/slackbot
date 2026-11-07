import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';
import './storybook.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    a11y: { test: 'error' },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { Retreat: 'retreat', Lab: 'lab' },
      defaultTheme: 'Retreat',
      attributeName: 'data-theme',
      parentSelector: 'html',
    }),
  ],
};
export default preview;
