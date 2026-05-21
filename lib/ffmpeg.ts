import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

const log = logger.child('ffmpeg');

const execAsync = promisify(exec);

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
  size: number;
  hasAudio: boolean;
}

interface ProcessedMedia {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

// LinkedIn video requirements
const LINKEDIN_MAX_SIZE_MB = 200;
const LINKEDIN_MAX_DURATION_SEC = 600; // 10 minutes
const LINKEDIN_TARGET_SIZE_MB = 50; // Target size for better upload reliability
const LINKEDIN_MAX_WIDTH = 1920;
const LINKEDIN_MAX_HEIGHT = 1080;

interface VideoInput {
  buffer: Buffer;
  filename: string;
}

/**
 * Combine multiple videos into one (side-by-side or grid layout)
 * - 2 videos: side by side horizontally
 * - 3-4 videos: 2x2 grid
 * - Loops shorter videos to match the longest video duration
 */
export async function combineVideos(
  videos: VideoInput[],
  layout: 'horizontal' | 'vertical' | 'grid' = 'horizontal'
): Promise<ProcessedMedia> {
  if (videos.length < 2) {
    throw new Error('Need at least 2 videos to combine');
  }
  
  if (videos.length > 4) {
    log.warn('Maximum 4 videos supported for combining - using first 4');
    videos = videos.slice(0, 4);
  }
  
  const tempId = randomUUID();
  const inputPaths: string[] = [];
  const outputPath = join(tmpdir(), `combined-${tempId}.mp4`);
  
  try {
    // Write all input buffers to temp files
    for (let i = 0; i < videos.length; i++) {
      const inputPath = join(tmpdir(), `input-${tempId}-${i}`);
      await writeFile(inputPath, videos[i].buffer);
      inputPaths.push(inputPath);
    }
    
    // Get metadata for all videos to determine dimensions
    const metadataList = await Promise.all(
      inputPaths.map(path => getVideoMetadata(path))
    );
    
    // Find the longest duration - we'll loop shorter videos to match
    const maxDuration = Math.max(...metadataList.map(m => m.duration));
    const minDuration = Math.min(...metadataList.map(m => m.duration));
    
    // Check if any video has audio
    const hasAnyAudio = metadataList.some(m => m.hasAudio);
    
    log.info('Combining videos', { count: videos.length, longestSec: maxDuration.toFixed(1), shortestSec: minDuration.toFixed(1), audio: hasAnyAudio ? 'yes' : 'no (will add silent)' });

    if (maxDuration !== minDuration) {
      log.info('Shorter videos will be looped to match the longest video');
    }
    
    // Check combined duration limit
    if (maxDuration > LINKEDIN_MAX_DURATION_SEC) {
      throw new Error(`Combined video duration (${Math.round(maxDuration)}s) exceeds LinkedIn's 10 minute limit`);
    }
    
    // Determine output dimensions based on layout
    let filterComplex: string;
    
    // Build input args with stream_loop for shorter videos
    // -stream_loop -1 loops infinitely, we'll cut with -t at the end
    const inputArgs = inputPaths.map((p, i) => {
      const needsLoop = metadataList[i].duration < maxDuration;
      if (needsLoop) {
        return `-stream_loop -1 -i "${p}"`;
      }
      return `-i "${p}"`;
    }).join(' ');
    
    // Add silent audio input for videos without audio (LinkedIn requires audio track)
    const silentAudioInput = `-f lavfi -t ${maxDuration} -i anullsrc=channel_layout=stereo:sample_rate=44100`;
    const silentAudioIndex = inputPaths.length; // Index of the silent audio input
    
    if (videos.length === 2) {
      if (layout === 'vertical') {
        // Stack vertically (top/bottom)
        if (hasAnyAudio) {
          filterComplex = `
            [0:v]scale=1920:540:force_original_aspect_ratio=decrease,pad=1920:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
            [1:v]scale=1920:540:force_original_aspect_ratio=decrease,pad=1920:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
            [v0][v1]vstack=inputs=2[outv];
            [0:a][1:a]amix=inputs=2:duration=longest[outa]
          `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
        } else {
          filterComplex = `
            [0:v]scale=1920:540:force_original_aspect_ratio=decrease,pad=1920:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
            [1:v]scale=1920:540:force_original_aspect_ratio=decrease,pad=1920:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
            [v0][v1]vstack=inputs=2[outv]
          `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
        }
      } else {
        // Side by side (left/right) - default for 2 videos
        if (hasAnyAudio) {
          filterComplex = `
            [0:v]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
            [1:v]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
            [v0][v1]hstack=inputs=2[outv];
            [0:a][1:a]amix=inputs=2:duration=longest[outa]
          `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
        } else {
          filterComplex = `
            [0:v]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
            [1:v]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
            [v0][v1]hstack=inputs=2[outv]
          `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
        }
      }
    } else if (videos.length === 3) {
      // 2 on top, 1 centered on bottom
      if (hasAnyAudio) {
        filterComplex = `
          [0:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
          [1:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
          [2:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];
          color=black:1920x540:d=${maxDuration}[black];
          [v0][v1]hstack=inputs=2[top];
          [black][v2]overlay=(W-w)/2:0[bottom];
          [top][bottom]vstack=inputs=2[outv];
          [0:a][1:a][2:a]amix=inputs=3:duration=longest[outa]
        `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
      } else {
        filterComplex = `
          [0:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
          [1:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
          [2:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];
          color=black:1920x540:d=${maxDuration}[black];
          [v0][v1]hstack=inputs=2[top];
          [black][v2]overlay=(W-w)/2:0[bottom];
          [top][bottom]vstack=inputs=2[outv]
        `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
      }
    } else {
      // 4 videos: 2x2 grid
      if (hasAnyAudio) {
        filterComplex = `
          [0:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
          [1:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
          [2:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];
          [3:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v3];
          [v0][v1]hstack=inputs=2[top];
          [v2][v3]hstack=inputs=2[bottom];
          [top][bottom]vstack=inputs=2[outv];
          [0:a][1:a][2:a][3:a]amix=inputs=4:duration=longest[outa]
        `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
      } else {
        filterComplex = `
          [0:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
          [1:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
          [2:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];
          [3:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v3];
          [v0][v1]hstack=inputs=2[top];
          [v2][v3]hstack=inputs=2[bottom];
          [top][bottom]vstack=inputs=2[outv]
        `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
      }
    }
    
    // Build ffmpeg command
    // If no audio, add silent audio track (LinkedIn requires audio)
    let command: string;
    if (hasAnyAudio) {
      command = `ffmpeg ${inputArgs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset medium -profile:v high -level 4.0 -crf 23 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart -t ${maxDuration} -y "${outputPath}"`;
    } else {
      // Add silent audio track for LinkedIn compatibility
      command = `ffmpeg ${inputArgs} ${silentAudioInput} -filter_complex "${filterComplex}" -map "[outv]" -map ${silentAudioIndex}:a -c:v libx264 -preset medium -profile:v high -level 4.0 -crf 23 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart -t ${maxDuration} -y "${outputPath}"`;
    }
    
    log.info('Running ffmpeg combine command');
    
    // Execute ffmpeg with longer timeout for video combining
    await execAsync(command, {
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
      timeout: 600000, // 10 minute timeout
    });
    
    // Read combined file
    const outputBuffer = await readFile(outputPath);
    const outputSizeMB = outputBuffer.length / (1024 * 1024);
    log.info('Combined video size', { sizeMB: outputSizeMB.toFixed(2) });

    // If too large, we need to compress
    if (outputSizeMB > LINKEDIN_TARGET_SIZE_MB) {
      log.info('Combined video too large, recompressing');
      return await processVideoForLinkedIn(outputBuffer, 'combined-video.mp4');
    }
    
    return {
      buffer: outputBuffer,
      mimeType: 'video/mp4',
      filename: 'combined-video.mp4',
    };
    
  } finally {
    // Cleanup temp files
    for (const inputPath of inputPaths) {
      try { await unlink(inputPath); } catch { /* ignore */ }
    }
    try { await unlink(outputPath); } catch { /* ignore */ }
  }
}

/**
 * Get video metadata using ffprobe
 */
async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`
    );
    
    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');
    const format = data.format;
    
    return {
      duration: parseFloat(format?.duration || '0'),
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      codec: videoStream?.codec_name || 'unknown',
      bitrate: parseInt(format?.bit_rate || '0', 10),
      size: parseInt(format?.size || '0', 10),
      hasAudio: !!audioStream,
    };
  } catch (error) {
    log.error('Failed to get video metadata', { error: error instanceof Error ? error.message : String(error) });
    throw new Error('Failed to analyze video file');
  }
}

/**
 * Calculate optimal bitrate for target file size
 */
function calculateTargetBitrate(
  duration: number,
  targetSizeMB: number
): number {
  // Target bitrate in bits per second
  // Formula: bitrate = (targetSize * 8) / duration
  // Leave some room for audio (assume ~128kbps audio)
  const audioBitrate = 128 * 1000;
  const targetBits = targetSizeMB * 1024 * 1024 * 8;
  const videoBitrate = Math.floor((targetBits / duration) - audioBitrate);
  
  // Minimum 500kbps, maximum 8Mbps
  return Math.max(500000, Math.min(videoBitrate, 8000000));
}

/**
 * Process video for LinkedIn using ffmpeg
 * - Converts to MP4 (H.264 + AAC)
 * - Scales down if needed
 * - Compresses if file is too large
 */
export async function processVideoForLinkedIn(
  inputBuffer: Buffer,
  originalFilename: string
): Promise<ProcessedMedia> {
  const tempId = randomUUID();
  const inputPath = join(tmpdir(), `input-${tempId}`);
  const outputPath = join(tmpdir(), `output-${tempId}.mp4`);
  
  try {
    // Write input buffer to temp file
    await writeFile(inputPath, inputBuffer);
    
    // Get video metadata
    const metadata = await getVideoMetadata(inputPath);
    log.info('Video metadata', { metadata });
    
    // Check duration limit
    if (metadata.duration > LINKEDIN_MAX_DURATION_SEC) {
      throw new Error(`Video duration (${Math.round(metadata.duration)}s) exceeds LinkedIn's 10 minute limit`);
    }
    
    // Build ffmpeg command
    const ffmpegArgs: string[] = [
      '-i', `"${inputPath}"`,
      '-y', // Overwrite output
    ];
    
    // Video codec: H.264
    ffmpegArgs.push('-c:v', 'libx264');
    ffmpegArgs.push('-preset', 'medium'); // Balance between speed and quality
    ffmpegArgs.push('-profile:v', 'high');
    ffmpegArgs.push('-level', '4.0');
    
    // Audio codec: AAC
    ffmpegArgs.push('-c:a', 'aac');
    ffmpegArgs.push('-b:a', '128k');
    
    // Pixel format for compatibility
    ffmpegArgs.push('-pix_fmt', 'yuv420p');
    
    // Scale down if needed (maintain aspect ratio)
    const needsResize = metadata.width > LINKEDIN_MAX_WIDTH || metadata.height > LINKEDIN_MAX_HEIGHT;
    if (needsResize) {
      // Scale to fit within max dimensions while maintaining aspect ratio
      // Wrap in double quotes to prevent shell from interpreting parentheses
      ffmpegArgs.push('-vf', `"scale='min(${LINKEDIN_MAX_WIDTH},iw)':'min(${LINKEDIN_MAX_HEIGHT},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2"`);
      log.info('Resizing video', { fromWidth: metadata.width, fromHeight: metadata.height });
    }
    
    // Calculate if we need to compress
    const currentSizeMB = metadata.size / (1024 * 1024);
    const needsCompression = currentSizeMB > LINKEDIN_TARGET_SIZE_MB;
    
    if (needsCompression && metadata.duration > 0) {
      const targetBitrate = calculateTargetBitrate(metadata.duration, LINKEDIN_TARGET_SIZE_MB);
      ffmpegArgs.push('-b:v', `${targetBitrate}`);
      ffmpegArgs.push('-maxrate', `${Math.floor(targetBitrate * 1.5)}`);
      ffmpegArgs.push('-bufsize', `${Math.floor(targetBitrate * 2)}`);
      log.info('Compressing video', { fromSizeMB: currentSizeMB.toFixed(1), targetBitrateMbps: (targetBitrate / 1000000).toFixed(2) });
    } else {
      // Use CRF for quality-based encoding when file is small enough
      ffmpegArgs.push('-crf', '23');
    }
    
    // Faststart for web streaming
    ffmpegArgs.push('-movflags', '+faststart');
    
    // Output file
    ffmpegArgs.push(`"${outputPath}"`);
    
    const command = `ffmpeg ${ffmpegArgs.join(' ')}`;
    log.info('Running ffmpeg command', { command });

    // Execute ffmpeg
    const { stderr } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for ffmpeg output
    });

    if (stderr && !stderr.includes('encoded')) {
      log.info('ffmpeg output', { output: stderr.slice(-500) }); // Last 500 chars
    }

    // Read processed file
    const outputBuffer = await readFile(outputPath);
    const outputSizeMB = outputBuffer.length / (1024 * 1024);
    log.info('Processed video size', { sizeMB: outputSizeMB.toFixed(2) });
    
    // Verify size is within limits
    if (outputSizeMB > LINKEDIN_MAX_SIZE_MB) {
      throw new Error(`Processed video (${outputSizeMB.toFixed(1)}MB) still exceeds LinkedIn's 200MB limit`);
    }
    
    // Generate new filename with .mp4 extension
    const baseName = originalFilename.replace(/\.[^.]+$/, '');
    const newFilename = `${baseName}.mp4`;
    
    return {
      buffer: outputBuffer,
      mimeType: 'video/mp4',
      filename: newFilename,
    };
  } finally {
    // Cleanup temp files
    try {
      await unlink(inputPath);
    } catch { /* ignore */ }
    try {
      await unlink(outputPath);
    } catch { /* ignore */ }
  }
}

