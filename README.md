# Social Media Auto-Poster

A self-hosted multi-platform social media automation tool with AI-powered content generation, scheduling, and engagement.

## Features

### Multi-Platform Publishing
- **LinkedIn** - Personal profiles and company pages
- **Twitter/X** - Full API v2 support with engagement
- **Facebook** - Pages publishing
- **Instagram** - Coming soon

### Three Content Modes
- **Manual** - Write your own content with full control
- **Structured** - Provide key details, AI writes the post
- **AI Generate** - Describe your topic, AI creates everything

### Smart AI Content Generation
- Platform-specific character limits enforced (280 for Twitter, 3000 for LinkedIn)
- Human-like writing style (no AI-sounding phrases)
- Customizable tone, emojis, and hashtags
- Learning from past performance
- 16 Groq models with smart load balancing

### ICP Twitter Engagement
- Autonomous agent finds your Ideal Customer Profile on Twitter
- Searches for relevant conversations
- Generates contextual, value-adding replies
- Tracks engagement outcomes

### Analytics and Learning
- Per-platform metrics collection
- Performance-based content optimization
- Engagement history tracking

### Token Management
- Automatic token refresh
- Email alerts when refresh fails
- 24-hour cooldown to prevent spam

### Media Support
- Images and videos (up to 100MB)
- S3-compatible storage
- Platform-specific media handling

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: MongoDB
- **Auth**: NextAuth.js v5
- **AI**: Ollama (default, self-hosted) or Groq (16 models with load balancing, optional cloud fallback)
- **Storage**: S3-compatible (MinIO, AWS S3)
- **Email**: Resend
- **Styling**: Tailwind CSS

## Quick Start

### Prerequisites

- Node.js 20+
- MongoDB instance
- MinIO or S3-compatible storage
- Platform Developer Apps (LinkedIn, Twitter, Facebook)
- Groq API key (optional — only for the Groq cloud AI provider; Ollama is the default)
- Resend API key (for email alerts)

### Environment Setup

Copy `.env.example` to `.env` and configure:

```env
# MongoDB
MONGODB_URI=mongodb://user:password@localhost:27017/social-poster

# NextAuth
AUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret

# Twitter OAuth 2.0
TWITTER_CLIENT_ID=your-client-id
TWITTER_CLIENT_SECRET=your-client-secret
TWITTER_REDIRECT_URI=http://localhost:3000/api/auth/twitter/callback

# Facebook
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
FACEBOOK_REDIRECT_URI=http://localhost:3000/api/auth/facebook/callback

# AI — Ollama is the default provider; set AI_PROVIDER=groq to use Groq instead
GROQ_API_KEY=your-groq-key

# S3/MinIO Storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=uploads

# Email (Resend)
RESEND_API_KEY=your-resend-key

# Cron Secret
CRON_SECRET=your-random-secret
```

### Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000

## Docker Deployment

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Architecture

```
+------------------------------------------------------------------+
|                       Docker Compose                              |
+-----------------------------+------------------------------------+
|       app (Next.js)         |        scheduler (Alpine)          |
|        Port 3000            |         Cron Jobs                  |
+-------------+---------------+-----------------+------------------+
              |                                 |
              v                                 v
+---------------------+         +----------------------------------+
|      MongoDB        |         |         Cron Endpoints           |
|   - Posts           |         |  /api/cron/publish      (5 min)  |
|   - Pages           |         |  /api/cron/engage       (15 min) |
|   - Users           |         |  /api/cron/icp-engage   (12 hr)  |
|   - ICPEngagement   |         |  /api/cron/token-refresh (1 hr)  |
|   - AIUsage         |         |  /api/cron/auto-generate (6 AM)  |
|   - TokenAlert      |         |  /api/cron/collect-metrics(6 hr) |
+---------------------+         +----------------------------------+

+---------------------+         +----------------------------------+
|   MinIO / S3        |         |          External APIs           |
|  (media storage)    |         |  - LinkedIn API                  |
+---------------------+         |  - Twitter API v2                |
                                |  - Facebook Graph API            |
                                |  - Groq AI                       |
                                |  - Resend Email                  |
                                +----------------------------------+
```

## Cron Jobs

Scheduled via `vercel.json` (`crons`):

| Schedule | Job | Description |
|----------|-----|-------------|
| `*/5 * * * *` | publish | Publish scheduled posts |
| `0 6 * * *` | auto-generate | Daily AI content generation |
| `*/15 * * * *` | engage | LinkedIn auto-engagement |
| `0 */6 * * *` | collect-metrics | Gather platform analytics |
| `0 */6 * * *` | conversation-monitor | Monitor & reply to Twitter conversations |

Additional jobs (`/api/cron/icp-engage`, `/api/cron/token-refresh`) exist but are
triggered externally rather than by Vercel cron. All cron endpoints require
`Authorization: Bearer $CRON_SECRET` and reject requests when `CRON_SECRET` is unset.

## API Routes

### Posts
| Route | Method | Description |
|-------|--------|-------------|
| `/api/posts` | GET | List all posts |
| `/api/posts` | POST | Create a new post |
| `/api/posts/[id]` | GET/PUT/DELETE | Manage single post |
| `/api/posts/[id]/retry` | POST | Retry failed post |

### Content Generation
| Route | Method | Description |
|-------|--------|-------------|
| `/api/generate` | POST | Generate AI content |
| `/api/ai/usage` | GET | View AI model usage stats |

### Pages and Connections
| Route | Method | Description |
|-------|--------|-------------|
| `/api/pages` | GET/POST | Manage pages/brands |
| `/api/auth/twitter` | GET | Start Twitter OAuth |
| `/api/auth/facebook` | GET | Start Facebook OAuth |

### Engagement
| Route | Method | Description |
|-------|--------|-------------|
| `/api/engagements` | GET | List engagements |
| `/api/icp-engagement` | GET | ICP engagement history |

### System
| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/cron/*` | GET | Cron job endpoints |

## ICP Twitter Engagement

The system autonomously engages with your Ideal Customer Profile:

1. **Analyzes your page** - Topics, audience, value proposition
2. **Generates search queries** - Based on ICP pain points
3. **Finds relevant tweets** - From potential customers
4. **Evaluates relevance** - Scores 0-10 for ICP match
5. **Generates replies** - Contextual, value-adding (not promotional)
6. **Posts replies** - With rate limiting and safeguards

### Safeguards
- Minimum relevance score: 7/10
- Max 1 reply per run (cost optimized)
- 24-hour cooldown per user
- Filters: 100-100k followers, skip verified
- Quality validation (no sycophantic replies)

## Platform Character Limits

| Platform | Limit | AI Guidance |
|----------|-------|-------------|
| Twitter | 280 | Aim for 200-250 |
| LinkedIn | 3,000 | Aim for 800-1,200 |
| Facebook | 63,206 | Aim for 500 |
| Instagram | 2,200 | Front-load first 125 |

## AI Quality

The AI is tuned to write like a professional, not a marketer:

**Avoided:**
- Em dashes
- "Not just X, but Y"
- Marketing buzzwords
- AI phrases: "It's worth noting", "At its core"

**Encouraged:**
- First person voice
- Contractions (don't, it's)
- Varied sentence length
- Specific examples
- Thoughtful questions

## License

MIT
