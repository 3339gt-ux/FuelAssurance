import React, { useEffect, useRef, useState, useCallback } from 'react';

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
  zoomScale?: number;
  onZoomChange?: (zoom: number) => void;
  onLoadComplete?: (info: { originalWidth: number; originalHeight: number }) => void;
}

export interface PDFPageRendererRef {
  recenter: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToWidth: () => void;
  fitToPage: () => void;
}

export const PDFPageRenderer = React.forwardRef<PDFPageRendererRef, PDFPageRendererProps>(function PDFPageRenderer(
  {
    fileId,
    pageNumber,
    boundingBox,
    crop = false,
    scale = 1.5,
    className = '',
    zoomScale: externalZoomScale,
    onZoomChange,
    onLoadComplete,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Interactive Zoom and Pan State
  const [zoom, setZoom] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  
  const highlightRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const originalSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Sync external zoom scale if provided
  useEffect(() => {
    if (externalZoomScale !== undefined) {
      setZoom(externalZoomScale);
    }
  }, [externalZoomScale]);

  // Sync zoom state back to parent
  useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  // Recenter helper
  const recenter = useCallback(() => {
    const container = containerRef.current;
    if (!container || !highlightRectRef.current) return;
    
    // Calculate highlight position with current CSS zoom applied
    const { left, top, width: rectW, height: rectH } = highlightRectRef.current;
    
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    
    const targetScrollLeft = left * zoom - containerW / 2 + (rectW * zoom) / 2;
    const targetScrollTop = top * zoom - containerH / 2 + (rectH * zoom) / 2;
    
    container.scrollTo({
      left: Math.max(0, targetScrollLeft),
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth',
    });
  }, [zoom]);

  // Expose controls to parent via ref
  React.useImperativeHandle(ref, () => ({
    recenter,
    zoomIn: () => setZoom(z => Math.min(3.5, z + 0.25)),
    zoomOut: () => setZoom(z => Math.max(0.4, z - 0.25)),
    resetZoom: () => setZoom(1.0),
    fitToWidth: () => {
      if (containerRef.current && originalSizeRef.current) {
        const padding = 32;
        const containerWidth = containerRef.current.clientWidth - padding;
        const newZoom = containerWidth / originalSizeRef.current.width;
        setZoom(newZoom);
      }
    },
    fitToPage: () => {
      if (containerRef.current && originalSizeRef.current) {
        const padding = 32;
        const containerHeight = containerRef.current.clientHeight - padding;
        const newZoom = containerHeight / originalSizeRef.current.height;
        setZoom(newZoom);
      }
    },
  }));

  // Render logic
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

        // Render at a high constant scale to preserve crispness during CSS zoom
        const renderScale = 2.0; 
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        if (!active) return;

        originalSizeRef.current = {
          width: viewport.width,
          height: viewport.height,
        };

        // Highlight bounding box if available
        if (boundingBox) {
          const { x, y, width: w, height: h } = boundingBox;
          
          const [p1x, p1y] = viewport.convertToViewportPoint(x, y + h);
          const [p2x, p2y] = viewport.convertToViewportPoint(x + w, y);

          const left = Math.min(p1x, p2x);
          const top = Math.min(p1y, p2y);
          const rectW = Math.abs(p2x - p1x);
          const rectH = Math.abs(p2y - p1y);

          // Save coordinates for centering
          highlightRectRef.current = { left, top, width: rectW, height: rectH };

          // Draw yellow transparent highlighting overlay
          ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
          ctx.fillRect(left - 2, top - 2, rectW + 4, rectH + 4);

          // Draw a fine border
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(left - 2, top - 2, rectW + 4, rectH + 4);

          if (crop && containerRef.current) {
            const padding = 15;
            const cropX = Math.max(0, left - padding);
            const cropY = Math.max(0, top - padding);
            const cropW = Math.min(viewport.width - cropX, rectW + padding * 2);
            const cropH = Math.min(viewport.height - cropY, rectH + padding * 2);

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
        } else {
          highlightRectRef.current = null;
        }

        setLoading(false);
        if (onLoadComplete) {
          onLoadComplete({
            originalWidth: viewport.width / renderScale,
            originalHeight: viewport.height / renderScale,
          });
        }

        // Auto-center the highlight on first load if not cropped
        if (!crop) {
          setTimeout(() => {
            recenter();
          }, 150);
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

  // Drag Panning Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current?.scrollLeft || 0,
      scrollTop: containerRef.current?.scrollTop || 0,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    containerRef.current.scrollLeft = dragStart.scrollLeft - dx;
    containerRef.current.scrollTop = dragStart.scrollTop - dy;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Mouse Wheel / Trackpad Zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(z => Math.max(0.4, Math.min(3.5, z * zoomFactor)));
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      onWheel={handleWheel}
      className={`relative w-full h-full overflow-auto select-none bg-gray-100 dark:bg-gray-950 flex items-start justify-start p-4 ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${className}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/10 dark:bg-black/20 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-gray-500 font-medium">Rendering PDF page...</span>
          </div>
        </div>
      )}
      {error && (
        <div className="p-4 mx-auto my-auto text-center bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">Failed to render PDF page</p>
          <p className="text-xs text-red-500 mt-1">{error}</p>
        </div>
      )}
      <div 
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
        }}
        className="inline-block shadow-md rounded border border-gray-200 dark:border-gray-800 bg-white"
      >
        <canvas ref={canvasRef} className="block" />
      </div>
    </div>
  );
});

export default PDFPageRenderer;
