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
// Jade — single-column conversion (2026-07-19) of the original two-column
// priya-nair mockup recreation. Same two inks (teal accent + near-black) and
// the same ruled-underline section headers and grouped bold-label skill
// bullets that made the original distinctive; just stacked into one column
// instead of a fixed-width identity sidebar. atsScore is now 'full' — no
// column-order ambiguity for text extraction.

const FONT = "Open Sans";
const ACCENT = "#026857"; // name, section headers, header underline rules
const INK = "#1a1a1a";     // everything else
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "44pt";
const MARGIN_V = "36pt";

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

// ── Section Heading (teal, uppercase, thin teal underline rule) ─

const SectionHeading: React.FC<{ title: string; first?: boolean }> = ({ title, first = false }) => (
  <Text
    style={{
      fontWeight: "bold",
      fontSize: "10pt",
      letterSpacing: "0.5pt",
      textTransform: "uppercase",
      color: ACCENT,
      paddingBottom: "2.5pt",
      marginTop: first ? "0pt" : "10pt",
      marginBottom: "4pt",
      borderBottomWidth: 1,
      borderBottomColor: ACCENT,
      borderBottomStyle: "solid",
    }}
  >
    {dL(title)}
  </Text>
);

// ── Bullet list (round • marker, black) ───────────────────

const BulletList: React.FC<{ items: string[]; size?: number; gap?: number; lh?: number }> = ({
  items,
  size = 9.7,
  gap = 1.5,
  lh = 1.25,
}) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        // wrap={false}: keep the "•" marker and its text together. Without it
        // @react-pdf can split a flex row at the page boundary, stranding a lone
        // bullet marker on the next page (the original 2-page overflow bug).
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: `${gap}pt` }}>
          <Text style={{ width: "11pt", fontSize: `${size}pt`, lineHeight: lh }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: `${size}pt`, lineHeight: lh }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left (bold) + right (regular or italic), both black ───

