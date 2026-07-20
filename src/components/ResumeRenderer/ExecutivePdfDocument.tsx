"use client";

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import "./fonts";
import { defeatLigatures as dL, sameText } from "./utils";

// ── Types (mirrored from resumes/page.tsx) ─────────────────

interface ExperienceEntry {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
}

interface EducationEntry {
  school: string;
  degree: string;
  date: string;
  gpa: string;
  coursework: string;
}

interface ProjectEntry {
  name: string;
  tech: string;
  date: string;
  bullets: string[];
}

interface LeadershipEntry {
  org: string;
  role: string;
  date: string;
  bullets: string[];
}

interface ResumeEditorState {
  profile: {
    name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    portfolio: string;
  };
  summary: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: {
    languages: string;
    tools: string;
    frameworks: string;
    soft: string;
  };
  leadership: LeadershipEntry[];
  certifications: string[];
  achievements: string[];
  sectionOrder?: string[];
}

// ── Constants ─────────────────────────────────────────────
// Executive — recreation of the "Executive" card in view-original-7.html
// (Garamond serif, diamond bullets, corporate). No accent color, monochrome
// black/gray only. Distinctive elements vs. the rest of the catalog:
//   - Left-aligned wide-tracked uppercase name (not centered)
//   - Contact line framed by a thick top rule + thin bottom rule, fields
//     spread with space-between rather than joined by a separator character
//     (sidesteps the wrap-hyphen class of bug entirely — no long joined
//     string to wrap awkwardly)
//   - Diamond "◆" bullet markers instead of round "•"
// Font: Caladea (open-source, metric-compatible Garamond/Cambria substitute
// — true Garamond isn't freely licensed). No true italic face; registered
// with Regular reused for the italic slot in fonts.ts (same pattern as
// Lora/Lato), so fontStyle:'italic' below renders upright, not slanted.

const FONT = "Caladea";
const INK = "#111111";
const MUTED = "#555555";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "48pt";
const MARGIN_V = "38pt";

// ── Bold-marker renderer (**bold** → bold run) ────────────

interface BoldTextProps {
  children: string;
  style?: Style;
}

const BoldText: React.FC<BoldTextProps> = ({ children: text, style = {} }) => {
  if (!text) return null;
  const parts = text.split(/\*\*/);
  if (parts.length === 1) return <Text style={style}>{dL(text)}</Text>;
  return (
    <Text style={style}>
      {parts.map((seg, i) =>
        seg ? (
          <Text key={i} style={i % 2 === 1 ? { fontWeight: "bold" } : undefined}>
            {dL(seg)}
          </Text>
        ) : null
      )}
    </Text>
  );
};

// ── Section Heading (bold, wide-tracked uppercase, rule below) ─

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <Text
    style={{
      fontWeight: "bold",
      fontSize: "10pt",
      letterSpacing: "1.5pt",
      textTransform: "uppercase",
      color: INK,
      paddingBottom: "2pt",
      marginTop: "10pt",
      marginBottom: "4pt",
      borderBottomWidth: 1.25,
      borderBottomColor: INK,
      borderBottomStyle: "solid",
    }}
  >
    {dL(title)}
  </Text>
);

// ── Diamond bullet list ────────────────────────────────────
// The marker is a rotated square View, not a "◆" glyph — Caladea's glyph set
// doesn't include the Unicode diamond character, and react-pdf silently
// substitutes a wrong glyph ("Æ") instead of erroring. A CSS-shape marker
// sidesteps font-coverage entirely, regardless of body font.

const DiamondMarker: React.FC = () => (
  <View style={{ width: "10pt", paddingTop: "3.5pt" }}>
    <View style={{ width: "3.2pt", height: "3.2pt", backgroundColor: "#333333", transform: "rotate(45deg)" }} />
  </View>
);

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        // wrap={false}: keep the marker and its text together across a page break.
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <DiamondMarker />
          <BoldText style={{ flex: 1, fontSize: "9.7pt", lineHeight: 1.3 }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left (bold) + right (italic, muted) ────────────────

const HeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.5pt", flex: 1 }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "9pt", color: MUTED, fontStyle: "italic", marginLeft: "8pt" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface ExecutivePdfDocumentProps {
  state: ResumeEditorState;
}

const DEFAULT_ORDER = ["summary", "experience", "projects", "skills", "education", "certifications", "achievements", "leadership"];

