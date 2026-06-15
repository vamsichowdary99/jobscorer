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

// ── Constants — theme color from open-resume ──────────────
// Font registered centrally in ./fonts.ts.

const FONT = "Roboto";
const THEME_COLOR = "#38bdf8"; // sky-400, open-resume default
const TEXT_COLOR = "#171717";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "40pt";
const MARGIN_V = "32pt";

// ── BoldText helper ────────────────────────────────────────

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

// ── Section heading — short colored bar + bold label ──────

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginTop: "14pt",
      marginBottom: "6pt",
    }}
  >
    <View
      style={{
        width: "26pt",
        height: "3.5pt",
        backgroundColor: THEME_COLOR,
        marginRight: "8pt",
      }}
    />
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "11pt",
        letterSpacing: "0.4pt",
        color: TEXT_COLOR,
      }}
    >
      {dL(title).toUpperCase()}
    </Text>
  </View>
);

// ── Bullet list ────────────────────────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "3pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "2pt" }}>
          <Text
            style={{
              width: "12pt",
              fontSize: "10pt",
              color: TEXT_COLOR,
              fontWeight: "bold",
            }}
          >
            {"•"}
          </Text>
          <BoldText style={{ flex: 1, fontSize: "10pt", lineHeight: 1.4, color: TEXT_COLOR }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

const HeaderRow: React.FC<{ left: string; right?: string; bold?: boolean }> = ({
  left,
  right,
  bold = false,
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: bold ? "bold" : "normal", fontSize: "10.5pt", color: TEXT_COLOR }}>
      {dL(left)}
    </Text>
    {right ? (
      <Text style={{ fontSize: "10pt", color: "#404040" }}>{right}</Text>
    ) : null}
  </View>
);

// ── Main Document ──────────────────────────────────────────

interface OpenResumePdfDocumentProps {
  state: ResumeEditorState;
}

