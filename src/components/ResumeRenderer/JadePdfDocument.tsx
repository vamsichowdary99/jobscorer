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
// Jade = faithful recreation of the priya-nair carousel mockup.
// TWO-COLUMN (left: identity/contact/skills/education, right: summary/
// experience/projects), whitespace-separated (no divider line). Two inks
// only, ink-core pixel-sampled from the mockup: teal accent + black. The
// "gray" body in the raster was anti-aliasing — darkest-50%-of-ink per line
// reads #1f-#25 (near-black), so structural text and body are both black.
// Section headers are teal with a thin full-column-width teal underline rule.
// Font: Open Sans (width+shape matched the mockup body; registered centrally
// in ./fonts.ts with a true OpenSans-Italic for the project tech line).

const FONT = "Open Sans";
const ACCENT = "#026857"; // name, section headers, header underline rules
const INK = "#1a1a1a";     // everything else
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "40pt";
const MARGIN_V = "34pt";
const LEFT_W = "178pt";    // left column fixed width
const GUTTER = "24pt";     // whitespace gutter between columns
const SKILL_GAP = "9pt";   // top gap before SKILLS heading (separates from contact)

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
// The rule spans the parent column width because Text is block-level.

const SectionHeading: React.FC<{ title: string; first?: boolean }> = ({ title, first = false }) => (
  <Text
    style={{
      fontWeight: "bold",
      fontSize: "10pt",
      letterSpacing: "0.5pt",
      textTransform: "uppercase",
      color: ACCENT,
      paddingBottom: "2.5pt",
      marginTop: first ? "0pt" : "9pt",
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

const JadePdfDocument: React.FC<JadePdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  // Role subtitle: derived from the latest (first) experience title.
  const roleSubtitle = experience.find((e) => e.title && e.title.trim())?.title?.trim() ?? "";

  const contactRows = [
    { label: "Email", value: profile.email },
    { label: "Phone", value: profile.phone },
    { label: "Location", value: profile.location },
    { label: "LinkedIn", value: profile.linkedin },
    { label: "GitHub", value: profile.github },
    { label: "Portfolio", value: profile.portfolio },
  ].filter((c) => c.value && c.value.trim());

  // Skills as grouped bold-label + bulleted items (priya-nair pattern).
  const skillGroups = [
    { label: "Languages", value: skills.languages },
    { label: "Libraries & Frameworks", value: skills.frameworks },
    { label: "Tools", value: skills.tools },
    { label: "Core Concepts", value: skills.soft },
  ]
    .map((g) => ({ label: g.label, items: splitItems(g.value || "") }))
    .filter((g) => g.items.length > 0);

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
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          {/* ════ LEFT COLUMN ════ */}
          <View style={{ width: LEFT_W }}>
            {/* Identity */}
            <Text style={{ fontWeight: "bold", fontSize: "21pt", letterSpacing: "0.5pt", textTransform: "uppercase", color: ACCENT, lineHeight: 1.04 }}>
              {dL(profile.name || "Your Name")}
            </Text>
            {roleSubtitle ? (
              <Text style={{ fontWeight: "bold", fontSize: "10.5pt", color: INK, marginTop: "3pt" }}>
                {dL(roleSubtitle)}
              </Text>
            ) : null}

            {/* Contact (stacked, bold label + value) */}
            {contactRows.length > 0 && (
              <View style={{ marginTop: "8pt" }}>
                {contactRows.map((c, i) => (
                  <Text key={i} style={{ fontSize: "8.5pt", marginBottom: "2.5pt", lineHeight: 1.25 }}>
                    <Text style={{ fontWeight: "bold" }}>{dL(`${c.label}: `)}</Text>
                    {dL(c.value)}
                  </Text>
                ))}
              </View>
            )}

            {/* Skills (grouped bold label + bullets) */}
            {skillGroups.length > 0 && (
              <View style={{ marginTop: SKILL_GAP }}>
                <SectionHeading title="Skills" />
                {skillGroups.map((g, i) => (
                  <View key={i} style={{ marginBottom: "2pt" }}>
                    <Text style={{ fontWeight: "bold", fontSize: "9.5pt", marginTop: i === 0 ? "0pt" : "1.5pt", marginBottom: "1pt" }}>
                      {dL(g.label)}
                    </Text>
                    <BulletList items={g.items} size={9.3} gap={1} lh={1.22} />
                  </View>
                ))}
              </View>
            )}

            {/* Education (degree-first) */}
            {education.length > 0 && (
              <View>
                <SectionHeading title="Education" />
                {education.map((edu, i) => (
                  <View key={i} style={{ marginBottom: "5pt" }}>
                    <Text style={{ fontWeight: "bold", fontSize: "10pt", lineHeight: 1.2 }}>
                      {dL(edu.degree || edu.school || "Degree")}
                    </Text>
                    {edu.school ? (
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
                ))}
              </View>
            )}

            {/* Certifications (left column, list) */}
            {certifications.filter((c) => c.trim()).length > 0 && (
              <View>
                <SectionHeading title="Certifications" />
                <BulletList items={certifications} size={9.3} gap={1} lh={1.22} />
              </View>
            )}

            {/* Achievements (left column, list) */}
            {achievements.filter((a) => a.trim()).length > 0 && (
              <View>
                <SectionHeading title="Achievements" />
                <BulletList items={achievements} size={9.3} gap={1} lh={1.22} />
              </View>
            )}
          </View>

          {/* ════ RIGHT COLUMN ════ */}
          <View style={{ flex: 1, marginLeft: GUTTER }}>
            {/* Summary */}
            {summary ? (
              <View>
                <SectionHeading title="Summary" first />
                <BoldText style={{ fontSize: "10pt", lineHeight: 1.4, color: INK }}>
                  {summary}
                </BoldText>
              </View>
            ) : (
              // Keep the right column anchored to the top even without a summary.
              <View />
            )}

            {/* Experience */}
            {experience.length > 0 && (
              <View>
                <SectionHeading title="Experience" first={!summary} />
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
            )}

            {/* Projects (tech shown italic on the right) */}
            {projects.length > 0 && (
              <View>
                <SectionHeading title="Projects" first={!summary && experience.length === 0} />
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

            {/* Leadership (right column, entry-style) */}
            {leadership.length > 0 && (
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
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default JadePdfDocument;
