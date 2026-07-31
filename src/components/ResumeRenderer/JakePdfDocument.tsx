"use client";

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Svg,
  Path,
  Rect,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import "./fonts";
import { defeatLigatures as dL, sameText } from "./utils";

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
    headline: string;
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
  sectionOrder?: string[];
}

// ── Constants ─────────────────────────────────────────────
// Jake — faithful recreation of "Jake's Resume" (Jake Gutierrez's LaTeX
// template), built 2026-07-19 from a user-supplied screenshot. One of the
// most-forked/most-used resume templates on Overleaf among CS/SWE job
// seekers — a deliberate exception to this catalog's usual "don't clone an
// existing look" rule, since the ask here was pixel fidelity to a specific
// named reference, not a new design. Distinctive elements vs. the other 14:
//   - Icon contact bar (phone/email/linkedin/github) instead of a plain text
//     line — icons are hand-drawn Feather-style vector paths (stroke-based,
//     Svg/Path primitives), NOT Unicode glyphs. Same reasoning as Executive's
//     diamond-bullet fix: relying on a symbol being present in a font's
//     glyph coverage risks the "silently wrong substitute glyph" bug class;
//     vector shapes sidestep it entirely, at any font.
//   - LinkedIn has no widely-recognized outline glyph, so it's a small solid
//     badge with real "in" text (2 letters — always in font coverage).
//   - "Relevant Coursework" renders as a 4-column bullet grid (flexWrap),
//     not a single Label:value line like every other template's skills.
//   - Technical Skills sits inside a bordered box — no other active
//     template puts a rule *around* a section's content.
//   - Project rows: "Name | tech, list" on one inline title line (bold name,
//     regular tech), date right — Cobalt/Onyx/etc. put tech on its own line.
// Font: Times-Roman, the PDF base-14 built-in (same as Harvard) — visually
// closest built-in match to the source's classic LaTeX Computer Modern serif,
// and guarantees ATS text extraction with zero font-file risk.

const FONT = "Times-Roman";
const INK = "#111111";
const MUTED = "#333333";
const RULE = "#000000";
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_H = "50pt";
const MARGIN_V = "34pt";

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

// ── Section Heading (bold, full-width rule directly beneath) ─

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <View style={{ marginTop: "9pt", marginBottom: "3pt" }}>
    <Text style={{ fontWeight: "bold", fontSize: "11.5pt", color: INK }}>{dL(title)}</Text>
    <View style={{ borderBottomWidth: 1, borderBottomColor: RULE, borderBottomStyle: "solid", marginTop: "1.5pt" }} />
  </View>
);

// ── Contact icons (Feather-style stroke paths, not glyphs) ──

const IconPhone: React.FC = () => (
  <Svg width="8" height="8" viewBox="0 0 24 24">
    <Path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
      stroke={INK}
      strokeWidth={2}
      fill="none"
    />
  </Svg>
);

const IconMail: React.FC = () => (
  <Svg width="8.5" height="8.5" viewBox="0 0 24 24">
    <Rect x="2" y="4" width="20" height="16" rx="2" stroke={INK} strokeWidth={2} fill="none" />
    <Path d="M22 6l-10 7L2 6" stroke={INK} strokeWidth={2} fill="none" />
  </Svg>
);

const IconGithub: React.FC = () => (
  <Svg width="8.5" height="8.5" viewBox="0 0 24 24">
    <Path
      d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
      stroke={INK}
      strokeWidth={1.6}
      fill="none"
    />
  </Svg>
);

const IconLinkedin: React.FC = () => (
  <View style={{ width: "8.5pt", height: "8.5pt", backgroundColor: INK, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ fontSize: "6pt", color: "#ffffff", fontWeight: "bold" }}>in</Text>
  </View>
);

const ContactItem: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <View style={{ flexDirection: "row", alignItems: "center" }}>
    {icon}
    <Text style={{ fontSize: "9pt", color: INK, marginLeft: "3pt", textDecoration: "underline" }}>{dL(text)}</Text>
  </View>
);

// ── Bullet list (round • marker) ──────────────────────────

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <View style={{ marginTop: "1.5pt" }}>
    {items
      .filter((b) => b.trim())
      .map((b, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: "1pt" }}>
          <Text style={{ width: "9pt", fontSize: "9.5pt" }}>{"•"}</Text>
          <BoldText style={{ flex: 1, fontSize: "9.5pt", lineHeight: 1.28, color: INK }}>
            {b}
          </BoldText>
        </View>
      ))}
  </View>
);

// ── Row: left (bold) + right (bold) ───────────────────────

const HeaderRow: React.FC<{ left: string; right?: string; leftBold?: boolean; rightBold?: boolean }> = ({
  left,
  right,
  leftBold = true,
  rightBold = true,
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontWeight: leftBold ? "bold" : "normal", fontSize: "10.3pt", flex: 1, color: INK }}>{dL(left)}</Text>
    {right ? (
      <Text style={{ fontWeight: rightBold ? "bold" : "normal", fontSize: "9pt", color: INK, marginLeft: "8pt" }}>{dL(right)}</Text>
    ) : null}
  </View>
);

const SubRow: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
    <Text style={{ fontStyle: "italic", fontSize: "9.3pt", color: MUTED, flex: 1 }}>{dL(left)}</Text>
    {right ? <Text style={{ fontStyle: "italic", fontSize: "9pt", color: MUTED, marginLeft: "8pt" }}>{dL(right)}</Text> : null}
  </View>
);

// ── Main PDF Document ─────────────────────────────────────

interface JakePdfDocumentProps {
  state: ResumeEditorState;
}

const DEFAULT_ORDER = ["education", "experience", "projects", "skills", "certifications", "achievements", "leadership", "summary"];

