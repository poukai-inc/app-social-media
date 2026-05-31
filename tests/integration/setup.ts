import { afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Spin up an in-memory MongoDB for the duration of each integration test file
 * and point the app's own `connectToDatabase` at it (via MONGODB_URI), so both
 * the seeded models AND code-under-test (e.g. cron route handlers that call
 * connectToDatabase) share the same connection.
 */
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  const { default: connectToDatabase } = await import('@/lib/mongodb');
  await connectToDatabase();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
