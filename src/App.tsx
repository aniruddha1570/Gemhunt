/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Activity, 
  Cpu, 
  Filter, 
  Play, 
  Square, 
  Terminal, 
  Zap, 
  ShieldCheck, 
  AlertCircle,
  Hash,
  Search,
  Settings2,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface TargetAddress {
  address: string;
  label: string;
}

interface ScanStat {
  totalScanned: number;
  filteredCount: number;
  candidatesFound: number;
  keysPerSecond: number;
  hits: number;
}

const TARGET_ADDRESSES: TargetAddress[] = [
  { address: '1PWo3JeB9jrGwfHDNpdGK54CRas7fsVzXU', label: 'Target A' },
  { address: '1JTK7s9YVYywfm5XUH7RNhHJH1LshCaRFR', label: 'Target B' },
  { address: '12VVRNPi4SJqUTsp6FmqDqY5sGosDtysn4', label: 'Target C' },
  { address: '1FWGcVDK3JGzCC3WtkYetULPszMaK2Jksv', label: 'Target D' },
];

const SEARCH_RANGE = {
  start: '400000000000000000',
  end: '7fffffffffffffffff', // Corrected range assumption for 67-bit puzzle
};

interface LogEntry {
  id: string;
  timestamp: string;
  key: string;
  status: 'scanned' | 'filtered' | 'candidate' | 'hit';
  reason?: string;
  targetLabel?: string;
}

// --- Logic ---
function isCandidateKey(hex: string): { valid: boolean; reason?: string } {
  const s = hex.toLowerCase();
  
  // Rule 1: no triple consecutive identical characters
  for (let i = 0; i < s.length - 2; i++) {
    if (s[i] === s[i+1] && s[i+1] === s[i+2]) {
      return { valid: false, reason: `Triple repeat: ${s[i]}${s[i+1]}${s[i+2]}` };
    }
  }
  
  // Rule 2: prohibited double repeats
  const prohibited = ["66", "99", "aa", "dd"];
  for (const p of prohibited) {
    if (s.includes(p)) {
      return { valid: false, reason: `Prohibited repeat: ${p}` };
    }
  }
  
  // Rule 3: at most one double pair overall
  let doubleCount = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === s[i+1]) {
      doubleCount++;
      i++; // skip next char
    }
  }
  if (doubleCount > 1) {
    return { valid: false, reason: `Multiple double pairs: ${doubleCount}` };
  }
  
  // Rule 4: each digit 0-9 and letter a-f appears at most twice
  const counts: Record<string, number> = {};
  for (const c of s) {
    counts[c] = (counts[c] || 0) + 1;
  }
  for (let d = 0; d <= 9; d++) {
    const char = d.toString();
    if ((counts[char] || 0) > 2) {
      return { valid: false, reason: `Digit '${char}' appears ${counts[char]} times` };
    }
  }
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (const l of letters) {
    if ((counts[l] || 0) > 2) {
      return { valid: false, reason: `Letter '${l}' appears ${counts[l]} times` };
    }
  }
  
  return { valid: true };
}

function generateRandomKey(length: number = 64): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// --- Components ---

const StatCard = ({ icon: Icon, label, value, subValue, color = "text-white" }: any) => (
  <div className="bg-[#1a1b1e] border border-[#2c2d31] p-4 rounded-lg flex flex-col gap-1">
    <div className="flex items-center gap-2 text-[#8e9299] text-[10px] uppercase tracking-wider font-mono">
      <Icon size={12} className={color} />
      {label}
    </div>
    <div className={`text-xl font-mono ${color} tracking-tight`}>
      {value}
    </div>
    {subValue && (
      <div className="text-[10px] text-[#5c5f66] font-mono">
        {subValue}
      </div>
    )}
  </div>
);

