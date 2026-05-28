"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { OpenResume } from "./PdfDocument";

// Lazy-load the inner component to keep @react-pdf/renderer off the server
const ResumePreviewInner = dynamic(
  () => import("./ResumePreviewInner"),
  { ssr: false }
);

interface ResumePreviewProps {
  resume: OpenResume;
  /** Scale factor applied to the LETTER-sized preview (default: auto-fit) */
  scale?: number;
  className?: string;
}

/**
 * Client-only PDF preview that renders the resume as an embedded PDF
 * inside an iframe using the browser's built-in PDF viewer.
 */
const ResumePreview: React.FC<ResumePreviewProps> = (props) => {
  return <ResumePreviewInner {...props} />;
};

export default ResumePreview;
