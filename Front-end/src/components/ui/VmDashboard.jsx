import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Cpu, HardDrive, RefreshCw, Server, AlertCircle } from 'lucide-react';

const VmDashboard = () => {
  const [vms, setVms] = useState([]);
  const [selectedVmName, setSelectedVmName] = useState('VM1');
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Poll FastAPI endpoint every 3 seconds
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/v1/vms/metrics');
        if (!response.ok) throw new Error('Failed to reach FastAPI backend');
        const data = await response.json();
        
        setVms(data);
        setLoading(false);
        setError(null);

        // Append new telemetry snapshot into historical time-series buffer (max 20 points)
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        setHistory((prevHistory) => {
          const updated = { ...prevHistory };
          data.forEach((vm) => {
            const currentVmHistory = updated[vm.name] || [];
            const newPoint = {
              time: timestamp,
              cpu: vm.cpu_percent,
              memory: vm.memory_usage_mb,
            };
            updated[vm.name] = [...currentVmHistory.slice(-19), newPoint];
          });
          return updated;
        });
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  const selectedVm = vms.find((vm) => vm.name === selectedVmName) || vms[0] || {};
  const currentHistory = history[selectedVm?.name] || [];

  if (loading) {
    return (
      <div style={{ backgroundColor: '#111827', color: '#9CA3AF', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '10px' }} />
        <span>Loading InfraWatch Dashboard...</span>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0B0F19', color: '#E5E7EB', minHeight: '100vh', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #1F2937', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity color="#3B82F6" size={28} />
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', letterSpacing: '0.5px' }}>
            INFRAWATCH <span style={{ color: '#6B7280', fontWeight: '400' }}>| Resource Overview</span>
          </h1>
        </div>

        {/* Dynamic Container Switcher Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '14px', color: '#9CA3AF' }}>Select Target Container:</label>
          <select
            value={selectedVmName}
            onChange={(e) => setSelectedVmName(e.target.value)}
            style={{ backgroundColor: '#1F2937', color: '#F3F4F6', border: '1px solid #374151', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', outline: 'none' }}
          >
            {vms.map((vm) => (
              <option key={vm.name} value={vm.name}>
                {vm.name} ({vm.status.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: '#7F1D1D', color: '#FCA5A5', padding: '12px 16px', borderRadius: '6px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          <span>Error loading metrics: {error}</span>
        </div>
      )}

      {/* Grid Layout (Grafana Panel Structure) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '16px' }}>
        
        {/* Left Column: Stat Gauge Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* CPU Metric Panel */}
          <div style={{ backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9CA3AF', marginBottom: '12px' }}>
              <Cpu size={18} color="#3B82F6" />
              <span style={{ fontSize: '14px', fontWeight: '600' }}>CPU UTILIZATION</span>
            </div>
            <div style={{ fontSize: '36px', fontWeight: '800', color: selectedVm.cpu_percent > 80 ? '#EF4444' : '#3B82F6' }}>
              {selectedVm.cpu_percent ?? 0}%
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>Capped @ 0.25 Cores</div>
          </div>

          {/* Memory Metric Panel */}
          <div style={{ backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9CA3AF', marginBottom: '12px' }}>
              <HardDrive size={18} color="#10B981" />
              <span style={{ fontSize: '14px', fontWeight: '600' }}>MEMORY USAGE</span>
            </div>
            <div style={{ fontSize: '36px', fontWeight: '800', color: '#10B981' }}>
              {selectedVm.memory_usage_mb ?? 0} <span style={{ fontSize: '18px', fontWeight: '400' }}>MB</span>
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
              Limit: {selectedVm.memory_limit_mb ?? 64} MB ({selectedVm.memory_percent ?? 0}%)
            </div>
          </div>
        </div>

        {/* Center Column: Live Area Time-Series Chart */}
        <div style={{ backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#9CA3AF', marginBottom: '16px' }}>
            {selectedVm.name} TELEMETRY HISTORY (REAL-TIME)
          </div>
          <div style={{ flex: 1, minHeight: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentHistory}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#4B5563" fontSize={11} />
                <YAxis stroke="#4B5563" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }} />
                <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#3B82F6" fillOpacity={1} fill="url(#cpuGrad)" />
                <Area type="monotone" dataKey="memory" name="RAM (MB)" stroke="#10B981" fillOpacity={1} fill="url(#memGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column: Container Status Card */}
        <div style={{ backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9CA3AF', marginBottom: '16px' }}>
            <Server size={18} color="#F59E0B" />
            <span style={{ fontSize: '14px', fontWeight: '600' }}>CONTAINER METADATA</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Container Name</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#F3F4F6' }}>{selectedVm.name}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>State</div>
              <div style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '700', backgroundColor: selectedVm.status === 'running' ? '#064E3B' : '#7F1D1D', color: selectedVm.status === 'running' ? '#34D399' : '#FCA5A5', marginTop: '4px' }}>
                {(selectedVm.status || 'OFFLINE').toUpperCase()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>Managed By</div>
              <div style={{ fontSize: '14px', color: '#D1D5DB' }}>Docker Engine / FastAPI</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default VmDashboard;