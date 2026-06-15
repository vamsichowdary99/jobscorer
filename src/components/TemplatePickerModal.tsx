'use client'

import React, { useEffect, useState } from 'react'

export type TemplateId = 'classic' | 'rezi' | 'rezi-standard' | 'london' | 'stitch' | 'harvard' | 'sb2nov' | 'open-resume' | 'cobalt' | 'onyx' | 'jade' | 'lapis'

interface Template {
  id: TemplateId
  name: string
  tagline: string
  tags: string[]
  preview: React.ReactNode
}

interface TemplatePickerModalProps {
  onSelect: (id: TemplateId) => void
  onClose: () => void
}

/* ─── Inject keyframes once ─────────────────────────────────── */
function useModalStyles() {
  useEffect(() => {
    if (document.getElementById('tpicker-styles')) return
    const s = document.createElement('style')
    s.id = 'tpicker-styles'
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap');

      @keyframes tpick-backdrop { from { opacity:0 } to { opacity:1 } }
      @keyframes tpick-panel    { from { opacity:0; transform:translateY(20px) scale(0.98) } to { opacity:1; transform:translateY(0) scale(1) } }
      @keyframes tpick-card     { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }

      .tpick-card {
        flex-shrink: 0;
        border: 1.5px solid #1e293b;
        border-radius: 8px;
        overflow: hidden;
        cursor: pointer;
        transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;
        background: #fff;
        animation: tpick-card 0.38s cubic-bezier(.22,.68,0,.99) both;
        position: relative;
      }
      .tpick-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px #334155;
        border-color: #334155;
      }
      .tpick-card.selected {
        border-color: #135bec;
        box-shadow: 0 0 0 1px #135bec, 0 12px 40px rgba(19,91,236,0.2);
        transform: translateY(-2px);
      }
      .tpick-check {
        position: absolute; top: 8px; right: 8px;
        width: 20px; height: 20px; border-radius: 50%;
        background: #135bec;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transform: scale(0.4);
        transition: opacity 0.16s, transform 0.2s cubic-bezier(.34,1.56,.64,1);
        box-shadow: 0 2px 8px rgba(19,91,236,0.5);
        z-index: 2;
      }
      .tpick-card.selected .tpick-check { opacity: 1; transform: scale(1); }

      .tpick-tag {
        font-size: 9.5px;
        padding: 2px 7px;
        border-radius: 4px;
        border: 1px solid #1e293b;
        color: #64748b;
        background: #0f172a;
        font-family: 'DM Sans', sans-serif;
        font-weight: 500;
        transition: border-color 0.15s, color 0.15s;
      }
      .tpick-card.selected .tpick-tag {
        border-color: rgba(19,91,236,0.3);
        color: #7aa3f5;
      }
    `
    document.head.appendChild(s)
  }, [])
}

/* ─── Mini Resume Previews ─────────────────────────────────── */

function ClassicPreview() {
  const s: React.CSSProperties = { fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 7, lineHeight: 1.4, color: '#111', padding: '14px 14px', background: '#fff', height: 240, overflow: 'hidden' }
  const divider = <div style={{ borderTop: '1.5px solid #111', margin: '4px 0 3px' }} />
  const secHead = (t: string) => <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, borderBottom: '1px solid #111', paddingBottom: 1, marginBottom: 3 }}>{t}</div>
  return (
    <div style={s}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 1, fontVariant: 'small-caps' }}>First Last</div>
      <div style={{ textAlign: 'center', fontSize: 6, color: '#444', marginBottom: 2 }}>123-456-7890 · email@gmail.com · linkedin.com/in/username · github.com/username</div>
      {divider}
      <div style={{ marginBottom: 5 }}>
        {secHead('Education')}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
          <span style={{ fontWeight: 700 }}>State University</span>
          <span style={{ fontSize: 5.5, color: '#555' }}>Sep 2019 – May 2023</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6 }}>
          <span style={{ fontStyle: 'italic' }}>Bachelor of Science in Computer Science</span>
          <span style={{ fontSize: 5.5, color: '#555' }}>City, State</span>
        </div>
      </div>
      <div style={{ marginBottom: 5 }}>
        {secHead('Experience')}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
          <span style={{ fontWeight: 700 }}>Electronics Company</span>
          <span style={{ fontSize: 5.5, color: '#555' }}>May 2022 – Aug 2022</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6, marginBottom: 2 }}>
          <span style={{ fontStyle: 'italic' }}>Software Engineer Intern</span>
          <span style={{ fontSize: 5.5, color: '#555' }}>City, State</span>
        </div>
        {['Developed a service to automate unit tests daily, reducing time to identify bugs', 'Incorporated Python and PowerShell scripts to aggregate XML test results', 'Utilized Jenkins for CI/CD to automate the entire testing process'].map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1 }}>
            <span>•</span><span style={{ fontSize: 5.5 }}>{b}</span>
          </div>
        ))}
      </div>
      <div>
        {secHead('Technical Skills')}
        <div style={{ fontSize: 6 }}>
          <span style={{ fontWeight: 700 }}>Languages:</span> Python, Java, C, HTML/CSS, JavaScript, SQL<br />
          <span style={{ fontWeight: 700 }}>Developer Tools:</span> VS Code, Eclipse, Google Cloud Platform<br />
          <span style={{ fontWeight: 700 }}>Technologies:</span> Linux, Jenkins, GitHub, JUnit, WordPress
        </div>
      </div>
    </div>
  )
}

function ReziPreview() {
  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: 7, lineHeight: 1.5, color: '#1a1a1a', padding: '14px 12px', background: '#fff', height: 240, overflow: 'hidden' }}>
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>First Last</div>
      <div style={{ textAlign: 'center', fontSize: 6, color: '#555', marginBottom: 5, letterSpacing: 0.3 }}>email@gmail.com · 123-456-7890 · City, State</div>
      <div style={{ borderTop: '0.75px solid #ccc', marginBottom: 6 }} />
      {['Experience', 'Technical Skills'].map((sec) => (
        <div key={sec} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 6.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, borderBottom: '0.5px solid #bbb', paddingBottom: 2, marginBottom: 4, color: '#222' }}>{sec}</div>
          {sec === 'Experience' && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 7 }}>Company Name</span>
              <span style={{ fontSize: 5.5, color: '#666', fontStyle: 'italic' }}>Jan 2023 – Present</span>
            </div>
            <div style={{ fontStyle: 'italic', fontSize: 6, color: '#555', marginBottom: 3 }}>Job Title · City, State</div>
            {['Accomplished [X] as measured by [Y], by doing [Z]', 'Led cross-functional team of [N] to deliver key initiative', 'Improved process efficiency by [X]% through automation'].map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 1.5, fontSize: 6 }}>
                <span style={{ color: '#888' }}>—</span>
                <span dangerouslySetInnerHTML={{ __html: b.replace(/<b>(.*?)<\/b>/g, '<strong>$1</strong>') }} />
              </div>
            ))}
          </>}
          {sec === 'Technical Skills' && (
            <div style={{ fontSize: 6.5, lineHeight: 1.8 }}>
              <span style={{ fontWeight: 700 }}>Languages:</span> Python · Java · JavaScript · SQL<br/>
              <span style={{ fontWeight: 700 }}>Tools:</span> Git · Docker · VS Code · Linux<br/>
              <span style={{ fontWeight: 700 }}>Frameworks:</span> React · Node.js · REST APIs
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ReziStandardPreview() {
  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 7, lineHeight: 1.4, color: '#111', padding: '14px 12px', background: '#fff', height: 240, overflow: 'hidden' }}>
      <div style={{ textAlign: 'center', fontWeight: 300, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 2 }}>First Last</div>
      <div style={{ textAlign: 'center', fontSize: 6, color: '#666', marginBottom: 3 }}>email@gmail.com · 123-456-7890 · City, State</div>
      <div style={{ borderTop: '0.5px solid #bbb', marginBottom: 5 }} />
      {['Education', 'Experience', 'Skills'].map((sec) => (
        <div key={sec} style={{ marginBottom: 5 }}>
          <div style={{ fontSize: 6, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', borderBottom: '0.5px solid #ddd', paddingBottom: 1.5, marginBottom: 2.5, color: '#333' }}>{sec}</div>
          {sec === 'Education' && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, marginBottom: 1 }}>
              <span style={{ fontWeight: 600 }}>State University</span>
              <span style={{ fontSize: 5.5, color: '#888' }}>May 2024</span>
            </div>
            <div style={{ fontSize: 6, color: '#555' }}>B.S. Computer Science · City, State</div>
          </>}
          {sec === 'Experience' && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
              <span style={{ fontWeight: 600 }}>Company Name</span>
              <span style={{ fontSize: 5.5, color: '#888' }}>Jan 2023 – Present</span>
            </div>
            <div style={{ fontSize: 6, color: '#666', marginBottom: 2 }}>Software Engineer · City, State</div>
            {['Accomplished [X] as measured by [Y], by doing [Z]', 'Improved system performance by [X]% through optimization'].map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1 }}>
                <span style={{ color: '#aaa', fontSize: 6 }}>–</span>
                <span style={{ fontSize: 6, color: '#333' }}>{b}</span>
              </div>
            ))}
          </>}
          {sec === 'Skills' && (
            <div style={{ fontSize: 6.5, color: '#444' }}>Python · JavaScript · React · Node.js · SQL · Git · Docker</div>
          )}
        </div>
      ))}
    </div>
  )
}

function LondonPreview() {
  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: 7, lineHeight: 1.45, color: '#1a1a1a', padding: '14px 12px', background: '#fff', height: 240, overflow: 'hidden' }}>
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, fontStyle: 'italic', letterSpacing: 0.5, marginBottom: 1 }}>First Last</div>
      <div style={{ textAlign: 'center', fontSize: 5.5, color: '#777', marginBottom: 5, fontStyle: 'italic' }}>email@gmail.com · 123-456-7890 · City, State</div>
      {(['Education', 'Experience', 'Skills'] as const).map((section) => (
        <div key={section} style={{ marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '4px 0 3px' }}>
            <div style={{ flex: 1, borderTop: '0.75px solid #bbb' }} />
            <span style={{ fontSize: 6.5, fontStyle: 'italic', color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>{section}</span>
            <div style={{ flex: 1, borderTop: '0.75px solid #bbb' }} />
          </div>
          {section === 'Education' && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
              <span style={{ fontWeight: 700 }}>State University</span>
              <span style={{ color: '#777', fontSize: 5.5, fontStyle: 'italic' }}>May 2024</span>
            </div>
            <div style={{ fontStyle: 'italic', fontSize: 6, color: '#666', marginBottom: 1 }}>Bachelor of Science, Computer Science · City, State</div>
          </>}
          {section === 'Experience' && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
              <span style={{ fontWeight: 700 }}>Company Name</span>
              <span style={{ color: '#777', fontSize: 5.5, fontStyle: 'italic' }}>Jan 2023 – Present</span>
            </div>
            <div style={{ fontStyle: 'italic', fontSize: 6, color: '#666', marginBottom: 2 }}>Software Engineer · City, State</div>
            {['Accomplished [X] as measured by [Y], by doing [Z]', 'Improved performance by [X]% through process improvements'].map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1 }}>
                <span style={{ color: '#aaa', fontStyle: 'italic' }}>·</span>
                <span style={{ fontSize: 6 }}>{b}</span>
              </div>
            ))}
          </>}
          {section === 'Skills' && (
            <div style={{ fontSize: 6.5, color: '#444', fontStyle: 'italic' }}>Python · JavaScript · React · SQL · Git · Docker · Linux</div>
          )}
        </div>
      ))}
    </div>
  )
}

function StitchPreview() {
  return (
    <div style={{ height: 240, overflow: 'hidden', background: '#fff' }}>
      <img
        src="/resume-template-classic.png"
        alt="Stitch Resume Template"
        style={{ width: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
      />
    </div>
  )
}

function HarvardPreview() {
  const s: React.CSSProperties = { fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 7, lineHeight: 1.4, color: '#000', padding: '14px 16px', background: '#fff', height: 240, overflow: 'hidden' }
  const secHead = (t: string) => <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, textDecoration: 'underline', marginBottom: 3, marginTop: 5 }}>{t}</div>
  return (
    <div style={s}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 12.5, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 1 }}>First Last</div>
      <div style={{ textAlign: 'center', fontSize: 5.5, color: '#333', fontStyle: 'italic', marginBottom: 2 }}>123-456-7890 · email@gmail.com · linkedin.com/in/user</div>
      <div style={{ borderTop: '0.5px solid #000', margin: '3px 0 2px' }} />
      {secHead('Education')}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
        <span style={{ fontWeight: 700 }}>Harvard Business School</span>
        <span style={{ fontSize: 5.5, fontStyle: 'italic' }}>May 2024</span>
      </div>
      <div style={{ fontStyle: 'italic', fontSize: 6 }}>Master of Business Administration — GPA: 3.9</div>
      {secHead('Experience')}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
        <span style={{ fontWeight: 700 }}>Consulting Firm</span>
        <span style={{ fontSize: 5.5 }}>New York, NY</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6 }}>
        <span style={{ fontStyle: 'italic' }}>Senior Associate</span>
        <span style={{ fontStyle: 'italic', fontSize: 5.5 }}>Jun 2022 – Present</span>
      </div>
      {['Led strategic initiative across 4 functional teams; drove $2.3M in cost savings', 'Built financial model adopted by C-suite for FY24 planning'].map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 1, fontSize: 5.5 }}>
          <span>•</span><span>{b}</span>
        </div>
      ))}
      {secHead('Skills & Interests')}
      <div style={{ fontSize: 6 }}>
        <span style={{ fontWeight: 700 }}>Technical:</span> Excel, SQL, Tableau, Python<br />
        <span style={{ fontWeight: 700 }}>Interests:</span> Sailing, Distance Running, Jazz Piano
      </div>
    </div>
  )
}

function Sb2novPreview() {
  const s: React.CSSProperties = { fontFamily: "'Lora', Georgia, serif", fontSize: 7, lineHeight: 1.4, color: '#000', padding: '14px 14px', background: '#fff', height: 240, overflow: 'hidden' }
  const secHead = (t: string) => <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' as const, borderBottom: '0.4px solid #000', paddingBottom: 1, marginBottom: 2, marginTop: 5 }}>{t}</div>
  return (
    <div style={s}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, letterSpacing: 0.5, marginBottom: 1 }}>First Last</div>
      <div style={{ textAlign: 'center', fontSize: 5.5, color: '#222', marginBottom: 2 }}>123-456-7890 | email@gmail.com | linkedin.com/in/user | github.com/user</div>
      {secHead('Education')}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
        <span style={{ fontWeight: 700 }}>Stanford University</span>
        <span style={{ fontSize: 5.5 }}>2020 – 2024</span>
      </div>
      <div style={{ fontStyle: 'italic', fontSize: 6 }}>B.S. Computer Science — GPA: 3.92</div>
      {secHead('Experience')}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
        <span style={{ fontWeight: 700 }}>Google</span>
        <span style={{ fontSize: 5.5 }}>Jun – Sep 2023</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6 }}>
        <span style={{ fontStyle: 'italic' }}>Software Engineering Intern</span>
        <span style={{ fontStyle: 'italic', fontSize: 5.5, color: '#333' }}>Mountain View, CA</span>
      </div>
      <ul style={{ margin: '2px 0 0 0', paddingLeft: 12, listStyle: 'none' }}>
        {['Built distributed indexing pipeline reducing latency by 38%', 'Authored RFC adopted across team of 14 engineers'].map((b, i) => (
          <li key={i} style={{ marginBottom: 1, fontSize: 6, position: 'relative' }}>
            <span style={{ position: 'absolute', left: -9 }}>◦</span>{b}
          </li>
        ))}
      </ul>
      {secHead('Technical Skills')}
      <div style={{ fontSize: 6 }}>
        <span style={{ fontWeight: 700 }}>Languages:</span> Python, C++, Go, TypeScript<br />
        <span style={{ fontWeight: 700 }}>Frameworks:</span> React, Next.js, gRPC, Protobuf
      </div>
    </div>
  )
}

function OpenResumePreview() {
  const ACCENT = '#38bdf8'
  return (
    <div style={{ fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", fontSize: 7, lineHeight: 1.4, color: '#171717', background: '#fff', height: 240, overflow: 'hidden' }}>
      <div style={{ height: 8, background: ACCENT }} />
      <div style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT, lineHeight: 1.1 }}>First Last</div>
        <div style={{ fontSize: 6, color: '#171717', marginTop: 2, lineHeight: 1.4 }}>Frontend engineer with 4+ years building accessible interfaces.</div>
        <div style={{ fontSize: 5.5, color: '#404040', marginTop: 2 }}>email@gmail.com  ·  123-456-7890  ·  github.com/user</div>
        {(['Work Experience', 'Education', 'Skills'] as const).map((section) => (
          <div key={section}>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 7, marginBottom: 3 }}>
              <div style={{ width: 18, height: 2.5, background: ACCENT, marginRight: 5 }} />
              <span style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>{section}</span>
            </div>
            {section === 'Work Experience' && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
                <span style={{ fontWeight: 700 }}>Acme Corp</span>
                <span style={{ fontSize: 5.5, color: '#404040' }}>2022 – Present</span>
              </div>
              <div style={{ fontSize: 6, marginTop: 1 }}>Senior Frontend Engineer</div>
              {['Shipped redesign that lifted activation by 23%', 'Mentored 3 junior engineers; led hiring loop'].map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 3, marginTop: 1, fontSize: 5.5 }}>
                  <span style={{ fontWeight: 700 }}>•</span><span>{b}</span>
                </div>
              ))}
            </>}
            {section === 'Education' && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
                <span style={{ fontWeight: 700 }}>State University</span>
                <span style={{ fontSize: 5.5, color: '#404040' }}>May 2020</span>
              </div>
              <div style={{ fontSize: 6 }}>B.S. Computer Science — GPA: 3.7</div>
            </>}
            {section === 'Skills' && (
              <div style={{ fontSize: 6 }}>
                <span style={{ fontWeight: 700 }}>Languages:</span> TypeScript, Python<br/>
                <span style={{ fontWeight: 700 }}>Frameworks:</span> React, Next.js, Tailwind
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function OnyxPreview() {
  const RULE = '#224a85'
  const sec = (t: string) => (
    <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#111', marginTop: 6, marginBottom: 3 }}>{t}</div>
  )
  const skill = (l: string, v: string) => (
    <div style={{ display: 'flex', marginBottom: 1 }}><span style={{ fontWeight: 700, width: 52, flexShrink: 0 }}>{l}</span><span>{v}</span></div>
  )
  return (
    <div style={{ fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif", fontSize: 7, lineHeight: 1.4, color: '#111', padding: '14px 14px', background: '#fff', height: 240, overflow: 'hidden' }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1.05 }}>First Last</div>
      <div style={{ fontSize: 7.5, marginTop: 1.5 }}>Full-Stack Developer</div>
      <div style={{ borderBottom: `1px solid ${RULE}`, margin: '4px 0' }} />
      <div style={{ fontSize: 5.5 }}>email@gmail.com  |  +91 98765 43210  |  Bengaluru  |  github.com/user</div>
      {sec('Summary')}
      <div style={{ fontSize: 6 }}>CS graduate building full-stack web apps with modern technologies.</div>
      {sec('Technical Skills')}
      <div style={{ fontSize: 6 }}>
        {skill('Languages:', 'JavaScript, TypeScript, Python')}
        {skill('Frontend:', 'React.js, HTML5, CSS3, Tailwind')}
        {skill('Backend:', 'Node.js, Express.js, REST APIs')}
      </div>
      {sec('Experience')}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700 }}>Full-Stack Developer Intern</span>
        <span style={{ fontSize: 5.5 }}>May – Aug 2024</span>
      </div>
      <div style={{ fontStyle: 'italic', fontSize: 6 }}>CodeOrbit Technologies, Bengaluru</div>
      <ul style={{ margin: '2px 0 0 0', paddingLeft: 10, listStyle: 'disc' }}>
        <li style={{ fontSize: 5.5, marginBottom: 1 }}>Developed responsive web apps using React.js and Node.js.</li>
        <li style={{ fontSize: 5.5 }}>Built and integrated RESTful APIs for auth and data.</li>
      </ul>
    </div>
  )
}

function CobaltPreview() {
  const ACCENT = '#06296b'
  const sec = (t: string) => (
    <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: ACCENT, borderBottom: `1px solid ${ACCENT}`, paddingBottom: 1.5, marginBottom: 3, marginTop: 6 }}>{t}</div>
  )
  const skill = (l: string, v: string) => (
    <div style={{ display: 'flex', marginBottom: 1 }}><span style={{ fontWeight: 700, width: 48, flexShrink: 0 }}>{l}</span><span>{v}</span></div>
  )
  return (
    <div style={{ fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", fontSize: 7, lineHeight: 1.4, color: '#111', padding: '14px 14px', background: '#fff', height: 240, overflow: 'hidden' }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#111', lineHeight: 1.05 }}>First Last</div>
      <div style={{ fontSize: 7.5, fontWeight: 700, color: ACCENT, marginTop: 1.5 }}>Software Engineer</div>
      <div style={{ fontSize: 5.5, color: '#111', marginTop: 2 }}>email@gmail.com  |  +91 98765 43210  |  Bengaluru  |  linkedin.com/in/user</div>
      {sec('Professional Summary')}
      <div style={{ fontSize: 6 }}>Backend-focused CS graduate building scalable REST APIs and reliable, efficient services.</div>
      {sec('Skills')}
      <div style={{ fontSize: 6 }}>
        {skill('Languages:', 'Java, Python, SQL, JavaScript')}
        {skill('Frameworks:', 'Spring Boot, Node.js, Express')}
        {skill('Tools:', 'Git, Docker, AWS, Postman')}
      </div>
      {sec('Experience')}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700 }}>Software Engineering Intern</span>
        <span style={{ fontSize: 5.5 }}>May – Jul 2024</span>
      </div>
      <div style={{ fontStyle: 'italic', fontSize: 6 }}>TechNova Solutions, Bengaluru</div>
      <ul style={{ margin: '2px 0 0 0', paddingLeft: 10, listStyle: 'disc' }}>
        <li style={{ fontSize: 5.5, marginBottom: 1 }}>Built and documented RESTful APIs using Spring Boot.</li>
        <li style={{ fontSize: 5.5 }}>Improved API response time by ~20%.</li>
      </ul>
    </div>
  )
}

function JadePreview() {
  const ACCENT = '#026857'
  const sec = (t: string) => (
    <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: ACCENT, borderBottom: `1px solid ${ACCENT}`, paddingBottom: 1, marginBottom: 2.5, marginTop: 5 }}>{t}</div>
  )
  return (
    <div style={{ fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif", fontSize: 6.5, lineHeight: 1.35, color: '#1a1a1a', padding: '13px 13px', background: '#fff', height: 240, overflow: 'hidden', display: 'flex', flexDirection: 'row', gap: 10 }}>
      {/* Left column */}
      <div style={{ width: '37%', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: ACCENT, lineHeight: 1.02 }}>First Last</div>
        <div style={{ fontSize: 6.5, fontWeight: 700, marginTop: 1 }}>Frontend Engineer</div>
        <div style={{ fontSize: 5, marginTop: 4 }}>
          <div style={{ marginBottom: 1 }}><b>Email:</b> first@gmail.com</div>
          <div style={{ marginBottom: 1 }}><b>Phone:</b> +91 98765 43210</div>
          <div><b>GitHub:</b> github.com/user</div>
        </div>
        {sec('Skills')}
        <div style={{ fontSize: 5.5 }}>
          <div style={{ fontWeight: 700 }}>Languages</div>
          <ul style={{ margin: '1px 0 0 0', paddingLeft: 8, listStyle: 'disc' }}>
            <li>JavaScript</li><li>TypeScript</li>
          </ul>
          <div style={{ fontWeight: 700, marginTop: 2 }}>Frameworks</div>
          <ul style={{ margin: '1px 0 0 0', paddingLeft: 8, listStyle: 'disc' }}>
            <li>React.js</li><li>Next.js</li>
          </ul>
        </div>
        {sec('Education')}
        <div style={{ fontSize: 5.5 }}>
          <div style={{ fontWeight: 700 }}>B.Tech, CSE</div>
          <div>RV College of Engineering</div>
        </div>
      </div>
      {/* Right column */}
      <div style={{ flex: 1 }}>
        {sec('Summary')}
        <div style={{ fontSize: 6 }}>Motivated CS graduate with a strong foundation in frontend development and responsive web apps.</div>
        {sec('Experience')}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700 }}>Frontend Developer Intern</span>
          <span style={{ fontSize: 5.5 }}>May – Aug 2024</span>
        </div>
        <div style={{ fontSize: 5.5 }}>TechNova Solutions, Bengaluru</div>
        <ul style={{ margin: '1.5px 0 0 0', paddingLeft: 9, listStyle: 'disc' }}>
          <li style={{ fontSize: 5.5, marginBottom: 1 }}>Developed responsive web interfaces using React.js.</li>
          <li style={{ fontSize: 5.5 }}>Built and integrated RESTful APIs.</li>
        </ul>
        {sec('Projects')}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700 }}>Portfolio Website</span>
          <span style={{ fontSize: 5.5, fontStyle: 'italic' }}>React.js, Vite</span>
        </div>
        <ul style={{ margin: '1.5px 0 0 0', paddingLeft: 9, listStyle: 'disc' }}>
          <li style={{ fontSize: 5.5 }}>Responsive site with dark mode toggle.</li>
        </ul>
      </div>
    </div>
  )
}

function LapisPreview() {
  const ACCENT = '#1a1670'
  const sec = (t: string) => (
    <div style={{ marginTop: 5, marginBottom: 2.5 }}>
      <div style={{ borderTop: '1px solid #e4e4ee', marginBottom: 2.5 }} />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 2, height: 7, background: ACCENT, marginRight: 3, flexShrink: 0 }} />
        <span style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: ACCENT }}>{t}</span>
      </div>
    </div>
  )
  const pill = (t: string) => (
    <span style={{ border: '0.6px solid #cdcdde', borderRadius: 3, padding: '1px 4px', marginRight: 3, marginBottom: 3, fontSize: 5.5, color: '#1f2024', whiteSpace: 'nowrap' as const, display: 'inline-block' }}>{t}</span>
  )
  return (
    <div style={{ fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif", fontSize: 7, lineHeight: 1.35, color: '#1f2024', padding: '13px 14px', background: '#fff', height: 240, overflow: 'hidden' }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: ACCENT, lineHeight: 1.04 }}>First Last</div>
      <div style={{ fontSize: 7.5, fontWeight: 700, color: ACCENT, marginTop: 1 }}>Data Engineer (Entry-Level)</div>
      <div style={{ fontSize: 5.5, color: '#1f2024', marginTop: 2.5 }}>email@gmail.com  |  +91 98765 43210  |  Bengaluru  |  github.com/user</div>
      {sec('Summary')}
      <div style={{ fontSize: 6 }}>CS graduate building scalable data pipelines with modern cloud tooling.</div>
      {sec('Skills')}
      <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 2 }}>
        {['Python', 'SQL', 'Spark', 'Kafka', 'Airflow', 'ETL', 'PostgreSQL', 'AWS', 'Docker', 'Pandas'].map((s, i) => <React.Fragment key={i}>{pill(s)}</React.Fragment>)}
      </div>
      {sec('Work Experience')}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700 }}>Data Engineer Intern</span>
        <span style={{ fontSize: 5.5 }}>May – Aug 2024</span>
      </div>
      <div style={{ fontStyle: 'italic', fontSize: 6, color: ACCENT }}>DataWave Analytics, Bengaluru</div>
      <ul style={{ margin: '2px 0 0 0', paddingLeft: 10, listStyle: 'disc' }}>
        <li style={{ fontSize: 5.5 }}>Designed ETL pipelines into AWS S3 and Redshift.</li>
      </ul>
    </div>
  )
}

/* ─── Template Definitions ──────────────────────────────────── */
const TEMPLATES: Template[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Timeless professional',
    tags: ['Serif', 'ATS ✓', 'Traditional'],
    preview: <ClassicPreview />,
  },
  {
    id: 'rezi',
    name: 'Rezi',
    tagline: 'Serif elegance',
    tags: ['Serif', 'Bold skills', 'ATS ✓'],
    preview: <ReziPreview />,
  },
  {
    id: 'rezi-standard',
    name: 'Rezi Standard',
    tagline: 'Clean & minimal',
    tags: ['Sans-serif', 'Thin rules', 'ATS ✓'],
    preview: <ReziStandardPreview />,
  },
  {
    id: 'london',
    name: 'London',
    tagline: 'Editorial italic',
    tags: ['Serif', 'Extending lines', 'ATS ✓'],
    preview: <LondonPreview />,
  },
  {
    id: 'stitch',
    name: 'Stitch',
    tagline: 'Modern traditional',
    tags: ['Serif', 'ATS ✓', 'Clean'],
    preview: <StitchPreview />,
  },
  {
    id: 'harvard',
    name: 'Harvard',
    tagline: 'HBS-style academic',
    tags: ['Serif', 'ATS ✓', 'Classic'],
    preview: <HarvardPreview />,
  },
  {
    id: 'sb2nov',
    name: 'sb2nov',
    tagline: 'LaTeX academic',
    tags: ['Serif', 'ATS ✓', 'Open bullets'],
    preview: <Sb2novPreview />,
  },
  {
    id: 'open-resume',
    name: 'Open Resume',
    tagline: 'Modern sky-blue accent',
    tags: ['Sans-serif', 'ATS ✓', 'Accent bar'],
    preview: <OpenResumePreview />,
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    tagline: 'Navy single-column, blue headers',
    tags: ['Sans-serif', 'ATS ✓', 'Blue accent'],
    preview: <CobaltPreview />,
  },
  {
    id: 'onyx',
    name: 'Onyx',
    tagline: 'Minimalist, wide-tracked headers',
    tags: ['Open Sans', 'ATS ✓', 'Minimalist'],
    preview: <OnyxPreview />,
  },
  {
    id: 'jade',
    name: 'Jade',
    tagline: 'Two-column teal with ruled headers',
    tags: ['Open Sans', 'Teal accent', 'Two-column'],
    preview: <JadePreview />,
  },
  {
    id: 'lapis',
    name: 'Lapis',
    tagline: 'Modern indigo with skill pills',
    tags: ['Open Sans', 'Indigo accent', 'Skill pills'],
    preview: <LapisPreview />,
  },
]

/* ─── Modal Component ───────────────────────────────────────── */
export default function TemplatePickerModal({ onSelect, onClose }: TemplatePickerModalProps) {
  useModalStyles()
  const [selected, setSelected] = useState<TemplateId>('classic')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
        animation: 'tpick-backdrop 0.22s ease both',
      }}
    >
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: '24px 28px',
        maxWidth: 1200,
        width: '100%',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        flexShrink: 0,
        boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
        animation: 'tpick-panel 0.3s cubic-bezier(.22,.68,0,.99) both',
      }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            {/* Eyebrow */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginBottom: 8,
              padding: '3px 10px', borderRadius: 20,
              background: 'rgba(19,91,236,0.12)',
              border: '1px solid rgba(19,91,236,0.2)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#135bec' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#7aa3f5', letterSpacing: '0.06em', fontFamily: "'DM Sans', sans-serif" }}>
                RESUME FORMAT
              </span>
            </div>
            <div style={{
              fontFamily: '"Syne", "DM Sans", sans-serif',
              fontSize: 26, fontWeight: 800, color: '#f1f5f9',
              letterSpacing: '-0.03em', lineHeight: 1.15,
            }}>
              Choose your template
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 5, fontFamily: "'DM Sans', sans-serif" }}>
              Your content stays exactly the same — only the design changes
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #1e293b', borderRadius: 6,
              color: '#475569', cursor: 'pointer', padding: '6px 9px',
              fontSize: 16, lineHeight: 1, transition: 'all 0.15s',
              flexShrink: 0, marginTop: 4,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = '#334155'
              el.style.color = '#94a3b8'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = '#1e293b'
              el.style.color = '#475569'
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Cards ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 20,
        }}>
          {TEMPLATES.map((tpl, i) => (
            <div
              key={tpl.id}
              className={`tpick-card${selected === tpl.id ? ' selected' : ''}`}
              style={{ animationDelay: `${i * 55}ms` }}
              onClick={() => setSelected(tpl.id)}
            >
              {/* Resume miniature */}
              <div style={{ position: 'relative', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {tpl.preview}
                <div className="tpick-check">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              {/* Card label */}
              <div style={{
                padding: '11px 14px 13px',
                background: selected === tpl.id ? '#0d1829' : '#111827',
                transition: 'background 0.18s',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{
                    fontSize: 13.5, fontWeight: 700,
                    color: selected === tpl.id ? '#60a5fa' : '#e2e8f0',
                    fontFamily: '"Syne", "DM Sans", sans-serif',
                    letterSpacing: '-0.01em',
                    transition: 'color 0.18s',
                  }}>
                    {tpl.name}
                  </div>
                  {selected === tpl.id && (
                    <div style={{
                      fontSize: 9.5, fontWeight: 600, color: '#3b82f6',
                      fontFamily: "'DM Sans', sans-serif",
                      letterSpacing: '0.04em',
                    }}>
                      SELECTED
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
                  {tpl.tagline}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {tpl.tags.map(tag => (
                    <span key={tag} className="tpick-tag">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 16,
          borderTop: '1px solid #1e293b',
        }}>
          <div style={{ fontSize: 12, color: '#334155', fontFamily: "'DM Sans', sans-serif" }}>
            Press{' '}
            <kbd style={{
              background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
              padding: '1px 6px', fontSize: 11, color: '#64748b',
              fontFamily: 'monospace',
            }}>Esc</kbd>
            {' '}to cancel
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 20px', borderRadius: 7,
                background: 'transparent', border: '1px solid #1e293b',
                color: '#64748b', cursor: 'pointer', fontSize: 13,
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = '#334155'
                el.style.color = '#94a3b8'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = '#1e293b'
                el.style.color = '#64748b'
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(selected)}
              style={{
                padding: '9px 24px', borderRadius: 7,
                background: 'linear-gradient(135deg, #135bec, #0f4cc7)',
                border: 'none', color: 'white',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                letterSpacing: '0.01em',
                boxShadow: '0 2px 12px rgba(19,91,236,0.4)',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.boxShadow = '0 4px 20px rgba(19,91,236,0.55)'
                el.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.boxShadow = '0 2px 12px rgba(19,91,236,0.4)'
                el.style.transform = 'translateY(0)'
              }}
            >
              Apply Template
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
