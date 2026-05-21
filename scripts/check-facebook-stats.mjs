import 'dotenv/config';
import mongoose from 'mongoose';

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';
const postId = '518321908039049_122170386404763713';

async function fetchStats() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Get the page to find the Facebook access token
  const page = await mongoose.connection.db.collection('pages').findOne({});
  const fbConnection = page.connections.find(c => c.platform === 'facebook');
  
  if (!fbConnection) {
    console.log('No Facebook connection found');
    await mongoose.disconnect();
    return;
  }
  
  console.log('Fetching Facebook stats for post:', postId);
  console.log('');
  
  // Fetch basic post info
  const basicUrl = `${FACEBOOK_GRAPH_API}/${postId}?fields=message,created_time,shares,comments.summary(true),reactions.summary(true)&access_token=${fbConnection.accessToken}`;
  
  const response = await fetch(basicUrl);
  const data = await response.json();
  
  if (data.error) {
    console.log('Error:', data.error.message);
    await mongoose.disconnect();
    return;
  }
  
  console.log('=== FACEBOOK POST STATS ===');
  console.log('');
  console.log('Post ID:', postId);
  console.log('Created:', data.created_time);
  console.log('');
  console.log('--- Engagement ---');
  console.log('Reactions:', data.reactions?.summary?.total_count || 0);
  console.log('Comments:', data.comments?.summary?.total_count || 0);
  console.log('Shares:', data.shares?.count || 0);
  console.log('');
  console.log('--- Content ---');
  console.log(data.message || 'No message');
  console.log('');
  
  // Try to get insights (may require page admin permissions)
  try {
    const insightsUrl = `${FACEBOOK_GRAPH_API}/${postId}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks&access_token=${fbConnection.accessToken}`;
    const insightsResp = await fetch(insightsUrl);
    const insightsData = await insightsResp.json();
    
    if (insightsData.data && insightsData.data.length > 0) {
      console.log('--- Insights ---');
      for (const insight of insightsData.data) {
        const value = insight.values?.[0]?.value || 0;
        console.log(`${insight.title}: ${value}`);
      }
    } else if (insightsData.error) {
      console.log('Insights not available:', insightsData.error.message);
    }
  } catch {
    console.log('Could not fetch insights');
  }
  
  console.log('');
  console.log('===========================');
  console.log('');
  console.log('Note: The post was just published. Stats take time to accumulate.');
  console.log('Check again in a few hours for meaningful engagement data.');
  
  await mongoose.disconnect();
}

fetchStats().catch(console.error);
