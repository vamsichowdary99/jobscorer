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
// Lapis = modern indigo recreation of the ananya-reddy carousel mockup.
// Single-column. Two inks (ink-core pixel-sampled): deep indigo accent + near
// black. Distinctive: each section header is a small vertical indigo bar + an
// indigo uppercase label sitting under a thin light divider rule; skills render
// as a wrapping cloud of outlined pills (each pill is real, extractable text);
// the company/tech line is indigo italic. Font: Open Sans (incl. true italic).

const FONT = "Open Sans";
const ACCENT = "#1a1670";    // name, subtitle, section headers + bars, company line
const INK = "#1f2024";       // body, titles, contact, pill text
const DIVIDER = "#e4e4ee";   // thin light rule above each section header
const PILL_BORDER = "#cdcdde"; // outlined skill pills
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "42pt";
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

// ── Section Heading (thin divider rule → ▌ indigo bar + indigo label) ─

const SectionHeading: React.FC<{ title: string; first?: boolean }> = ({ title, first = false }) => (
  <View style={{ marginTop: first ? "9pt" : "10pt", marginBottom: "4pt" }}>
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: DIVIDER,
        borderTopStyle: "solid",
        marginBottom: "5pt",
      }}
    />
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 3, height: 10.5, backgroundColor: ACCENT, marginRight: "6pt" }} />
      <Text
        style={{
          fontWeight: "bold",
          fontSize: "11pt",
          letterSpacing: "0.5pt",
          textTransform: "uppercase",
          color: ACCENT,
        }}
      >
        {dL(title)}
      </Text>
    </View>
  </View>
);

// ── Bullet list (round • marker, black) ───────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <Text style={{ width: "12pt", fontSize: "10pt" }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: "10pt", lineHeight: 1.3 }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Skill pills (wrapping cloud of outlined, extractable text) ─

const SkillPills: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: "3pt" }}>
    {items.map((s, i) => (
      <View
        key={i}
        wrap={false}
        style={{
          borderWidth: 0.8,
          borderColor: PILL_BORDER,
          borderStyle: "solid",
          borderRadius: 4,
          paddingTop: "2pt",
          paddingBottom: "2pt",
          paddingLeft: "6pt",
          paddingRight: "6pt",
          marginRight: "5pt",
          marginBottom: "5pt",
        }}
      >
        <Text style={{ fontSize: "9pt", color: INK }}>{dL(s)}</Text>
      </View>
    ))}
  </View>
);

// ── Row: left (bold) + right date, both black ─────────────

const HeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: "bold", fontSize: "10.5pt", flex: 1 }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "9.5pt", color: INK, marginLeft: "10pt" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface LapisPdfDocumentProps {
  state: ResumeEditorState;
}

const splitItems = (csv: string): string[] =>
  (csv || "")
    // Split on commas / newlines / bullets, but keep commas INSIDE parentheses
    // together so e.g. "AWS (S3, EC2, Glue)" stays a single pill.
    .split(/,(?![^(]*\))|[•\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const LapisPdfDocument: React.FC<LapisPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedin,
    profile.github,
    profile.portfolio,
  ].filter(Boolean);

  const roleSubtitle = experience.find((e) => e.title && e.title.trim())?.title?.trim() ?? "";

  // Skills merge into one flat pill cloud (mockup shows no category labels).
  const skillPills = [
    ...splitItems(skills.languages),
    ...splitItems(skills.frameworks),
    ...splitItems(skills.tools),
    ...splitItems(skills.soft),
  ];

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
          <Text style={{ fontWeight: "bold", fontSize: "22pt", letterSpacing: "0.5pt", textTransform: "uppercase", color: ACCENT, lineHeight: 1.05 }}>
            {dL(profile.name || "Your Name")}
          </Text>
          {roleSubtitle ? (
            <Text style={{ fontWeight: "bold", fontSize: "11.5pt", color: ACCENT, marginTop: "2pt" }}>
              {dL(roleSubtitle)}
            </Text>
          ) : null}
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "9pt", color: INK, marginTop: "5pt", letterSpacing: "0.1pt" }}>
              {dL(contactParts.join("   |   "))}
            </Text>
          )}
        </View>

        {/* ── Summary ── */}
        {summary ? (
          <View>
            <SectionHeading title="Summary" first />
            <BoldText style={{ fontSize: "10pt", lineHeight: 1.4, color: INK }}>
              {summary}
            </BoldText>
          </View>
        ) : null}

        {/* ── Skills (pills) ── */}
        {skillPills.length > 0 && (
          <View>
            <SectionHeading title="Skills" first={!summary} />
            <SkillPills items={skillPills} />
          </View>
        )}

        {/* ── Experience ── */}
        {experience.length > 0 && (
          <View>
            <SectionHeading title="Work Experience" first={!summary && skillPills.length === 0} />
            {experience.map((exp, i) => {
              const companyLine = [exp.company, exp.location].filter(Boolean).join(", ");
              return (
                <View key={i} style={{ marginBottom: "6pt" }}>
                  <HeaderRow
                    left={exp.title || "Role"}
                    right={[exp.startDate, exp.endDate].filter(Boolean).join(" – ")}
                  />
                  {companyLine ? (
                    <Text style={{ fontStyle: "italic", fontSize: "10pt", color: ACCENT, marginTop: "0.5pt" }}>
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

        {/* ── Projects ── */}
        {projects.length > 0 && (
          <View>
            <SectionHeading title="Projects" />
            {projects.map((proj, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <HeaderRow left={proj.name} right={proj.date} />
                {proj.tech ? (
                  <Text style={{ fontStyle: "italic", fontSize: "10pt", color: ACCENT, marginTop: "0.5pt" }}>
                    {dL(proj.tech)}
                  </Text>
                ) : null}
                {proj.bullets.filter((b) => b.trim()).length > 0 && (
                  <BulletList items={proj.bullets} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Education ── */}
        {education.length > 0 && (
          <View>
            <SectionHeading title="Education" />
            {education.map((edu, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <HeaderRow left={edu.degree || edu.school || "Degree"} right={edu.date} />
                {(edu.school || edu.gpa) && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <Text style={{ fontStyle: "italic", fontSize: "10pt", color: ACCENT, flex: 1 }}>{dL(edu.school)}</Text>
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
                  <Text style={{ fontStyle: "italic", fontSize: "10pt", color: ACCENT, marginTop: "0.5pt" }}>{dL(lead.role)}</Text>
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

export default LapisPdfDocument;
