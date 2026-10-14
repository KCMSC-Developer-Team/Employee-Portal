"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "./actions";

const highlights = [
  { icon: "◈", title: "One trusted staff directory", detail: "Accurate records, one secure workspace." },
  { icon: "↗", title: "Changes with approval", detail: "Employee updates are reviewed before they become official." },
  { icon: "⬡", title: "Privacy by design", detail: "Access follows your responsibilities, not your designation." },
];

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <main className="auth-shell">
      <div className="auth-frame">
        <section className="auth-story" aria-label="KCMSC Staff Portal">
          <div className="brand-lockup">
            <div className="brand-mark"><img src="/brand/kcmsc-mark.svg" alt="" /></div>
            <div><span className="brand-name">KCMSC</span><span className="brand-subtitle">STAFF PORTAL</span></div>
          </div>
          <div className="story-copy">
            <span className="eyebrow"><span className="live-dot" /> PEOPLE · SERVICE · TRUST</span>
            <h1>Your work.<br />Your records.<br /><span>One connected campus.</span></h1>
            <p>A smarter, more secure way to manage staff information, review requests and keep the school moving forward.</p>
          </div>
          <div className="story-highlights">
            {highlights.map((item) => <div className="story-highlight" key={item.title}>
              <span className="highlight-icon" aria-hidden="true">{item.icon}</span>
              <div><strong>{item.title}</strong><span>{item.detail}</span></div>
            </div>)}
          </div>
          <div className="story-footer"><span>KC MODEL SCHOOL &amp; COLLEGE</span><span>SECURE WORKSPACE <span className="footer-lock">●</span></span></div>
          <div className="story-orb story-orb-one" /><div className="story-orb story-orb-two" />
        </section>

        <section className="auth-main">
          <div className="auth-mobile-brand"><img src="/brand/kcmsc-mark.svg" alt="" /><span>KCMSC <small>STAFF PORTAL</small></span></div>
          <div className="login-card">
            <div className="login-card-top"><span className="welcome-label">WELCOME BACK</span><span className="secure-pill"><span /> Secure sign in</span></div>
            <h2>Sign in to your workspace</h2>
            <p className="login-description">Use your staff ID and password to continue.</p>

            <form action={action} className="login-form">
              <label htmlFor="staffId">Staff ID</label>
              <div className="field-wrap"><span className="field-icon" aria-hidden="true">▦</span><input id="staffId" name="staffId" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} placeholder="Enter your staff ID" /></div>
              <div className="password-label"><label htmlFor="password">Password</label><a href="/recover">Forgot password?</a></div>
              <div className="field-wrap"><span className="field-icon" aria-hidden="true">◇</span><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} placeholder="Enter your password" /></div>
              {state.error && <p role="alert" className="login-error"><span aria-hidden="true">!</span>{state.error}</p>}
              <button disabled={pending} className="login-submit" type="submit">{pending ? <><span className="button-spinner" /> Signing you in…</> : <>Sign in securely <span aria-hidden="true">↗</span></>}</button>
            </form>
            <div className="login-note"><span className="note-icon">✓</span><span>Your account is protected by KCMSC access controls.</span></div>
          </div>
          <div className="auth-bottom"><span>Need access? Contact your school administrator.</span><span>© {new Date().getFullYear()} KCMSC</span></div>
        </section>
      </div>
    </main>
  );
}
