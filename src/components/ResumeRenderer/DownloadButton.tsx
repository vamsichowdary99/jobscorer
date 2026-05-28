"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { OpenResume } from "./PdfDocument";

// Lazy-load the inner component to avoid SSR issues with @react-pdf/renderer
const DownloadButtonInner = dynamic(
  () => import("./DownloadButtonInner"),
  { ssr: false }
);

interface DownloadButtonProps {
  resume: OpenResume;
  fileName?: string;
  className?: string;
}

/**
 * Client-only download button that generates a PDF from the resume data
 * and provides a download link.
 */
const DownloadButton: React.FC<DownloadButtonProps> = (props) => {
  return <DownloadButtonInner {...props} />;
};

export default DownloadButton;
