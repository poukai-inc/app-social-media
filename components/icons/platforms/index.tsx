import type { ComponentType, SVGProps } from 'react';
import { FacebookIcon } from './facebook';
import { InstagramIcon } from './instagram';
import { LinkedinIcon } from './linkedin';
import { TwitterIcon } from './twitter';

export { FacebookIcon, InstagramIcon, LinkedinIcon, TwitterIcon };

export const PLATFORM_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  facebook: FacebookIcon,
  twitter: TwitterIcon,
  linkedin: LinkedinIcon,
  instagram: InstagramIcon,
};
