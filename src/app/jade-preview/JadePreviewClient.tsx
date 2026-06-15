"use client";

// TEMPORARY dev-only preview/repro harness for the resume templates. Renders the
// REAL PDF (via usePDF, same path as the app's download) so layout/font bugs can
// be reproduced and verified. Switch template with ?t=jade (default) or ?t=onyx.
// Safe to delete (remove the src/app/jade-preview/ folder).

import React from "react";
import { usePDF } from "@react-pdf/renderer";
import JadePdfDocument from "@/components/ResumeRenderer/JadePdfDocument";
import OnyxPdfDocument from "@/components/ResumeRenderer/OnyxPdfDocument";
import LapisPdfDocument from "@/components/ResumeRenderer/LapisPdfDocument";

const varshaJade = {
  profile: {
    name: "Bandaru Varsha",
    email: "bandarvarsha0907@gmail.com",
    phone: "9701877844",
    location: "Bangalore",
    linkedin: "",
    github: "",
    portfolio: "",
  },
  summary:
    "QA Engineer with 3 years of experience specializing in manual and automation testing for Android mobile applications, with strengths in Selenium WebDriver, Regression Testing, and Device Testing. Improved efficiency and accuracy of benchmark testing by automating Python-based test scripts, reducing manual effort. Demonstrated expertise in test case design, execution, and defects management within fast-paced environments.",
  education: [
    { school: "PACE Institute of Technology and Sciences", degree: "B.Tech", date: "06/2022", gpa: "", coursework: "" },
  ],
  experience: [
    {
      company: "HCL Technologies / Google Client",
      title: "Software Engineer",
      startDate: "06/2022",
      endDate: "06/2025",
      location: "Bangalore",
      bullets: [
        "Specialized in manual and automation testing of Android devices focusing on benchmarking, performance, and stability for the Google Pixel project.",
        "Validated Android builds across devices by designing and executing test cases for features such as Response Time, Smoothness, Fingerprint Accuracy, App Launch Time, and Latency, using Selenium WebDriver and Python automation scripts.",
        "Performed bug tracking and reporting using Buganizer and managed defects throughout the test execution cycle to support issue discovery and timely resolution.",
        "Reduced manual test effort through automation, achieving a 99% pass rate in compatibility testing and improving KPI management by automating critical test processes.",
      ],
    },
  ],
  projects: [
    {
      name: "REST API Test Automation with Postman (in progress)",
      tech: "Postman, GIT",
      date: "",
      bullets: [
        "Building an automated framework for testing REST APIs utilizing Postman and GIT for version control.",
        "Demonstrating end-to-end API test script development, test execution, and structured defects management with real-time collaboration.",
      ],
    },
  ],
  skills: {
    languages:
      "Manual Testing, Automation Testing, Device Testing, Regression Testing, Functional Testing, Testcase Design & Execution, Bug Tracking & Reporting, Testing & Debugging, Selenium WebDriver, Python, Touch Latency Testing, Sanity Testing",
    tools: "Buganizer, Android Flash Tool, Shotcut, ATP, ABTD, Microbench, Testtracker",
    frameworks: "",
    soft: "Collaboration, Efficiency Improvement, Quality Assurance, Issue Discovery",
  },
  leadership: [],
  certifications: [
    "Python Fundamentals and Intermediate Training",
    "Selenium Automation Testing on Python",
    "5G Basics End-to-End",
  ],
  achievements: [],
};