const OpenResumePdfDocument: React.FC<OpenResumePdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.email,
    profile.phone,
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
          fontSize: "10.5pt",
          color: TEXT_COLOR,
        }}
      >
        {/* Top accent bar */}
        <View
          style={{
            width: "100%",
            height: "12pt",
            backgroundColor: THEME_COLOR,
          }}
        />

        {/* Content with horizontal padding */}
        <View
          style={{
            paddingTop: MARGIN_V,
            paddingBottom: MARGIN_V,
            paddingLeft: MARGIN_H,
            paddingRight: MARGIN_H,
          }}
        >
          {/* Profile header — large blue name */}
          <Text
            style={{
              fontWeight: "bold",
              fontSize: "22pt",
              color: THEME_COLOR,
              letterSpacing: "0.2pt",
              lineHeight: 1.15,
            }}
          >
            {dL(profile.name || "Your Name")}
          </Text>

          {summary ? (
            <BoldText
              style={{
                fontSize: "10pt",
                lineHeight: 1.45,
                marginTop: "4pt",
                color: TEXT_COLOR,
              }}
            >
              {summary}
            </BoldText>
          ) : null}

          {contactParts.length > 0 && (
            <Text
              style={{
                fontSize: "9.5pt",
                marginTop: "4pt",
                color: "#404040",
              }}
            >
              {dL(contactParts.join("   ·   "))}
            </Text>
          )}

          {/* Work Experience */}
          {experience.length > 0 && (
            <View>
              <SectionHeading title="Work Experience" />
              {experience.map((exp, i) => (
                <View key={i} style={{ marginBottom: "6pt" }}>
                  <HeaderRow
                    left={exp.company || "Company"}
                    right={[exp.startDate, exp.endDate].filter(Boolean).join(" - ")}
                    bold
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: "1pt",
                    }}
                  >
                    <Text style={{ fontSize: "10pt", color: TEXT_COLOR }}>{dL(exp.title)}</Text>
                    {exp.location ? (
                      <Text style={{ fontSize: "9.5pt", color: "#525252" }}>{dL(exp.location)}</Text>
                    ) : null}
                  </View>
                  {exp.bullets.filter((b) => b.trim()).length > 0 && (
                    <BulletList items={exp.bullets} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Education */}
          {education.length > 0 && (
            <View>
              <SectionHeading title="Education" />
              {education.map((edu, i) => (
                <View key={i} style={{ marginBottom: "5pt" }}>
                  <HeaderRow left={edu.school || "University"} right={edu.date} bold />
                  {edu.degree ? (
                    <Text style={{ fontSize: "10pt", color: TEXT_COLOR, marginTop: "1pt" }}>
                      {dL(edu.degree)}
                      {edu.gpa ? `  -  GPA: ${edu.gpa}` : ""}
                    </Text>
                  ) : null}
                  {edu.coursework ? (
                    <Text style={{ fontSize: "9.5pt", color: "#404040", marginTop: "1pt" }}>
                      <Text style={{ fontWeight: "bold" }}>Coursework: </Text>
                      {dL(edu.coursework)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* Projects */}
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
                    <Text style={{ fontWeight: "bold", fontSize: "10.5pt", color: TEXT_COLOR }}>
                      {dL(proj.name)}
                      {proj.tech ? (
                        <Text style={{ fontWeight: "normal", color: "#525252" }}>
                          {"  |  "}
                          {dL(proj.tech)}
                        </Text>
                      ) : ""}
                    </Text>
                    {proj.date ? (
                      <Text style={{ fontSize: "10pt", color: "#404040" }}>{proj.date}</Text>
                    ) : null}
                  </View>
                  {proj.bullets.filter((b) => b.trim()).length > 0 && (
                    <BulletList items={proj.bullets} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Skills */}
          {hasSkills ? (
            <View>
              <SectionHeading title="Skills" />
              <View style={{ fontSize: "10pt", lineHeight: 1.5 }}>
                {skills.languages ? (
                  <Text style={{ marginBottom: "1.5pt", color: TEXT_COLOR }}>
                    <Text style={{ fontWeight: "bold" }}>{dL("Technical Skills: ")}</Text>
                    {dL(skills.languages)}
                  </Text>
                ) : null}
                {skills.frameworks ? (
                  <Text style={{ marginBottom: "1.5pt", color: TEXT_COLOR }}>
                    <Text style={{ fontWeight: "bold" }}>Frameworks: </Text>
                    {dL(skills.frameworks)}
                  </Text>
                ) : null}
                {skills.tools ? (
                  <Text style={{ marginBottom: "1.5pt", color: TEXT_COLOR }}>
                    <Text style={{ fontWeight: "bold" }}>Tools: </Text>
                    {dL(skills.tools)}
                  </Text>
                ) : null}
                {skills.soft ? (
                  <Text style={{ marginBottom: "1.5pt", color: TEXT_COLOR }}>
                    <Text style={{ fontWeight: "bold" }}>Soft Skills: </Text>
                    {dL(skills.soft)}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Leadership */}
          {leadership.length > 0 && (
            <View>
              <SectionHeading title="Leadership" />
              {leadership.map((lead, i) => (
                <View key={i} style={{ marginBottom: "5pt" }}>
                  <HeaderRow left={lead.org} right={lead.date} bold />
                  {lead.role ? (
                    <Text style={{ fontSize: "10pt", color: TEXT_COLOR }}>{dL(lead.role)}</Text>
                  ) : null}
                  {lead.bullets.filter((b) => b.trim()).length > 0 && <BulletList items={lead.bullets} />}
                </View>
              ))}
            </View>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <View>
              <SectionHeading title="Certifications" />
              <BulletList items={certifications} />
            </View>
          )}

          {/* Achievements */}
          {achievements.length > 0 && (
            <View>
              <SectionHeading title="Achievements" />
              <BulletList items={achievements} />
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
};

export default OpenResumePdfDocument;
