import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import { metricsApi } from '../services/api';

export default function Home() {
  const [metrics, setMetrics] = useState(null);

  const loadMetrics = async () => {
    try {
      const data = await metricsApi.get();
      setMetrics(data);
    } catch (err) {
      // ignore on home if unauthenticated
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

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
      {metrics && (
        <section className="metrics">
          <h2>Live Metrics</h2>
          <p>Total Alerts: {metrics.totalAlerts}</p>
          <p>Average Analysis Time: {metrics.avgAnalysisTime.toFixed(1)}s</p>
          <button onClick={loadMetrics}>Refresh</button>
        </section>
      )}
    </div>
  );
}
