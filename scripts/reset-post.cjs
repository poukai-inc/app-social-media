/* eslint-disable @typescript-eslint/no-require-imports */
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();
/* eslint-enable @typescript-eslint/no-require-imports */

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  
  const postId = '696f4cc9d8d32a345473c270';
  
  // Update the post: fix URL and reset status
  const result = await client.db().collection('posts').updateOne(
    { _id: new ObjectId(postId) },
    {
      $set: {
        status: 'scheduled',
        error: null,
        linkedinPostId: null,
        publishedAt: null,
        'media.0.url': 'http://host.docker.internal:7675/socialmediaautomation/combined/1769363481077-combined-696f4cc9d8d32a345473c270.mp4',
        updatedAt: new Date(),
      }
    }
  );
  
  console.log('Updated:', result.modifiedCount, 'document(s)');
  
  // Verify
  const post = await client.db().collection('posts').findOne({ _id: new ObjectId(postId) });
  console.log('New status:', post.status);
  console.log('New URL:', post.media[0].url);
  
  await client.close();
}

main().catch(console.error);
