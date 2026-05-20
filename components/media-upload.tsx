'use client';

import { useState, useRef } from 'react';
import { X, Upload, Image, Video, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

const log = logger.child('component:media-upload');

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  filename: string;
  mimeType: string;
  size: number;
}

interface MediaUploadProps {
  media: MediaItem[];
  onMediaChange: (media: MediaItem[]) => void;
  maxFiles?: number;
}

export function MediaUpload({ media, onMediaChange, maxFiles = 9 }: MediaUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;

    if (media.length + files.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      onMediaChange([...media, ...data.files]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (item: MediaItem) => {
    try {
      await fetch(`/api/upload/${item.id}?url=${encodeURIComponent(item.url)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      log.error('Error deleting file', { error: err instanceof Error ? err.message : String(err) });
    }
    
    onMediaChange(media.filter(m => m.id !== item.id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Media (optional)
        </label>
        <span className="text-xs text-zinc-500">
          {media.length}/{maxFiles} files
        </span>
      </div>

      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-6 text-center transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-600 dark:hover:bg-zinc-800"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading || media.length >= maxFiles}
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Image className="h-6 w-6 text-zinc-400" />
              <Video className="h-6 w-6 text-zinc-400" />
              <Upload className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Click to upload images or videos
            </p>
            <p className="text-xs text-zinc-400">
              JPEG, PNG, GIF, WebP, MP4, MOV, WebM (max 100MB)
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* Media preview grid */}
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {item.type === 'image' ? (
                <img
                  src={item.url}
                  alt={item.filename}
                  className="h-32 w-full object-cover"
                />
              ) : (
                <video
                  src={item.url}
                  className="h-32 w-full object-cover"
                />
              )}
              
              {/* Overlay with info */}
              <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(item);
                  }}
                  className="ml-auto rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="text-xs text-white">
                  <p className="truncate">{item.filename}</p>
                  <p>{formatFileSize(item.size)}</p>
                </div>
              </div>

              {/* Type indicator */}
              <div className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
                {item.type === 'video' ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
