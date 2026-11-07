import 'server-only';
import { cookies } from 'next/headers';
import type { ThemePreference } from '@cmobeat/ui';
import type { Area } from './areas';

export const THEME_COOKIE = 'cmob_theme';
export type Theme = 'lab' | 'retreat';

/** Lab (light) for public editorial pages, Retreat (dark) for the app and private areas. */
export const areaDefaultTheme = (area: Area): Theme => (area === 'public' ? 'lab' : 'retreat');

export async function themePreference(): Promise<ThemePreference> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === 'lab' || v === 'retreat' ? v : 'auto';
}

export async function resolveTheme(
  area: Area,
): Promise<{ theme: Theme; preference: ThemePreference }> {
  const preference = await themePreference();
  return { preference, theme: preference === 'auto' ? areaDefaultTheme(area) : preference };
}
