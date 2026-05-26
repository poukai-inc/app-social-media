'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PostAngle {
  angle: string;
  hook: string;
  outline: string;
}

interface BlogAnalysis {
  title: string;
  summary: string;
  keyInsights: string[];
  postAngles: PostAngle[];
  suggestedPostCount: number;
}

interface GeneratedPost {
  content: string;
  analysis: {
    confidence: number;
    riskLevel: string;
    angle: string;
    aiReasoning?: string;
  };
  requiresApproval: boolean;
}

export default function BlogRepurposePage() {
  const { status } = useSession();
  const router = useRouter();
  
  const [step, setStep] = useState<'input' | 'analyze' | 'generate' | 'preview'>('input');
  const [blogUrl, setBlogUrl] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [analysis, setAnalysis] = useState<BlogAnalysis | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<PostAngle | null>(null);
  const [includeLink, setIncludeLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [tone, setTone] = useState<'professional' | 'casual' | 'inspirational' | 'educational'>('professional');
  
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [editedContent, setEditedContent] = useState('');

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--accent)]"></div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  const handleAnalyze = async () => {
    if (!blogUrl && !blogContent) {
      setError('Please provide a blog URL or paste content');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/blog/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: blogUrl || undefined, 
          content: blogContent || undefined 
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to analyze blog');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      setStep('analyze');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedAngle || !analysis) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/blog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogContent: blogContent || '',
          blogUrl,
          blogTitle: analysis.title,
          angle: selectedAngle.angle,
          hook: selectedAngle.hook,
          outline: selectedAngle.outline,
          includeLink,
          linkUrl: includeLink ? linkUrl : undefined,
          tone,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate post');
      }

      const data = await response.json();
      setGeneratedPost(data.post);
      setEditedContent(data.post.content);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsDraft = async () => {
    // The post is already created, redirect to edit
    if (generatedPost) {
      router.push(`/dashboard/edit/${(generatedPost as { id?: string }).id || 'draft'}`);
    }
  };

  const getAngleEmoji = (angle: string) => {
    const emojis: Record<string, string> = {
      problem_recognition: '🎯',
      war_story: '⚔️',
      opinionated_take: '💭',
      insight: '💡',
      how_to: '📝',
      case_study: '📊',
    };
    return emojis[angle] || '📌';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Blog → LinkedIn</h1>
            <p className="text-gray-600 mt-1">Repurpose blog content into engaging posts</p>
          </div>
          <Link href="/dashboard" className="text-[color:var(--accent)] hover:text-[color:var(--accent)] font-medium">
            ← Back
          </Link>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-4 mb-8">
          {['input', 'analyze', 'generate', 'preview'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-[color:var(--accent)] text-white' :
                ['input', 'analyze', 'generate', 'preview'].indexOf(step) > i ? 'bg-green-500 text-white' :
                'bg-gray-200 text-gray-600'
              }`}>
                {i + 1}
              </div>
              {i < 3 && <div className="w-12 h-0.5 bg-gray-200 mx-2" />}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {/* Step 1: Input */}
        {step === 'input' && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold mb-4">1. Add Your Blog</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Blog URL
              </label>
              <input
                type="url"
                value={blogUrl}
                onChange={(e) => setBlogUrl(e.target.value)}
                placeholder="https://yourblog.com/post-title"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[color:var(--accent-glow)] focus:border-transparent"
              />
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or paste content</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Blog Content
              </label>
              <textarea
                value={blogContent}
                onChange={(e) => setBlogContent(e.target.value)}
                placeholder="Paste your blog post content here..."
                rows={10}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[color:var(--accent-glow)] focus:border-transparent font-mono text-sm"
              />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading || (!blogUrl && !blogContent)}
              className="w-full py-3 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)] disabled:opacity-50 font-medium"
            >
              {loading ? 'Analyzing...' : 'Analyze Blog →'}
            </button>
          </div>
        )}

        {/* Step 2: Select Angle */}
        {step === 'analyze' && analysis && (
          <div className="space-y-6">
            {/* Blog Summary */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold mb-2">{analysis.title}</h2>
              <p className="text-gray-600 mb-4">{analysis.summary}</p>
              
              <div className="mb-4">
                <h3 className="font-medium text-gray-900 mb-2">Key Insights:</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  {analysis.keyInsights.map((insight, i) => (
                    <li key={i}>{insight}</li>
                  ))}
                </ul>
              </div>

              <p className="text-sm text-[color:var(--accent)]">
                💡 Suggested: Create {analysis.suggestedPostCount} posts from this blog
              </p>
            </div>

            {/* Angle Selection */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold mb-4">2. Choose an Angle</h2>
              
              <div className="grid gap-4">
                {analysis.postAngles.map((angle, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedAngle(angle)}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedAngle === angle
                        ? 'border-[color:var(--accent)] bg-[color:var(--accent-glow)]'
                        : 'border-gray-200 hover:border-[color:var(--accent)]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{getAngleEmoji(angle.angle)}</span>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {angle.angle.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </div>
                        <p className="text-sm text-[color:var(--accent)] mt-1 italic">&ldquo;{angle.hook}&rdquo;</p>
                        <p className="text-sm text-gray-600 mt-2">{angle.outline}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            {selectedAngle && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h2 className="text-xl font-semibold mb-4">3. Post Options</h2>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tone</label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as typeof tone)}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="inspirational">Inspirational</option>
                      <option value="educational">Educational</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeLink}
                        onChange={(e) => setIncludeLink(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Include link to clarity page</span>
                    </label>
                    {includeLink && (
                      <input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="mt-2 w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    )}
                    {includeLink && (
                      <p className="text-xs text-yellow-700 mt-1">
                        ⚠️ Remember: Only 1 in 3 posts should include links
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    onClick={() => setStep('input')}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="flex-1 py-2 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)] disabled:opacity-50 font-medium"
                  >
                    {loading ? 'Generating...' : 'Generate Post →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && generatedPost && (
          <div className="space-y-6">
            {/* Analysis Badge */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Confidence:</span>
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        generatedPost.analysis.confidence >= 0.7 ? 'bg-green-500' :
                        generatedPost.analysis.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${generatedPost.analysis.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{Math.round(generatedPost.analysis.confidence * 100)}%</span>
                </div>

                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  generatedPost.analysis.riskLevel === 'high' ? 'bg-red-100 text-red-800' :
                  generatedPost.analysis.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {generatedPost.analysis.riskLevel.toUpperCase()} RISK
                </span>

                {generatedPost.requiresApproval && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    Requires Approval
                  </span>
                )}
              </div>

              {generatedPost.analysis.aiReasoning && (
                <p className="mt-3 text-sm text-[color:var(--accent)]">
                  🤖 {generatedPost.analysis.aiReasoning}
                </p>
              )}
            </div>

            {/* Post Preview/Edit */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold mb-4">4. Review & Edit</h2>
              
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={15}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[color:var(--accent-glow)] focus:border-transparent font-mono text-sm"
              />

              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm ${editedContent.length > 3000 ? 'text-red-600' : 'text-gray-500'}`}>
                  {editedContent.length} / 3000 characters
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => setStep('analyze')}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ← Change Angle
              </button>
              <button
                onClick={handleSaveAsDraft}
                className="flex-1 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              >
                Save as Draft
              </button>
              <Link
                href="/dashboard/approvals"
                className="flex-1 py-3 bg-[color:var(--accent)] text-white rounded-lg hover:bg-[color:var(--accent)] font-medium text-center"
              >
                Go to Approvals
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
