'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export interface StructuredInput {
  title?: string;
  problem?: string;
  solution?: string;
  tech?: string[];
  outcome?: string;
  cta?: string;
  customFields?: Record<string, string>;
}

interface StructuredInputFormProps {
  value: StructuredInput;
  onChange: (value: StructuredInput) => void;
}

export function StructuredInputForm({ value, onChange }: StructuredInputFormProps) {
  const [newTech, setNewTech] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const updateField = (field: keyof StructuredInput, fieldValue: string | string[] | Record<string, string>) => {
    onChange({ ...value, [field]: fieldValue });
  };

  const addTech = () => {
    if (newTech.trim()) {
      const currentTech = value.tech || [];
      updateField('tech', [...currentTech, newTech.trim()]);
      setNewTech('');
    }
  };

  const removeTech = (index: number) => {
    const currentTech = value.tech || [];
    updateField('tech', currentTech.filter((_, i) => i !== index));
  };

  const addCustomField = () => {
    if (newFieldKey.trim() && newFieldValue.trim()) {
      const currentFields = value.customFields || {};
      updateField('customFields', { ...currentFields, [newFieldKey.trim()]: newFieldValue.trim() });
      setNewFieldKey('');
      setNewFieldValue('');
    }
  };

  const removeCustomField = (key: string) => {
    const currentFields = { ...value.customFields };
    delete currentFields[key];
    updateField('customFields', currentFields);
  };

  const inputClasses = "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-glow)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500";

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Fill in the details below and AI will generate a LinkedIn post for you.
      </p>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Project/Topic Title *
        </label>
        <input
          type="text"
          value={value.title || ''}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="e.g., AI-powered onboarding generator"
          className={inputClasses}
        />
      </div>

      {/* Problem */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Problem Being Solved
        </label>
        <textarea
          rows={2}
          value={value.problem || ''}
          onChange={(e) => updateField('problem', e.target.value)}
          placeholder="e.g., Manual onboarding docs are slow & inconsistent"
          className={inputClasses}
        />
      </div>

      {/* Solution */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Solution/Approach
        </label>
        <textarea
          rows={2}
          value={value.solution || ''}
          onChange={(e) => updateField('solution', e.target.value)}
          placeholder="e.g., Generated onboarding scripts using OpenAI + video avatars"
          className={inputClasses}
        />
      </div>

      {/* Tech Stack */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Technologies Used
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          {(value.tech || []).map((tech, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface)] px-3 py-1 text-sm text-[color:var(--accent)]"
            >
              {tech}
              <button
                type="button"
                onClick={() => removeTech(index)}
                className="ml-1 hover:text-[color:var(--accent)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newTech}
            onChange={(e) => setNewTech(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTech())}
            placeholder="Add technology..."
            className={inputClasses + ' flex-1'}
          />
          <button
            type="button"
            onClick={addTech}
            className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Outcome */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Outcome/Result
        </label>
        <input
          type="text"
          value={value.outcome || ''}
          onChange={(e) => updateField('outcome', e.target.value)}
          placeholder="e.g., Working MVP in 3 days"
          className={inputClasses}
        />
      </div>

      {/* CTA */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Call to Action
        </label>
        <input
          type="text"
          value={value.cta || ''}
          onChange={(e) => updateField('cta', e.target.value)}
          placeholder="e.g., Happy to share the demo if curious"
          className={inputClasses}
        />
      </div>

      {/* Custom Fields */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Custom Fields (optional)
        </label>
        {value.customFields && Object.entries(value.customFields).length > 0 && (
          <div className="mt-2 space-y-2">
            {Object.entries(value.customFields).map(([key, fieldValue]) => (
              <div key={key} className="flex items-center gap-2 rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{key}:</span>
                <span className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">{fieldValue}</span>
                <button
                  type="button"
                  onClick={() => removeCustomField(key)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newFieldKey}
            onChange={(e) => setNewFieldKey(e.target.value)}
            placeholder="Field name"
            className={inputClasses + ' w-1/3'}
          />
          <input
            type="text"
            value={newFieldValue}
            onChange={(e) => setNewFieldValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomField())}
            placeholder="Field value"
            className={inputClasses + ' flex-1'}
          />
          <button
            type="button"
            onClick={addCustomField}
            className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
