"use client";

import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
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

const FONT = "Lato";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "48pt";
const MARGIN_V = "36pt";

// ── Helpers ───────────────────────────────────────────────

interface BoldTextProps {
  children: string;
  style?: Style;
}

/**
 * Renders inline text where **double-asterisk** segments are bolded.
 * All other segments render with the provided style.
 */
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
  <View style={{ marginTop: "7pt", marginBottom: "3pt" }}>
    <Text
      style={{
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: "8pt",
        letterSpacing: "0.6pt",
        textTransform: "uppercase",
        color: "#333",
        paddingBottom: "2.5pt",
        borderBottomWidth: 0.5,
        borderBottomColor: "#ddd",
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
          {/* Bullet marker */}
          <Text style={{ width: "12pt", fontSize: "9.5pt", color: "#aaa" }}>{"\u2022"}</Text>
          <BoldText style={{ flex: 1, fontSize: "9.5pt", color: "#333", lineHeight: 1.35 }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Entry header row: bold left label + right-aligned date ─

interface EntryHeaderRowProps {
  left: string;
  right?: string;
}

const EntryHeaderRow: React.FC<EntryHeaderRowProps> = ({ left, right }) => (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    }}
  >
    <Text style={{ fontWeight: "bold", fontSize: "10pt", color: "#111" }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "9pt", color: "#888" }}>{right}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface ReziStandardPdfDocumentProps {
  state: ResumeEditorState;
}

const ReziStandardPdfDocument: React.FC<ReziStandardPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  // Build contact line parts, separated by · (middle dot)
  const contactParts = [
    profile.phone,
    profile.email,
    profile.location,
    profile.linkedin,
    profile.github,
  ].filter(Boolean);

  const hasSkills = !!(skills.languages || skills.tools || skills.frameworks || skills.soft);

  return (
    <Document title={`${profile.name || "Resume"}`} author={profile.name} producer="JobScorer">
      <Page
        size={[PAGE_W, PAGE_H]}
        style={{
          fontFamily: FONT,
          fontSize: "9.5pt",
          color: "#333",
          paddingTop: MARGIN_V,
          paddingBottom: MARGIN_V,
          paddingLeft: MARGIN_H,
          paddingRight: MARGIN_H,
        }}
      >
        {/* ── Header ── */}
        <View style={{ alignItems: "center", marginBottom: "6pt" }}>
          {/* Name: bold, 20pt, uppercase. Light tracking \u2014 ATS-safe. */}
          <Text
            style={{
              fontWeight: "bold",
              fontSize: "20pt",
              letterSpacing: "1pt",
              textTransform: "uppercase",
              color: "#111",
              lineHeight: 1.2,
            }}
          >
            {dL(profile.name || "Your Name")}
          </Text>

          {/* Contact line */}
          {contactParts.length > 0 && (
            <Text
              style={{
                fontSize: "9pt",
                color: "#777",
                marginTop: "4pt",
                letterSpacing: "0.2pt",
              }}
            >
              {dL(contactParts.join(" \u00B7 "))}
            </Text>
          )}
        </View>

        {/* Thin rule below header */}
        <View
          style={{
            borderBottomWidth: 0.5,
            borderBottomColor: "#ccc",
            borderBottomStyle: "solid",
            marginBottom: "6pt",
          }}
        />

        {/* ── Summary ── */}
        {summary ? (
          <BoldText
            style={{
              fontSize: "9.5pt",
              lineHeight: 1.45,
              color: "#333",
              marginBottom: "6pt",
            }}
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
                <EntryHeaderRow
                  left={edu.school || "University"}
                  right={edu.date}
                />
                {edu.degree ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: "#666" }}>
                      {dL(edu.degree)}
                      {edu.gpa ? `  -  GPA: ${edu.gpa}` : ""}
                    </Text>
                  </View>
                ) : null}
                {edu.coursework ? (
                  <Text style={{ fontSize: "9pt", marginTop: "1pt", color: "#555", fontStyle: "italic" }}>
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
              <View key={i} style={{ marginBottom: "5pt" }}>
                <EntryHeaderRow
                  left={exp.company || "Company"}
                  right={[exp.startDate, exp.endDate].filter(Boolean).join(" - ")}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: "#666" }}>
                    {dL(exp.title)}
                  </Text>
                  {exp.location ? (
                    <Text style={{ fontSize: "9pt", color: "#888" }}>{dL(exp.location)}</Text>
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
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                  }}
                >
                  <Text style={{ fontWeight: "bold", fontSize: "10pt", color: "#111" }}>
                    {dL(proj.name)}
                    {proj.tech ? (
                      <Text style={{ fontWeight: "normal", fontStyle: "italic", color: "#666" }}>
                        {" | "}
                        {dL(proj.tech)}
                      </Text>
                    ) : ""}
                  </Text>
                  {proj.date ? (
                    <Text style={{ fontSize: "9pt", color: "#888" }}>{proj.date}</Text>
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
            <View style={{ fontSize: "9.5pt" }}>
              {skills.languages ? (
                <Text style={{ marginBottom: "2pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Technical: </Text>{dL(skills.languages)}
                </Text>
              ) : null}
              {skills.tools ? (
                <Text style={{ marginBottom: "2pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Tools: </Text>{dL(skills.tools)}
                </Text>
              ) : null}
              {skills.frameworks ? (
                <Text style={{ marginBottom: "2pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Frameworks: </Text>{dL(skills.frameworks)}
                </Text>
              ) : null}
              {skills.soft ? (
                <Text>
                  <Text style={{ fontWeight: "bold" }}>Core Competencies: </Text>{dL(skills.soft)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── Certifications ── */}
        {certifications.length > 0 && (
          <View>
            <SectionHeading title="Certifications" />
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
                <EntryHeaderRow left={lead.org} right={lead.date} />
                {lead.role ? (
                  <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: "#666" }}>
                    {dL(lead.role)}
                  </Text>
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

export default ReziStandardPdfDocument;
