import type { Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import crypto from 'crypto';

/**
 * Short-lived server-side store for OAuth connection data (platform tokens +
 * metadata) pending the user's page-selection step.
 *
 * Previously this data — including Twitter refresh tokens and Facebook page
 * access tokens — was base64'd into a `?data=` redirect query param, where it
 * leaks into server access logs, browser history, and Referer headers. Instead
 * we persist it here under a random opaque key, redirect with `?key=...`, and
 * the selection page fetches it once (one-time consume) over an authenticated,
 * same-origin request. TTL auto-expires anything not consumed.
 *
 * See SECURITY: BACKLOG #110 (AUDIT-H1).
 */
export interface IPendingConnection {
  _id: string; // random opaque key (base64url)
  userId: mongoose.Types.ObjectId;
  platform: string;
  payload: Record<string, unknown>; // transient connection data incl. tokens
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PendingConnectionSchema = new Schema<IPendingConnection>(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    // TTL index — Mongo removes the doc automatically once expiresAt passes.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

const PendingConnection: Model<IPendingConnection> =
  mongoose.models.PendingConnection ||
  mongoose.model<IPendingConnection>('PendingConnection', PendingConnectionSchema);

export default PendingConnection;

/**
 * Persist pending connection data and return the opaque one-time key to put in
 * the redirect URL. Default TTL 5 minutes.
 */
export async function createPendingConnection(
  userId: mongoose.Types.ObjectId,
  platform: string,
  payload: Record<string, unknown>,
  ttlMs: number = 5 * 60 * 1000
): Promise<string> {
  const key = crypto.randomBytes(32).toString('base64url');
  await PendingConnection.create({
    _id: key,
    userId,
    platform,
    payload,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return key;
}
