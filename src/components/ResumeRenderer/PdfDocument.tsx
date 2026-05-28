"use client";

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Link,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import "./fonts";
import {
  styles,
  spacing,
  THEME_COLOR,
  DEFAULT_FONT_COLOR,
} from "./pdfStyles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenResumeProfile {
  name: string;
  email: string;
  phone: string;
  url: string;
  summary: string;
  location: string;
}

export interface OpenResumeWorkExperience {
  company: string;
  jobTitle: string;
  date: string;
  descriptions: string[];
}

export interface OpenResumeEducation {
  school: string;
  degree: string;
  date: string;
  gpa: string;
  descriptions: string[];
}

export interface OpenResumeProject {
  project: string;
  date: string;
  descriptions: string[];
}

export interface OpenResumeSkills {
  featuredSkills: { skill: string; rating: number }[];
  descriptions: string[];
}

export interface OpenResume {
  profile: OpenResumeProfile;
  workExperiences: OpenResumeWorkExperience[];
  educations: OpenResumeEducation[];
  projects: OpenResumeProject[];
  skills: OpenResumeSkills;
}

// ---------------------------------------------------------------------------
// Constants
// Font registered centrally in ./fonts.ts.
// ---------------------------------------------------------------------------

const FONT_FAMILY = "Roboto";
const FONT_SIZE = "11pt";
// US Letter size in points
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// ---------------------------------------------------------------------------
// Helper: BoldText
// ---------------------------------------------------------------------------
// Claude AI outputs **keyword** markdown inside bullet strings.
// This component splits on ** delimiters and renders alternating
// normal / bold Text spans so the PDF shows real bold text.

interface BoldTextProps {
  children: string;
  style?: Style;
}

const BoldText: React.FC<BoldTextProps> = ({ children: text, style = {} }) => {
  if (!text) return null;

  // Split on ** delimiters. Odd-indexed segments are bold.
  const segments = text.split(/\*\*/);
  if (segments.length === 1) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <Text style={style}>
      {segments.map((segment, i) =>
        segment ? (
          <Text
            key={i}
            style={i % 2 === 1 ? { fontWeight: "bold" } : undefined}
          >
            {segment}
          </Text>
        ) : null
      )}
    </Text>
  );
};

// ---------------------------------------------------------------------------
// Common sub-components
// ---------------------------------------------------------------------------

/** Section heading with theme-colored underline bar */
const SectionHeading: React.FC<{ heading: string }> = ({ heading }) => (
  <View
    style={{
      ...styles.flexCol,
      marginTop: spacing[5],
      gap: spacing[2],
    }}
  >
    <View style={{ ...styles.flexRow, alignItems: "center" }}>
      <View
        style={{
          height: "3.75pt",
          width: "30pt",
          backgroundColor: THEME_COLOR,
          marginRight: spacing[3.5],
        }}
      />
      <Text
        style={{
          fontWeight: "bold",
          letterSpacing: "0.3pt",
        }}
      >
        {heading}
      </Text>
    </View>
  </View>
);

/** A single bullet point row */
const BulletItem: React.FC<{ text: string }> = ({ text }) => (
  <View style={{ ...styles.flexRow }}>
    <Text
      style={{
        paddingLeft: spacing[2],
        paddingRight: spacing[2],
        lineHeight: 1.3,
        fontWeight: "bold",
        color: DEFAULT_FONT_COLOR,
      }}
    >
      {"\u2022"}
    </Text>
    <BoldText
      style={{
        lineHeight: 1.3,
        flexGrow: 1,
        flexBasis: 0,
        color: DEFAULT_FONT_COLOR,
      }}
    >
      {text}
    </BoldText>
  </View>
);

/** Bullet list from an array of strings */
const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <>
    {items
      .filter((item) => item.trim() !== "")
      .map((item, idx) => (
        <BulletItem key={idx} text={item} />
      ))}
  </>
);

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

