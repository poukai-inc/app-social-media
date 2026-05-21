#!/usr/bin/env node

/**
 * Script to fix a failed post with multiple videos
 * 
 * 1. Fetches the failing post from MongoDB
 * 2. Downloads the videos from S3
 * 3. Combines them side-by-side
 * 4. Uploads the combined video to S3
 * 5. Updates the post with the single combined video
 * 
 * Usage:
 *   node scripts/fix-failed-post.mjs [postId]
 * 
 * If no postId is provided, it will find the most recent failed post with multiple videos.
 * 
 * Environment variables needed:
 *   - MONGODB_URI
 *   - S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME
 */

import { MongoClient, ObjectId } from 'mongodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const execAsync = promisify(exec);

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`\n${colors.cyan}[Step ${step}]${colors.reset} ${colors.blue}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'yellow');
}

// ============================================================================
// S3 FUNCTIONS
// ============================================================================

function getS3Client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

async function downloadFromS3(url) {
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET;
  
  // Extract key from URL
  // URL format: http://endpoint/bucket/key or https://bucket.endpoint/key
  // Also handle host.docker.internal URLs
  let key;
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // If path starts with bucket name, remove it
    if (pathParts[0] === bucket) {
      key = pathParts.slice(1).join('/');
    } else {
      key = pathParts.join('/');
    }
  } catch {
    // Assume it's just the key
    key = url;
  }
  
  logInfo(`Downloading from S3: ${key}`);
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  const response = await s3.send(command);
  const chunks = [];
  
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

async function uploadToS3(buffer, filename, mimeType) {
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET;
  const key = `combined/${Date.now()}-${filename}`;
  
  logInfo(`Uploading to S3: ${key}`);
  
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  });
  
  await s3.send(command);
  
  // Construct URL using host.docker.internal for Docker compatibility
  // This ensures the URL works when accessed from inside Docker containers
  const endpoint = process.env.S3_ENDPOINT;
  
  // Parse the endpoint to get the port
  let dockerUrl;
  try {
    const endpointUrl = new URL(endpoint);
    const port = endpointUrl.port || '7675';
    // Use host.docker.internal for Docker container access
    dockerUrl = `http://host.docker.internal:${port}/${bucket}/${key}`;
  } catch {
    // Fallback to original endpoint
    dockerUrl = `${endpoint}/${bucket}/${key}`;
  }
  
  return dockerUrl;
}

// ============================================================================
// FFMPEG FUNCTIONS
// ============================================================================

async function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stderr });
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

async function getVideoInfo(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
    { maxBuffer: 50 * 1024 * 1024 }
  );
  
  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find(s => s.codec_type === 'video');
  const audioStream = data.streams?.find(s => s.codec_type === 'audio');
  
  return {
    duration: parseFloat(data.format?.duration || '0'),
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    codec: videoStream?.codec_name || 'unknown',
    size: parseInt(data.format?.size || '0', 10),
    hasAudio: !!audioStream,
  };
}

