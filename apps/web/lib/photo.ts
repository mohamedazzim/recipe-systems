import { API_BASE_URL } from '@/lib/api';

/** `s3://<bucket>/<key>` → a browser-loadable URL. In production this points at
 *  the authorized/expiring asset URL service (ADR §5); in dev it is MinIO.
 *  Used by the cook log's plate photo. */
export function photoUrl(uri: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (match) {
    const base = process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? 'http://localhost:9000';
    return `${base.replace(/\/$/, '')}/${match[1]}/${match[2]}`;
  }
  return uri;
}

/** The recipe card photo — served through the authenticated, ownership-gated
 *  GET /recipes/:recipeId/photo byte route (the object store itself is not
 *  anonymously readable). */
export function recipePhotoUrl(uri: string, recipeId: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  if (/^s3:\/\//.test(uri)) return `${API_BASE_URL}/recipes/${recipeId}/photo`;
  return uri;
}
