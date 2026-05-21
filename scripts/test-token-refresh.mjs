#!/usr/bin/env node
/**
 * Test Token Refresh Cron
 * 
 * Runs a dry test of the token refresh system
 */

import 'dotenv/config';

const connectDB = (await import('../lib/mongodb.ts')).default;
const Page = (await import('../lib/models/Page.ts')).default;
await import('../lib/models/User.ts');  // Need to import User model for populate

await connectDB();

console.log('🔄 Token Refresh System Test\n');
console.log('=' .repeat(60));

// Find all pages with connections
const pages = await Page.find({
  isActive: true,
  'connections.0': { $exists: true },
})
  .populate('userId', 'email name')
  .lean();

console.log(`\n📄 Found ${pages.length} pages with connections\n`);

for (const page of pages) {
  const user = page.userId;
  console.log(`\n📌 Page: ${page.name}`);
  console.log(`   User: ${user?.email || 'No email'}`);
  console.log(`   Connections: ${page.connections?.length || 0}`);
  
  for (const conn of page.connections || []) {
    const platform = conn.platform;
    const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
    const hasRefreshToken = !!conn.refreshToken;
    
    console.log(`\n   🔗 ${platform.toUpperCase()}`);
    console.log(`      Username: ${conn.platformUsername || 'N/A'}`);
    console.log(`      Active: ${conn.isActive}`);
    console.log(`      Has Refresh Token: ${hasRefreshToken}`);
    
    if (expiresAt) {
      const now = new Date();
      const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      const isExpired = now > expiresAt;
      
      console.log(`      Token Expires: ${expiresAt.toISOString()}`);
      console.log(`      Hours Until Expiry: ${hoursUntilExpiry.toFixed(1)}`);
      
      if (isExpired) {
        console.log(`      ⚠️  STATUS: EXPIRED`);
      } else if (hoursUntilExpiry < 6) {
        console.log(`      ⚠️  STATUS: CRITICAL (< 6 hours)`);
      } else if (hoursUntilExpiry < 24) {
        console.log(`      ⚠️  STATUS: WARNING (< 24 hours)`);
      } else {
        console.log(`      ✅ STATUS: OK`);
      }
    } else {
      console.log(`      Token Expires: No expiry set (possibly long-lived token)`);
      console.log(`      ✅ STATUS: No expiry`);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('\n✨ To run the actual token refresh cron, call:');
console.log(`   curl "http://localhost:3000/api/cron/token-refresh?key=YOUR_CRON_SECRET"`);
console.log('');

process.exit(0);