const HeaderRow: React.FC<{ left: string; right?: string; rightItalic?: boolean }> = ({
  left,
  right,
  rightItalic = false,
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.5pt", flex: 1 }}>{dL(left)}</Text>
    {right ? (
      <Text
        style={{
          fontSize: "9pt",
          color: INK,
          marginLeft: "8pt",
          fontStyle: rightItalic ? "italic" : "normal",
        }}
      >
        {dL(right)}
      </Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface JadePdfDocumentProps {
  state: ResumeEditorState;
}

const splitItems = (csv: string): string[] =>
  csv
    .split(/[,•\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const DEFAULT_ORDER = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "leadership"];

const JadePdfDocument: React.FC<JadePdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  // Role subtitle: derived from the latest (first) experience title.
  const roleSubtitle = profile.headline?.trim() || experience.find((e) => e.title && e.title.trim())?.title?.trim() || "";

  const contactParts = [
    profile.phone,
    profile.email,
    profile.location,
    profile.linkedin,
    profile.github,
    profile.portfolio,
  ].filter(Boolean);

  // Skills as grouped bold-label + bulleted items (Jade's signature format,
  // kept from the original two-column layout rather than collapsed to the
  // single-line "Label: value" style the other single-column templates use).
  const skillGroups = [
    { label: "Languages", value: skills.languages },
    { label: "Libraries & Frameworks", value: skills.frameworks },
    { label: "Tools", value: skills.tools },
    { label: "Core Competencies", value: skills.soft },
  ]
    .map((g) => ({ label: g.label, items: splitItems(g.value || "") }))
    .filter((g) => g.items.length > 0);

  const order = state.sectionOrder ?? DEFAULT_ORDER;
  const sections: Record<string, () => React.ReactNode> = {
    summary: () => summary ? (
      <View>
        <SectionHeading title="Summary" first />
        <BoldText style={{ fontSize: "10pt", lineHeight: 1.4, color: INK }}>
          {summary}
        </BoldText>
      </View>
    ) : null,

    skills: () => skillGroups.length > 0 && (
      <View>
        <SectionHeading title="Skills" />
        {skillGroups.map((g, i) => (
          <Text key={i} wrap={false} style={{ fontSize: "9.7pt", lineHeight: 1.4, marginBottom: "2pt" }}>
            <Text style={{ fontWeight: "bold" }}>{dL(`${g.label}: `)}</Text>
            {dL(g.items.join(", "))}
          </Text>
        ))}
      </View>
    ),

    experience: () => experience.length > 0 && (
      <View>
        <SectionHeading title="Experience" />
        {experience.map((exp, i) => {
          const companyLine = [exp.company, exp.location].filter(Boolean).join(", ");
          return (
            <View key={i} style={{ marginBottom: "7pt" }}>
              <HeaderRow
                left={exp.title || "Role"}
                right={[exp.startDate, exp.endDate].filter(Boolean).join(" – ")}
              />
              {companyLine ? (
                <Text style={{ fontSize: "9.5pt", marginTop: "0.5pt" }}>{dL(companyLine)}</Text>
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
            <HeaderRow
              left={proj.name}
              right={proj.tech || proj.date}
              rightItalic={!!proj.tech}
            />
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
          const eduTop = edu.degree || edu.school || "Degree";
          const showSchool = edu.school && !sameText(edu.school, eduTop);
          return (
          <View key={i} style={{ marginBottom: "5pt" }}>
            <Text style={{ fontWeight: "bold", fontSize: "10pt", lineHeight: 1.2 }}>
              {dL(eduTop)}
            </Text>
            {showSchool ? (
              <Text style={{ fontSize: "9.5pt", marginTop: "0.5pt" }}>{dL(edu.school)}</Text>
            ) : null}
            {(edu.date || edu.gpa) && (
              <Text style={{ fontSize: "9pt", marginTop: "0.5pt" }}>
                {dL([edu.date, edu.gpa].filter(Boolean).join("  |  "))}
              </Text>
            )}
            {edu.coursework ? (
              <Text style={{ fontSize: "8.7pt", marginTop: "1.5pt", lineHeight: 1.25 }}>
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
        <BulletList items={certifications} size={9.3} gap={1} lh={1.22} />
      </View>
    ),

    achievements: () => achievements.filter((a) => a.trim()).length > 0 && (
      <View>
        <SectionHeading title="Achievements" />
        <BulletList items={achievements} size={9.3} gap={1} lh={1.22} />
      </View>
    ),

    leadership: () => leadership.length > 0 && (
      <View>
        <SectionHeading title="Leadership" />
        {leadership.map((lead, i) => (
          <View key={i} style={{ marginBottom: "6pt" }}>
            <HeaderRow left={lead.org} right={lead.date} />
            {lead.role ? (
              <Text style={{ fontSize: "9.5pt", marginTop: "0.5pt" }}>{dL(lead.role)}</Text>
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
        {/* ── Header (left-aligned, teal name) ── */}
        <View style={{ marginBottom: "2pt" }}>
          <Text style={{ fontWeight: "bold", fontSize: "21pt", letterSpacing: "0.5pt", textTransform: "uppercase", color: ACCENT, lineHeight: 1.04 }}>
            {dL(profile.name || "Your Name")}
          </Text>
          {roleSubtitle ? (
            <Text style={{ fontWeight: "bold", fontSize: "10.5pt", color: INK, marginTop: "3pt" }}>
              {dL(roleSubtitle)}
            </Text>
          ) : null}
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "9pt", color: INK, marginTop: "5pt", letterSpacing: "0.1pt" }}>
              {dL(contactParts.join(" \u00a0|\u00a0 "))}
            </Text>
          )}
        </View>

        {order.map((key) => (
          <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
        ))}
      </Page>
    </Document>
  );
};

export default JadePdfDocument;
