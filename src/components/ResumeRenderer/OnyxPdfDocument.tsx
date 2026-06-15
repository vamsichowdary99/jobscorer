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
import { defeatLigatures as dL } from "./utils";

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
}

// ── Constants ─────────────────────────────────────────────
// Onyx = minimalist recreation of the rohan-mehta carousel mockup.
// Monochrome black text + ONE thin navy divider rule under the header.
// Section headers are rule-less, set apart by wide letter-spacing alone.
// Font: Open Sans (pixel-matched the mockup's name; registered in ./fonts.ts
// with a true OpenSans-Italic for the company·location line).

const FONT = "Open Sans";
const INK = "#111111";       // all text
const RULE = "#224a85";      // the single navy divider rule under the header
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "46pt";
const MARGIN_V = "36pt";
const SKILL_LABEL_W = "104pt";

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

// ── Section Heading (uppercase, WIDE tracking, no rule) ────

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <Text
    style={{
      fontWeight: "bold",
      fontSize: "10pt",
      letterSpacing: "2pt",
      textTransform: "uppercase",
      color: INK,
      marginTop: "11pt",
      marginBottom: "5pt",
    }}
  >
    {dL(title)}
  </Text>
);

// ── Bullet list (round • marker) ──────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        // wrap={false}: keep the "•" marker with its text across page breaks.
        // Onyx is frequently multi-page, so without this @react-pdf can split a
        // bullet row at the page boundary and strand a lone marker on the next
        // page (same class of bug fixed in Jade).
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <Text style={{ width: "12pt", fontSize: "10pt" }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: "10pt", lineHeight: 1.3 }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left (bold) + right (regular) ────────────────────

const HeaderRow: React.FC<{ left: string; right?: string; rightItalic?: boolean }> = ({
  left,
  right,
  rightItalic = false,
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.5pt", flex: 1 }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "9.5pt", color: INK, marginLeft: "10pt", fontStyle: rightItalic ? "italic" : "normal" }}>
        {dL(right)}
      </Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface OnyxPdfDocumentProps {
  state: ResumeEditorState;
}

const OnyxPdfDocument: React.FC<OnyxPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.phone,
    profile.email,
    profile.location,
    profile.linkedin,
    profile.github,
    profile.portfolio,
  ].filter(Boolean);

  const roleSubtitle = experience.find((e) => e.title && e.title.trim())?.title?.trim() ?? "";

  const skillRows = [
    { label: "Languages", value: skills.languages },
    { label: "Frameworks", value: skills.frameworks },
    { label: "Tools & Platforms", value: skills.tools },
    { label: "Core Concepts", value: skills.soft },
  ].filter((r) => r.value && r.value.trim());

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
        {/* ── Header (left-aligned, big name, navy divider) ── */}
        <View>
          <Text style={{ fontWeight: "bold", fontSize: "23pt", letterSpacing: "0.8pt", lineHeight: 1.04 }}>
            {dL((profile.name || "Your Name").toUpperCase())}
          </Text>
          {roleSubtitle ? (
            <Text style={{ fontSize: "11.5pt", color: INK, marginTop: "3pt" }}>
              {dL(roleSubtitle)}
            </Text>
          ) : null}
          <View
            style={{
              borderBottomWidth: 1.2,
              borderBottomColor: RULE,
              borderBottomStyle: "solid",
              marginTop: "6pt",
              marginBottom: "6pt",
            }}
          />
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "9pt", color: INK, letterSpacing: "0.1pt" }}>
              {dL(contactParts.join("  |  "))}
            </Text>
          )}
        </View>

        {/* ── Summary ── */}
        {summary ? (
          <View>
            <SectionHeading title="Summary" />
            <BoldText style={{ fontSize: "10pt", lineHeight: 1.4, color: INK }}>
              {summary}
            </BoldText>
          </View>
        ) : null}

        {/* ── Skills ── */}
        {skillRows.length > 0 && (
          <View>
            <SectionHeading title="Technical Skills" />
            {skillRows.map((row, i) => (
              <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "2.5pt" }}>
                <Text style={{ fontWeight: "bold", width: SKILL_LABEL_W, fontSize: "10pt" }}>
                  {dL(`${row.label}:`)}
                </Text>
                <Text style={{ flex: 1, fontSize: "10pt" }}>{dL(row.value)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Experience ── */}
        {experience.length > 0 && (
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
                    <Text style={{ fontStyle: "italic", fontSize: "10pt", marginTop: "0.5pt" }}>
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
        )}

        {/* ── Projects ── (tech shown italic on the right, like the mockup) */}
        {projects.length > 0 && (
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
        )}

        {/* ── Education ── (degree-first) */}
        {education.length > 0 && (
          <View>
            <SectionHeading title="Education" />
            {education.map((edu, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <HeaderRow left={edu.degree || edu.school || "Degree"} right={edu.date} />
                {(edu.school || edu.gpa) && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <Text style={{ fontStyle: "italic", fontSize: "10pt", flex: 1 }}>{dL(edu.school)}</Text>
                    {edu.gpa ? (
                      <Text style={{ fontSize: "9.5pt", color: INK, marginLeft: "10pt" }}>{dL(edu.gpa)}</Text>
                    ) : null}
                  </View>
                )}
                {edu.coursework ? (
                  <Text style={{ fontSize: "9.5pt", marginTop: "1.5pt" }}>
                    <Text style={{ fontWeight: "bold" }}>Relevant Coursework: </Text>
                    {dL(edu.coursework)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* ── Certifications ── */}
        {certifications.filter((c) => c.trim()).length > 0 && (
          <View>
            <SectionHeading title="Certifications" />
            <BulletList items={certifications} />
          </View>
        )}

        {/* ── Achievements ── */}
        {achievements.filter((a) => a.trim()).length > 0 && (
          <View>
            <SectionHeading title="Achievements" />
            <BulletList items={achievements} />
          </View>
        )}

        {/* ── Leadership ── */}
        {leadership.length > 0 && (
          <View>
            <SectionHeading title="Leadership" />
            {leadership.map((lead, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <HeaderRow left={lead.org} right={lead.date} />
                {lead.role ? (
                  <Text style={{ fontStyle: "italic", fontSize: "10pt", marginTop: "0.5pt" }}>{dL(lead.role)}</Text>
                ) : null}
                {lead.bullets.filter((b) => b.trim()).length > 0 && (
                  <BulletList items={lead.bullets} />
                )}
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};

export default OnyxPdfDocument;
