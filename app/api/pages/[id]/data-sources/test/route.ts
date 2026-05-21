import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import type { DatabaseSource } from '@/lib/models/Page';
import mongoose from 'mongoose';
import { 
  testConnection, 
  previewQuery,
  getTables,
  getTableColumns,
  fetchFromSource,
  transformResults
} from '@/lib/data-sources/database';
import { logger } from '@/lib/logger';

const log = logger.child('api:pages:[id]:data-sources:test');

// POST /api/pages/[id]/data-sources/test - Test connection or preview query
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
    const { action, type, connectionString, query, sourceId, tableName } = body;

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

    // Get connection string from existing source if sourceId provided
    let connString = connectionString;
    let dbType = type;
    let source: DatabaseSource | undefined;

    if (sourceId) {
      source = page.dataSources?.databases?.find(
        (db: DatabaseSource) => db.id === sourceId
      );
      if (source) {
        connString = source.connectionString;
        dbType = source.type;
      }
    }

    if (!connString || !dbType) {
      return NextResponse.json(
        { error: 'Missing connection details' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'test': {
        // Test database connection
        const result = await testConnection(dbType, connString);
        return NextResponse.json(result);
      }

      case 'preview': {
        // Preview query results (limited to 10 rows)
        if (!query && !source?.query) {
          return NextResponse.json(
            { error: 'Missing query' },
            { status: 400 }
          );
        }
        const result = await previewQuery(dbType, connString, query || source!.query);
        return NextResponse.json(result);
      }

      case 'tables': {
        // Get list of tables
        const result = await getTables(dbType, connString);
        return NextResponse.json(result);
      }

      case 'columns': {
        // Get columns for a table
        if (!tableName) {
          return NextResponse.json(
            { error: 'Missing tableName' },
            { status: 400 }
          );
        }
        const result = await getTableColumns(dbType, connString, tableName);
        return NextResponse.json(result);
      }

      case 'fetch': {
        // Fetch data from source and transform
        if (!source) {
          return NextResponse.json(
            { error: 'Source not found' },
            { status: 404 }
          );
        }
        
        const result = await fetchFromSource(source);
        if (!result.success || !result.data) {
          return NextResponse.json(result);
        }
        
        const transformed = transformResults(result.data, source.fieldMapping);
        
        // Update lastFetchedAt
        const sourceIndex = page.dataSources.databases.findIndex(
          (db: DatabaseSource) => db.id === sourceId
        );
        if (sourceIndex >= 0) {
          page.dataSources.databases[sourceIndex].lastFetchedAt = new Date();
          await page.save();
        }
        
        return NextResponse.json({
          ...result,
          transformed,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: test, preview, tables, columns, fetch' },
          { status: 400 }
        );
    }
  } catch (error) {
    log.error('Data source test error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    );
  }
}