const ProfileSection: React.FC<{ profile: OpenResumeProfile }> = ({
  profile,
}) => {
  const { name, email, phone, url, summary, location } = profile;

  // Build contact info items
  const contactItems: { label: string; value: string; href?: string }[] = [];
  if (email) contactItems.push({ label: "email", value: email, href: `mailto:${email}` });
  if (phone) contactItems.push({ label: "phone", value: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  if (location) contactItems.push({ label: "location", value: location });
  if (url) {
    const href = url.startsWith("http") ? url : `https://${url}`;
    contactItems.push({ label: "url", value: url, href });
  }

  return (
    <View style={{ ...styles.flexCol, marginTop: spacing[4] }}>
      {/* Name */}
      <Text
        style={{
          fontWeight: "bold",
          fontSize: "20pt",
          color: THEME_COLOR,
        }}
      >
        {name}
      </Text>

      {/* Summary */}
      {summary ? (
        <BoldText
          style={{
            color: DEFAULT_FONT_COLOR,
            marginTop: spacing[1.5],
            lineHeight: 1.4,
          }}
        >
          {summary}
        </BoldText>
      ) : null}

      {/* Contact row */}
      {contactItems.length > 0 && (
        <View
          style={{
            ...styles.flexRow,
            flexWrap: "wrap",
            marginTop: spacing[1.5],
            gap: spacing[3],
          }}
        >
          {contactItems.map((item) => {
            const textNode = (
              <Text
                key={item.label}
                style={{ color: DEFAULT_FONT_COLOR }}
              >
                {item.value}
              </Text>
            );

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  src={item.href}
                  style={{ textDecoration: "none" }}
                >
                  {textNode}
                </Link>
              );
            }
            return textNode;
          })}
        </View>
      )}
    </View>
  );
};

