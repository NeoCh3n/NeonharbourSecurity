import React from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart, BarElement, ArcElement, CategoryScale, LinearScale } from 'chart.js';
import sampleAlerts from '../sampleAlerts.js';

Chart.register(BarElement, ArcElement, CategoryScale, LinearScale);

const dailyCounts = {};
sampleAlerts.forEach(a => {
  const day = new Date(a.time).getDate();
  dailyCounts[day] = (dailyCounts[day] || 0) + 1;
});

const severityCounts = sampleAlerts.reduce((acc, a) => {
  acc[a.severity] = (acc[a.severity] || 0) + 1;
  return acc;
}, {});

const barData = {
  labels: Object.keys(dailyCounts),
  datasets: [{ label: 'Alerts', data: Object.values(dailyCounts), backgroundColor: '#2196f3' }]
};

const pieData = {
  labels: Object.keys(severityCounts),
  datasets: [{ data: Object.values(severityCounts), backgroundColor: ['#4caf50', '#ff9800', '#f44336'] }]
};

const avgInvestigationTime = 30; // minutes placeholder

export default function Dashboard() {
  return (
    <div>
      <h2>Dashboard</h2>
      <div style={{ width: '400px' }}>
        <Bar data={barData} />
      </div>
      <div style={{ width: '400px' }}>
        <Pie data={pieData} />
      </div>
      <div>
        <h3>Average Investigation Time</h3>
        <p>{avgInvestigationTime} minutes</p>
      </div>
    </div>
  );
}