async function combineVideos(videoBuffers, layout = 'horizontal') {
  if (!videoBuffers || videoBuffers.length === 0) {
    throw new Error('No videos provided');
  }
  
  if (videoBuffers.length === 1) {
    return videoBuffers[0];
  }
  
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const inputPaths = [];
  
  try {
    // Write all input videos to temp files
    for (let i = 0; i < videoBuffers.length; i++) {
      const inputPath = join(tempDir, `combine-input-${timestamp}-${i}.mp4`);
      await writeFile(inputPath, videoBuffers[i]);
      inputPaths.push(inputPath);
    }
    
    const outputPath = join(tempDir, `combine-output-${timestamp}.mp4`);
    
    // Get video info and durations
    logInfo('Analyzing input videos...');
    const videoInfos = [];
    let hasAnyAudio = false;
    for (let i = 0; i < inputPaths.length; i++) {
      const info = await getVideoInfo(inputPaths[i]);
      videoInfos.push(info);
      if (info.hasAudio) hasAnyAudio = true;
      logInfo(`  Video ${i + 1}: ${info.width}x${info.height}, ${info.duration.toFixed(1)}s, ${info.codec}, audio: ${info.hasAudio ? 'yes' : 'no'}`);
    }
    
    const maxDuration = Math.max(...videoInfos.map(v => v.duration));
    logInfo(`Longest video: ${maxDuration.toFixed(1)}s (shorter videos will loop)`);
    logInfo(`Audio tracks: ${hasAnyAudio ? 'will mix available audio' : 'none (will add silent audio for LinkedIn)'}`);
    
    // Build ffmpeg command with looping for shorter videos
    const ffmpegArgs = [];
    
    // Add inputs with stream_loop for looping
    for (const path of inputPaths) {
      ffmpegArgs.push('-stream_loop', '-1');  // Loop indefinitely
      ffmpegArgs.push('-i', path);
    }
    
    // Add silent audio input (LinkedIn requires audio track)
    if (!hasAnyAudio) {
      ffmpegArgs.push('-f', 'lavfi');
      ffmpegArgs.push('-t', maxDuration.toString());
      ffmpegArgs.push('-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    }
    
    const silentAudioIndex = inputPaths.length; // Index of the silent audio input
    
    // Build filter complex based on layout and number of videos
    let filterComplex = '';
    const numVideos = inputPaths.length;
    
    // Video filter part (always needed)
    if (numVideos === 2) {
      if (layout === 'horizontal') {
        // Side-by-side horizontally (1280x720 total)
        filterComplex = `[0:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[1:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];[v0][v1]hstack=inputs=2[vout]`;
      } else {
        // Stacked vertically
        filterComplex = `[0:v]scale=1280:360:force_original_aspect_ratio=decrease,pad=1280:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[1:v]scale=1280:360:force_original_aspect_ratio=decrease,pad=1280:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];[v0][v1]vstack=inputs=2[vout]`;
      }
    } else if (numVideos === 3) {
      filterComplex = `[0:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[1:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];[2:v]scale=1280:360:force_original_aspect_ratio=decrease,pad=1280:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];[v0][v1]hstack=inputs=2[top];[top][v2]vstack=inputs=2[vout]`;
    } else if (numVideos >= 4) {
      // 2x2 grid
      filterComplex = `[0:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[1:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];[2:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];[3:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1[v3];[v0][v1]hstack=inputs=2[top];[v2][v3]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[vout]`;
    }
    
    // Add audio mixing if any video has audio
    if (hasAnyAudio) {
      const audioInputs = videoInfos
        .map((info, i) => info.hasAudio ? `[${i}:a]` : null)
        .filter(Boolean);
      
      if (audioInputs.length > 0) {
        filterComplex += `;${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest[aout]`;
      }
    }
    
    ffmpegArgs.push('-filter_complex', filterComplex);
    ffmpegArgs.push('-map', '[vout]');
    
    if (hasAnyAudio && videoInfos.some(v => v.hasAudio)) {
      ffmpegArgs.push('-map', '[aout]');
    } else {
      // Map the silent audio input
      ffmpegArgs.push('-map', `${silentAudioIndex}:a`);
    }
    
    ffmpegArgs.push('-t', maxDuration.toString());  // Limit to longest video duration
    ffmpegArgs.push('-c:v', 'libx264');
    ffmpegArgs.push('-preset', 'medium');
    ffmpegArgs.push('-profile:v', 'high');    // LinkedIn requires High profile
    ffmpegArgs.push('-level', '4.0');          // LinkedIn requires level 4.0 or lower
    ffmpegArgs.push('-crf', '23');
    ffmpegArgs.push('-pix_fmt', 'yuv420p');
    ffmpegArgs.push('-c:a', 'aac');
    ffmpegArgs.push('-b:a', '128k');
    ffmpegArgs.push('-movflags', '+faststart');
    ffmpegArgs.push('-y');
    ffmpegArgs.push(outputPath);
    
    logInfo('Combining videos with ffmpeg...');
    await runFfmpeg(ffmpegArgs);
    
    const outputBuffer = await readFile(outputPath);
    const outputInfo = await getVideoInfo(outputPath);
    
    logInfo(`Output: ${outputInfo.width}x${outputInfo.height}, ${outputInfo.duration.toFixed(1)}s, audio: ${outputInfo.hasAudio ? 'yes' : 'no'}`);
    
    // Cleanup
    for (const path of inputPaths) {
      try { await unlink(path); } catch {}
    }
    try { await unlink(outputPath); } catch {}
    
    return outputBuffer;
    
  } catch (error) {
    // Cleanup on error
    for (const path of inputPaths) {
      try { await unlink(path); } catch {}
    }
    throw error;
  }
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  console.log(`${colors.magenta}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║           🔧 FIX FAILED POST WITH MULTIPLE VIDEOS 🔧              ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Check environment variables
  const requiredEnvVars = ['MONGODB_URI', 'S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    logError(`Missing environment variables: ${missingVars.join(', ')}`);
    logInfo('Make sure you have a .env file with all required variables');
    process.exit(1);
  }
  
  const postId = process.argv[2];
  
  // Connect to MongoDB
  logStep(1, 'Connecting to MongoDB...');
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    logSuccess('Connected to MongoDB');
    
    const db = client.db();
    const postsCollection = db.collection('posts');
    
    // Find the post
    logStep(2, 'Finding the post...');
    
    let post;
    if (postId) {
      post = await postsCollection.findOne({ _id: new ObjectId(postId) });
      if (!post) {
        logError(`Post with ID ${postId} not found`);
        process.exit(1);
      }
    } else {
      // Find most recent failed post with multiple media items
      post = await postsCollection.findOne(
        {
          status: 'failed',
          'media.1': { $exists: true }, // Has at least 2 media items
        },
        { sort: { createdAt: -1 } }
      );
      
      if (!post) {
        // Try finding any post with multiple media that isn't published
        post = await postsCollection.findOne(
          {
            status: { $ne: 'published' },
            'media.1': { $exists: true },
          },
          { sort: { createdAt: -1 } }
        );
      }
      
      if (!post) {
        logError('No failed post with multiple videos found');
        logInfo('You can specify a post ID: node scripts/fix-failed-post.mjs <postId>');
        process.exit(1);
      }
    }
    
    logSuccess(`Found post: ${post._id}`);
    logInfo(`Status: ${post.status}`);
    logInfo(`Media items: ${post.media?.length || 0}`);
    logInfo(`Original media items: ${post.originalMedia?.length || 0}`);
    
    // Use originalMedia if available (from previous combine attempts), otherwise use media
    let media = post.originalMedia || post.media || [];
    
    // Check if post has multiple media
    if (media.length < 2) {
      logError('Post does not have multiple media files (checked both media and originalMedia)');
      process.exit(1);
    }
    
    // Filter for videos only
    const videos = media.filter(m => m.type === 'video');
    
    if (videos.length < 2) {
      logError(`Only ${videos.length} video(s) found in this post`);
      process.exit(1);
    }
    
    logInfo(`Videos to combine: ${videos.length}`);
    for (const video of videos) {
      logInfo(`  - ${video.filename} (${(video.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Download videos from S3
    logStep(3, 'Downloading videos from S3...');
    const videoBuffers = [];
    
    for (let i = 0; i < videos.length; i++) {
      logInfo(`Downloading video ${i + 1}/${videos.length}: ${videos[i].filename}...`);
      const buffer = await downloadFromS3(videos[i].url);
      videoBuffers.push(buffer);
      logInfo(`  Downloaded: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
    }
    
    logSuccess(`Downloaded ${videoBuffers.length} videos`);
    
    // Combine videos
    logStep(4, 'Combining videos side-by-side...');
    const combinedBuffer = await combineVideos(videoBuffers, 'horizontal');
    logSuccess(`Combined video size: ${(combinedBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Upload combined video to S3
    logStep(5, 'Uploading combined video to S3...');
    const combinedFilename = `combined-${post._id}.mp4`;
    const combinedUrl = await uploadToS3(combinedBuffer, combinedFilename, 'video/mp4');
    logSuccess(`Uploaded: ${combinedUrl}`);
    
    // Update the post with combined video
    logStep(6, 'Updating post in database...');
    
    // Create new media entry for the combined video
    const combinedMedia = {
      id: `combined-${Date.now()}`,
      url: combinedUrl,
      type: 'video',
      filename: combinedFilename,
      mimeType: 'video/mp4',
      size: combinedBuffer.length,
    };
    
    const updateResult = await postsCollection.updateOne(
      { _id: post._id },
      {
        $set: {
          media: [combinedMedia],
          originalMedia: media, // Keep original media for reference
          status: 'scheduled', // Reset to scheduled so it can be published
          error: null,
          updatedAt: new Date(),
          processingNote: `Combined ${videos.length} videos into one on ${new Date().toISOString()}`,
        },
      }
    );
    
    if (updateResult.modifiedCount === 1) {
      logSuccess('Post updated successfully!');
    } else {
      logError('Failed to update post');
      process.exit(1);
    }
    
    // Summary
    console.log(`\n${colors.magenta}
╔═══════════════════════════════════════════════════════════════════╗
║                          SUMMARY                                  ║
╚═══════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    logSuccess(`Post ID: ${post._id}`);
    logSuccess(`Original videos: ${videos.length}`);
    for (const v of videos) {
      logInfo(`  - ${v.filename}`);
    }
    logSuccess(`Combined video URL: ${combinedUrl}`);
    logSuccess(`New status: scheduled`);
    
    console.log(`\n${colors.green}The post is now ready to be published!${colors.reset}`);
    console.log(`${colors.yellow}You can publish it via the API or wait for the next scheduled run.${colors.reset}\n`);
    
  } catch (error) {
    logError(`Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
