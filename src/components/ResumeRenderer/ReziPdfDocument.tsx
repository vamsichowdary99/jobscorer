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

const FONT = "Lora";
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
          <Text key={i} style={i % 2 === 1 ? { fontFamily: FONT, fontWeight: "bold" } : undefined}>
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
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: "9pt",
        letterSpacing: "0.8pt",
        textTransform: "uppercase",
        color: "#333",
        paddingBottom: "2pt",
        borderBottomWidth: 0.5,
        borderBottomColor: "#ccc",
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
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "3pt" }}>
          <Text style={{ width: "10pt", fontSize: "10pt", color: "#333" }}>{"\u2022"}</Text>
          <BoldText style={{ flex: 1, fontSize: "9.5pt", lineHeight: 1.4, color: "#111" }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left bold + right italic date ────────────────────

const HeaderRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    }}
  >
    <Text
      style={{
        fontFamily: FONT,
        fontWeight: "bold",
        fontSize: "10.5pt",
        color: "#111",
      }}
    >
      {dL(left)}
    </Text>
    {right ? (
      <Text
        style={{
          fontFamily: FONT,
          fontStyle: "italic",
          fontSize: "9pt",
          color: "#666",
        }}
      >
        {right}
      </Text>
    ) : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface ReziPdfDocumentProps {
  state: ResumeEditorState;
}

const ReziPdfDocument: React.FC<ReziPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.phone,
    profile.email,
    profile.location,
    profile.linkedin,
    profile.github,
  ].filter(Boolean);

  const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft;

  const skillRows: { label: string; value: string }[] = [
    { label: "Technical Skills", value: skills.languages },
    { label: "Tools", value: skills.tools },
    { label: "Frameworks", value: skills.frameworks },
    { label: "Soft Skills", value: skills.soft },
  ].filter((row) => Boolean(row.value));

  return (
    <Document title={`${profile.name || "Resume"}`} author={profile.name} producer="JobScorer">
      <Page
        size={[PAGE_W, PAGE_H]}
        style={{
          fontFamily: FONT,
          fontSize: "9.5pt",
          color: "#111",
          paddingTop: MARGIN_V,
          paddingBottom: MARGIN_V,
          paddingLeft: MARGIN_H,
          paddingRight: MARGIN_H,
        }}
      >
        {/* ── Header ── */}
        <View style={{ alignItems: "center", marginBottom: "6pt" }}>
          <Text
            style={{
              fontFamily: FONT,
              fontWeight: "bold",
              fontSize: "22pt",
              letterSpacing: "0.5pt",
              color: "#111",
              lineHeight: 1.2,
            }}
          >
            {dL(profile.name || "Your Name")}
          </Text>
          {contactParts.length > 0 && (
            <Text
              style={{
                fontFamily: FONT,
                fontSize: "9pt",
                color: "#555",
                marginTop: "4pt",
                letterSpacing: "0.1pt",
              }}
            >
              {dL(contactParts.join("  \u00b7  "))}
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
              fontFamily: FONT,
              fontSize: "9.5pt",
              lineHeight: 1.4,
              color: "#111",
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
              <View key={i} style={{ marginBottom: "6pt" }}>
                <HeaderRow left={edu.school || "University"} right={edu.date} />
                {edu.degree ? (
                  <Text
                    style={{
                      fontFamily: FONT,
                      fontWeight: "bold",
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
                  <Text
                    style={{
                      fontFamily: FONT,
                      fontSize: "9pt",
                      marginTop: "2pt",
                      color: "#333",
                    }}
                  >
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
              <View key={i} style={{ marginBottom: "6pt" }}>
                <HeaderRow
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
                  <Text
                    style={{
                      fontFamily: FONT,
                      fontWeight: "bold",
                      fontStyle: "italic",
                      fontSize: "9.5pt",
                      color: "#555",
                    }}
                  >
                    {dL(exp.title)}
                  </Text>
                  {exp.location ? (
                    <Text
                      style={{
                        fontFamily: FONT,
                        fontSize: "9pt",
                        color: "#666",
                      }}
                    >
                      {dL(exp.location)}
                    </Text>
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
                  <Text
                    style={{
                      fontFamily: FONT,
                      fontWeight: "bold",
                      fontSize: "10.5pt",
                      color: "#111",
                    }}
                  >
                    {dL(proj.name)}
                    {proj.tech ? (
                      <Text
                        style={{
                          fontFamily: FONT,
                          fontWeight: "normal",
                          fontStyle: "italic",
                          fontSize: "9.5pt",
                          color: "#555",
                        }}
                      >
                        {" | "}
                        {dL(proj.tech)}
                      </Text>
                    ) : (
                      ""
                    )}
                  </Text>
                  {proj.date ? (
                    <Text
                      style={{
                        fontFamily: FONT,
                        fontStyle: "italic",
                        fontSize: "9pt",
                        color: "#666",
                      }}
                    >
                      {proj.date}
                    </Text>
                  ) : null}
                </View>
                {proj.bullets.filter((b) => b.trim()).length > 0 && (
                  <BulletList items={proj.bullets} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Skills ── */}
        {hasSkills ? (
          <View>
            <SectionHeading title="Skills" />
            <View style={{ fontSize: "9.5pt" }}>
              {skillRows.map((row, i) => (
                <Text
                  key={i}
                  style={{
                    fontFamily: FONT,
                    marginBottom: "3pt",
                    color: "#111",
                    lineHeight: 1.4,
                  }}
                >
                  <Text style={{ fontWeight: "bold" }}>{dL(row.label + ": ")}</Text>
                  {dL(row.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .join(", "))}
                </Text>
              ))}
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
              <View key={i} style={{ marginBottom: "6pt" }}>
                <HeaderRow left={lead.org} right={lead.date} />
                {lead.role ? (
                  <Text
                    style={{
                      fontFamily: FONT,
                      fontWeight: "bold",
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

export default ReziPdfDocument;
