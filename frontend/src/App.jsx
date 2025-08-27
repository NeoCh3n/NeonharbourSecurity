import React from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Alerts from './pages/Alerts.jsx';
import AlertDetail from './pages/AlertDetail.jsx';
import ThreatHunter from './pages/ThreatHunter.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Home from './pages/Home.jsx';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <div>
        <nav>
          <Link to="/">Home</Link> |{' '}
          <Link to="/dashboard">Dashboard</Link> |{' '}
          <Link to="/alerts">Alerts</Link> |{' '}
          <Link to="/hunter">Threat Hunter</Link>
        </nav>
      <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/alerts" element={<PrivateRoute><Alerts /></PrivateRoute>} />
          <Route path="/alerts/:id" element={<PrivateRoute><AlertDetail /></PrivateRoute>} />
          <Route path="/hunter" element={<PrivateRoute><ThreatHunter /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
