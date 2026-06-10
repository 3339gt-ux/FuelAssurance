import fs from 'fs';
import path from 'path';

export const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
export const SAMPLE_FILES_DIR = path.resolve(process.cwd(), 'Sample Files');

export function fixturePath(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

export function samplePath(name: string): string {
  return path.join(SAMPLE_FILES_DIR, name);
}

export function hasLocalSampleFiles(): boolean {
  return fs.existsSync(samplePath('document_direct.pdf'));
}

export function resolveFixtureOrSample(fixtureName: string, sampleName: string): string {
  const fixture = fixturePath(fixtureName);
  if (fs.existsSync(fixture)) return fixture;
  const sample = samplePath(sampleName);
  if (fs.existsSync(sample)) return sample;
  return fixture;
}