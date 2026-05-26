'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { useToast } from '@poukai-inc/ui/organisms';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const log = logger.child('dashboard:pages:[id]:data-sources');
import {
  ArrowLeft,
  Database,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  Code,
  AlertCircle,
} from 'lucide-react';

interface DataSource {
  id: string;
  name: string;
  type: 'mysql' | 'postgresql' | 'mongodb';
  description?: string;
  query: string;
  refreshInterval?: number;
  lastFetchedAt?: string;
  isActive: boolean;
  connectionString: string;
  fieldMapping?: {
    titleField?: string;
    bodyField?: string;
    dateField?: string;
    categoryField?: string;
    customFields?: string[];
  };
}

interface QueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  fields?: string[];
  rowCount?: number;
  error?: string;
  executionTime?: number;
}

// Helper to format cell values for display
function formatCellValue(value: unknown, maxLength: number = 100): string {
  if (value === null || value === undefined) return '';
  
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value, null, 2);
      return json.length > maxLength ? json.substring(0, maxLength) + '...' : json;
    } catch {
      return '[Complex Object]';
    }
  }
  
  const str = String(value);
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

export default function DataSourcesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const pageId = params.id as string;
  const toast = useToast();

  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [previewResults, setPreviewResults] = useState<QueryResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New source form
  const [newSource, setNewSource] = useState({
    name: '',
    type: 'mysql' as 'mysql' | 'postgresql' | 'mongodb',
    connectionString: '',
    query: '',
    description: '',
    refreshInterval: 0,
  });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchDataSources = async () => {
    try {
      const response = await fetch(`/api/pages/${pageId}/data-sources`);
      if (response.ok) {
        const data = await response.json();
        setDataSources(data.dataSources || []);
      }
    } catch (error) {
      log.error('Failed to fetch data sources', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  // Refactor deferred — see BACKLOG #122 (move to TanStack Query / Suspense)
  useEffect(() => {
    if (session && pageId) {
      setTimeout(() => fetchDataSources(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pageId]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/pages/${pageId}/data-sources/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          type: newSource.type,
          connectionString: newSource.connectionString,
        }),
      });

      const result = await response.json();
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handlePreviewQuery = async (source?: DataSource) => {
    const targetSource = source || selectedSource;
    if (!targetSource && !newSource.query) return;

    setPreviewLoading(true);
    setPreviewResults(null);

    try {
      const response = await fetch(`/api/pages/${pageId}/data-sources/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceId: targetSource?.id,
          type: targetSource?.type || newSource.type,
          connectionString: targetSource ? undefined : newSource.connectionString,
          query: targetSource?.query || newSource.query,
        }),
      });

      const result = await response.json();
      setPreviewResults(result);
    } catch {
      setPreviewResults({ success: false, error: 'Preview failed' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleAddSource = async () => {
    setSaving(true);

    try {
      const response = await fetch(`/api/pages/${pageId}/data-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSource),
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewSource({
          name: '',
          type: 'mysql',
          connectionString: '',
          query: '',
          description: '',
          refreshInterval: 0,
        });
        setTestResult(null);
        setPreviewResults(null);
        fetchDataSources();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to add data source');
      }
    } catch {
      alert('Failed to add data source');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteSource = async () => {
    const id = deleteDialogId;
    if (!id) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/pages/${pageId}/data-sources?sourceId=${id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        toast.show({ tone: 'success', title: 'Data source deleted', body: 'The data source was removed.' });
        fetchDataSources();
      } else {
        toast.show({ tone: 'danger', title: 'Delete failed', body: 'Failed to delete data source.' });
      }
    } catch {
      toast.show({ tone: 'danger', title: 'Delete failed', body: 'Failed to delete data source.' });
    } finally {
      setIsDeleting(false);
      setDeleteDialogId(null);
    }
  };

  const handleToggleActive = async (source: DataSource) => {
    try {
      const response = await fetch(`/api/pages/${pageId}/data-sources`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: source.id,
          isActive: !source.isActive,
        }),
      });

      if (response.ok) {
        fetchDataSources();
      }
    } catch (error) {
      log.error('Failed to toggle source', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--accent)]" />
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/pages/${pageId}/settings`}
            className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Database className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Data Sources
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                  Connect databases to ingest content for AI generation
                </p>
              </div>
            </div>

            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4" />
              Add Data Source
            </Button>
          </div>
        </div>

        {/* Data Sources List */}
        <div className="space-y-4">
          {dataSources.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-12 text-center">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Data Sources Connected
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Connect a MySQL database to pull data for AI-powered content generation
              </p>
              <Button variant="primary" onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4" />
                Add Your First Data Source
              </Button>
            </div>
          ) : (
            dataSources.map((source) => (
              <div
                key={source.id}
                className={`bg-white dark:bg-zinc-900 rounded-xl border p-6 ${
                  source.isActive
                    ? 'border-gray-200 dark:border-zinc-800'
                    : 'border-gray-200 dark:border-zinc-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        source.type === 'mysql'
                          ? 'bg-orange-100 dark:bg-orange-900/30'
                          : source.type === 'postgresql'
                          ? 'bg-[color:var(--surface)]'
                          : 'bg-green-100 dark:bg-green-900/30'
                      }`}
                    >
                      <Database
                        className={`h-5 w-5 ${
                          source.type === 'mysql'
                            ? 'text-orange-600 dark:text-orange-400'
                            : source.type === 'postgresql'
                            ? 'text-[color:var(--accent)]'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {source.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            source.isActive
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {source.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {source.type.toUpperCase()} •{' '}
                        {source.description || 'No description'}
                      </p>
                      {source.lastFetchedAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          Last fetched:{' '}
                          {new Date(source.lastFetchedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedSource(source);
                        handlePreviewQuery(source);
                      }}
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
                      title="Preview Data"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(source)}
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
                      title={source.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {source.isActive ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteDialogId(source.id)}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Query Preview */}
                <div className="mt-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                    <Code className="h-4 w-4" />
                    Query
                  </div>
                  <code className="text-sm text-gray-800 dark:text-gray-200 font-mono">
                    {source.query.length > 100
                      ? `${source.query.substring(0, 100)}...`
                      : source.query}
                  </code>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Data Source Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 dark:border-zinc-800">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Add Data Source
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Connect a database to pull content for AI generation
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name
                  </label>
                  <Input
                    type="text"
                    value={newSource.name}
                    onChange={(e) =>
                      setNewSource({ ...newSource, name: e.target.value })
                    }
                    placeholder="e.g., Sales CRM, Product Analytics"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Database Type
                  </label>
                  <Select
                    value={newSource.type}
                    onValueChange={(v) =>
                      setNewSource({
                        ...newSource,
                        type: v as 'mysql' | 'postgresql' | 'mongodb',
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mysql">MySQL / MariaDB</SelectItem>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mongodb" disabled>MongoDB (Coming Soon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Connection String */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Connection String
                  </label>
                  <Input
                    type="password"
                    value={newSource.connectionString}
                    onChange={(e) =>
                      setNewSource({
                        ...newSource,
                        connectionString: e.target.value,
                      })
                    }
                    placeholder="mysql://user:password@host:port/database"
                    className="font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Format: mysql://username:password@hostname:port/database
                  </p>

                  {/* Test Connection */}
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={handleTestConnection}
                      disabled={!newSource.connectionString || testing}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {testing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Test Connection
                    </button>

                    {testResult && (
                      <span
                        className={`flex items-center gap-1 text-sm ${
                          testResult.success
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {testResult.success ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {testResult.message}
                      </span>
                    )}
                  </div>
                </div>

                {/* Query */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    SQL Query
                  </label>
                  <Textarea
                    value={newSource.query}
                    onChange={(e) =>
                      setNewSource({ ...newSource, query: e.target.value })
                    }
                    rows={4}
                    placeholder="SELECT title, content, created_at FROM posts WHERE status = 'published' ORDER BY created_at DESC"
                    className="font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Only SELECT queries are allowed. Results are automatically limited.
                  </p>

                  {/* Preview Query */}
                  <button
                    onClick={() => handlePreviewQuery()}
                    disabled={
                      !newSource.connectionString ||
                      !newSource.query ||
                      previewLoading
                    }
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {previewLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Preview Results
                  </button>
                </div>

                {/* Preview Results */}
                {previewResults && (
                  <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                    <div
                      className={`px-4 py-2 ${
                        previewResults.success
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {previewResults.success ? (
                        <span className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          {previewResults.rowCount} rows returned in{' '}
                          {previewResults.executionTime}ms
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {previewResults.error}
                        </span>
                      )}
                    </div>

                    {previewResults.success && previewResults.data && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-zinc-800">
                            <tr>
                              {previewResults.fields?.map((field) => (
                                <th
                                  key={field}
                                  className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium"
                                >
                                  {field}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewResults.data.slice(0, 5).map((row, i) => (
                              <tr
                                key={i}
                                className="border-t border-gray-100 dark:border-zinc-800"
                              >
                                {previewResults.fields?.map((field) => (
                                  <td
                                    key={field}
                                    className="px-4 py-2 text-gray-800 dark:text-gray-200 font-mono text-xs max-w-xs"
                                  >
                                    <pre className="whitespace-pre-wrap break-all">
                                      {formatCellValue(row[field], 150)}
                                    </pre>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <Input
                    type="text"
                    value={newSource.description}
                    onChange={(e) =>
                      setNewSource({ ...newSource, description: e.target.value })
                    }
                    placeholder="What data does this query return?"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-200 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setTestResult(null);
                    setPreviewResults(null);
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"
                >
                  Cancel
                </button>
                <Button
                  variant="primary"
                  onClick={handleAddSource}
                  disabled={
                    !newSource.name ||
                    !newSource.connectionString ||
                    !newSource.query ||
                    saving
                  }
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add Data Source
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal for Existing Source */}
        {selectedSource && previewResults && !showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedSource.name} - Data Preview
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">
                    Showing preview of query results
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    setPreviewResults(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6">
                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[color:var(--accent)]" />
                  </div>
                ) : previewResults.success && previewResults.data ? (
                  <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                      <span className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        {previewResults.rowCount} rows returned in{' '}
                        {previewResults.executionTime}ms
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-zinc-800">
                          <tr>
                            {previewResults.fields?.map((field) => (
                              <th
                                key={field}
                                className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium"
                              >
                                {field}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewResults.data.map((row, i) => (
                            <tr
                              key={i}
                              className="border-t border-gray-100 dark:border-zinc-800"
                            >
                              {previewResults.fields?.map((field) => (
                                <td
                                  key={field}
                                  className="px-4 py-2 text-gray-800 dark:text-gray-200 font-mono text-xs max-w-xs"
                                >
                                  <pre className="whitespace-pre-wrap break-all">
                                    {formatCellValue(row[field], 200)}
                                  </pre>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                    <p>{previewResults.error || 'Failed to load preview'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    <ConfirmDialog
      open={deleteDialogId !== null}
      onOpenChange={(open) => { if (!open) setDeleteDialogId(null); }}
      title="Delete this data source?"
      description="This action can't be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={confirmDeleteSource}
      isConfirming={isDeleting}
    />
    </>
  );
}
