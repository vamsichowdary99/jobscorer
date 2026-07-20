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
// Axis — original design, built 2026-07-19 to fill a genuine structural gap:
// every active template (single-column since Jade's 2026-07-19 conversion)
// uses flat rules/panels/pills to separate entries. Axis is the only one with
// a vertical "career timeline" rail — a small accent-colored node per dated
// entry (Experience/Education/Projects/Leadership/Certifications/
// Achievements), connected by a thin line segment that runs the height of
// each entry. Verified this is still 100% ATS-safe: researched whether
// two-column layouts are the only real ATS risk (they mostly aren't anymore
// on modern parsers — XY-Cut reading-order algorithms handle them — but
// legacy government/enterprise Taleo-style parsers still can fail on them).
// Axis sidesteps the question entirely: it's a single linear column of real
// text top-to-bottom; the rail is pure decoration (borders + circles), not a
// layout mechanism, so there's no reading-order ambiguity for any parser,
// legacy or modern. Font: Roboto (already registered, reused from
// Classic/Open Resume/Cobalt — no new font file needed). Accent: violet
// #7c3aed, the one accent color not yet used anywhere in the catalog (navy,
// teal, indigo, sky-blue, gold, red are all taken).

const FONT = "Roboto";
const INK = "#1c1c26";
const MUTED = "#5b5b6b";
const ACCENT = "#7c3aed";
const RAIL = "#ddd2fb";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "46pt";
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

// ── Section Heading (bold, small accent square marker) ────

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ flexDirection: "row", alignItems: "center", marginTop: "12pt", marginBottom: "5pt" }}>
    <View style={{ width: "6pt", height: "6pt", backgroundColor: ACCENT, marginRight: "6pt" }} />
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "10.5pt",
        letterSpacing: "1pt",
        textTransform: "uppercase",
        color: INK,
      }}
    >
      {dL(title)}
    </Text>
  </View>
);

// ── Timeline entry wrapper: node + connecting rail, content to the right ─

const TimelineEntry: React.FC<{ last?: boolean; children: React.ReactNode }> = ({ last = false, children }) => (
  <View style={{ flexDirection: "row" }}>
    <View style={{ width: "14pt", alignItems: "center" }}>
      <View style={{ width: "6pt", height: "6pt", borderRadius: "3pt", backgroundColor: ACCENT, marginTop: "3pt" }} />
      {!last ? <View style={{ flex: 1, width: "1pt", backgroundColor: RAIL, marginTop: "2pt" }} /> : null}
    </View>
    <View style={{ flex: 1, paddingLeft: "10pt", paddingBottom: "9pt" }}>{children}</View>
  </View>
);

// ── Bullet list (round • marker) ──────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <Text style={{ width: "10pt", fontSize: "9.5pt", color: MUTED }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: "9.5pt", lineHeight: 1.32, color: INK }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left (bold) + right (muted) ──────────────────────

const HeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.3pt", flex: 1, color: INK }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "8.7pt", color: ACCENT, fontWeight: "bold", marginLeft: "8pt" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface AxisPdfDocumentProps {
  state: ResumeEditorState;
}

const DEFAULT_ORDER = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "leadership"];

