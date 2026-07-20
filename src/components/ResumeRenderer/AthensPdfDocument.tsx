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
// Athens — recreation of the "Resume.io Athens" card in view-competitor-10.html
// (red accent, gray header panel, outlined skill pills). Built 2026-07-19,
// chosen to fill the one warm-color-accent gap left after Amber (gold) —
// nothing else in the catalog is red. Font: Helvetica, the PDF base-14
// built-in font (same guaranteed-ATS-extraction logic as Harvard's
// Times-Roman) — the catalog lists "Arial" as the source font, and Helvetica
// is its metric-compatible PDF-standard substitute, so no new font file or
// fonts.ts registration is needed for this template.
// Bullet marker is a CSS border-triangle, not a "▸" glyph — Helvetica's
// base-14 WinAnsi encoding doesn't cover that Unicode triangle (same glyph-
// coverage bug class fixed for Executive's diamond bullets).

const FONT = "Helvetica";
const RED = "#c0392b";
const INK = "#1a1a1a";
const MUTED = "#666666";
const BODY = "#444444";
const HR = "#dcdcdc";
const HEADER_BG = "#f7f7f7";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "42pt";
const MARGIN_V = "0pt";

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

// ── Section Heading (red uppercase, thin gray rule below) ──

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "11pt", marginBottom: "4pt" }}>
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "10pt",
        letterSpacing: "1.5pt",
        textTransform: "uppercase",
        color: RED,
        marginBottom: "3pt",
      }}
    >
      {dL(title)}
    </Text>
    <View style={{ borderBottomWidth: 1, borderBottomColor: HR, borderBottomStyle: "solid" }} />
  </View>
);

// ── Triangle bullet marker (CSS border-triangle, not a glyph) ─

