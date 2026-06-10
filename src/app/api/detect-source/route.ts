import { NextRequest, NextResponse } from 'next/server';
import { detectSourceType } from '@/lib/source-detection';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const specifiedType = (formData.get('type') as string) || '';

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await detectSourceType(
      buffer,
      file.name,
      file.type || '',
      specifiedType || undefined
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Detection failed' },
      { status: 500 }
    );
  }
}