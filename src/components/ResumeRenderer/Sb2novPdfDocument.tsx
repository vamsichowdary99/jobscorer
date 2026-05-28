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
// CMap corruption that Lora suffered when rendered alongside other Lora
// templates in the same session. Built-in fonts use standard PDF encoding
// and extract cleanly in every ATS. The Times-Roman feel is also closer
// to sb2nov's LaTeX-academic origin than Lora.

const FONT = "Times-Roman";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "48pt";
const MARGIN_V = "36pt";

// ── BoldText helper ────────────────────────────────────────

interface BoldTextProps {
  children: string;
  style?: Style;
}

const BoldText: React.FC<BoldTextProps> = ({ children: text, style = {} }) => {
  if (!text) return null;
  const parts = text.split(/\*\*/);
  if (parts.length === 1)
    return <Text style={{ fontFamily: FONT, ...style }}>{dL(text)}</Text>;
  return (
    <Text style={{ fontFamily: FONT, ...style }}>
      {parts.map((seg, i) =>
        seg ? (
          <Text key={i} style={i % 2 === 1 ? { fontFamily: FONT, fontWeight: "bold" } : { fontFamily: FONT }}>
            {dL(seg)}
          </Text>
        ) : null
      )}
    </Text>
  );
};

// ── Section heading: uppercase bold + thin rule under ──────

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "10pt", marginBottom: "3pt" }}>
    <Text
      style={{
        fontWeight: "bold",
        fontSize: "11pt",
        letterSpacing: "0.6pt",
        textTransform: "uppercase",
        paddingBottom: "1pt",
        borderBottomWidth: 0.6,
        borderBottomColor: "#000",
        borderBottomStyle: "solid",
      }}
    >
      {dL(title)}
    </Text>
  </View>
);

// ── Bullet list — open circle markers ──────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "2pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: "1.5pt" }}>
          <Text style={{ width: "12pt", fontSize: "10pt", paddingLeft: "2pt", fontFamily: FONT }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: "10pt", lineHeight: 1.4 }}>{b}</BoldText>
        </View>
      ))}
  </View>
);

const HeaderRow: React.FC<{ left: string; right?: string; bold?: boolean; italic?: boolean }> = ({
  left,
  right,
  bold = false,
  italic = false,
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text
      style={{
        fontFamily: FONT,
        fontWeight: bold ? "bold" : "normal",
        fontStyle: italic ? "italic" : "normal",
        fontSize: "10.5pt",
      }}
    >
      {dL(left)}
    </Text>
    {right ? (
      <Text style={{ fontFamily: FONT, fontSize: "10pt", color: "#222" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

// ── Main Document ──────────────────────────────────────────

interface Sb2novPdfDocumentProps {
  state: ResumeEditorState;
}

const Sb2novPdfDocument: React.FC<Sb2novPdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const contactParts = [
    profile.phone,
    profile.email,
    profile.linkedin,
    profile.github,
    profile.location,
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
        {/* Header — large centered name, contact line with vertical pipes */}
        <View style={{ alignItems: "center", marginBottom: "3pt" }}>
          <Text
            style={{
              fontWeight: "bold",
              fontSize: "22pt",
              letterSpacing: "0.5pt",
              lineHeight: 1.15,
            }}
          >
            {dL(profile.name || "Your Name")}
          </Text>
          {contactParts.length > 0 && (
            <Text style={{ fontSize: "9.5pt", color: "#222", marginTop: "4pt" }}>
              {dL(contactParts.join("  |  "))}
            </Text>
          )}
        </View>

        {/* Summary */}
        {summary ? (
          <BoldText style={{ fontSize: "10pt", lineHeight: 1.45, marginTop: "6pt" }}>
            {summary}
          </BoldText>
        ) : null}

        {/* Education */}
        {education.length > 0 && (
          <View>
            <SectionHeading title="Education" />
            {education.map((edu, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <HeaderRow left={edu.school || "University"} right={edu.date} bold />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>
                    {dL(edu.degree)}
                    {edu.gpa ? `  -  GPA: ${edu.gpa}` : ""}
                  </Text>
                </View>
                {edu.coursework ? (
                  <Text style={{ fontSize: "9.5pt", marginTop: "1pt" }}>
                    <Text style={{ fontWeight: "bold" }}>Coursework: </Text>
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
              <View key={i} style={{ marginBottom: "7pt" }}>
                <HeaderRow
                  left={exp.company || "Company"}
                  right={[exp.startDate, exp.endDate].filter(Boolean).join(" - ")}
                  bold
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>{dL(exp.title)}</Text>
                  {exp.location ? (
                    <Text style={{ fontStyle: "italic", fontSize: "10pt", color: "#333" }}>
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

        {/* Projects */}
        {projects.length > 0 && (
          <View>
            <SectionHeading title="Projects" />
            {projects.map((proj, i) => (
              <View key={i} style={{ marginBottom: "5pt" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "bold", fontSize: "10.5pt" }}>
                    {dL(proj.name)}
                    {proj.tech ? (
                      <Text style={{ fontWeight: "normal", fontStyle: "italic" }}>
                        {" | "}
                        {dL(proj.tech)}
                      </Text>
                    ) : ""}
                  </Text>
                  {proj.date ? (
                    <Text style={{ fontSize: "10pt", color: "#222" }}>{proj.date}</Text>
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
            <SectionHeading title="Technical Skills" />
            <View style={{ fontSize: "10pt", lineHeight: 1.5 }}>
              {skills.languages ? (
                <Text style={{ marginBottom: "1pt" }}>
                  <Text style={{ fontWeight: "bold" }}>{dL("Technical Skills: ")}</Text>
                  {dL(skills.languages)}
                </Text>
              ) : null}
              {skills.frameworks ? (
                <Text style={{ marginBottom: "1pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Frameworks: </Text>
                  {dL(skills.frameworks)}
                </Text>
              ) : null}
              {skills.tools ? (
                <Text style={{ marginBottom: "1pt" }}>
                  <Text style={{ fontWeight: "bold" }}>Tools: </Text>
                  {dL(skills.tools)}
                </Text>
              ) : null}
              {skills.soft ? (
                <Text style={{ marginBottom: "1pt" }}>
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
                  <Text style={{ fontStyle: "italic", fontSize: "10pt" }}>{dL(lead.role)}</Text>
                ) : null}
                {lead.bullets.filter((b) => b.trim()).length > 0 && <BulletList items={lead.bullets} />}
              </View>
            ))}
          </View>
        )}

        {/* Certifications */}
        {certifications.length > 0 && (
          <View>
            <SectionHeading title={dL("Certifications")} />
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

export default Sb2novPdfDocument;
