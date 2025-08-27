import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

export default function Home() {
  return (
    <div className="home-container">
      <section className="hero">
        <h1>Agentic AI SOC Platform</h1>
        <p>Triage, investigate, and respond to alerts with speed and precision.</p>
        <Link to="/register" className="cta">Request a Demo</Link>
      </section>
      <section className="features">
        <div className="feature-card">
          <span className="icon">🔍</span>
          <h3>Deep Visibility</h3>
          <p>Gain insights into threats across your environment.</p>
        </div>
        <div className="feature-card">
          <span className="icon">⚡</span>
          <h3>Automated Response</h3>
          <p>Respond quickly with AI-powered workflows.</p>
        </div>
        <div className="feature-card">
          <span className="icon">🛡️</span>
          <h3>Proactive Defense</h3>
          <p>Stay ahead with continuous monitoring.</p>
        </div>
      </section>
    </div>
  );
}
