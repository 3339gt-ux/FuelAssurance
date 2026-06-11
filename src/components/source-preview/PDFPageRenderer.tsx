import React, { useEffect, useRef, useState } from 'react';

// Global cache to prevent re-fetching and re-parsing PDFs
const pdfDocCache = new Map<string, any>();
let pdfjsLoadingPromise: Promise<any> | null = null;

// Dynamic loader for PDF.js CDN
function loadPdfJS(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('SSR');
  if ((window as any).pdfjsLib) {
    return Promise.resolve((window as any).pdfjsLib);
  }

  if (pdfjsLoadingPromise) {
    return pdfjsLoadingPromise;
  }

  pdfjsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = (err) => {
      pdfjsLoadingPromise = null;
      reject(err);
    };
    document.body.appendChild(script);
  });

  return pdfjsLoadingPromise;
}

interface PDFPageRendererProps {
  fileId: string;
  pageNumber: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | undefined;
  crop?: boolean;
  scale?: number;
  className?: string;
  onLoadComplete?: (info: { originalWidth: number; originalHeight: number }) => void;
}

export default function PDFPageRenderer({
  fileId,
  pageNumber,
  boundingBox,
  crop = false,
  scale = 1.5,
  className = '',
  onLoadComplete,
}: PDFPageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const renderPage = async () => {
      try {
        const pdfjsLib = await loadPdfJS();
        
        let pdfDoc;
        const cacheKey = `pdf_${fileId}`;
        if (pdfDocCache.has(cacheKey)) {
          pdfDoc = pdfDocCache.get(cacheKey);
        } else {
          const url = `/api/files/${fileId}`;
          const loadingTask = pdfjsLib.getDocument(url);
          pdfDoc = await loadingTask.promise;
          pdfDocCache.set(cacheKey, pdfDoc);
        }

        if (!active) return;

        if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
          setError(`Invalid page number ${pageNumber} of ${pdfDoc.numPages}`);
          setLoading(false);
          return;
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (!active) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Render PDF page to canvas
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        if (!active) return;

        // Highlight bounding box if available
        if (boundingBox) {
          const { x, y, width: w, height: h } = boundingBox;
          
          // PDF.js coordinates: bottom-left is 0,0. Convert corners to viewport canvas points
          const [p1x, p1y] = viewport.convertToViewportPoint(x, y + h);
          const [p2x, p2y] = viewport.convertToViewportPoint(x + w, y);

          const left = Math.min(p1x, p2x);
          const top = Math.min(p1y, p2y);
          const rectW = Math.abs(p2x - p1x);
          const rectH = Math.abs(p2y - p1y);

          // Draw yellow transparent highlighting overlay
          ctx.fillStyle = 'rgba(250, 204, 21, 0.35)'; // Yellow-400 with opacity
          ctx.fillRect(left - 2, top - 2, rectW + 4, rectH + 4);

          // Draw a fine border
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)'; // Yellow-500
          ctx.lineWidth = 1.5;
          ctx.strokeRect(left - 2, top - 2, rectW + 4, rectH + 4);

          if (crop && containerRef.current) {
            // Apply crop behavior: resize canvas to show only the crop area plus padding
            const padding = 15;
            const cropX = Math.max(0, left - padding);
            const cropY = Math.max(0, top - padding);
            const cropW = Math.min(viewport.width - cropX, rectW + padding * 2);
            const cropH = Math.min(viewport.height - cropY, rectH + padding * 2);

            // Create temporary canvas to hold crop
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cropW;
            tempCanvas.height = cropH;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
              canvas.width = cropW;
              canvas.height = cropH;
              ctx.drawImage(tempCanvas, 0, 0);
            }
          }
        }

        setLoading(false);
        if (onLoadComplete) {
          onLoadComplete({
            originalWidth: viewport.width / scale,
            originalHeight: viewport.height / scale,
          });
        }
      } catch (err) {
        console.error('PDF Render Error:', err);
        if (active) {
          setError(String(err));
          setLoading(false);
        }
      }
    };

    renderPage();

    return () => {
      active = false;
    };
  }, [fileId, pageNumber, boundingBox, crop, scale]);

  return (
    <div ref={containerRef} className={`relative flex items-center justify-center overflow-auto ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/10 dark:bg-black/20 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-gray-500 font-medium">Rendering PDF page...</span>
          </div>
        </div>
      )}
      {error && (
        <div className="p-4 text-center bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">Failed to render PDF page</p>
          <p className="text-xs text-red-500 mt-1">{error}</p>
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full h-auto shadow-md rounded border border-gray-200 dark:border-gray-800" />
    </div>
  );
}
