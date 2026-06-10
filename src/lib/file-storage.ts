import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'private-uploads');

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Persist an uploaded source file locally (gitignored). Returns a stable reference path.
 */
export function storeSourceFile(fileHash: string, originalFileName: string, buffer: Buffer): string {
  ensureUploadDir();
  const ext = path.extname(originalFileName) || '.bin';
  const safeName = `${fileHash.slice(0, 16)}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, buffer);
  }
  return `private-uploads/${safeName}`;
}

export function getStoredFilePath(storedReference: string): string | null {
  if (!storedReference || !storedReference.startsWith('private-uploads/')) return null;
  const fullPath = path.join(process.cwd(), storedReference);
  return fs.existsSync(fullPath) ? fullPath : null;
}