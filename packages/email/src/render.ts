import { render } from '@react-email/render';
import type { ReactElement } from 'react';

/** Renders a React Email element to the html + plain-text pair every send needs. */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
