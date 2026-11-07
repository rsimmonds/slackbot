import type { Viewer } from '../auth';

export type EditorialErrorCode = 'forbidden' | 'not_found' | 'conflict' | 'invalid';

/** Expected failures in editorial actions, mapped to HTTP status by the API and to messages by the UI. */
export class EditorialError extends Error {
  constructor(
    readonly code: EditorialErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EditorialError';
  }
}

export const httpStatus: Record<EditorialErrorCode, number> = {
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 422,
};

export const isEditorial = (viewer: Pick<Viewer, 'roles'> | null | undefined) =>
  !!viewer && (viewer.roles.includes('editor') || viewer.roles.includes('admin'));

/** App-level check. Postgres RLS (app.is_editorial) is the second wall. */
export function requireEditorial(viewer: Viewer | null): asserts viewer is Viewer {
  if (!isEditorial(viewer)) throw new EditorialError('forbidden', 'Editorial is for editors.');
}
