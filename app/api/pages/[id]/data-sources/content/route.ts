import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import type { DatabaseSource } from '@/lib/models/Page';
import mongoose from 'mongoose';
import { fetchContentForGeneration } from '@/lib/data-sources/database';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]:data-sources:content');

// GET /api/pages/[id]/data-sources/content - Get content items for generation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');
    const limit = parseInt(searchParams.get('limit') || '10');

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use native MongoDB to get the page with dataSources
    const page = await mongoose.connection.db?.collection('pages').findOne({ 
      _id: new mongoose.Types.ObjectId(id),
      userId: user._id,
    });
    
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const dataSources = page.dataSources?.databases || [];
    
    if (dataSources.length === 0) {
      return NextResponse.json({ 
        error: 'No data sources configured',
        items: [],
      });
    }

    // Find the specific data source or use the first active one
    const source = sourceId 
      ? dataSources.find((ds: DatabaseSource) => ds.id === sourceId)
      : dataSources.find((ds: DatabaseSource) => ds.isActive);
      
    if (!source) {
      return NextResponse.json({ 
        error: 'No active data source found',
        items: [],
      });
    }

    // Fetch content from the data source
    const result = await fetchContentForGeneration(source as DatabaseSource, {
      limit,
      randomize: false, // Return in order for browsing
    });

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error,
        items: [],
      });
    }

    // Return items with limited body preview
    const items = (result.items || []).map(item => ({
      id: item.id,
      title: item.title,
      bodyPreview: item.body.slice(0, 300) + (item.body.length > 300 ? '...' : ''),
      date: item.date,
      category: item.category,
    }));

    return NextResponse.json({
      success: true,
      source: {
        id: source.id,
        name: source.name,
        type: source.type,
      },
      items,
      totalCount: result.items?.length || 0,
    });
  } catch (error) {
    log.error('Get content items error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to get content items' },
      { status: 500 }
    );
  }
}
