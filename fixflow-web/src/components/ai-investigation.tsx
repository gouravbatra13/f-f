'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bot, BrainCircuit, RotateCw, Search, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  EmptyState,
  ErrorState,
  formatDate,
  LoadingState,
  Panel,
  StatusBadge,
} from '@/components/ui';

type SourceType = 'issue' | 'incident';

interface SimilarIssue {
  sourceId: string;
  title: string;
  status: string | null;
  severity: string | null;
  similarity: number;
  explanation: string;
}

interface Analysis {
  incidentSummary: string;
  probableRootCause: string;
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceRationale: string;
  evidenceSufficiency: 'insufficient' | 'limited' | 'supporting';
  evidence: { sourceId: string; statement: string }[];
  potentialImpact: string;
  debuggingSteps: string[];
  remediationSuggestions: string[];
  similarIssues: SimilarIssue[];
}

interface SavedAnalysis {
  id: string;
  modelName: string;
  createdAt: string;
  analysis: Analysis;
}

export function AiInvestigationPanel({
  sourceType,
  sourceId,
}: {
  sourceType: SourceType;
  sourceId: string;
}) {
  const [saved, setSaved] = useState<SavedAnalysis | null>(null);
  const [similar, setSimilar] = useState<SimilarIssue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'analysis' | 'similar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryMode, setRetryMode] = useState<'analysis' | 'similar' | 'latest'>('latest');

  const fetchLatest = useCallback(() => {
    const path =
      sourceType === 'issue'
        ? `ai/issues/${sourceId}/analysis/latest`
        : `ai/incidents/${sourceId}/summary`;
    return apiFetch<{ analysis: SavedAnalysis | null }>(path);
  }, [sourceId, sourceType]);

  const loadLatest = useCallback(async () => {
    try {
      const result = await fetchLatest();
      setSaved(result.analysis);
      setSimilar(result.analysis?.analysis.similarIssues ?? null);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load the saved AI analysis',
      );
    } finally {
      setLoading(false);
    }
  }, [fetchLatest]);

  useEffect(() => {
    let active = true;
    void fetchLatest()
      .then((result) => {
        if (!active) return;
        setSaved(result.analysis);
        setSimilar(result.analysis?.analysis.similarIssues ?? null);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the saved AI analysis',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchLatest]);

  const analyze = async () => {
    setRetryMode('analysis');
    setError(null);
    setBusy('analysis');
    try {
      const result = await apiFetch<SavedAnalysis>(
        `ai/${sourceType}s/${sourceId}/analyze`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setSaved(result);
      setSimilar(result.analysis.similarIssues);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'AI analysis could not be completed',
      );
    } finally {
      setBusy(null);
    }
  };

  const findSimilar = async () => {
    if (sourceType !== 'issue') return;
    setRetryMode('similar');
    setError(null);
    setBusy('similar');
    try {
      const result = await apiFetch<{ data: SimilarIssue[] }>(
        `ai/issues/${sourceId}/similar`,
      );
      setSimilar(result.data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to search similar issues',
      );
    } finally {
      setBusy(null);
    }
  };

  const retry = () => {
    if (retryMode === 'analysis') return void analyze();
    if (retryMode === 'similar') return void findSimilar();
    setLoading(true);
    setError(null);
    return void loadLatest();
  };

  return (
    <Panel
      title="AI incident intelligence"
      subtitle="Local model analysis is generated from authorized, sanitized issue and incident evidence."
      className="panel-accent-analytics"
    >
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={retry} />
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'analysis' ? (
            <RotateCw size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {busy === 'analysis' ? 'Analyzing evidence…' : 'Analyze with AI'}
        </button>
        {sourceType === 'issue' && (
          <button
            type="button"
            onClick={() => void findSimilar()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.04] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search size={14} />
            {busy === 'similar' ? 'Searching history…' : 'Find similar issues'}
          </button>
        )}
      </div>

      {busy && (
        <div aria-live="polite" className="mb-4 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] px-4 py-3 text-xs text-cyan-100">
          {busy === 'analysis'
            ? 'The local model is reviewing the issue, timeline, deployments, and matching history. First-time embedding setup can take longer.'
            : 'Searching semantically similar, organization-scoped history…'}
        </div>
      )}

      {loading ? (
        <LoadingState label="Checking saved AI analysis…" />
      ) : saved ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.035] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-100">
              <Bot size={15} />
              AI-generated · hypothesis, not a verified cause
            </div>
            <span className="text-[11px] text-slate-500">
              {saved.modelName} · {formatDate(saved.createdAt)}
            </span>
          </div>

          <section className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <BrainCircuit size={15} className="text-cyan-200" />
              Summary
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {saved.analysis.incidentSummary}
            </p>
          </section>

          <section className="rounded-xl border border-violet-300/10 bg-violet-300/[0.025] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-violet-100">
                Probable root cause · AI hypothesis
              </h3>
              <StatusBadge value={`${saved.analysis.confidenceLabel} confidence`} />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              {saved.analysis.probableRootCause}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Model-reported confidence: {Math.round(saved.analysis.confidence * 100)}% · {saved.analysis.confidenceRationale}
            </p>
          </section>

          {saved.analysis.evidenceSufficiency === 'insufficient' && (
            <div role="status" className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-5 text-amber-100">
              Available evidence is insufficient to identify a likely cause. Treat the analysis as exploratory and gather more diagnostics.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-white/[0.07] p-4">
              <h3 className="text-sm font-semibold text-slate-100">Supporting evidence</h3>
              {saved.analysis.evidence.length ? (
                <ul className="mt-3 space-y-3">
                  {saved.analysis.evidence.map((item, index) => (
                    <li key={`${item.sourceId}-${index}`} className="border-l border-cyan-300/20 pl-3 text-xs leading-5 text-slate-300">
                      {item.statement}
                      <span className="mt-1 block font-mono text-[10px] text-slate-500">
                        Source {item.sourceId.slice(0, 8)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  The model did not return verifiable supporting evidence.
                </p>
              )}
            </section>
            <section className="rounded-xl border border-white/[0.07] p-4">
              <h3 className="text-sm font-semibold text-slate-100">Potential impact</h3>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                {saved.analysis.potentialImpact}
              </p>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RecommendationList
              title="Debugging steps"
              items={saved.analysis.debuggingSteps}
            />
            <RecommendationList
              title="Suggested remediation"
              items={saved.analysis.remediationSuggestions}
            />
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            Recommendations are evidence-grounded suggestions only. Review and verify them before making changes; no generated code is executed.
          </p>
        </div>
      ) : (
        <EmptyState
          title="No saved AI analysis"
          description="Start an analysis when you want an evidence-based summary and debugging hypotheses. No AI output is generated until you request it."
        />
      )}

      {(sourceType === 'issue' || Boolean(saved?.analysis.similarIssues.length)) &&
        similar !== null && (
        <section className="mt-5 border-t border-white/[0.07] pt-5">
          <h3 className="text-sm font-semibold text-slate-100">Similar historical issues</h3>
          {similar.length ? (
            <div className="mt-3 space-y-2">
              {similar.map((item) => (
                <Link
                  key={item.sourceId}
                  href={`/issues/${item.sourceId}`}
                  className="block rounded-xl border border-white/[0.07] bg-black/[0.08] p-3 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.025]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-200">{item.title}</span>
                    <span className="text-xs tabular-nums text-cyan-200">
                      {Math.round(item.similarity * 100)}% similar
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.status && <StatusBadge value={item.status} />}
                    {item.severity && <StatusBadge value={item.severity} />}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{item.explanation}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              No sufficiently similar historical issues were found in this project.
            </p>
          )}
        </section>
      )}
    </Panel>
  );
}

function RecommendationList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section className="rounded-xl border border-white/[0.07] p-4">
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {items.length ? (
        <ol className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${index}-${item.slice(0, 24)}`} className="flex gap-2 text-xs leading-5 text-slate-300">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-300/[0.08] text-[10px] text-cyan-100">
                {index + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-slate-400">No recommendations were returned.</p>
      )}
    </section>
  );
}
