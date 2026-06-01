import mysql from 'mysql2/promise';
import type { DatabaseSource, DatabaseType } from '../models/Page';
import { logger } from '@/lib/logger';

const log = logger.child('data-source:database');

// Valid table name regex - alphanumeric, underscores, max 64 chars
const VALID_TABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

/**
 * Sanitize and validate table name to prevent SQL injection
 */
function sanitizeTableName(tableName: string): string {
  const trimmed = tableName.trim();
  if (!VALID_TABLE_NAME_REGEX.test(trimmed)) {
    throw new Error(`Invalid table name: ${trimmed}. Table names must be alphanumeric with underscores only.`);
  }
  return trimmed;
}

export interface QueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  fields?: string[];
  rowCount?: number;
  error?: string;
  executionTime?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  serverVersion?: string;
  database?: string;
}

/**
 * Create a MySQL connection with SSL support for cloud databases
 * TiDB Cloud, PlanetScale, AWS RDS, etc. require SSL
 */
async function createMySQLConnection(connectionString: string) {
  // Parse the connection string to add SSL options
  const url = new URL(connectionString);
  
  // Check if this is a cloud database that requires SSL
  const host = url.hostname.toLowerCase();
  const requiresSSL = 
    host.includes('tidbcloud.com') ||
    host.includes('planetscale') ||
    host.includes('rds.amazonaws.com') ||
    host.includes('azure') ||
    host.includes('cloud') ||
    host.includes('serverless');
  
  if (requiresSSL) {
    // Connect with SSL enabled (rejectUnauthorized: true for production)
    return mysql.createConnection({
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1), // Remove leading /
      ssl: {
        rejectUnauthorized: true,
      },
    });
  }
  
  // For local/non-cloud databases, connect without SSL
  return mysql.createConnection(connectionString);
}

/**
 * Test database connection
 */