// Ligature-rich data (workflows / configured / identification / fintech / Certified)
// to verify defeatLigatures + the italic project-tech fix on Onyx.
const bapanapalliOnyx = {
  profile: {
    name: "Bapanapalli Venkata Hari Narayan",
    email: "haribapanapalli5@gmail.com",
    phone: "+916301487421",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
  },
  summary:
    "Entry-level DevOps Engineer with strong hands-on experience in AWS, Terraform, and CI/CD workflows. Automated AWS infrastructure provisioning using Terraform and achieved 99.9% detection accuracy on a machine learning security project utilizing Python scripting. Demonstrated capability with cloud platforms, infrastructure automation, and Agile methodologies.",
  education: [
    { school: "Parul University", degree: "Bachelor of Science", date: "07/2024", gpa: "", coursework: "" },
  ],
  experience: [
    {
      company: "EDZU",
      title: "Cyber Security Intern",
      startDate: "12/2023",
      endDate: "03/2024",
      location: "",
      bullets: [
        "Performed penetration testing to identify vulnerabilities on Linux/Unix systems using automation tools.",
        "Applied cybersecurity methodologies for threat detection in AWS environments utilizing Python scripting.",
        "Utilized Git for version control of security scripts and reports within team workflows.",
        "Implemented security automation tasks in cloud platforms through Python scripting, supporting CI/CD processes.",
      ],
    },
  ],
  projects: [
    {
      name: "Key Logger Detection System",
      tech: "Python, Scikit-learn, Pandas, NumPy, Matplotlib",
      date: "",
      bullets: [
        "Developed a machine learning model in Python using Scikit-learn for keylogger detection achieving 99.9% detection accuracy on 523,000+ samples.",
        "Automated real-time threat identification to enhance infrastructure reliability using Pandas, NumPy, and Matplotlib.",
      ],
    },
    {
      name: "Multi-Tier Web Application Deployment using AWS and Terraform",
      tech: "Terraform, AWS, EC2, RDS, MySQL, S3",
      date: "",
      bullets: [
        "Automated AWS resource provisioning with Terraform for EC2, RDS (MySQL), and S3 storage as Infrastructure as Code.",
        "Integrated CI/CD workflows enabling repeatable environment setups and scalable deployments across AWS resources.",
      ],
    },
    {
      name: "Infrastructure Automation using Terraform and Ansible on AWS",
      tech: "Terraform, Ansible, AWS, EC2, VPC, S3, Git",
      date: "",
      bullets: [
        "Automated deployment of AWS environments using Terraform and configured web servers with Ansible playbooks.",
        "Utilized Git for version control and integrated CI/CD workflows for infrastructure builds.",
      ],
    },
    {
      name: "Payment Microservice Platform on Kubernetes (in progress)",
      tech: "Java, Spring Boot, Docker, Kubernetes, MySQL, Jenkins",
      date: "",
      bullets: [
        "Building a payment microservice platform utilizing Java, Spring Boot, Docker, Kubernetes, MySQL, and Jenkins.",
        "Demonstrates end-to-end microservice deployment, container orchestration, and CI/CD on Kubernetes.",
      ],
    },
    {
      name: "Dockerized Fintech Transaction Simulator (in progress)",
      tech: "Python, Docker, Kubernetes",
      date: "",
      bullets: [
        "Designing a fintech transaction simulator with Python, Docker, and Kubernetes for secure and scalable workloads.",
        "Focuses on containerization techniques and distributed processing using Kubernetes clusters.",
      ],
    },
  ],
  skills: {
    languages:
      "AWS, Terraform, CI/CD Workflows, Python, Ansible, cloud platforms (AWS / Azure / GCP), Automation, Penetration Testing, Java, MYSQL, Data Structures, Algorithms",
    tools: "Git, GitHub, AWS DevOps, AWS CloudFormation, S3, Pandas, NumPy, Matplotlib, Scikit-learn",
    frameworks: "",
    soft: "Agile",
  },
  leadership: [],
  certifications: ["AWS Devops", "Docker Certified Associate (in progress)", "Google Cloud Associate Cloud Engineer (in progress)"],
  achievements: [],
};

