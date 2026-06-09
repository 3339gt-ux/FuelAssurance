'use client';

import { useCallback, useRef, useState } from 'react';
import type { UploadResponse } from '@/types/upload';

const POLL_INTERVAL_MS = 800;
const TIMEOUT_MS = 120_000;
const STALE_MS = 15_000;

export interface UploadJobState {
  isProcessing: boolean;
  progress: number;
  stageLabel: string;
  isStale: boolean;
  jobId: string | null;
}

export function useUploadJob() {
  const [state, setState] = useState<UploadJobState>({
    isProcessing: false,
    progress: 0,
    stageLabel: '',
    isStale: false,
    jobId: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    clearPoll();
    if (state.jobId) {
      try {
        await fetch(`/api/jobs/${state.jobId}`, { method: 'DELETE' });
      } catch { /* ignore */ }
    }
    setState({ isProcessing: false, progress: 0, stageLabel: '', isStale: false, jobId: null });
  }, [clearPoll, state.jobId]);

  const uploadWithPolling = useCallback(async (
    formData: FormData,
    fileName: string,
    fileType: string,
  ): Promise<UploadResponse> => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    clearPoll();
    lastUpdateRef.current = Date.now();

    setState({
      isProcessing: true,
      progress: 5,
      stageLabel: 'Uploading…',
      isStale: false,
      jobId: null,
    });

    const timeout = setTimeout(() => {
      setState((s) => ({ ...s, isStale: true }));
    }, TIMEOUT_MS);

    try {
      const res = await fetch('/api/upload?async=1', {
        method: 'POST',
        body: formData,
        signal: abortRef.current.signal,
      });
      const data = await res.json();

      if ('jobId' in data && data.jobId) {
        const jobId = data.jobId as string;
        setState((s) => ({ ...s, jobId, stageLabel: 'Queued…', progress: 10 }));

        return await new Promise<UploadResponse>((resolve, reject) => {
          const started = Date.now();
          pollRef.current = setInterval(async () => {
            if (Date.now() - lastUpdateRef.current > STALE_MS) {
              setState((s) => ({ ...s, isStale: true, stageLabel: 'Processing is taking longer than expected…' }));
            }
            if (Date.now() - started > TIMEOUT_MS) {
              clearPoll();
              clearTimeout(timeout);
              setState({ isProcessing: false, progress: 0, stageLabel: '', isStale: false, jobId: null });
              reject(new Error('Upload timed out'));
              return;
            }
            try {
              const statusRes = await fetch(`/api/jobs/${jobId}`);
              const job = await statusRes.json();
              lastUpdateRef.current = Date.now();
              setState({
                isProcessing: !['complete', 'complete_with_warnings', 'failed', 'cancelled'].includes(job.status),
                progress: job.progress ?? 0,
                stageLabel: job.stageLabel ?? 'Processing…',
                isStale: false,
                jobId,
              });

              if (job.status === 'complete' || job.status === 'complete_with_warnings') {
                clearPoll();
                clearTimeout(timeout);
                setState({ isProcessing: false, progress: 100, stageLabel: 'Complete', isStale: false, jobId: null });
                resolve(job.result as UploadResponse);
              } else if (job.status === 'failed' || job.status === 'cancelled') {
                clearPoll();
                clearTimeout(timeout);
                setState({ isProcessing: false, progress: 0, stageLabel: '', isStale: false, jobId: null });
                resolve(job.result as UploadResponse);
              }
            } catch (err) {
              clearPoll();
              clearTimeout(timeout);
              reject(err);
            }
          }, POLL_INTERVAL_MS);
        });
      }

      clearTimeout(timeout);
      setState({ isProcessing: false, progress: 100, stageLabel: 'Complete', isStale: false, jobId: null });
      return data as UploadResponse;
    } catch (err) {
      clearTimeout(timeout);
      clearPoll();
      setState({ isProcessing: false, progress: 0, stageLabel: '', isStale: false, jobId: null });
      throw err;
    }
  }, [clearPoll]);

  return { state, uploadWithPolling, cancel };
}