const WorkExperienceSection: React.FC<{
  workExperiences: OpenResumeWorkExperience[];
}> = ({ workExperiences }) => {
  if (!workExperiences || workExperiences.length === 0) return null;

  return (
    <View>
      <SectionHeading heading="WORK EXPERIENCE" />
      {workExperiences.map((exp, idx) => {
        // Hide company name if same as previous entry (multiple roles at one company)
        const hideCompany =
          idx > 0 && exp.company === workExperiences[idx - 1].company;

        return (
          <View
            key={idx}
            style={idx !== 0 ? { marginTop: spacing[2] } : { marginTop: spacing[2] }}
          >
            {!hideCompany && (
              <Text style={{ fontWeight: "bold", color: DEFAULT_FONT_COLOR }}>
                {exp.company}
              </Text>
            )}
            <View
              style={{
                ...styles.flexRowBetween,
                marginTop: hideCompany ? `-${spacing[1]}` : spacing[1.5],
              }}
            >
              <Text style={{ color: DEFAULT_FONT_COLOR }}>{exp.jobTitle}</Text>
              <Text style={{ color: DEFAULT_FONT_COLOR }}>{exp.date}</Text>
            </View>
            {exp.descriptions.length > 0 && (
              <View style={{ ...styles.flexCol, marginTop: spacing[1.5] }}>
                <BulletList items={exp.descriptions} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const EducationSection: React.FC<{
  educations: OpenResumeEducation[];
}> = ({ educations }) => {
  if (!educations || educations.length === 0) return null;

  return (
    <View>
      <SectionHeading heading="EDUCATION" />
      {educations.map((edu, idx) => {
        const hideSchool =
          idx > 0 && edu.school === educations[idx - 1].school;

        const degreeText = edu.gpa
          ? `${edu.degree} - ${Number(edu.gpa) ? edu.gpa + " GPA" : edu.gpa}`
          : edu.degree;

        const showDescriptions =
          edu.descriptions && edu.descriptions.join("").trim() !== "";

        return (
          <View key={idx} style={{ marginTop: spacing[2] }}>
            {!hideSchool && (
              <Text style={{ fontWeight: "bold", color: DEFAULT_FONT_COLOR }}>
                {edu.school}
              </Text>
            )}
            <View
              style={{
                ...styles.flexRowBetween,
                marginTop: hideSchool ? `-${spacing[1]}` : spacing[1.5],
              }}
            >
              <Text style={{ color: DEFAULT_FONT_COLOR }}>{degreeText}</Text>
              <Text style={{ color: DEFAULT_FONT_COLOR }}>{edu.date}</Text>
            </View>
            {showDescriptions && (
              <View style={{ ...styles.flexCol, marginTop: spacing[1.5] }}>
                <BulletList items={edu.descriptions} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const ProjectsSection: React.FC<{
  projects: OpenResumeProject[];
}> = ({ projects }) => {
  if (!projects || projects.length === 0) return null;

  return (
    <View>
      <SectionHeading heading="PROJECTS" />
      {projects.map((proj, idx) => (
        <View key={idx} style={{ marginTop: spacing[2] }}>
          <View style={{ ...styles.flexRowBetween }}>
            <Text style={{ fontWeight: "bold", color: DEFAULT_FONT_COLOR }}>
              {proj.project}
            </Text>
            {proj.date ? (
              <Text style={{ color: DEFAULT_FONT_COLOR }}>{proj.date}</Text>
            ) : null}
          </View>
          {proj.descriptions.length > 0 && (
            <View style={{ ...styles.flexCol, marginTop: spacing[1] }}>
              <BulletList items={proj.descriptions} />
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

const SkillsSection: React.FC<{
  skills: OpenResumeSkills;
}> = ({ skills }) => {
  if (!skills) return null;

  const { featuredSkills, descriptions } = skills;
  const hasDescriptions =
    descriptions && descriptions.join("").trim() !== "";
  const hasFeaturedSkills =
    featuredSkills && featuredSkills.some((s) => s.skill.trim() !== "");

  if (!hasDescriptions && !hasFeaturedSkills) return null;

  return (
    <View>
      <SectionHeading heading="SKILLS" />

      {/* Featured skills rendered as filled-circle rating rows */}
      {hasFeaturedSkills && (
        <View
          style={{
            ...styles.flexRow,
            flexWrap: "wrap",
            marginTop: spacing[2],
            gap: spacing[3],
          }}
        >
          {featuredSkills
            .filter((s) => s.skill.trim() !== "")
            .map((fs, idx) => (
              <View
                key={idx}
                style={{ ...styles.flexRow, alignItems: "center" }}
              >
                <Text
                  style={{
                    color: DEFAULT_FONT_COLOR,
                    marginRight: spacing[0.5],
                  }}
                >
                  {fs.skill}
                </Text>
                {[...Array(5)].map((_, circleIdx) => (
                  <View
                    key={circleIdx}
                    style={{
                      height: "9pt",
                      width: "9pt",
                      marginLeft: "2.25pt",
                      backgroundColor:
                        fs.rating >= circleIdx ? THEME_COLOR : "#d9d9d9",
                      borderRadius: "4.5pt",
                    }}
                  />
                ))}
              </View>
            ))}
        </View>
      )}

      {/* Skill description bullets */}
      {hasDescriptions && (
        <View style={{ ...styles.flexCol, marginTop: spacing[1.5] }}>
          <BulletList items={descriptions} />
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Main PDF Document component
// ---------------------------------------------------------------------------

interface PdfDocumentProps {
  resume: OpenResume;
}

const PdfDocument: React.FC<PdfDocumentProps> = ({ resume }) => {
  const { profile, workExperiences, educations, projects, skills } = resume;

  return (
    <Document
      title={`${profile.name} Resume`}
      author={profile.name}
      producer="ResuScore"
    >
      <Page
        size={[PAGE_WIDTH, PAGE_HEIGHT]}
        style={{
          ...styles.flexCol,
          color: DEFAULT_FONT_COLOR,
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZE,
        }}
      >
        {/* Top color accent bar */}
        <View
          style={{
            width: spacing.full,
            height: spacing[3.5],
            backgroundColor: THEME_COLOR,
          }}
        />

        {/* Content area with horizontal padding */}
        <View
          style={{
            ...styles.flexCol,
            padding: `${spacing[0]} ${spacing[20]}`,
          }}
        >
          <ProfileSection profile={profile} />
          <WorkExperienceSection workExperiences={workExperiences} />
          <EducationSection educations={educations} />
          <ProjectsSection projects={projects} />
          <SkillsSection skills={skills} />
        </View>
      </Page>
    </Document>
  );
};

export default PdfDocument;
