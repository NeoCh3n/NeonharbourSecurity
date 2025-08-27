import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Onboarding() {
  const navigate = useNavigate();
  const complete = () => {
    localStorage.setItem('onboarded', 'true');
    navigate('/alerts');
  };

  return (
    <div>
      <h2>Welcome to Agentic AI SOC Analyst</h2>
      <p>
        Not a black box: every investigation shows a transparent timeline of steps,
        tools used (e.g., VirusTotal), and the exact evidence behind each conclusion.
        You can always review, validate, and give feedback to help improve accuracy.
      </p>
      <ul>
        <li>See AI summary and severity at a glance.</li>
        <li>Review investigation timeline and raw evidence.</li>
        <li>Provide feedback: Accurate vs Inaccurate investigations.</li>
        <li>Ask natural language questions via Threat Hunter.</li>
      </ul>
      <button onClick={complete}>Got it</button>
    </div>
  );
}