const ananyaLapis = {
  profile: {
    name: "Ananya Reddy",
    email: "ananya.reddy@example.com",
    phone: "+91 98765 43210",
    location: "Bengaluru, India",
    linkedin: "linkedin.com/in/ananya-reddy",
    github: "github.com/ananya-reddy",
    portfolio: "",
  },
  summary:
    "Motivated and detail-oriented Computer Science graduate with a strong foundation in data engineering, SQL, and cloud technologies. Hands-on experience in building data pipelines, working with large datasets, and designing scalable data solutions. Eager to contribute to impactful projects and grow as a data engineer.",
  education: [
    {
      school: "RV College of Engineering, Bengaluru, India",
      degree: "Bachelor of Technology in Computer Science and Engineering",
      date: "2021 – 2025",
      gpa: "8.4/10",
      coursework: "Data Structures & Algorithms, Database Management Systems, Distributed Systems, Big Data Analytics, Cloud Computing",
    },
  ],
  experience: [
    {
      company: "DataWave Analytics",
      title: "Data Engineer Intern",
      startDate: "May 2024",
      endDate: "Aug 2024",
      location: "Bengaluru, India",
      bullets: [
        "Designed and developed ETL pipelines to ingest, transform, and load data from multiple sources into AWS S3 and Redshift.",
        "Automated data workflows using Apache Airflow, improving pipeline reliability and reducing manual effort.",
        "Built and maintained data models in PostgreSQL, optimizing query performance for analytics dashboards.",
        "Collaborated with analysts and engineers to deliver clean, reliable datasets for reporting and analytics.",
      ],
    },
  ],
  projects: [
    {
      name: "Retail Sales Data Pipeline",
      tech: "Python, Airflow, AWS S3, Redshift",
      date: "",
      bullets: [
        "Built an end-to-end batch pipeline processing 2M+ daily retail records into a Redshift warehouse.",
        "Implemented data validation checks and automated email alerts for pipeline failures.",
      ],
    },
    {
      name: "Real-Time Clickstream Processing",
      tech: "Kafka, PySpark, Spark Streaming",
      date: "",
      bullets: [
        "Streamed and aggregated clickstream events using Kafka and PySpark for near real-time analytics.",
        "Reduced event-processing latency to under 5 seconds for live dashboards.",
      ],
    },
    {
      name: "Data Quality Monitoring Dashboard",
      tech: "Python, Pandas, Grafana",
      date: "",
      bullets: [
        "Developed automated data-quality checks flagging completeness, uniqueness, and freshness issues.",
        "Surfaced metrics in a Grafana dashboard for proactive monitoring.",
      ],
    },
  ],
  skills: {
    languages: "Python, SQL, Spark, Kafka, Airflow, ETL, PostgreSQL, MySQL",
    frameworks: "AWS (S3, EC2, Glue), PySpark, REST APIs",
    tools: "Data Modeling, Linux, Git, Docker, Pandas",
    soft: "Data Quality, Agile",
  },
  leadership: [],
  certifications: [
    "AWS Certified Cloud Practitioner — Amazon Web Services (May 2024)",
    "Databricks Certified Data Engineer Associate (in progress)",
  ],
  achievements: [],
};

const Pane: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100vh" }}>
    <div style={{ padding: "8px 12px", fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a1a", background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
      {title}
    </div>
    <div style={{ flex: 1, overflow: "auto", background: "#525659" }}>{children}</div>
  </div>
);

const CONFIG = {
  jade: { Comp: JadePdfDocument, data: varshaJade, ref: "/resumes-it/priya-nair.png", label: "Jade — Bandaru Varsha" },
  onyx: { Comp: OnyxPdfDocument, data: bapanapalliOnyx, ref: "/resumes-it/rohan-mehta.png", label: "Onyx — Bapanapalli (ligature/italic test)" },
  lapis: { Comp: LapisPdfDocument, data: ananyaLapis, ref: "/resumes-it/ananya-reddy.png", label: "Lapis — Ananya Reddy" },
} as const;

const JadePreviewClient: React.FC = () => {
  const param = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("t") : null;
  const t: keyof typeof CONFIG = param && param in CONFIG ? (param as keyof typeof CONFIG) : "jade";
  const { Comp, data, ref, label } = CONFIG[t];
  const [instance] = usePDF({ document: <Comp state={data} /> });

  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100vh", width: "100vw", margin: 0 }}>
      <Pane title={`Design reference — ${ref.split("/").pop()}`}>
        <img src={ref} alt="mockup" style={{ width: "100%", display: "block" }} />
      </Pane>
      <Pane title={`Live PDF — ${label}`}>
        {instance.loading && <div style={{ color: "#fff", padding: 24, fontFamily: "sans-serif" }}>Rendering PDF…</div>}
        {instance.error && <div style={{ color: "#fca5a5", padding: 24, fontFamily: "sans-serif" }}>Error: {String(instance.error)}</div>}
        {instance.url && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: "6px 12px", background: "#1e293b", display: "flex", gap: 16 }}>
              <a href={instance.url} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc", fontFamily: "sans-serif", fontSize: 13, fontWeight: 600 }}>Open PDF in new tab ↗</a>
              <a href={instance.url} download={`${t}_preview.pdf`} style={{ color: "#7dd3fc", fontFamily: "sans-serif", fontSize: 13, fontWeight: 600 }}>Download PDF ↓</a>
              <span style={{ color: "#94a3b8", fontFamily: "sans-serif", fontSize: 12 }}>?t=jade | ?t=onyx · (use links if embed is blank)</span>
            </div>
            <iframe src={instance.url} title="PDF" style={{ width: "100%", flex: 1, border: "none" }} />
          </div>
        )}
      </Pane>
    </div>
  );
};

export default JadePreviewClient;
