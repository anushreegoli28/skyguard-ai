import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MetricCards } from './components/MetricCards';
import { TelemetryCharts } from './components/TelemetryCharts';
import { AIDiagnosisPanel } from './components/AIDiagnosisPanel';
import { AnomalyTimeline } from './components/AnomalyTimeline';
import { FaultLab } from './components/FaultLab';
import { StationHealthPanel } from './components/StationHealthPanel';
import { EvaluationModal } from './components/EvaluationModal';
import { DemoBanner } from './components/DemoBanner';
import type { TelemetryPoint, EvaluationMetrics } from './types/skyguard';

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000/api'
    : '/api');

export function App() {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [latestTelemetry, setLatestTelemetry] =
    useState<TelemetryPoint | null>(null);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [isDemoActive, setIsDemoActive] = useState<boolean>(false);
  const [isScenarioRunning, setIsScenarioRunning] =
    useState<boolean>(false);
  const [demoStepMsg, setDemoStepMsg] = useState<string>('');
  const [isMetricsOpen, setIsMetricsOpen] = useState<boolean>(false);
  const [metrics, setMetrics] =
    useState<EvaluationMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [scenarioTimer, setScenarioTimer] =
    useState<ReturnType<typeof setTimeout> | null>(null);

  const applyTelemetry = (point: TelemetryPoint) => {
    setLatestTelemetry(point);
    setHistory((prev) => [...prev.slice(-99), point]);
  };

  const fetchTelemetryHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/timeseries`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: TelemetryPoint[] = await res.json();

      setHistory(data);

      if (data.length > 0) {
        setLatestTelemetry(data[data.length - 1]);
      }

      setErrorMessage('');
    } catch (err) {
      console.warn('Backend connecting...', err);
    }
  };

  const handleTick = async () => {
    try {
      const res = await fetch(`${API_BASE}/tick`, {
        method: 'POST'
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: TelemetryPoint = await res.json();

      applyTelemetry(data);
      setErrorMessage('');
    } catch (err) {
      console.warn('Backend stream error:', err);
    }
  };

  useEffect(() => {
    fetchTelemetryHistory();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (
        isPlaying &&
        !isDemoActive &&
        !isScenarioRunning
      ) {
        handleTick();
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [isPlaying, isDemoActive, isScenarioRunning]);

  useEffect(() => {
    return () => {
      if (scenarioTimer) {
        clearTimeout(scenarioTimer);
      }
    };
  }, [scenarioTimer]);

  const playSequence = async (
    sequence: TelemetryPoint[],
    delayMs = 500
  ) => {
    for (const point of sequence) {
      applyTelemetry(point);

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delayMs);
        setScenarioTimer(timer);
      });
    }

    setScenarioTimer(null);
  };

  const handleInjectFault = async (
    faultType: string,
    sensor: string,
    severity: number,
    duration: number
  ) => {
    setErrorMessage('');
    setIsScenarioRunning(true);
    setIsPlaying(false);

    try {
      const res = await fetch(`${API_BASE}/inject-fault`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fault_type: faultType,
          affected_sensor: sensor,
          severity,
          duration
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();
      const sequence: TelemetryPoint[] =
        result.telemetry_sequence || [];

      if (sequence.length > 0) {
        await playSequence(sequence, 500);
      } else if (result.latest_telemetry) {
        applyTelemetry(result.latest_telemetry);
      }
    } catch (err) {
      console.error('Failed to inject fault:', err);
      setErrorMessage(
        'Fault injection failed. Check that the backend/Vercel API is online.'
      );
    } finally {
      setIsScenarioRunning(false);
      setIsPlaying(true);
    }
  };

  const handleReset = async () => {
    if (scenarioTimer) {
      clearTimeout(scenarioTimer);
    }

    setScenarioTimer(null);
    setIsScenarioRunning(false);
    setIsDemoActive(false);
    setErrorMessage('');

    try {
      const res = await fetch(`${API_BASE}/reset`, {
        method: 'POST'
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();

      if (result.latest_telemetry) {
        applyTelemetry(result.latest_telemetry);
      }
    } catch (err) {
      console.error('Failed to reset station:', err);
      setErrorMessage(
        'Reset failed. Check that the backend/Vercel API is online.'
      );
    }
  };

  const handleRunDemo = async () => {
    if (isDemoActive || isScenarioRunning) {
      return;
    }

    setIsDemoActive(true);
    setIsPlaying(false);
    setErrorMessage('');
    setDemoStepMsg(
      'Running automated physical fault & genuine weather demonstration...'
    );

    try {
      const res = await fetch(`${API_BASE}/demo`, {
        method: 'POST'
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();
      const steps: string[] = result.step_descriptions || [];
      const sequence: TelemetryPoint[] =
        result.telemetry_sequence || [];

      if (sequence.length > 0) {
        const chunkSize = Math.max(
          1,
          Math.ceil(sequence.length / Math.max(steps.length, 1))
        );

        for (let i = 0; i < sequence.length; i += 1) {
          const stepIndex = Math.min(
            Math.max(steps.length - 1, 0),
            Math.floor(i / chunkSize)
          );

          if (steps.length > 0) {
            setDemoStepMsg(
              `[Step ${stepIndex + 1}/${steps.length}] ${steps[stepIndex]}`
            );
          }

          applyTelemetry(sequence[i]);

          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 450);
            setScenarioTimer(timer);
          });
        }
      }

      setScenarioTimer(null);
      setDemoStepMsg(
        'Demo sequence finished. Station baseline restored.'
      );
    } catch (err) {
      console.error('Demo execution error:', err);
      setErrorMessage(
        'Demo failed. Check that the backend/Vercel API is online.'
      );
    } finally {
      setIsDemoActive(false);
      setIsPlaying(true);
      setScenarioTimer(null);
    }
  };

  const handleOpenMetrics = async () => {
    setIsMetricsOpen(true);

    try {
      const res = await fetch(`${API_BASE}/metrics`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch ML metrics:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <Header
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onRunDemo={handleRunDemo}
          onReset={handleReset}
          onOpenMetrics={handleOpenMetrics}
          stationName={
            latestTelemetry?.station_name ||
            'NOAA GHCNh Station USW00014739'
          }
        />

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <DemoBanner
          isDemoActive={isDemoActive}
          stepMessage={demoStepMsg}
        />

        <MetricCards latest={latestTelemetry} />
        <AIDiagnosisPanel latest={latestTelemetry} />
        <TelemetryCharts history={history} />
        <AnomalyTimeline history={history} />

        <FaultLab
          onInjectFault={handleInjectFault}
          onReset={handleReset}
        />

        <StationHealthPanel
          health={latestTelemetry?.station_health || null}
        />

        <EvaluationModal
          isOpen={isMetricsOpen}
          onClose={() => setIsMetricsOpen(false)}
          metrics={metrics}
        />
      </div>
    </div>
  );
}

export default App;
