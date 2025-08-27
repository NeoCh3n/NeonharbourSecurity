import React, { useEffect, useState } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart, BarElement, ArcElement, CategoryScale, LinearScale } from 'chart.js';
import { alertsApi, metricsApi } from '../services/api';

Chart.register(BarElement, ArcElement, CategoryScale, LinearScale);
export default function Dashboard() {
  const [alerts, setAlerts] = useState([]);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    alertsApi.list()
      .then(data => setAlerts(data.alerts || []))
      .catch(err => console.error('Failed to load alerts', err));
    metricsApi.get()
      .then(data => setMetrics(data))
      .catch(err => console.error('Failed to load metrics', err));
  }, []);

  const dailyCounts = {};
  alerts.forEach(a => {
    const day = new Date(a.createdAt).getDate();
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });

  const severityCounts = metrics?.severityCounts || {};

  const barData = {
    labels: Object.keys(dailyCounts),
    datasets: [{ label: 'Alerts', data: Object.values(dailyCounts), backgroundColor: '#2196f3' }]
  };

  const pieData = {
    labels: Object.keys(severityCounts),
    datasets: [{ data: Object.values(severityCounts), backgroundColor: ['#4caf50', '#ff9800', '#f44336'] }]
  };

  const statusCounts = metrics?.statusCounts || {};
  const statusPieData = {
    labels: Object.keys(statusCounts),
    datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#90caf9', '#a5d6a7', '#ffe082', '#ef9a9a'] }]
  };

  const avgInvestigationTime = metrics?.avgAnalysisTime ? (metrics.avgAnalysisTime / 60).toFixed(1) : 0;
  const feedbackScore = metrics?.feedbackScore ?? 0;
  const investigatedCount = metrics?.investigatedCount ?? 0;

  return (
    <div>
      <h2>Dashboard</h2>
      <div style={{ width: '400px' }}>
        <Bar data={barData} />
      </div>
      <div style={{ width: '400px' }}>
        <Pie data={pieData} />
      </div>
      <div style={{ width: '400px' }}>
        <Pie data={statusPieData} />
      </div>
      <div>
        <h3>Average Analysis Time</h3>
        <p>{avgInvestigationTime} minutes</p>
      </div>
      <div>
        <h3>Alerts Investigated</h3>
        <p>{investigatedCount}</p>
      </div>
      <div>
        <h3>User Feedback Score</h3>
        <p>{feedbackScore}% Accurate</p>
      </div>
    </div>
  );
}
