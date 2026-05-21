// Check Twitter connection status
/* eslint-disable @typescript-eslint/no-require-imports */
const mongoose = require('mongoose');
require('dotenv').config();
/* eslint-enable @typescript-eslint/no-require-imports */

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Page = mongoose.model('Page', new mongoose.Schema({}, { strict: false }));
  const page = await Page.findById('697a8625f047b183f44c15f7').lean();
  
  const twitter = page.connections.find(c => c.platform === 'twitter');
  if (twitter) {
    console.log('Twitter connection found:');
    console.log('  Platform:', twitter.platform);
    console.log('  Active:', twitter.isActive);
    console.log('  Username:', twitter.username || twitter.platformUsername);
    console.log('  User ID:', twitter.platformUserId);
    console.log('  Has Access Token:', !!twitter.accessToken);
    console.log('  Has Refresh Token:', !!twitter.refreshToken);
    console.log('  Token Length:', twitter.accessToken?.length);
    console.log('  Token Expires:', twitter.tokenExpiresAt);
    console.log('  Connected At:', twitter.connectedAt);
  }
  
  await mongoose.disconnect();
}
run().catch(console.error);
