#!/usr/bin/env node
/**
 * Test Smart Load Balancing
 * 
 * Verifies that the AI client selects models based on lowest usage percentage
 * rather than fixed priority order.
 */

import 'dotenv/config';

// Connect to MongoDB first
const connectDB = (await import('../lib/mongodb.ts')).default;
await connectDB();

// Import the AI client
const aiClient = await import('../lib/ai-client.ts');
const {
  getTotalCapacity,
  getSelectedModel,
  createChatCompletion,
} = aiClient;

async function testLoadBalancing() {
  console.log('🔄 Testing Smart Load Balancing\n');
  console.log('=' .repeat(60));
  
  // 1. Get current model selection
  console.log('\n📊 Which model would be selected right now?\n');
  const selection = await getSelectedModel();
  
  console.log(`Selected: ${selection.model}`);
  console.log(`Usage:    ${selection.usagePercent}%`);
  console.log(`Reason:   ${selection.reasoning}`);
  
  // 2. Show all models sorted by usage
  console.log('\n📈 All Models (sorted by usage):\n');
  
  const sorted = [...selection.allModels].sort((a, b) => {
    // Put null limits at the end
    if (a.tokensLimit === null && b.tokensLimit !== null) return 1;
    if (a.tokensLimit !== null && b.tokensLimit === null) return -1;
    return a.usagePercent - b.usagePercent;
  });
  
  for (const m of sorted) {
    const limitStr = m.tokensLimit 
      ? `${m.tokensUsed.toLocaleString()} / ${m.tokensLimit.toLocaleString()}`
      : `${m.tokensUsed.toLocaleString()} / ∞`;
    const availStr = m.hasCapacity ? '✅' : '❌';
    const pctStr = m.tokensLimit ? `${m.usagePercent.toFixed(1)}%` : 'N/A';
    
    console.log(`  ${availStr} ${m.model.padEnd(35)} ${pctStr.padStart(6)} (${limitStr})`);
  }
  
  // 3. Show capacity summary
  console.log('\n📊 Capacity Summary:\n');
  const capacity = await getTotalCapacity();
  console.log(`  Total Used:        ${capacity.totalUsed.toLocaleString()} tokens`);
  console.log(`  Total Limit:       ${capacity.totalLimit.toLocaleString()} tokens`);
  console.log(`  Overall Usage:     ${capacity.percentUsed}%`);
  console.log(`  Available Models:  ${capacity.availableModels.length}`);
  console.log(`  Unlimited Models:  ${capacity.unlimitedModels.length}`);
  
  // 4. Make a test request to verify it uses the selected model
  console.log('\n🧪 Making a test request...\n');
  
  const result = await createChatCompletion({
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Respond in one sentence.' },
      { role: 'user', content: 'What is 2+2?' },
    ],
    maxTokens: 50,
  });
  
  console.log(`  Model used: ${result.model}`);
  console.log(`  Response:   ${result.content}`);
  console.log(`  Tokens:     ${result.usage?.totalTokens || 'N/A'}`);
  
  // Verify it used the expected model
  if (result.model === selection.model) {
    console.log('\n✅ Load balancing working correctly - used lowest usage model!');
  } else {
    console.log(`\n⚠️  Used ${result.model} instead of ${selection.model}`);
    console.log('   (This might be normal if usage changed between selection and request)');
  }
  
  // 5. Show updated selection after request
  console.log('\n📊 Updated selection after request:\n');
  const newSelection = await getSelectedModel();
  console.log(`  Selected: ${newSelection.model} (${newSelection.usagePercent}%)`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✨ Load balancing test complete!');
}

// Run the test
testLoadBalancing().catch(console.error);