const AxisPdfDocument: React.FC<AxisPdfDocumentProps> = ({ state }) => {
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

  const skillRows = [
    { label: "Languages", value: skills.languages },
    { label: "Frameworks", value: skills.frameworks },
    { label: "Tools & Platforms", value: skills.tools },
    { label: "Core Competencies", value: skills.soft },
  ].filter((r) => r.value && r.value.trim());

  const order = state.sectionOrder ?? DEFAULT_ORDER;
  const sections: Record<string, () => React.ReactNode> = {
    summary: () => summary ? (
      <View>
        <SectionHeading title="Summary" />
        <BoldText style={{ fontSize: "9.7pt", lineHeight: 1.42, color: INK }}>
          {summary}
        </BoldText>
      </View>
    ) : null,

    skills: () => skillRows.length > 0 && (
      <View>
        <SectionHeading title="Skills" />
        {skillRows.map((row, i) => (
          <Text key={i} wrap={false} style={{ fontSize: "9.5pt", lineHeight: 1.4, marginBottom: "2.5pt", color: INK }}>
            <Text style={{ fontWeight: "bold" }}>{dL(`${row.label}:  `)}</Text>
            {dL(row.value)}
          </Text>
        ))}
      </View>
    ),

    experience: () => experience.length > 0 && (
      <View>
        <SectionHeading title="Experience" />
        {experience.map((exp, i) => {
          const companyLine = [exp.company, exp.location].filter(Boolean).join(" · ");
          return (
            <TimelineEntry key={i} last={i === experience.length - 1}>
              <HeaderRow
                left={exp.title || "Role"}
                right={[exp.startDate, exp.endDate].filter(Boolean).join(" – ")}
              />
              {companyLine ? (
                <Text style={{ fontStyle: "italic", fontSize: "9.3pt", color: MUTED, marginTop: "0.5pt", marginBottom: "1pt" }}>
                  {dL(companyLine)}
                </Text>
              ) : null}
              {exp.bullets.filter((b) => b.trim()).length > 0 && (
                <BulletList items={exp.bullets} />
              )}
            </TimelineEntry>
          );
        })}
      </View>
    ),

    projects: () => projects.length > 0 && (
      <View>
        <SectionHeading title="Projects" />
        {projects.map((proj, i) => (
          <TimelineEntry key={i} last={i === projects.length - 1}>
            <HeaderRow left={proj.name} right={proj.date} />
            {proj.tech ? (
              <Text style={{ fontStyle: "italic", fontSize: "9.3pt", color: MUTED, marginTop: "0.5pt" }}>
                {dL(proj.tech)}
              </Text>
            ) : null}
            {proj.bullets.filter((b) => b.trim()).length > 0 && (
              <BulletList items={proj.bullets} />
            )}
          </TimelineEntry>
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
            <TimelineEntry key={i} last={i === education.length - 1}>
              <HeaderRow left={eduTop} right={edu.date} />
              {showDegree ? (
                <Text style={{ fontStyle: "italic", fontSize: "9.3pt", color: MUTED, marginTop: "0.5pt" }}>
                  {dL(edu.degree)}
                  {edu.gpa ? `  ·  GPA: ${edu.gpa}` : ""}
                </Text>
              ) : edu.gpa ? (
                <Text style={{ fontSize: "9.3pt", color: MUTED, marginTop: "0.5pt" }}>GPA: {dL(edu.gpa)}</Text>
              ) : null}
              {edu.coursework ? (
                <Text style={{ fontSize: "8.8pt", marginTop: "1.5pt", lineHeight: 1.3, color: INK }}>
                  <Text style={{ fontWeight: "bold" }}>Relevant Coursework: </Text>
                  {dL(edu.coursework)}
                </Text>
              ) : null}
            </TimelineEntry>
          );
        })}
      </View>
    ),

    certifications: () => {
      const items = certifications.filter((c) => c.trim());
      return items.length > 0 && (
        <View>
          <SectionHeading title="Certifications" />
          {items.map((c, i) => (
            <TimelineEntry key={i} last={i === items.length - 1}>
              <Text style={{ fontSize: "9.5pt", color: INK }}>{dL(c)}</Text>
            </TimelineEntry>
          ))}
        </View>
      );
    },

    achievements: () => {
      const items = achievements.filter((a) => a.trim());
      return items.length > 0 && (
        <View>
          <SectionHeading title="Achievements" />
          {items.map((a, i) => (
            <TimelineEntry key={i} last={i === items.length - 1}>
              <Text style={{ fontSize: "9.5pt", color: INK }}>{dL(a)}</Text>
            </TimelineEntry>
          ))}
        </View>
      );
    },

    leadership: () => leadership.length > 0 && (
      <View>
        <SectionHeading title="Leadership" />
        {leadership.map((lead, i) => (
          <TimelineEntry key={i} last={i === leadership.length - 1}>
            <HeaderRow left={lead.org} right={lead.date} />
            {lead.role ? (
              <Text style={{ fontStyle: "italic", fontSize: "9.3pt", color: MUTED, marginTop: "0.5pt" }}>{dL(lead.role)}</Text>
            ) : null}
            {lead.bullets.filter((b) => b.trim()).length > 0 && (
              <BulletList items={lead.bullets} />
            )}
          </TimelineEntry>
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
        <View>
          <Text style={{ fontWeight: "bold", fontSize: "22pt", color: INK, lineHeight: 1.05 }}>
            {dL(profile.name || "Your Name")}
          </Text>
          {roleSubtitle ? (
            <Text style={{ fontSize: "11pt", color: ACCENT, fontWeight: "bold", marginTop: "2pt" }}>
              {dL(roleSubtitle)}
            </Text>
          ) : null}
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "9pt", color: MUTED, marginTop: "5pt" }}>
              {dL(contactParts.join("  ·  "))}
            </Text>
          )}
          <View style={{ borderBottomWidth: 1.2, borderBottomColor: ACCENT, borderBottomStyle: "solid", marginTop: "7pt" }} />
        </View>

        {order.map((key) => (
          <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
        ))}
      </Page>
    </Document>
  );
};

export default AxisPdfDocument;
