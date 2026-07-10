"use client";

import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import "./fonts";
import { defeatLigatures as dL } from "./utils";
import type { CoverLetter } from "@/lib/types";

// Times-Roman is a PDF base-14 built-in — no Font.register needed. See
// HarvardPdfDocument.tsx for why: embedded-subset fonts have corrupted CMaps
// under strict ATS parsers (Workday, Taleo) when multiple templates render
// in one session; Times-Roman uses standard PDF encoding and always extracts.
const FONT = "Times-Roman";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "64pt";
const MARGIN_V = "64pt";

interface CoverLetterProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

interface CoverLetterJob {
  title?: string | null;
  company?: string | null;
  location?: string | null;
}

interface CoverLetterPdfDocumentProps {
  letter: CoverLetter;
  profile: CoverLetterProfile;
  job: CoverLetterJob | null;
}

const CoverLetterPdfDocument: React.FC<CoverLetterPdfDocumentProps> = ({ letter, profile, job }) => {
  const contactParts = [profile.email, profile.phone, profile.location, profile.linkedin].filter(Boolean);
  const dateLabel = new Date(letter.generated_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Document title={`${profile.name || "Cover Letter"}`} author={profile.name} producer="JobScorer">
      <Page
        size={[PAGE_W, PAGE_H]}
        style={{
          fontFamily: FONT,
          fontSize: "11pt",
          color: "#000",
          paddingTop: MARGIN_V,
          paddingBottom: MARGIN_V,
          paddingLeft: MARGIN_H,
          paddingRight: MARGIN_H,
        }}
      >
        {/* Letterhead */}
        <View>
          <Text style={{ fontWeight: "bold", fontSize: "14pt", letterSpacing: "0.5pt" }}>
            {dL(profile.name || "Your Name")}
          </Text>
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "9.5pt", color: "#333", marginTop: "3pt" }}>
              {dL(contactParts.join("   ·   "))}
            </Text>
          )}
        </View>

        {/* Rule */}
        <View
          style={{
            borderBottomWidth: 0.75,
            borderBottomColor: "#999",
            borderBottomStyle: "solid",
            marginTop: "10pt",
          }}
        />

        {/* Date + Re line */}
        <View style={{ marginTop: "18pt", marginBottom: "18pt" }}>
          <Text style={{ fontSize: "10pt", color: "#222" }}>{dL(dateLabel)}</Text>
          {job?.title ? (
            <Text style={{ fontSize: "10pt", color: "#222", marginTop: "3pt" }}>
              {dL(`Re: ${job.title}${job.company ? ` - ${job.company}` : ""}`)}
            </Text>
          ) : null}
        </View>

        {/* Body */}
        <View style={{ fontSize: "11pt", lineHeight: 1.5 }}>
          <Text style={{ marginBottom: "10pt" }}>{dL(letter.greeting)}</Text>
          {letter.body_paragraphs.map((p, i) => (
            <Text key={i} style={{ marginBottom: "10pt" }}>
              {dL(p)}
            </Text>
          ))}
          <Text style={{ marginTop: "14pt" }}>{dL(letter.closing)}</Text>
          <Text style={{ marginTop: "2pt", fontWeight: "bold" }}>{dL(letter.signature)}</Text>
        </View>
      </Page>
    </Document>
  );
};

export default CoverLetterPdfDocument;
