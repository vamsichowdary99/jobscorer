"use client";

// TEMPORARY dev-only route — side-by-side Jade fidelity check. Safe to delete
// (remove the src/app/jade-preview/ folder when done).

import dynamic from "next/dynamic";

const JadePreviewClient = dynamic(() => import("./JadePreviewClient"), {
  ssr: false,
});

export default function JadePreviewPage() {
  return <JadePreviewClient />;
}
