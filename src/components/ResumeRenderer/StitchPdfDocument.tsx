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

// ── Constants ──────────────────────────────────────────────
// Font is Times-Roman — a PDF base-14 built-in. Bypasses the font-subset
// CMap corruption that Lora suffered when rendered after another Lora
// template in the same session. Built-in fonts use standard PDF encoding
// and extract cleanly in every ATS (Workday, Taleo, iCIMS, Greenhouse).

const FONT = "Times-Roman";
const NAVY = "#1e3a5f";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "48pt";
const MARGIN_V = "36pt";

// ── Helpers ────────────────────────────────────────────────

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

// ── Section Heading — navy text + thin navy underline ──────

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "12pt", marginBottom: "5pt" }}>
    <Text
      style={{
        fontSize: "8.5pt",
        fontWeight: "bold",
        letterSpacing: "0.8pt",
        textTransform: "uppercase",
        color: NAVY,
        paddingBottom: "2pt",
        borderBottomWidth: 0.75,
        borderBottomColor: NAVY,
        borderBottomStyle: "solid",
      }}
    >
      {dL(title)}
    </Text>
  </View>
);

// ── Em-dash Bullet List ────────────────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: "2pt" }}>
          <Text
            style={{
              width: "12pt",
              fontSize: "9.5pt",
              color: NAVY,
              lineHeight: 1.45,
            }}
          >
            {"•"}
          </Text>
          <BoldText
            style={{
              flex: 1,
              fontSize: "9.5pt",
              lineHeight: 1.45,
              color: "#222",
            }}
          >
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Entry Header Row ───────────────────────────────────────

const EntryHeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    }}
  >
    <Text style={{ fontWeight: "bold", fontSize: "10pt", color: "#111" }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontSize: "8.5pt", color: "#666" }}>{right}</Text>
    ) : null}
  </View>
);

// ── Main PDF Document ──────────────────────────────────────

interface StitchPdfDocumentProps {
  state: ResumeEditorState;
}

const StitchPdfDocument: React.FC<StitchPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.phone,
    profile.email,
    profile.location,
    profile.linkedin,
    profile.github,
  ].filter(Boolean);

  const hasSkills = !!(skills.languages || skills.tools || skills.frameworks || skills.soft);

  return (
    <Document title={`${profile.name || "Resume"}`} author={profile.name} producer="ResuScore">
      <Page
        size={[PAGE_W, PAGE_H]}
        style={{
          fontFamily: FONT,
          fontSize: "9.5pt",
          color: "#222",
          paddingTop: MARGIN_V,
          paddingBottom: MARGIN_V,
          paddingLeft: MARGIN_H,
          paddingRight: MARGIN_H,
        }}
      >
        {/* ── Header ── */}
        <View style={{ alignItems: "center", marginBottom: "4pt" }}>
          <Text
            style={{
              fontWeight: "normal",
              fontSize: "22pt",
              color: NAVY,
              lineHeight: 1.2,
              letterSpacing: "0.5pt",
            }}
          >
            {dL(profile.name || "Your Name")}
          </Text>
          {contactParts.length > 0 && (
            <Text
              style={{
                fontSize: "8.5pt",
                color: "#555",
                marginTop: "5pt",
                letterSpacing: "0.2pt",
                lineHeight: 1.4,
              }}
            >
              {dL(contactParts.join("  |  "))}
            </Text>
          )}
        </View>

        {/* Thin navy rule below header */}
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: NAVY,
            borderBottomStyle: "solid",
            marginTop: "4pt",
            marginBottom: "2pt",
          }}
        />

        {/* ── Summary ── */}
        {summary ? (
          <View style={{ marginTop: "8pt" }}>
            <BoldText
              style={{
                fontSize: "9.5pt",
                lineHeight: 1.5,
                color: "#333",
                fontStyle: "italic",
              }}
            >
              {summary}
            </BoldText>
          </View>
        ) : null}

        {/* ── Education ── */}
        {education.length > 0 && (
          <View>
            <SectionHeading title="Education" />
            {education.map((edu, i) => (
              <View key={i} style={{ marginBottom: "6pt" }}>
                <EntryHeaderRow left={edu.school || "University"} right={edu.date} />
                {edu.degree ? (
                  <Text
                    style={{
                      fontStyle: "italic",
                      fontSize: "9.5pt",
                      color: "#555",
                      marginTop: "1pt",
                    }}
                  >
                    {dL(edu.degree)}
                    {edu.gpa ? `  -  GPA: ${edu.gpa}` : ""}
                  </Text>
                ) : null}
                {edu.coursework ? (
                  <Text style={{ fontSize: "9pt", color: "#444", marginTop: "2pt", lineHeight: 1.4 }}>
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
              <View key={i} style={{ marginBottom: "8pt" }}>
                <EntryHeaderRow
                  left={exp.company || "Company"}
                  right={[exp.startDate, exp.endDate].filter(Boolean).join(" - ")}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginTop: "1pt",
                  }}
                >
                  <Text style={{ fontStyle: "italic", fontSize: "9.5pt", color: "#555" }}>
                    {dL(exp.title)}
                  </Text>
                  {exp.location ? (
                    <Text style={{ fontSize: "8.5pt", color: "#777" }}>{dL(exp.location)}</Text>
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
              <View key={i} style={{ marginBottom: "6pt" }}>
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
                      <Text
                        style={{
                          fontWeight: "normal",
                          fontStyle: "italic",
                          color: "#666",
                          fontSize: "9.5pt",
                        }}
                      >
                        {"  |  "}
                        {dL(proj.tech)}
                      </Text>
                    ) : ""}
                  </Text>
                  {proj.date ? (
                    <Text style={{ fontSize: "8.5pt", color: "#666" }}>{proj.date}</Text>
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
            <SectionHeading title="Skills" />
            <View style={{ fontSize: "9.5pt" }}>
              {skills.languages ? (
                <Text style={{ marginBottom: "2pt", color: "#333", lineHeight: 1.4 }}>
                  <Text style={{ fontWeight: "bold", color: NAVY }}>Technical: </Text>
                  {dL(skills.languages)}
                </Text>
              ) : null}
              {skills.tools ? (
                <Text style={{ marginBottom: "2pt", color: "#333", lineHeight: 1.4 }}>
                  <Text style={{ fontWeight: "bold", color: NAVY }}>Tools: </Text>
                  {dL(skills.tools)}
                </Text>
              ) : null}
              {skills.frameworks ? (
                <Text style={{ marginBottom: "2pt", color: "#333", lineHeight: 1.4 }}>
                  <Text style={{ fontWeight: "bold", color: NAVY }}>Frameworks: </Text>
                  {dL(skills.frameworks)}
                </Text>
              ) : null}
              {skills.soft ? (
                <Text style={{ color: "#333", lineHeight: 1.4 }}>
                  <Text style={{ fontWeight: "bold", color: NAVY }}>Core Competencies: </Text>
                  {dL(skills.soft)}
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
              <View key={i} style={{ marginBottom: "6pt" }}>
                <EntryHeaderRow left={lead.org} right={lead.date} />
                {lead.role ? (
                  <Text
                    style={{
                      fontStyle: "italic",
                      fontSize: "9.5pt",
                      color: "#555",
                      marginTop: "1pt",
                    }}
                  >
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

export default StitchPdfDocument;
