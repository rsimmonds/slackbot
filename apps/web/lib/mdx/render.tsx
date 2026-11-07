import 'server-only';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { mdxComponents } from './components';

/**
 * Renders editorial MDX on the server. Shared by public article pages and the editor preview,
 * so what the editor approves is exactly what readers see. JavaScript in MDX is blocked.
 */
export function Mdx({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={mdxComponents}
      options={{ blockJS: true, blockDangerousJS: true, mdxOptions: { format: 'mdx' } }}
    />
  );
}
