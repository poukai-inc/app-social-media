import { afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Spin up an in-memory MongoDB for the duration of each integration test file
 * and connect the shared mongoose instance to it. Models registered by the app
 * (AIUsage, PendingConnection, …) then operate against a real database.
 */
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
