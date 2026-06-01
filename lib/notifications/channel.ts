/**
 * Notification channel contract (BACKLOG #32, decisions/0007-notifications.md).
 *
 * A channel renders + delivers a NotificationMessage for one transport. The
 * dispatcher (`notify`) fans a message out to the org's configured channels.
 * MVP channels: in-app + email. Slack (#35) / Discord (#67) are P2.
 */
export type ChannelName = 'in-app' | 'email' | 'slack' | 'discord';

export interface NotificationContext {
  /** Owning organization (required — drives tenant scoping + per-org config). */
  organizationId: string;
  /** Optional target user (for in-app feed / per-user routing). */
  userId?: string;
  /** Override the channels to deliver on; defaults to the org's MVP set. */
  channels?: ChannelName[];
}

export interface NotificationMessage {
  /** Stable event key, e.g. `post.published`, `post.failed`, `approval.needed`. */
  event: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /**
   * Optional pre-rendered email. Channels that don't apply to a given message
   * (e.g. email when no recipient was rendered) skip it silently.
   */
  email?: { to: string; subject: string; html: string; text?: string };
}

export interface NotificationChannel {
  readonly name: ChannelName;
  send(ctx: NotificationContext, msg: NotificationMessage): Promise<void>;
}
