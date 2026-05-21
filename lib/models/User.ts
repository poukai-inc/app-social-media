import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export interface LinkedInOrganization {
  id: string;
  name: string;
  vanityName?: string;
  logoUrl?: string;
  role: string;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  image?: string;
  linkedinId?: string;
  linkedinAccessToken?: string;
  linkedinAccessTokenExpires?: Date;
  linkedinOrganizations?: LinkedInOrganization[];
  defaultPostAs?: 'person' | 'organization';
  defaultOrganizationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LinkedInOrganizationSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    vanityName: { type: String },
    logoUrl: { type: String },
    role: { type: String, required: true },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    image: {
      type: String,
    },
    linkedinId: {
      type: String,
      unique: true,
      sparse: true,
    },
    linkedinAccessToken: {
      type: String,
    },
    linkedinAccessTokenExpires: {
      type: Date,
    },
    linkedinOrganizations: {
      type: [LinkedInOrganizationSchema],
      default: [],
    },
    defaultPostAs: {
      type: String,
      enum: ['person', 'organization'],
      default: 'person',
    },
    defaultOrganizationId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
