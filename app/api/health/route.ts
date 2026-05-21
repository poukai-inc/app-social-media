import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get('detailed') === 'true';

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  };

  if (detailed) {
    // Check MongoDB
    let dbStatus = 'unknown';
    try {
      await connectToDatabase();
      dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    } catch {
      dbStatus = 'error';
    }

    // Check required env vars
    const aiProvider = process.env.AI_PROVIDER || 'ollama';
    const aiConfigured = aiProvider === 'ollama' 
      ? !!process.env.OLLAMA_BASE_URL || true  // Ollama has defaults
      : !!process.env.GROQ_API_KEY;

    const envStatus = {
      AI_CONFIGURED: aiConfigured,
      MONGODB_URI: !!process.env.MONGODB_URI,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      LINKEDIN_CLIENT_ID: !!process.env.LINKEDIN_CLIENT_ID,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    };

    const allEnvOk = envStatus.AI_CONFIGURED && envStatus.MONGODB_URI && 
                     envStatus.NEXTAUTH_SECRET && envStatus.LINKEDIN_CLIENT_ID;

    return NextResponse.json({
      ...health,
      status: dbStatus === 'connected' && allEnvOk ? 'ok' : 'degraded',
      services: {
        database: dbStatus,
        ai: `${aiProvider}${aiConfigured ? ' (configured)' : ' (missing)'}`,
        email: envStatus.RESEND_API_KEY ? 'configured' : 'not_configured',
        linkedin: envStatus.LINKEDIN_CLIENT_ID ? 'configured' : 'missing',
      },
      environment: process.env.NODE_ENV || 'development',
    });
  }

  return NextResponse.json(health);
}
