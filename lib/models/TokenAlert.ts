/**
 * Token Alert Model
 * 
 * Tracks token expiry alerts sent to users to avoid spamming.
 * Also useful for auditing and debugging token issues.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITokenAlert extends Document {
  pageId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  platform: 'twitter' | 'facebook' | 'linkedin';
  platformId: string;
  
  // What happened
  alertType: 'expiring_soon' | 'expired' | 'refresh_failed';
  tokenExpiresAt?: Date;
  
  // Result
  refreshAttempted: boolean;
  refreshSucceeded: boolean;
  refreshError?: string;
  
  emailSent: boolean;
  emailError?: string;
  
  // Timestamps
  alertedAt: Date;
  
  // Metadata
  hoursUntilExpiry?: number;
}

const TokenAlertSchema = new Schema<ITokenAlert>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: 'Page',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['twitter', 'facebook', 'linkedin'],
      required: true,
    },
    platformId: {
      type: String,
      required: true,
    },
    alertType: {
      type: String,
      enum: ['expiring_soon', 'expired', 'refresh_failed'],
      required: true,
    },
    tokenExpiresAt: Date,
    refreshAttempted: {
      type: Boolean,
      default: false,
    },
    refreshSucceeded: {
      type: Boolean,
      default: false,
    },
    refreshError: String,
    emailSent: {
      type: Boolean,
      default: false,
    },
    emailError: String,
    alertedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    hoursUntilExpiry: Number,
  },
  {
    timestamps: true,
  }
);

// Index for checking recent alerts (avoid duplicate emails)
TokenAlertSchema.index({ pageId: 1, platform: 1, alertType: 1, alertedAt: -1 });

// Index for user's alerts
TokenAlertSchema.index({ userId: 1, alertedAt: -1 });

// Static method to check if we recently sent an alert
TokenAlertSchema.statics.recentAlertExists = async function(
  pageId: mongoose.Types.ObjectId,
  platform: string,
  alertType: string,
  withinHours: number = 24
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  // safe: platform and alertType are validated enum strings from the callers;
  // cast to FilterQuery to satisfy Mongoose 9 strict enum conditions
  const count = await this.countDocuments({
    pageId,
    platform,
    alertType,
    emailSent: true,
    alertedAt: { $gte: cutoff },
  } as mongoose.QueryFilter<ITokenAlert>);
  return count > 0;
};

interface TokenAlertModel extends Model<ITokenAlert> {
  recentAlertExists(
    pageId: mongoose.Types.ObjectId,
    platform: string,
    alertType: string,
    withinHours?: number
  ): Promise<boolean>;
}

const TokenAlert = (
  mongoose.models.TokenAlert || 
  mongoose.model<ITokenAlert, TokenAlertModel>('TokenAlert', TokenAlertSchema)
) as TokenAlertModel;

export default TokenAlert;
