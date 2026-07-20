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
// Amber — editorial serif name + sans body, gold accent. Built 2026-07-19
// from the karthik-iyer.png reference image. Only active template combining
// a serif display name with a sans body (Executive is all-serif; every other
// active template is all-sans) and the only one with a warm/gold accent
// (everything else is navy/teal/indigo/sky-blue or monochrome).
// Name font: Playfair Display (registered in ./fonts.ts, name-only — body
// stays in Open Sans so this template doesn't add a second sans to the
// pipeline). No true italic face for Playfair registered since the name is
// never rendered italic.

const NAME_FONT = "Playfair Display";
const FONT = "Open Sans";
const INK = "#1a2942";
const MUTED = "#4a5568";
const GOLD = "#b8912f";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "48pt";
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

// ── Section Heading (bold sans caps, full-width gold rule below) ─

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "11pt", marginBottom: "5pt" }}>
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "10.5pt",
        letterSpacing: "1.2pt",
        textTransform: "uppercase",
        color: INK,
        marginBottom: "3pt",
      }}
    >
      {dL(title)}
    </Text>
    <View style={{ borderBottomWidth: 1, borderBottomColor: GOLD, borderBottomStyle: "solid" }} />
  </View>
);

// ── Bullet list (round • marker) ──────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        // wrap={false}: keep the "•" marker with its text across page breaks.
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <Text style={{ width: "12pt", fontSize: "9.5pt" }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: "9.7pt", lineHeight: 1.32 }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left (bold) + right (regular, muted) ─────────────

const HeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.3pt", flex: 1, color: INK }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "9pt", color: MUTED, marginLeft: "8pt" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface AmberPdfDocumentProps {
  state: ResumeEditorState;
}

const DEFAULT_ORDER = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "leadership"];

const AmberPdfDocument: React.FC<AmberPdfDocumentProps> = ({ state }) => {
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
        <BoldText style={{ fontSize: "9.8pt", lineHeight: 1.42, color: INK }}>
          {summary}
        </BoldText>
      </View>
    ) : null,

    skills: () => skillRows.length > 0 && (
      <View>
        <SectionHeading title="Core Skills" />
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
          const companyLine = [exp.company, exp.location].filter(Boolean).join(", ");
          return (
            <View key={i} style={{ marginBottom: "7pt" }}>
              <HeaderRow
                left={exp.title || "Role"}
                right={[exp.startDate, exp.endDate].filter(Boolean).join(" – ")}
              />
              {companyLine ? (
                <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: MUTED, marginTop: "0.5pt" }}>
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
              <Text style={{ fontSize: "9pt", marginTop: "1pt" }}>
                <Text style={{ fontWeight: "bold" }}>Technologies: </Text>
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
          const eduTop = edu.degree || edu.school || "Degree";
          const showSchool = edu.school && !sameText(edu.school, eduTop);
          return (
          <View key={i} style={{ marginBottom: "5pt" }}>
            <HeaderRow left={eduTop} right={edu.date} />
            {(showSchool || edu.gpa) && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: MUTED, flex: 1 }}>{showSchool ? dL(edu.school) : ""}</Text>
                {edu.gpa ? (
                  <Text style={{ fontSize: "9pt", color: MUTED, marginLeft: "8pt" }}>{`CGPA: ${dL(edu.gpa)}`}</Text>
                ) : null}
              </View>
            )}
            {edu.coursework ? (
              <Text style={{ fontSize: "9pt", marginTop: "1.5pt", lineHeight: 1.3, color: INK }}>
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
        {/* ── Header (centered serif name, gold line-dot-line divider) ── */}
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: NAME_FONT, fontWeight: "bold", fontSize: "27pt", letterSpacing: "2.5pt", color: INK, textAlign: "center" }}>
            {dL((profile.name || "Your Name").toUpperCase())}
          </Text>
          {roleSubtitle ? (
            <Text style={{ fontWeight: "bold", fontSize: "10pt", letterSpacing: "1pt", textTransform: "uppercase", color: INK, marginTop: "4pt" }}>
              {dL(roleSubtitle)}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: "6pt", marginBottom: "6pt" }}>
            <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: GOLD, borderBottomStyle: "solid" }} />
            <View style={{ width: "3.5pt", height: "3.5pt", borderRadius: "1.75pt", backgroundColor: GOLD, marginLeft: "6pt", marginRight: "6pt" }} />
            <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: GOLD, borderBottomStyle: "solid" }} />
          </View>
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "8.7pt", color: MUTED, textAlign: "center" }}>
              {dL(contactParts.join("  |  "))}
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

export default AmberPdfDocument;