const TriangleMarker: React.FC = () => (
  <View style={{ width: "10pt", paddingTop: "3.5pt" }}>
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 3,
        borderBottomWidth: 3,
        borderLeftWidth: 5,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        borderLeftColor: RED,
        borderStyle: "solid",
      }}
    />
  </View>
);

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <TriangleMarker />
          <BoldText style={{ flex: 1, fontSize: "9.5pt", lineHeight: 1.32, color: BODY }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left (bold, ink) + right (bold, red) ─────────────

const HeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.5pt", flex: 1, color: INK }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontWeight: "bold", fontSize: "9pt", color: RED, marginLeft: "8pt" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

// ── Skill pills (outlined red, wrapping cloud of extractable text) ─

const splitItems = (csv: string): string[] =>
  (csv || "")
    .split(/,(?![^(]*\))|[•\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const SkillPills: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: "2pt" }}>
    {items.map((s, i) => (
      <View
        key={i}
        wrap={false}
        style={{
          borderWidth: 0.8,
          borderColor: RED,
          borderStyle: "solid",
          borderRadius: 2,
          paddingTop: "2pt",
          paddingBottom: "2pt",
          paddingLeft: "6pt",
          paddingRight: "6pt",
          marginRight: "5pt",
          marginBottom: "5pt",
        }}
      >
        <Text style={{ fontSize: "8.5pt", color: RED }}>{dL(s)}</Text>
      </View>
    ))}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface AthensPdfDocumentProps {
  state: ResumeEditorState;
}

const DEFAULT_ORDER = ["summary", "experience", "projects", "skills", "education", "certifications", "achievements", "leadership"];

const AthensPdfDocument: React.FC<AthensPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedin,
    profile.github,
    profile.portfolio,
  ].filter(Boolean);

  const roleSubtitle = profile.headline?.trim() || experience.find((e) => e.title && e.title.trim())?.title?.trim() || "";

  const skillPills = [
    ...splitItems(skills.languages),
    ...splitItems(skills.frameworks),
    ...splitItems(skills.tools),
    ...splitItems(skills.soft),
  ];

  const order = state.sectionOrder ?? DEFAULT_ORDER;
  const sections: Record<string, () => React.ReactNode> = {
    summary: () => summary ? (
      <View>
        <SectionHeading title="Summary" />
        <BoldText style={{ fontSize: "9.7pt", lineHeight: 1.45, color: BODY }}>
          {summary}
        </BoldText>
      </View>
    ) : null,

    skills: () => skillPills.length > 0 && (
      <View>
        <SectionHeading title="Technical Skills" />
        <SkillPills items={skillPills} />
      </View>
    ),

    experience: () => experience.length > 0 && (
      <View>
        <SectionHeading title="Experience" />
        {experience.map((exp, i) => {
          const companyLine = [exp.title, exp.location].filter(Boolean).join(" · ");
          return (
            <View key={i} style={{ marginBottom: "7pt" }}>
              <HeaderRow
                left={exp.company || "Company"}
                right={[exp.startDate, exp.endDate].filter(Boolean).join(" – ")}
              />
              {companyLine ? (
                <Text style={{ fontSize: "9pt", color: MUTED, marginTop: "0.5pt", marginBottom: "1pt" }}>
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
          <View key={i} style={{ marginBottom: "6pt" }}>
            <HeaderRow left={proj.name} right={proj.date} />
            {proj.tech ? (
              <Text style={{ fontSize: "9pt", color: MUTED, marginTop: "1pt" }}>
                {dL(proj.tech)}
              </Text>
            ) : null}
            {proj.bullets.filter((b) => b.trim()).length > 0 && (
              <BulletList items={proj.bullets} />
            )}
          </View>
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
              <Text style={{ fontSize: "9pt", color: MUTED, marginTop: "0.5pt" }}>
                {dL(edu.degree)}
                {edu.gpa ? `  ·  GPA: ${edu.gpa}` : ""}
              </Text>
            ) : edu.gpa ? (
              <Text style={{ fontSize: "9pt", color: MUTED, marginTop: "0.5pt" }}>GPA: {dL(edu.gpa)}</Text>
            ) : null}
            {edu.coursework ? (
              <Text style={{ fontSize: "9pt", marginTop: "1.5pt", lineHeight: 1.3, color: BODY }}>
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
        {certifications.filter((c) => c.trim()).map((c, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: "2pt" }}>
            <Text style={{ fontSize: "9.5pt", color: INK }}>{dL(c)}</Text>
          </View>
        ))}
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
              <Text style={{ fontSize: "9pt", color: MUTED, marginTop: "0.5pt" }}>{dL(lead.role)}</Text>
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
          paddingBottom: "36pt",
          paddingLeft: 0,
          paddingRight: 0,
        }}
      >
        {/* ── Header (gray panel, 3pt red bottom border) ── */}
        <View
          style={{
            backgroundColor: HEADER_BG,
            borderBottomWidth: 3,
            borderBottomColor: RED,
            borderBottomStyle: "solid",
            paddingTop: "22pt",
            paddingBottom: "14pt",
            paddingLeft: MARGIN_H,
            paddingRight: MARGIN_H,
          }}
        >
          <Text style={{ fontWeight: "bold", fontSize: "20pt", letterSpacing: "0.5pt", color: INK }}>
            {dL(profile.name || "Your Name")}
          </Text>
          {roleSubtitle ? (
            <Text style={{ fontWeight: "bold", fontSize: "10pt", letterSpacing: "1pt", textTransform: "uppercase", color: RED, marginTop: "3pt" }}>
              {dL(roleSubtitle)}
            </Text>
          ) : null}
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "9pt", color: MUTED, marginTop: "3pt" }}>
              {dL(contactParts.join("  ·  "))}
            </Text>
          )}
        </View>

        <View style={{ paddingLeft: MARGIN_H, paddingRight: MARGIN_H, paddingTop: "10pt" }}>
          {order.map((key) => (
            <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
          ))}
        </View>
      </Page>
    </Document>
  );
};

export default AthensPdfDocument;