/**
 * Process image for LinkedIn (resize if needed)
 */
export async function processImageForLinkedIn(
  inputBuffer: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<ProcessedMedia> {
  const tempId = randomUUID();
  const inputExt = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
  const inputPath = join(tmpdir(), `input-${tempId}.${inputExt}`);
  const outputPath = join(tmpdir(), `output-${tempId}.jpg`);
  
  try {
    await writeFile(inputPath, inputBuffer);
    
    // LinkedIn image recommendations: max 8MB, ideally 1200x627 for link shares
    // For image posts, we'll cap at 1920px width
    const MAX_IMAGE_WIDTH = 1920;
    const MAX_IMAGE_SIZE_MB = 8;
    
    const currentSizeMB = inputBuffer.length / (1024 * 1024);
    
    // Check if processing is needed
    if (currentSizeMB <= MAX_IMAGE_SIZE_MB && (mimeType.includes('jpeg') || mimeType.includes('jpg'))) {
      // Check dimensions using ffprobe
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -print_format json -show_streams "${inputPath}"`
        );
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0];
        
        if (stream?.width && stream.width <= MAX_IMAGE_WIDTH) {
          // Image is already within limits
          return {
            buffer: inputBuffer,
            mimeType,
            filename: originalFilename,
          };
        }
      } catch {
        // If we can't get dimensions, process anyway
      }
    }
    
    // Process image with ffmpeg
    const command = `ffmpeg -i "${inputPath}" -vf "scale='min(${MAX_IMAGE_WIDTH},iw)':-1" -q:v 2 -y "${outputPath}"`;
    
    await execAsync(command);
    
    const outputBuffer = await readFile(outputPath);
    
    const baseName = originalFilename.replace(/\.[^.]+$/, '');
    
    return {
      buffer: outputBuffer,
      mimeType: 'image/jpeg',
      filename: `${baseName}.jpg`,
    };
  } finally {
    try {
      await unlink(inputPath);
    } catch { /* ignore */ }
    try {
      await unlink(outputPath);
    } catch { /* ignore */ }
  }
}

/**
 * Check if ffmpeg is available
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}
