"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { usePDF } from "@react-pdf/renderer";
import PdfDocument from "./PdfDocument";
import type { OpenResume } from "./PdfDocument";

// US Letter at 96 DPI
const LETTER_WIDTH_PX = 816;
const LETTER_HEIGHT_PX = 1056;

interface ResumePreviewInnerProps {
  resume: OpenResume;
  scale?: number;
  className?: string;
}

/**
 * Renders the resume PDF inside an iframe using the blob URL produced by
 * usePDF. The browser's built-in PDF viewer handles the rendering, which
 * gives us high-fidelity preview with zero extra dependencies.
 */
const ResumePreviewInner: React.FC<ResumePreviewInnerProps> = ({
  resume,
  scale: externalScale,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);

  const document = <PdfDocument resume={resume} />;
  const [instance] = usePDF({ document });

  // Compute scale to fit the container width when no explicit scale is given
  const computeScale = useCallback(() => {
    if (externalScale != null) {
      setAutoScale(externalScale);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    const newScale = Math.min(containerWidth / LETTER_WIDTH_PX, 1);
    setAutoScale(newScale);
  }, [externalScale]);

  useEffect(() => {
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, [computeScale]);

  const effectiveScale = externalScale ?? autoScale;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: `${LETTER_WIDTH_PX * effectiveScale}px`,
          maxHeight: `${LETTER_HEIGHT_PX * effectiveScale}px`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${LETTER_WIDTH_PX}px`,
            height: `${LETTER_HEIGHT_PX}px`,
            transform: `scale(${effectiveScale})`,
            transformOrigin: "top left",
            backgroundColor: "#ffffff",
            boxShadow:
              "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
            borderRadius: "2px",
          }}
        >
          {instance.loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                color: "#6b7280",
                fontSize: "14px",
              }}
            >
              Loading preview...
            </div>
          )}
          {!instance.loading && instance.url && (
            <iframe
              src={`${instance.url}#toolbar=0&navpanes=0`}
              title="Resume Preview"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />
          )}
          {!instance.loading && instance.error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                color: "#ef4444",
                fontSize: "14px",
                padding: "24px",
                textAlign: "center",
              }}
            >
              Failed to render PDF preview. Please try downloading instead.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumePreviewInner;