const ExecutivePdfDocument: React.FC<ExecutivePdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.phone,
    profile.email,
    profile.location,
    profile.linkedin,
    profile.github,
    profile.portfolio,
  ].filter(Boolean);

  const skillRows = [
    { label: "Technical", value: skills.languages },
    { label: "Frameworks", value: skills.frameworks },
    { label: "Tools", value: skills.tools },
    { label: "Core Competencies", value: skills.soft },
  ].filter((r) => r.value && r.value.trim());

  const order = state.sectionOrder ?? DEFAULT_ORDER;
  const sections: Record<string, () => React.ReactNode> = {
    summary: () => summary ? (
      <View>
        <SectionHeading title="Professional Summary" />
        <BoldText style={{ fontSize: "9.8pt", lineHeight: 1.4, color: INK }}>
          {summary}
        </BoldText>
      </View>
    ) : null,

    experience: () => experience.length > 0 && (
      <View>
        <SectionHeading title="Professional Experience" />
        {experience.map((exp, i) => {
          const companyLine = [exp.company, exp.location].filter(Boolean).join(" · ");
          return (
            <View key={i} style={{ marginBottom: "6pt" }}>
              <HeaderRow
                left={exp.title || "Role"}
                right={[exp.startDate, exp.endDate].filter(Boolean).join(" – ")}
              />
              {companyLine ? (
                <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: MUTED, marginTop: "0.5pt", marginBottom: "1pt" }}>
                  {dL(companyLine)}
                </Text>
              ) : null}
              {exp.bullets.filter((b) => b.trim()).length > 0 && (
                <BulletList items={exp.bullets} />
              )}
            </View>
          );
        })}
      </View>
    ),

    projects: () => projects.length > 0 && (
      <View>
        <SectionHeading title="Projects" />
        {projects.map((proj, i) => (
          <View key={i} style={{ marginBottom: "5pt" }}>
            <HeaderRow left={proj.name} right={proj.tech || proj.date} />
            {proj.bullets.filter((b) => b.trim()).length > 0 && (
              <BulletList items={proj.bullets} />
            )}
          </View>
        ))}
      </View>
    ),

    skills: () => skillRows.length > 0 && (
      <View>
        <SectionHeading title="Technical Skills" />
        {skillRows.map((row, i) => (
          <Text key={i} wrap={false} style={{ fontSize: "9.5pt", lineHeight: 1.4, marginBottom: "2pt" }}>
            <Text style={{ fontWeight: "bold" }}>{dL(`${row.label}: `)}</Text>
            {dL(row.value)}
          </Text>
        ))}
      </View>
    ),

    education: () => education.length > 0 && (
      <View>
        <SectionHeading title="Education" />
        {education.map((edu, i) => {
          const eduTop = edu.school || "University";
          const showDegree = edu.degree && !sameText(edu.degree, eduTop);
          return (
          <View key={i} style={{ marginBottom: "5pt" }}>
            <HeaderRow left={eduTop} right={edu.date} />
            {showDegree ? (
              <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: MUTED, marginTop: "0.5pt" }}>
                {dL(edu.degree)}
                {edu.gpa ? `  ·  GPA: ${edu.gpa}` : ""}
              </Text>
            ) : edu.gpa ? (
              <Text style={{ fontSize: "9.5pt", color: MUTED, marginTop: "0.5pt" }}>GPA: {dL(edu.gpa)}</Text>
            ) : null}
            {edu.coursework ? (
              <Text style={{ fontSize: "9pt", marginTop: "1.5pt", lineHeight: 1.3 }}>
                <Text style={{ fontWeight: "bold" }}>Relevant Coursework: </Text>
                {dL(edu.coursework)}
              </Text>
            ) : null}
          </View>
          );
        })}
      </View>
    ),

    certifications: () => certifications.filter((c) => c.trim()).length > 0 && (
      <View>
        <SectionHeading title="Certifications" />
        <BulletList items={certifications} />
      </View>
    ),

    achievements: () => achievements.filter((a) => a.trim()).length > 0 && (
      <View>
        <SectionHeading title="Achievements" />
        <BulletList items={achievements} />
      </View>
    ),

    leadership: () => leadership.length > 0 && (
      <View>
        <SectionHeading title="Leadership" />
        {leadership.map((lead, i) => (
          <View key={i} style={{ marginBottom: "5pt" }}>
            <HeaderRow left={lead.org} right={lead.date} />
            {lead.role ? (
              <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: MUTED, marginTop: "0.5pt" }}>{dL(lead.role)}</Text>
            ) : null}
            {lead.bullets.filter((b) => b.trim()).length > 0 && (
              <BulletList items={lead.bullets} />
            )}
          </View>
        ))}
      </View>
    ),
  };

  return (
    <Document title={`${profile.name || "Resume"}`} author={profile.name} producer="JobScorer">
      <Page
        size={[PAGE_W, PAGE_H]}
        style={{
          fontFamily: FONT,
          fontSize: "10pt",
          color: INK,
          paddingTop: MARGIN_V,
          paddingBottom: MARGIN_V,
          paddingLeft: MARGIN_H,
          paddingRight: MARGIN_H,
        }}
      >
        {/* ── Header ── */}
        <Text style={{ fontWeight: "bold", fontSize: "18pt", letterSpacing: "3pt", textTransform: "uppercase", lineHeight: 1.1 }}>
          {dL(profile.name || "Your Name")}
        </Text>
        {contactParts.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              columnGap: 10,
              fontSize: "8.7pt",
              color: MUTED,
              borderTopWidth: 1.5,
              borderTopColor: INK,
              borderTopStyle: "solid",
              borderBottomWidth: 0.75,
              borderBottomColor: "#cccccc",
              borderBottomStyle: "solid",
              paddingTop: "3pt",
              paddingBottom: "3pt",
              marginTop: "3pt",
            }}
          >
            {contactParts.map((c, i) => (
              <Text key={i}>{dL(c)}</Text>
            ))}
          </View>
        )}

        {order.map((key) => (
          <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
        ))}
      </Page>
    </Document>
  );
};

export default ExecutivePdfDocument;
