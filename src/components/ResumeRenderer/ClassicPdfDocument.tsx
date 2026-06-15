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
// Font registered centrally in ./fonts.ts.

const FONT = "Roboto";
const FONT_SIZE = "10pt";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "48pt";
const MARGIN_V = "36pt";

// ── Helpers ───────────────────────────────────────────────

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

// ── Section Heading ───────────────────────────────────────

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "10pt", marginBottom: "4pt" }}>
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "10.5pt",
        letterSpacing: "0.8pt",
        textTransform: "uppercase",
        paddingBottom: "2pt",
        borderBottomWidth: 1,
        borderBottomColor: "#000",
        borderBottomStyle: "solid",
      }}
    >
      {dL(title)}
    </Text>
  </View>
);

// ── Bullet list ───────────────────────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <Text style={{ width: "12pt", fontSize: "10pt" }}>{"\u2022"}</Text>
          <BoldText style={{ flex: 1, fontSize: "10pt", lineHeight: 1.3 }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left bold + right date ───────────────────────────

const HeaderRow: React.FC<{ left: string; right?: string; bold?: boolean }> = ({
  left,
  right,
  bold = false,
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: bold ? "bold" : "normal", fontSize: "10.5pt" }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "9.5pt", color: "#333" }}>{right}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface ClassicPdfDocumentProps {
  state: ResumeEditorState;
}

const ClassicPdfDocument: React.FC<ClassicPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.phone,
    profile.email,
    profile.location,
    profile.linkedin,
    profile.github,
  ].filter(Boolean);

  const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft;

  return (
    <Document title={`${profile.name || "Resume"}`} author={profile.name} producer="JobScorer">
      <Page
        size={[PAGE_W, PAGE_H]}
        style={{
          fontFamily: FONT,
          fontSize: FONT_SIZE,
          color: "#000",
          paddingTop: MARGIN_V,
          paddingBottom: MARGIN_V,
          paddingLeft: MARGIN_H,
          paddingRight: MARGIN_H,
        }}
      >
        {/* ── Header ── */}
        <View style={{ alignItems: "center", marginBottom: "5pt" }}>
          <Text
            style={{
              fontWeight: "bold",
              fontSize: "20pt",
              letterSpacing: "1.5pt",
              lineHeight: 1.2,
            }}
          >
            {dL((profile.name || "Your Name").toUpperCase())}
          </Text>
          {contactParts.length > 0 && (
            <Text
              style={{
                fontSize: "9.5pt",
                color: "#333",
                marginTop: "3pt",
                letterSpacing: "0.2pt",
              }}
            >
              {dL(contactParts.join("  \u00b7  "))}
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={{ borderBottomWidth: 1.5, borderBottomColor: "#000", borderBottomStyle: "solid", marginBottom: "5pt" }} />

        {/* ── Summary ── */}
        {summary ? (
          <BoldText
            style={{ fontSize: "10pt", lineHeight: 1.45, color: "#111", marginBottom: "6pt" }}
          >
            {summary}
          </BoldText>
        ) : null}

        {/* ── Education ── */}
        {education.length > 0 && (
          <View>
            <SectionHeading title="Education" />
            {education.map((edu, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <HeaderRow left={edu.school || "University"} right={edu.date} bold />
                {edu.degree ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>
                      {dL(edu.degree)}
                      {edu.gpa ? `  -  GPA: ${edu.gpa}` : ""}
                    </Text>
                  </View>
                ) : null}
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

        {/* ── Experience ── */}
        {experience.length > 0 && (
          <View>
            <SectionHeading title="Experience" />
            {experience.map((exp, i) => (
              <View key={i} style={{ marginBottom: "7pt" }}>
                <HeaderRow
                  left={exp.company || "Company"}
                  right={[exp.startDate, exp.endDate].filter(Boolean).join(" - ")}
                  bold
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>{dL(exp.title)}</Text>
                  {exp.location ? (
                    <Text style={{ fontSize: "9.5pt", color: "#555" }}>{dL(exp.location)}</Text>
                  ) : null}
                </View>
                {exp.bullets.filter((b) => b.trim()).length > 0 && (
                  <BulletList items={exp.bullets} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Projects ── */}
        {projects.length > 0 && (
          <View>
            <SectionHeading title="Projects" />
            {projects.map((proj, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "bold", fontSize: "10.5pt" }}>
                    {dL(proj.name)}
                    {proj.tech ? (
                      <Text style={{ fontWeight: "normal" }}>
                        {" | "}
                        <Text style={{ fontStyle: "italic" }}>{dL(proj.tech)}</Text>
                      </Text>
                    ) : ""}
                  </Text>
                  {proj.date ? (
                    <Text style={{ fontSize: "9.5pt", color: "#333" }}>{proj.date}</Text>
                  ) : null}
                </View>
                {proj.bullets.filter((b) => b.trim()).length > 0 && (
                  <BulletList items={proj.bullets} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Technical Skills ── */}
        {hasSkills ? (
          <View>
            <SectionHeading title="Technical Skills" />
            <View style={{ fontSize: "10pt" }}>
              {skills.languages ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>{dL("Technical Skills: ")}</Text>
                  {dL(skills.languages)}
                </Text>
              ) : null}
              {skills.tools ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Developer Tools: </Text>
                  {dL(skills.tools)}
                </Text>
              ) : null}
              {skills.frameworks ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Technologies/Frameworks: </Text>
                  {dL(skills.frameworks)}
                </Text>
              ) : null}
              {skills.soft ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Core Competencies: </Text>
                  {dL(skills.soft)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── Certifications ── */}
        {certifications.length > 0 && (
          <View>
            <SectionHeading title={dL("Certifications")} />
            <BulletList items={certifications} />
          </View>
        )}

        {/* ── Achievements ── */}
        {achievements.length > 0 && (
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
                <HeaderRow left={lead.org} right={lead.date} bold />
                {lead.role ? (
                  <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>{dL(lead.role)}</Text>
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

export default ClassicPdfDocument;