const JakePdfDocument: React.FC<JakePdfDocumentProps> = ({ state }) => {
  const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state;

  const skillRows = [
    { label: "Languages", value: skills.languages },
    { label: "Developer Tools", value: skills.tools },
    { label: "Technologies/Frameworks", value: skills.frameworks },
  ].filter((r) => r.value && r.value.trim());

  const splitItems = (csv: string): string[] =>
    (csv || "").split(/,(?![^(]*\))|[•\n]/).map((s) => s.trim()).filter(Boolean);

  const order = state.sectionOrder ?? DEFAULT_ORDER;
  const sections: Record<string, () => React.ReactNode> = {
    summary: () => summary ? (
      <View>
        <SectionHeading title="Summary" />
        <BoldText style={{ fontSize: "9.5pt", lineHeight: 1.35, color: INK }}>
          {summary}
        </BoldText>
      </View>
    ) : null,

    education: () => {
      if (education.length === 0) return null;
      const allCourses = education.flatMap((edu) => splitItems(edu.coursework));
      return (
        <View>
          <SectionHeading title="Education" />
          {education.map((edu, i) => {
            const eduTop = edu.school || "University";
            const showDegree = edu.degree && !sameText(edu.degree, eduTop);
            return (
              <View key={i} style={{ marginBottom: "6pt" }}>
                <HeaderRow left={eduTop} right={edu.date} />
                <SubRow
                  left={showDegree ? edu.degree : edu.gpa ? `GPA: ${edu.gpa}` : ""}
                  right={undefined}
                />
              </View>
            );
          })}
          {allCourses.length > 0 && (
            <View>
              <SectionHeading title="Relevant Coursework" />
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {allCourses.map((c, j) => (
                  <View key={j} wrap={false} style={{ width: "25%", flexDirection: "row", marginBottom: "2pt", paddingRight: "4pt" }}>
                    <Text style={{ width: "8pt", fontSize: "9pt" }}>{"•"}</Text>
                    <Text style={{ fontSize: "9pt", color: INK }}>{dL(c)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      );
    },

    experience: () => experience.length > 0 && (
      <View>
        <SectionHeading title="Experience" />
        {experience.map((exp, i) => (
          <View key={i} style={{ marginBottom: "6pt" }}>
            <HeaderRow left={exp.company || "Company"} right={[exp.startDate, exp.endDate].filter(Boolean).join(" – ")} />
            <SubRow left={exp.title || "Role"} right={exp.location} />
            {exp.bullets.filter((b) => b.trim()).length > 0 && <BulletList items={exp.bullets} />}
          </View>
        ))}
      </View>
    ),

    projects: () => projects.length > 0 && (
      <View>
        <SectionHeading title="Projects" />
        {projects.map((proj, i) => (
          <View key={i} style={{ marginBottom: "6pt" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <Text style={{ fontSize: "10.3pt", flex: 1, color: INK }}>
                <Text style={{ fontWeight: "bold" }}>{dL(proj.name)}</Text>
                {proj.tech ? <Text style={{ fontStyle: "italic" }}>{dL(` | ${proj.tech}`)}</Text> : null}
              </Text>
              {proj.date ? <Text style={{ fontWeight: "bold", fontSize: "9pt", color: INK, marginLeft: "8pt" }}>{dL(proj.date)}</Text> : null}
            </View>
            {proj.bullets.filter((b) => b.trim()).length > 0 && <BulletList items={proj.bullets} />}
          </View>
        ))}
      </View>
    ),

    skills: () => skillRows.length > 0 && (
      <View>
        <SectionHeading title="Technical Skills" />
        {skillRows.map((row, i) => (
          <Text key={i} wrap={false} style={{ fontSize: "9.5pt", lineHeight: 1.4, color: INK }}>
            <Text style={{ fontWeight: "bold" }}>{dL(`${row.label}: `)}</Text>
            {dL(row.value)}
          </Text>
        ))}
      </View>
    ),

    certifications: () => certifications.filter((c) => c.trim()).length > 0 && (
      <View>
        <SectionHeading title="Certifications" />
        <BulletList items={certifications} />
      </View>
    ),

    achievements: () => achievements.filter((a) => a.trim()).length > 0 && (
      <View>
        <SectionHeading title="Achievements" />
        <BulletList items={achievements} />
      </View>
    ),

    leadership: () => leadership.length > 0 && (
      <View>
        <SectionHeading title="Leadership / Extracurricular" />
        {leadership.map((lead, i) => (
          <View key={i} style={{ marginBottom: "6pt" }}>
            <HeaderRow left={lead.org} right={lead.date} />
            {lead.role ? <SubRow left={lead.role} /> : null}
            {lead.bullets.filter((b) => b.trim()).length > 0 && <BulletList items={lead.bullets} />}
          </View>
        ))}
      </View>
    ),
  };

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
        {/* ── Header (centered name, icon contact bar) ── */}
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontWeight: "bold", fontSize: "24pt", letterSpacing: "0.5pt", color: INK }}>
            {dL((profile.name || "Your Name").toUpperCase())}
          </Text>
          {profile.location ? (
            <Text style={{ fontSize: "10pt", color: INK, marginTop: "2pt" }}>{dL(profile.location)}</Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 10, marginTop: "5pt" }}>
            {profile.phone ? <ContactItem icon={<IconPhone />} text={profile.phone} /> : null}
            {profile.email ? <ContactItem icon={<IconMail />} text={profile.email} /> : null}
            {profile.linkedin ? <ContactItem icon={<IconLinkedin />} text={profile.linkedin} /> : null}
            {profile.github ? <ContactItem icon={<IconGithub />} text={profile.github} /> : null}
          </View>
        </View>

        {order.map((key) => (
          <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
        ))}
      </Page>
    </Document>
  );
};

export default JakePdfDocument;
