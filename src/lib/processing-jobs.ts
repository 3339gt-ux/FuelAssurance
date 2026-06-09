export type JobStatus =
  | 'queued'
  | 'uploading'
  | 'reading'
  | 'parsing'
  | 'validating'
  | 'scanning_fleet'
  | 'building_summary'
  | 'saving'
  | 'complete'
  | 'complete_with_warnings'
  | 'failed'
  | 'cancelled';

export interface ProcessingJob {
  id: string;
  status: JobStatus;
  progress: number;
  stageLabel: string;
  fileName: string;
  fileType: string;
  startedAt: string;
  updatedAt: string;
  error?: {
    stage: string;
    code: string;
    message: string;
    suggestedAction: string;
  };
  result?: Record<string, unknown>;
  cancelled?: boolean;
}

const jobs = new Map<string, ProcessingJob>();

const STAGE_PROGRESS: Record<JobStatus, number> = {
  queued: 5,
  uploading: 15,
  reading: 25,
  parsing: 45,
  validating: 60,
  scanning_fleet: 72,
  building_summary: 85,
  saving: 95,
  complete: 100,
  complete_with_warnings: 100,
  failed: 100,
  cancelled: 100,
};

export function createJob(id: string, fileName: string, fileType: string): ProcessingJob {
  const job: ProcessingJob = {
    id,
    status: 'queued',
    progress: STAGE_PROGRESS.queued,
    stageLabel: 'Queued',
    fileName,
    fileType,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): ProcessingJob | null {
  return jobs.get(id) ?? null;
}

export function updateJob(id: string, patch: Partial<ProcessingJob> & { status?: JobStatus }): ProcessingJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  const next: ProcessingJob = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
    progress: patch.progress ?? (patch.status ? STAGE_PROGRESS[patch.status] : job.progress),
  };
  jobs.set(id, next);
  return next;
}

export function cancelJob(id: string): ProcessingJob | null {
  const job = jobs.get(id);
  if (!job || job.status === 'complete' || job.status === 'complete_with_warnings' || job.status === 'failed') {
    return job ?? null;
  }
  return updateJob(id, { status: 'cancelled', stageLabel: 'Cancelled', cancelled: true });
}

export function isJobCancelled(id: string): boolean {
  return jobs.get(id)?.cancelled === true;
}

export function pruneOldJobs(maxAgeMs = 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}