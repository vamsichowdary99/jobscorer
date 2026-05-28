"use client";

import React from "react";
import { usePDF } from "@react-pdf/renderer";
import PdfDocument from "./PdfDocument";
import type { OpenResume } from "./PdfDocument";

interface DownloadButtonInnerProps {
  resume: OpenResume;
  fileName?: string;
  className?: string;
}

/**
 * Inner component that calls usePDF. This file is dynamically imported
 * with ssr:false so @react-pdf/renderer never runs on the server.
 */
const DownloadButtonInner: React.FC<DownloadButtonInnerProps> = ({
  resume,
  fileName,
  className,
}) => {
  const document = <PdfDocument resume={resume} />;
  const [instance] = usePDF({ document });

  const resolvedFileName =
    fileName || `${resume.profile.name.replace(/\s+/g, "_")}_Resume.pdf`;

  const isReady = !instance.loading && instance.url;

  return (
    <a
      href={instance.url ?? undefined}
      download={resolvedFileName}
      aria-disabled={!isReady}
      className={className}
      style={
        className
          ? undefined
          : {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: isReady ? "#135bec" : "#93b4f5",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "14px",
              lineHeight: "20px",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
              textDecoration: "none",
              cursor: isReady ? "pointer" : "default",
              transition: "background-color 150ms ease",
              pointerEvents: isReady ? "auto" : "none",
              userSelect: "none",
            }
      }
    >
      {/* Download icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 1v9m0 0L5 7m3 3l3-3M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {instance.loading ? "Preparing..." : "Download PDF"}
    </a>
  );
};

export default DownloadButtonInner;
