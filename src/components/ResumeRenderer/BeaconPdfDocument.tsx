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
// Beacon — promoted from the pending "Kickresume Gradient" catalog entry
// (dark navy gradient header), built 2026-07-19. Research-driven pick: the
// full-bleed colored banner header with reversed (white) name/contact text
// is the single most common "modern professional" archetype across Zety,
// Canva, Enhancv's Modern category, and Kickresume's own top template — none
// of the other 13 active templates use reversed text on a solid color block
// (they all put dark text on white/light backgrounds even with strong accent
// colors). Dropped the source idea's "dot skills" proficiency rating —
// implies a quantified skill level with no real backing data, so skills stay
// plain extractable text like every other template. Banner is a SOLID navy
// fill, not a true gradient: react-pdf's gradient support is SVG-only and
// adds fragility for a purely decorative effect — solid color reads the same
// at a glance and is more reliable. Font: Open Sans (already registered,
// reused from Onyx/Jade/Lapis).

const FONT = "Open Sans";
const NAVY = "#0f3460";
const INK = "#1a1a2e";
const MUTED = "#5c5c6e";
const BANNER_TEXT = "#f4f6fb";
const BANNER_MUTED = "#c3cbe0";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "44pt";

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

// ── Section Heading (bold navy uppercase, thin rule below) ─

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "11pt", marginBottom: "5pt" }}>
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "10.5pt",
        letterSpacing: "1.2pt",
        textTransform: "uppercase",
        color: NAVY,
        marginBottom: "3pt",
      }}
    >
      {dL(title)}
    </Text>
    <View style={{ borderBottomWidth: 1, borderBottomColor: NAVY, borderBottomStyle: "solid" }} />
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

// ── Row: left (bold) + right (navy bold) ──────────────────

const HeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.3pt", flex: 1, color: INK }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "8.7pt", fontWeight: "bold", color: NAVY, marginLeft: "8pt" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface BeaconPdfDocumentProps {
  state: ResumeEditorState;
}

const DEFAULT_ORDER = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "leadership"];

const BeaconPdfDocument: React.FC<BeaconPdfDocumentProps> = ({ state }) => {
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
            <View key={i} style={{ marginBottom: "7pt" }}>
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
              <Text style={{ fontStyle: "italic", fontSize: "9.3pt", color: MUTED, marginTop: "0.5pt" }}>
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
              <Text style={{ fontStyle: "italic", fontSize: "9.3pt", color: MUTED, marginTop: "0.5pt" }}>{dL(lead.role)}</Text>
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
          paddingTop: 0,
          paddingBottom: "36pt",
          paddingLeft: 0,
          paddingRight: 0,
        }}
      >
        {/* ── Banner header (solid navy, reversed white text) ── */}
        <View style={{ backgroundColor: NAVY, paddingTop: "26pt", paddingBottom: "16pt", paddingLeft: MARGIN_H, paddingRight: MARGIN_H }}>
          <Text style={{ fontWeight: "bold", fontSize: "21pt", color: BANNER_TEXT, lineHeight: 1.08 }}>
            {dL(profile.name || "Your Name")}
          </Text>
          {roleSubtitle ? (
            <Text style={{ fontWeight: "bold", fontSize: "10.5pt", letterSpacing: "0.8pt", textTransform: "uppercase", color: BANNER_MUTED, marginTop: "3pt" }}>
              {dL(roleSubtitle)}
            </Text>
          ) : null}
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "8.8pt", color: BANNER_MUTED, marginTop: "6pt" }}>
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

export default BeaconPdfDocument;