export async function testConnection(
  type: DatabaseType,
  connectionString: string
): Promise<ConnectionTestResult> {
  const startTime = Date.now();
  
  try {
    if (type === 'mysql' || type === 'postgresql') {
      // For MySQL/PostgreSQL
      const connection = await createMySQLConnection(connectionString);
      
      // Get server info
      const [rows] = await connection.query('SELECT VERSION() as version');
      const version = (rows as { version: string }[])[0]?.version;
      
      // Get current database
      const [dbRows] = await connection.query('SELECT DATABASE() as db');
      const database = (dbRows as { db: string }[])[0]?.db;
      
      await connection.end();
      
      return {
        success: true,
        message: `Connected successfully in ${Date.now() - startTime}ms`,
        ...(version !== undefined ? { serverVersion: version } : {}),
        database: database || 'N/A',
      };
    } else if (type === 'mongodb') {
      // For MongoDB - we'd use mongoose or native driver
      // For now, return not implemented
      return {
        success: false,
        message: 'MongoDB support coming soon',
      };
    }
    
    return {
      success: false,
      message: `Unsupported database type: ${type}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Database connection test failed', { error: errorMessage });
    return {
      success: false,
      message: `Connection failed: ${errorMessage}`,
    };
  }
}

/**
 * Execute a query and return results
 */
export async function executeQuery(
  type: DatabaseType,
  connectionString: string,
  query: string,
  limit: number = 100
): Promise<QueryResult> {
  const startTime = Date.now();
  
  try {
    if (type === 'mysql' || type === 'postgresql') {
      const connection = await createMySQLConnection(connectionString);
      
      // Add LIMIT if not present and it's a SELECT query
      let safeQuery = query.trim();
      if (
        safeQuery.toUpperCase().startsWith('SELECT') &&
        !safeQuery.toUpperCase().includes('LIMIT')
      ) {
        safeQuery = `${safeQuery} LIMIT ${limit}`;
      }
      
      // Only allow SELECT queries for safety
      if (!safeQuery.toUpperCase().startsWith('SELECT')) {
        await connection.end();
        return {
          success: false,
          error: 'Only SELECT queries are allowed for data ingestion',
        };
      }
      
      const [rows, fields] = await connection.query(safeQuery);
      await connection.end();
      
      const fieldNames = (fields as mysql.FieldPacket[]).map(f => f.name);
      const data = rows as Record<string, unknown>[];
      
      return {
        success: true,
        data,
        fields: fieldNames,
        rowCount: data.length,
        executionTime: Date.now() - startTime,
      };
    } else if (type === 'mongodb') {
      return {
        success: false,
        error: 'MongoDB support coming soon',
      };
    }
    
    return {
      success: false,
      error: `Unsupported database type: ${type}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Query execution failed', { error: errorMessage });
    return {
      success: false,
      error: `Query failed: ${errorMessage}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Fetch data from a database source
 */
export async function fetchFromSource(source: DatabaseSource): Promise<QueryResult> {
  if (!source.isActive) {
    return {
      success: false,
      error: 'Data source is not active',
    };
  }
  
  return executeQuery(source.type, source.connectionString, source.query);
}

/**
 * Preview query results (limited to 10 rows)
 */
export async function previewQuery(
  type: DatabaseType,
  connectionString: string,
  query: string
): Promise<QueryResult> {
  return executeQuery(type, connectionString, query, 10);
}

/**
 * Transform database results into content-ready format based on field mapping
 */
export function transformResults(
  results: Record<string, unknown>[],
  fieldMapping: DatabaseSource['fieldMapping']
): Array<{
  title?: string;
  body?: string;
  date?: Date;
  category?: string;
  customData?: Record<string, unknown>;
}> {
  if (!fieldMapping) {
    return results.map(row => ({ customData: row }));
  }
  
  return results.map(row => {
    const transformed: {
      title?: string;
      body?: string;
      date?: Date;
      category?: string;
      customData?: Record<string, unknown>;
    } = {};
    
    if (fieldMapping.titleField && row[fieldMapping.titleField]) {
      transformed.title = String(row[fieldMapping.titleField]);
    }
    
    if (fieldMapping.bodyField && row[fieldMapping.bodyField]) {
      transformed.body = String(row[fieldMapping.bodyField]);
    }
    
    if (fieldMapping.dateField && row[fieldMapping.dateField]) {
      const dateValue = row[fieldMapping.dateField];
      transformed.date = dateValue instanceof Date 
        ? dateValue 
        : new Date(String(dateValue));
    }
    
    if (fieldMapping.categoryField && row[fieldMapping.categoryField]) {
      transformed.category = String(row[fieldMapping.categoryField]);
    }
    
    // Include custom fields
    if (fieldMapping.customFields && fieldMapping.customFields.length > 0) {
      transformed.customData = {};
      for (const field of fieldMapping.customFields) {
        if (row[field] !== undefined) {
          transformed.customData[field] = row[field];
        }
      }
    }
    
    return transformed;
  });
}

/**
 * Get all available tables in the database
 */
export async function getTables(
  type: DatabaseType,
  connectionString: string
): Promise<{ success: boolean; tables?: string[]; error?: string }> {
  try {
    if (type === 'mysql') {
      const connection = await createMySQLConnection(connectionString);
      const [rows] = await connection.query('SHOW TABLES');
      await connection.end();
      
      // Extract table names from result
      const tables = (rows as Record<string, string>[])
        .map(row => Object.values(row)[0])
        .filter((t): t is string => t !== undefined);

      return { success: true, tables };
    } else if (type === 'postgresql') {
      const connection = await createMySQLConnection(connectionString);
      const [rows] = await connection.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      await connection.end();
      
      const tables = (rows as { table_name: string }[]).map(row => row.table_name);
      
      return { success: true, tables };
    }
    
    return { success: false, error: `Unsupported database type: ${type}` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Get columns for a specific table
 */
export async function getTableColumns(
  type: DatabaseType,
  connectionString: string,
  tableName: string
): Promise<{ success: boolean; columns?: { name: string; type: string }[]; error?: string }> {
  try {
    // Validate table name to prevent SQL injection
    const safeTableName = sanitizeTableName(tableName);
    
    if (type === 'mysql') {
      const connection = await createMySQLConnection(connectionString);
      // Use parameterized approach with validated table name
      const [rows] = await connection.query(`DESCRIBE \`${safeTableName}\``);
      await connection.end();
      
      const columns = (rows as { Field: string; Type: string }[]).map(row => ({
        name: row.Field,
        type: row.Type,
      }));
      
      return { success: true, columns };
    } else if (type === 'postgresql') {
      const connection = await createMySQLConnection(connectionString);
      // Use parameterized query for PostgreSQL
      const [rows] = await connection.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?`,
        [safeTableName]
      );
      await connection.end();
      
      const columns = (rows as { column_name: string; data_type: string }[]).map(row => ({
        name: row.column_name,
        type: row.data_type,
      }));
      
      return { success: true, columns };
    }
    
    return { success: false, error: `Unsupported database type: ${type}` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Content item fetched from database for AI generation
 */
export interface ContentItem {
  id: string;
  title: string;
  body: string;
  date?: Date;
  category?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fetch content from a data source for AI post generation
 * Returns content items ready to be used as inspiration
 */
export async function fetchContentForGeneration(
  source: DatabaseSource,
  options: {
    limit?: number;
    randomize?: boolean;
    unusedOnly?: boolean;
    usedIds?: string[];
  } = {}
): Promise<{ success: boolean; items?: ContentItem[]; error?: string }> {
  const { limit = 5, randomize = true, unusedOnly = false, usedIds = [] } = options;
  
  if (!source.isActive) {
    return { success: false, error: 'Data source is not active' };
  }
  
  try {
    const result = await executeQuery(source.type, source.connectionString, source.query, 100);
    
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to fetch data' };
    }
    
    let items = result.data;
    
    // Filter out already used items if requested
    if (unusedOnly && usedIds.length > 0 && source.fieldMapping?.titleField) {
      const idField = result.fields?.find(f => f.toLowerCase().includes('id')) || result.fields?.[0];
      if (idField) {
        items = items.filter(item => !usedIds.includes(String(item[idField])));
      }
    }
    
    // Randomize if requested
    if (randomize) {
      items = items.sort(() => Math.random() - 0.5);
    }
    
    // Limit results
    items = items.slice(0, limit);
    
    // Transform to ContentItem format
    const mapping = source.fieldMapping || {};
    const contentItems: ContentItem[] = items.map(item => {
      // Find best fields for title and body
      const titleField = mapping.titleField || result.fields?.find(f => 
        f.toLowerCase().includes('title') || f.toLowerCase().includes('name')
      );
      const bodyField = mapping.bodyField || result.fields?.find(f => 
        f.toLowerCase().includes('content') || 
        f.toLowerCase().includes('body') || 
        f.toLowerCase().includes('description') ||
        f.toLowerCase().includes('text')
      );
      const dateField = mapping.dateField || result.fields?.find(f => 
        f.toLowerCase().includes('date') || 
        f.toLowerCase().includes('created') ||
        f.toLowerCase().includes('published')
      );
      const idField = result.fields?.find(f => f.toLowerCase() === 'id' || f.toLowerCase().includes('_id'));
      
      // Extract body content - handle JSON fields
      let bodyContent = '';
      if (bodyField && item[bodyField]) {
        const bodyValue = item[bodyField];
        if (typeof bodyValue === 'object') {
          // It's JSON - try to extract text content
          bodyContent = extractTextFromJson(bodyValue);
        } else {
          bodyContent = String(bodyValue);
        }
      }
      
      return {
        id: idField ? String(item[idField]) : String(Math.random()),
        title: titleField ? String(item[titleField] || '') : '',
        body: bodyContent,
        ...(dateField && item[dateField] ? { date: new Date(item[dateField] as string) } : {}),
        ...(mapping.categoryField ? { category: String(item[mapping.categoryField] || '') } : {}),
        metadata: item,
      };
    });
    
    return { success: true, items: contentItems };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Extract text content from a JSON object (e.g., blog post content_json)
 */
function extractTextFromJson(obj: unknown, maxLength: number = 5000): string {
  if (!obj) return '';
  
  if (typeof obj === 'string') {
    return obj.slice(0, maxLength);
  }
  
  if (Array.isArray(obj)) {
    // Handle array of content blocks (common in CMS)
    return obj.map(item => extractTextFromJson(item)).join('\n\n').slice(0, maxLength);
  }
  
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    
    // Common content structures
    if (record.text) return extractTextFromJson(record.text);
    if (record.content) return extractTextFromJson(record.content);
    if (record.body) return extractTextFromJson(record.body);
    if (record.value) return extractTextFromJson(record.value);
    if (record.children) return extractTextFromJson(record.children);
    if (record.blocks) return extractTextFromJson(record.blocks);
    
    // For ProseMirror/TipTap style content
    if (record.type === 'doc' && record.content) {
      return extractTextFromJson(record.content);
    }
    if (record.type === 'paragraph' && record.content) {
      return extractTextFromJson(record.content);
    }
    if (record.type === 'text' && record.text) {
      return String(record.text);
    }
    
    // Fall back to joining all string values
    const texts: string[] = [];
    for (const value of Object.values(record)) {
      if (typeof value === 'string' && value.length > 10) {
        texts.push(value);
      } else if (typeof value === 'object') {
        const extracted = extractTextFromJson(value);
        if (extracted) texts.push(extracted);
      }
    }
    return texts.join('\n').slice(0, maxLength);
  }
  
  return '';
}
