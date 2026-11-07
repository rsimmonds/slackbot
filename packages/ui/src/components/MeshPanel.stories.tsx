import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { MeshPanel } from './MeshPanel';

const meta: Meta<typeof MeshPanel> = { title: 'Signature/Mesh Panel', component: MeshPanel };
export default meta;

export const Default: StoryObj<typeof MeshPanel> = {
  render: () => (
    <div className="max-w-md">
      <MeshPanel
        eyebrow="Mandate · draft"
        title="Chief Marketing Officer"
        actions={
          <Button size="sm" variant="secondary">
            Edit
          </Button>
        }
      >
        <p className="text-small text-text-2">
          Hover to reveal the grid underneath. Glass surface, hairline border, no shadow.
        </p>
      </MeshPanel>
    </div>
  ),
};
