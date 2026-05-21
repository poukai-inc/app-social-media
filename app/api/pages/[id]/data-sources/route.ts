import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import type { DatabaseSource } from '@/lib/models/Page';
import Page from '@/lib/models/Page';
import {
  testConnection,
} from '@/lib/data-sources/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]:data-sources');

// GET /api/pages/[id]/data-sources - List all data sources
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

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use native MongoDB to ensure we get the dataSources field
    const mongoose = await import('mongoose');
    const page = await mongoose.connection.db?.collection('pages').findOne({ 
      _id: new mongoose.Types.ObjectId(id),
      userId: user._id,
    });
    
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Return data sources without sensitive connection strings
    const databases = page.dataSources?.databases || [];
    const sanitizedSources = databases.map((db: DatabaseSource) => ({
      id: db.id,
      name: db.name,
      type: db.type,
      description: db.description,
      query: db.query,
      refreshInterval: db.refreshInterval,
      lastFetchedAt: db.lastFetchedAt,
      isActive: db.isActive,
      fieldMapping: db.fieldMapping,
      // Mask connection string
      connectionString: db.connectionString ? '••••••••' : null,
    }));

    return NextResponse.json({
      dataSources: sanitizedSources,
    });
  } catch (error) {
    log.error('Get data sources error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to get data sources' },
      { status: 500 }
    );
  }
}

// POST /api/pages/[id]/data-sources - Add a new data source
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      type,
      connectionString,
      query,
      description,
      refreshInterval,
      fieldMapping,
    } = body;

    if (!name || !type || !connectionString || !query) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, connectionString, query' },
        { status: 400 }
      );
    }

    // Validate type
    if (!['mysql', 'postgresql', 'mongodb'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid database type. Supported: mysql, postgresql, mongodb' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const page = await Page.findOne({ _id: id, userId: user._id });
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Test connection before saving
    const testResult = await testConnection(type, connectionString);
    if (!testResult.success) {
      return NextResponse.json(
        { error: `Connection test failed: ${testResult.message}` },
        { status: 400 }
      );
    }

    // Create new data source
    const newSource: DatabaseSource = {
      id: uuidv4(),
      name,
      type,
      connectionString,
      query,
      description,
      refreshInterval: refreshInterval || 0,
      isActive: true,
      fieldMapping,
    };

    // Use native MongoDB updateOne for reliable nested updates
    // Mongoose methods have issues with dynamically added schema fields
    const mongoose = await import('mongoose');
    const result = await mongoose.connection.db?.collection('pages').updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      {
        $set: {
          [`dataSources.databases`]: [
            ...(page.dataSources?.databases || []),
            newSource,
          ],
          'dataSources.apis': page.dataSources?.apis || [],
        },
      }
    );

    if (!result || (result.modifiedCount === 0 && result.matchedCount === 0)) {
      return NextResponse.json(
        { error: 'Failed to save data source' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Data source added successfully',
      dataSource: {
        id: newSource.id,
        name: newSource.name,
        type: newSource.type,
        description: newSource.description,
        isActive: newSource.isActive,
      },
      connectionTest: testResult,
    });
  } catch (error) {
    log.error('Add data source error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to add data source' },
      { status: 500 }
    );
  }
}

// PUT /api/pages/[id]/data-sources - Update a data source
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { sourceId, ...updates } = body;

    if (!sourceId) {
      return NextResponse.json(
        { error: 'Missing sourceId' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const page = await Page.findOne({ _id: id, userId: user._id });
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const sourceIndex = page.dataSources?.databases?.findIndex(
      (db: DatabaseSource) => db.id === sourceId
    );

    if (sourceIndex === undefined || sourceIndex < 0) {
      return NextResponse.json(
        { error: 'Data source not found' },
        { status: 404 }
      );
    }

    // If connection string is being updated, test it
    if (updates.connectionString) {
      const testResult = await testConnection(
        updates.type || page.dataSources.databases[sourceIndex].type,
        updates.connectionString
      );
      if (!testResult.success) {
        return NextResponse.json(
          { error: `Connection test failed: ${testResult.message}` },
          { status: 400 }
        );
      }
    }

    // Update the source
    Object.assign(page.dataSources.databases[sourceIndex], updates);
    page.markModified('dataSources');
    await page.save();

    return NextResponse.json({
      success: true,
      message: 'Data source updated successfully',
    });
  } catch (error) {
    log.error('Update data source error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to update data source' },
      { status: 500 }
    );
  }
}

// DELETE /api/pages/[id]/data-sources - Delete a data source
export async function DELETE(
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

    if (!sourceId) {
      return NextResponse.json(
        { error: 'Missing sourceId parameter' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const page = await Page.findOne({ _id: id, userId: user._id });
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    page.dataSources.databases = (page.dataSources?.databases || []).filter(
      (db: DatabaseSource) => db.id !== sourceId
    );

    page.markModified('dataSources');
    await page.save();

    return NextResponse.json({
      success: true,
      message: 'Data source deleted successfully',
    });
  } catch (error) {
    log.error('Delete data source error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Failed to delete data source' },
      { status: 500 }
    );
  }
}
