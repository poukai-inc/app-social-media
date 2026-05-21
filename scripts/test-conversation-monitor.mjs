#!/usr/bin/env node
/**
 * Test conversation monitor with verbose logging
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the function
import { monitorAndRespondToConversations } from '../lib/engagement/conversation-manager.ts';

async function testMonitor() {
  try {
    console.log('🚀 Starting conversation monitor test (dry run)...\n');
    
    const result = await monitorAndRespondToConversations({
      dryRun: true,
      verbose: true,
    });
    
    console.log('\n=== FINAL RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.responsesGenerated > 0) {
      console.log('\n✅ SUCCESS: Generated responses would be sent in production!');
    } else if (result.errors.length > 0) {
      console.log('\n⚠️  Errors occurred:', result.errors);
    } else {
      console.log('\n📭 No responses generated (either no replies found or analysis said skip)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testMonitor();