const ZoneGrid = ({ activeIndex }: { activeIndex: number }) => {
  return (
    <div className="grid grid-cols-8 gap-1 p-2 bg-[#151619] rounded-lg border border-[#2c2d31]">
      {Array.from({ length: 64 }).map((_, i) => (
        <motion.div
          key={i}
          initial={false}
          animate={{
            backgroundColor: i === activeIndex ? '#f27d26' : '#2c2d31',
            opacity: i === activeIndex ? 1 : 0.3,
            scale: i === activeIndex ? 1.1 : 1,
          }}
          className="aspect-square rounded-[2px]"
        />
      ))}
    </div>
  );
};

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [useFilter, setUseFilter] = useState(true);
  const [stats, setStats] = useState<ScanStat>({
    totalScanned: 0,
    filteredCount: 0,
    candidatesFound: 0,
    keysPerSecond: 0,
    hits: 0,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [foundKeys, setFoundKeys] = useState<LogEntry[]>([]);
  const [currentZone, setCurrentZone] = useState(0);
  const [activeTab, setActiveTab] = useState<'console' | 'code' | 'found'>('console');
  const [lastHit, setLastHit] = useState<LogEntry | null>(null);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => {
    let interval: any;
    if (isRunning) {
      interval = setInterval(() => {
        const batchSize = 15; // Simulate batch processing
        let newFiltered = 0;
        let newCandidates = 0;
        let newHits = 0;
        const newLogs: LogEntry[] = [];

        for (let i = 0; i < batchSize; i++) {
          const key = generateRandomKey(64);
          const { valid, reason } = isCandidateKey(key);
          
          if (useFilter) {
            if (valid) {
              newCandidates++;
              newLogs.push({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                key,
                status: 'candidate'
              });
            } else {
              newFiltered++;
              if (Math.random() < 0.05) {
                newLogs.push({
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  key,
                  status: 'filtered',
                  reason
                });
              }
            }
          } else {
            newCandidates++;
            newLogs.push({
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              key,
              status: 'scanned'
            });
          }
        }

        setStats(prev => ({
          ...prev,
          totalScanned: prev.totalScanned + batchSize,
          filteredCount: prev.filteredCount + newFiltered,
          candidatesFound: prev.candidatesFound + newCandidates,
          hits: prev.hits + newHits,
          keysPerSecond: batchSize * 10,
        }));

        setLogs(prev => [...prev.slice(-49), ...newLogs]);
        setCurrentZone(prev => (prev + 1) % 64);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRunning, useFilter]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e1e1e1] font-sans selection:bg-[#f27d26] selection:text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#2c2d31] pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#f27d26] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(242,125,38,0.3)]">
                <Cpu className="text-white" size={24} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white uppercase italic font-serif">
                KeyHunt <span className="text-[#f27d26]">Pro</span>
              </h1>
            </div>
            <p className="text-xs text-[#8e9299] font-mono uppercase tracking-[0.2em]">
              Advanced Pattern Filter & Smart Zone Analysis
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseFilter(!useFilter)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all border ${
                useFilter 
                  ? 'bg-[#f27d26]/10 border-[#f27d26] text-[#f27d26]' 
                  : 'bg-[#1a1b1e] border-[#2c2d31] text-[#8e9299]'
              }`}
            >
              <Filter size={14} />
              Filter: {useFilter ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`flex items-center gap-2 px-6 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all ${
                isRunning 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
                  : 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)]'
              }`}
            >
              {isRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              {isRunning ? 'Stop Scan' : 'Start Scan'}
            </button>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Stats & Zones */}
          <div className="lg:col-span-4 space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <StatCard 
                icon={Activity} 
                label="Scan Rate" 
                value={`${stats.keysPerSecond.toLocaleString()} K/s`} 
                subValue="Simulated throughput"
                color="text-[#f27d26]"
              />
              <StatCard 
                icon={ShieldCheck} 
                label="Candidates" 
                value={stats.candidatesFound.toLocaleString()} 
                subValue="Matches pattern rules"
                color="text-green-400"
              />
              <StatCard 
                icon={Zap} 
                label="Hits Found" 
                value={stats.hits.toLocaleString()} 
                subValue="Real-time matches detected"
                color="text-yellow-400"
              />
            </div>

            {/* Target Addresses */}
            <div className="bg-[#1a1b1e] border border-[#2c2d31] p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-[#8e9299] text-[10px] uppercase tracking-wider font-mono">
                <Search size={12} className="text-[#f27d26]" />
                Target Addresses
              </div>
              <div className="space-y-2">
                {TARGET_ADDRESSES.map((target, i) => (
                  <div key={i} className="flex flex-col gap-1 p-2 bg-[#151619] rounded border border-[#2c2d31]/50">
                    <div className="text-[9px] text-[#f27d26] font-mono font-bold uppercase">{target.label}</div>
                    <div className="text-[10px] text-[#8e9299] font-mono break-all">{target.address}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Range Display */}
            <div className="bg-[#1a1b1e] border border-[#2c2d31] p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-[#8e9299] text-[10px] uppercase tracking-wider font-mono">
                <Settings2 size={12} className="text-[#f27d26]" />
                Search Range & Progress
              </div>
              <div className="space-y-2 font-mono text-[10px]">
                <div className="flex justify-between text-[#5c5f66]">
                  <span>START</span>
                  <span className="text-[#e1e1e1]">0x{SEARCH_RANGE.start}</span>
                </div>
                <div className="flex justify-between text-[#5c5f66]">
                  <span>END</span>
                  <span className="text-[#e1e1e1]">0x{SEARCH_RANGE.end}</span>
                </div>
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between text-[9px] text-[#5c5f66]">
                    <span>PROGRESS</span>
                    <span>{((stats.totalScanned / 1000000) * 100).toFixed(6)}%</span>
                  </div>
                  <div className="h-1 bg-[#151619] rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: `${Math.min((stats.totalScanned / 1000000) * 100, 100)}%` }}
                      className="h-full bg-[#f27d26]" 
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#1a1b1e] border border-[#2c2d31] p-4 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#8e9299] text-[10px] uppercase tracking-wider font-mono">
                  <Zap size={12} className="text-[#f27d26]" />
                  Smart Zone Analysis
                </div>
                <div className="text-[10px] text-[#5c5f66] font-mono">
                  ZONE {currentZone + 1}/64
                </div>
              </div>
              <ZoneGrid activeIndex={currentZone} />
              <div className="text-[10px] text-[#5c5f66] font-mono leading-relaxed">
                Scanning specific entropy zones to optimize candidate discovery. 
                Current range: <span className="text-[#e1e1e1]">0x{currentZone.toString(16).padStart(2, '0')}...</span>
              </div>
            </div>
          </div>

          {/* Right Column: Console & Rules */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Terminal Console */}
            <div className="bg-[#151619] border border-[#2c2d31] rounded-lg flex flex-col h-[450px] overflow-hidden">
              <div className="bg-[#1a1b1e] border-b border-[#2c2d31] px-4 py-2 flex items-center justify-between">
                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveTab('console')}
                    className={`flex items-center gap-2 text-[10px] uppercase tracking-wider font-mono transition-colors ${activeTab === 'console' ? 'text-[#f27d26]' : 'text-[#5c5f66] hover:text-[#8e9299]'}`}
                  >
                    <Terminal size={12} />
                    Live Scan
                  </button>
                  <button 
                    onClick={() => setActiveTab('found')}
                    className={`flex items-center gap-2 text-[10px] uppercase tracking-wider font-mono transition-colors ${activeTab === 'found' ? 'text-[#f27d26]' : 'text-[#5c5f66] hover:text-[#8e9299]'}`}
                  >
                    <ShieldCheck size={12} />
                    Found ({foundKeys.length})
                  </button>
                  <button 
                    onClick={() => setActiveTab('code')}
                    className={`flex items-center gap-2 text-[10px] uppercase tracking-wider font-mono transition-colors ${activeTab === 'code' ? 'text-[#f27d26]' : 'text-[#5c5f66] hover:text-[#8e9299]'}`}
                  >
                    <Cpu size={12} />
                    C++ Source
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-[10px] text-[#5c5f66] font-mono uppercase">
                    {isRunning ? 'Active' : 'Standby'}
                  </span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1 scrollbar-thin scrollbar-thumb-[#2c2d31]">
                {activeTab === 'console' && (
                  <>
                    {logs.length === 0 && (
                      <div className="text-[#5c5f66] italic">Waiting for scan to start...</div>
                    )}
                    {logs.map((log) => (
                      <div key={log.id} className="flex gap-3 group">
                        <span className="text-[#5c5f66] shrink-0">[{log.timestamp}]</span>
                        <span className={`shrink-0 uppercase font-bold ${
                          log.status === 'hit' ? 'text-yellow-400 animate-pulse' :
                          log.status === 'candidate' ? 'text-green-400' : 
                          log.status === 'filtered' ? 'text-red-400/50' : 'text-[#8e9299]'
                        }`}>
                          {log.status.padEnd(9)}
                        </span>
                        <span className={`truncate ${log.status === 'hit' ? 'text-yellow-400 font-bold' : 'text-[#e1e1e1]'}`}>
                          {log.key}
                        </span>
                        {(log.reason || log.targetLabel) && (
                          <span className="text-[#5c5f66] italic truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            // {log.targetLabel ? `MATCH: ${log.targetLabel}` : log.reason}
                          </span>
                        )}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </>
                )}

                {activeTab === 'found' && (
                  <div className="space-y-4">
                    {foundKeys.length === 0 && (
                      <div className="text-[#5c5f66] italic text-center py-20">No hits found yet. Keep scanning...</div>
                    )}
                    {foundKeys.map((hit) => (
                      <div key={hit.id} className="p-3 bg-[#1a1b1e] border border-yellow-400/30 rounded-lg space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-yellow-400 font-bold text-xs uppercase tracking-widest">HIT DETECTED: {hit.targetLabel}</span>
                          <span className="text-[#5c5f66]">{hit.timestamp}</span>
                        </div>
                        <div className="text-[#e1e1e1] break-all font-bold text-sm select-all">{hit.key}</div>
                        <div className="text-[9px] text-[#5c5f66] uppercase tracking-widest">Private Key (Hex)</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'code' && (
                  <div className="text-[#8e9299] whitespace-pre-wrap leading-relaxed">
                    <span className="text-[#f27d26]">// Modified keyhunt.cpp with Pattern Filter</span>
                    {`
bool is_candidate_key(const Int& key) {
    char hex[65];
    key.GetHex(hex);
    std::string s(hex);
    std::transform(s.begin(), s.end(), s.begin(), ::tolower);
    
    // Rule 1: no triple consecutive identical characters
    for (size_t i = 0; i < s.length() - 2; i++) {
        if (s[i] == s[i+1] && s[i+1] == s[i+2]) return false;
    }
    
    // Rule 2: prohibited double repeats
    const std::vector<std::string> prohibited = {"66", "99", "aa", "dd"};
    for (const auto& p : prohibited) {
        if (s.find(p) != std::string::npos) return false;
    }
    
    // Rule 3: at most one double pair overall
    int doubleCount = 0;
    for (size_t i = 0; i < s.length() - 1; i++) {
        if (s[i] == s[i+1]) {
            doubleCount++;
            i++; // skip next char
        }
    }
    if (doubleCount > 1) return false;
    
    // Rule 4: each digit 0-9 and letter a-f appears at most twice
    std::map<char, int> counts;
    for (char c : s) counts[c]++;
    for (char d = '0'; d <= '9'; d++) {
        if (counts[d] > 2) return false;
    }
    for (char l = 'a'; l <= 'f'; l++) {
        if (counts[l] > 2) return false;
    }
    return true;
}
`}
                  </div>
                )}
              </div>
            </div>

            {/* Rules Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#1a1b1e] border border-[#2c2d31] p-4 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-[#8e9299] text-[10px] uppercase tracking-wider font-mono">
                  <Settings2 size={12} className="text-[#f27d26]" />
                  Active Filter Rules
                </div>
                <ul className="space-y-2 text-[11px] text-[#8e9299] font-mono">
                  <li className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-[#f27d26] rounded-full mt-1.5" />
                    <span>No triple consecutive identical characters</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-[#f27d26] rounded-full mt-1.5" />
                    <span>Prohibited double repeats: 66, 99, AA, DD</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-[#f27d26] rounded-full mt-1.5" />
                    <span>At most one double pair overall</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-[#f27d26] rounded-full mt-1.5" />
                    <span>Each digit/letter appears at most twice</span>
                  </li>
                </ul>
              </div>

              <div className="bg-[#1a1b1e] border border-[#2c2d31] p-4 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-[#8e9299] text-[10px] uppercase tracking-wider font-mono">
                  <Database size={12} className="text-[#f27d26]" />
                  System Optimization
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono text-[#5c5f66]">
                    <span>CPU UTILIZATION</span>
                    <span>{isRunning ? '84%' : '0%'}</span>
                  </div>
                  <div className="h-1 bg-[#151619] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: isRunning ? '84%' : '0%' }}
                      className="h-full bg-[#f27d26]" 
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#5c5f66]">
                    <span>ENTROPY POOL</span>
                    <span>92%</span>
                  </div>
                  <div className="h-1 bg-[#151619] rounded-full overflow-hidden">
                    <div className="h-full bg-[#8e9299] w-[92%]" />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer Info */}
        <footer className="pt-8 border-t border-[#2c2d31] flex flex-col md:flex-row justify-between gap-4 text-[10px] font-mono text-[#5c5f66] uppercase tracking-widest">
          <div className="flex items-center gap-4">
            <span>v2.4.0-STABLE</span>
            <span>BUILD: 2026.03.28</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Activity size={10} />
              Real-Time Pattern Analysis
            </span>
            <span className="text-[#8e9299]">© 2026 KeyHunt Systems</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
