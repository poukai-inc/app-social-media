'use client';

import type { PlatformType } from '@/lib/platforms/types';

interface PlatformSelectorProps {
  availablePlatforms: PlatformType[];
  selectedPlatforms: PlatformType[];
  onChange: (platforms: PlatformType[]) => void;
  disabled?: boolean;
}

const PLATFORM_INFO: Record<PlatformType, { 
  name: string; 
  icon: string; 
  color: string; 
  charLimit: number;
  description: string;
}> = {
  linkedin: {
    name: 'LinkedIn',
    icon: '💼',
    color: 'bg-[color:var(--accent)]',
    charLimit: 3000,
    description: 'Professional network',
  },
  facebook: {
    name: 'Facebook',
    icon: '📘',
    color: 'bg-[color:var(--accent)]',
    charLimit: 63206,
    description: 'Social network',
  },
  twitter: {
    name: 'Twitter / X',
    icon: '🐦',
    color: 'bg-sky-600',
    charLimit: 280,
    description: 'Microblogging',
  },
  instagram: {
    name: 'Instagram',
    icon: '📷',
    color: 'bg-gradient-to-r from-purple-600 to-pink-600',
    charLimit: 2200,
    description: 'Visual content',
  },
};

export default function PlatformSelector({
  availablePlatforms,
  selectedPlatforms,
  onChange,
  disabled = false,
}: PlatformSelectorProps) {
  const togglePlatform = (platform: PlatformType) => {
    if (disabled) return;
    
    if (selectedPlatforms.includes(platform)) {
      // Don't allow deselecting all platforms
      if (selectedPlatforms.length === 1) return;
      onChange(selectedPlatforms.filter(p => p !== platform));
    } else {
      onChange([...selectedPlatforms, platform]);
    }
  };

  const selectAll = () => {
    if (disabled) return;
    onChange([...availablePlatforms]);
  };

  if (availablePlatforms.length === 0) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <p className="text-gray-400 text-sm">
          No platforms connected. Connect a platform in your page settings first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">
          Publish to
        </label>
        {availablePlatforms.length > 1 && (
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled}
            className="text-xs text-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:opacity-50"
          >
            Select all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {availablePlatforms.map((platform) => {
          const info = PLATFORM_INFO[platform];
          const isSelected = selectedPlatforms.includes(platform);
          
          return (
            <button
              key={platform}
              type="button"
              onClick={() => togglePlatform(platform)}
              disabled={disabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                isSelected
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/20 text-white'
                  : 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className="text-lg">{info.icon}</span>
              <span className="text-sm font-medium">{info.name}</span>
              {isSelected && (
                <svg 
                  className="w-4 h-4 text-[color:var(--accent)]" 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                >
                  <path 
                    fillRule="evenodd" 
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                    clipRule="evenodd" 
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {/* Character limits info */}
      {selectedPlatforms.length > 1 && (
        <div className="p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">
            Content will be adapted for each platform:
          </p>
          <div className="flex flex-wrap gap-4 text-xs">
            {selectedPlatforms.map((platform) => {
              const info = PLATFORM_INFO[platform];
              return (
                <div key={platform} className="text-gray-500">
                  <span className="mr-1">{info.icon}</span>
                  {info.name}: {info.charLimit.toLocaleString()} chars
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
