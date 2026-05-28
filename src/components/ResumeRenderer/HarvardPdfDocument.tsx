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
// Font is Times-Roman — a PDF base-14 built-in. No Font.register needed
// because PDFKit ships these fonts natively with stable, well-known
// encoding. This bypasses the font-subset/CMap corruption that the
// previous Lora migration suffered when multiple templates were rendered
// in the same browser session — strict ATS systems (Workday, Taleo)
// would see garbled text. Times-Roman extracts cleanly in every parser
// because it uses the standard PDF encoding rather than an embedded subset.

const FONT = "Times-Roman";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "54pt";
const MARGIN_V = "42pt";

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

// ── Section heading (bold underlined caps) ─────────────────

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "12pt", marginBottom: "5pt" }}>
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "10.5pt",
        letterSpacing: "1pt",
        textTransform: "uppercase",
        textDecoration: "underline",
      }}
    >
      {dL(title)}
    </Text>
  </View>
);

// ── Bullet list ────────────────────────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: "2pt" }}>
          <Text style={{ width: "12pt", fontSize: "10pt" }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: "10pt", lineHeight: 1.4 }}>{b}</BoldText>
        </View>
      ))}
  </View>
);

// ── Two-line header row: left bold + right date ───────────

const HeaderRow: React.FC<{ left: string; right?: string; bold?: boolean; italic?: boolean }> = ({
  left,
  right,
  bold = false,
  italic = false,
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text
      style={{
        fontWeight: bold ? "bold" : "normal",
        fontStyle: italic ? "italic" : "normal",
        fontSize: "10.5pt",
      }}
    >
      {dL(left)}
    </Text>
    {right ? (
      <Text style={{ fontSize: "10pt", fontStyle: italic ? "italic" : "normal", color: "#222" }}>
        {dL(right)}
      </Text>
    ) : null}
  </View>
);

// ── Main Document ──────────────────────────────────────────

interface HarvardPdfDocumentProps {
  state: ResumeEditorState;
}

const HarvardPdfDocument: React.FC<HarvardPdfDocumentProps> = ({ state }) => {
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
    <Document title={`${profile.name || "Resume"}`} author={profile.name} producer="ResuScore">
      <Page
        size={[PAGE_W, PAGE_H]}
        style={{
          fontFamily: FONT,
          fontSize: "10.5pt",
          color: "#000",
          paddingTop: MARGIN_V,
          paddingBottom: MARGIN_V,
          paddingLeft: MARGIN_H,
          paddingRight: MARGIN_H,
        }}
      >
        {/* Header — centered name + contacts */}
        <View style={{ alignItems: "center", marginBottom: "4pt" }}>
          <Text
            style={{
              fontWeight: "bold",
              fontSize: "18pt",
              letterSpacing: "2pt",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            {dL(profile.name || "Your Name")}
          </Text>
          {contactParts.length > 0 && (
            <Text
              style={{
                fontSize: "9.5pt",
                color: "#222",
                marginTop: "4pt",
                fontStyle: "italic",
              }}
            >
              {dL(contactParts.join("  ·  "))}
            </Text>
          )}
        </View>

        {/* Horizontal rule */}
        <View
          style={{
            borderBottomWidth: 0.75,
            borderBottomColor: "#000",
            borderBottomStyle: "solid",
            marginTop: "6pt",
            marginBottom: "2pt",
          }}
        />

        {/* Summary */}
        {summary ? (
          <BoldText style={{ fontSize: "10pt", lineHeight: 1.5, marginTop: "8pt" }}>
            {summary}
          </BoldText>
        ) : null}

        {/* Education — HBS resumes lead with Education */}
        {education.length > 0 && (
          <View>
            <SectionHeading title="Education" />
            {education.map((edu, i) => (
              <View key={i} style={{ marginBottom: "6pt" }}>
                <HeaderRow left={edu.school || "University"} right={edu.date} bold />
                {edu.degree ? (
                  <Text style={{ fontStyle: "italic", fontSize: "10pt", marginTop: "1pt" }}>
                    {dL(edu.degree)}
                    {edu.gpa ? `  -  GPA: ${edu.gpa}` : ""}
                  </Text>
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

        {/* Experience */}
        {experience.length > 0 && (
          <View>
            <SectionHeading title="Experience" />
            {experience.map((exp, i) => (
              <View key={i} style={{ marginBottom: "8pt" }}>
                <HeaderRow
                  left={exp.company || "Company"}
                  right={exp.location}
                  bold
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>{dL(exp.title)}</Text>
                  <Text style={{ fontSize: "10pt", fontStyle: "italic", color: "#222" }}>
                    {[exp.startDate, exp.endDate].filter(Boolean).join(" - ")}
                  </Text>
                </View>
                {exp.bullets.filter((b) => b.trim()).length > 0 && (
                  <BulletList items={exp.bullets} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <View>
            <SectionHeading title="Projects" />
            {projects.map((proj, i) => (
              <View key={i} style={{ marginBottom: "6pt" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "bold", fontSize: "10.5pt" }}>
                    {dL(proj.name)}
                    {proj.tech ? (
                      <Text style={{ fontWeight: "normal", fontStyle: "italic" }}>
                        {"  |  "}
                        {dL(proj.tech)}
                      </Text>
                    ) : ""}
                  </Text>
                  {proj.date ? (
                    <Text style={{ fontSize: "10pt", fontStyle: "italic", color: "#222" }}>{proj.date}</Text>
                  ) : null}
                </View>
                {proj.bullets.filter((b) => b.trim()).length > 0 && <BulletList items={proj.bullets} />}
              </View>
            ))}
          </View>
        )}

        {/* Leadership */}
        {leadership.length > 0 && (
          <View>
            <SectionHeading title="Leadership & Activities" />
            {leadership.map((lead, i) => (
              <View key={i} style={{ marginBottom: "6pt" }}>
                <HeaderRow left={lead.org} right={lead.date} bold />
                {lead.role ? (
                  <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>{dL(lead.role)}</Text>
                ) : null}
                {lead.bullets.filter((b) => b.trim()).length > 0 && <BulletList items={lead.bullets} />}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {hasSkills ? (
          <View>
            <SectionHeading title="Skills & Interests" />
            <View style={{ fontSize: "10pt", lineHeight: 1.5 }}>
              {skills.languages ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Technical: </Text>
                  {dL(skills.languages)}
                </Text>
              ) : null}
              {skills.tools ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Tools: </Text>
                  {dL(skills.tools)}
                </Text>
              ) : null}
              {skills.frameworks ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Frameworks: </Text>
                  {dL(skills.frameworks)}
                </Text>
              ) : null}
              {skills.soft ? (
                <Text style={{ marginBottom: "1.5pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Interests: </Text>
                  {dL(skills.soft)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

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
            <SectionHeading title="Key Achievements" />
            <BulletList items={achievements} />
          </View>
        )}
      </Page>
    </Document>
  );
};

export default HarvardPdfDocument;
