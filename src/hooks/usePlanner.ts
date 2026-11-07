import { useEffect, useRef, useState } from "react";
import type {
  Analysis,
  FareConfig,
  Metadata,
  Place,
  Plan,
  WorkerRequest,
  WorkerResponse,
} from "../types";
import { loadJson } from "../lib/data";
import { parsePlan, STORAGE_KEY } from "../lib/storage";
import { FIXED_MARGIN, isTestPlan } from "../lib/testConfig";

export function newPlan(metadata: Metadata): Plan {
  return {
    schema: 1,
    graphVersion: metadata.version,
    budget: 40000,
    options: { margin: FIXED_MARGIN, callFee: false },
    start: metadata.defaultStart,
    end: metadata.defaultStart,
    sameEnd: true,
    visits: [],
    finished: false,
  };
}

export function usePlanner() {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [fare, setFare] = useState<FareConfig | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [candidate, setCandidate] = useState<Place | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const worker = useRef<Worker | null>(null),
    sequence = useRef(0),
    active = useRef(0);
  // Analysis is actionable only if it belongs to these exact confirmed/query states.
  const analyzedInput = useRef<{ plan: Plan; candidate: Place | null } | null>(
    null,
  );
  const pending = useRef<{ plan: Plan; candidate: Place | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const instance = new Worker(
      new URL("../workers/routingWorker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (cancelled) return;
      const message = event.data;
      if (message.type === "ready") {
        setReady(true);
        return;
      }
      if (message.id !== active.current) return;
      setBusy(false);
      if (message.type === "error") {
        setError(message.message);
        setAnalysis(null);
        analyzedInput.current = null;
      } else {
        setAnalysis(message.analysis);
        analyzedInput.current = pending.current;
        setError("");
      }
    };
    instance.onerror = () => {
      setError(
        "경로 계산기를 실행하지 못했습니다. 페이지를 새로고침해 주세요.",
      );
      setBusy(false);
    };
    const base = new URL(
      `${import.meta.env.BASE_URL}data/`,
      window.location.href,
    ).href;
    Promise.all([
      loadJson<Metadata>(base + "network-metadata.json"),
      loadJson<FareConfig>(base + "fare-config.json"),
      loadJson<Place[]>(base + "road-search.json"),
    ])
      .then(([meta, settings, names]) => {
        if (cancelled) return;
        setMetadata(meta);
        setFare(settings);
        setPlaces(names);
        let initial = newPlan(meta);
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const restored = parsePlan(saved, meta.version);
            if (restored && isTestPlan(restored, meta)) {
              initial = restored;
            } else
              setNotice(
                "저장된 계획의 형식 또는 도로 데이터가 바뀌어 새 계획을 시작합니다.",
              );
          }
        } catch {
          setNotice(
            "브라우저 저장 공간을 사용할 수 없어 이번 계획은 자동 저장되지 않습니다.",
          );
        }
        setPlan(initial);
        instance.postMessage({
          id: 0,
          type: "init",
          url: base + "road-graph.json.gz",
          fare: settings,
        } satisfies WorkerRequest);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
      instance.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    if (!plan || !ready) return;
    const id = ++sequence.current;
    active.current = id;
    pending.current = { plan, candidate };
    setBusy(true);
    setError("");
    const timer = window.setTimeout(
      () =>
        worker.current?.postMessage({
          id,
          type: "analyze",
          plan,
          candidate,
        } satisfies WorkerRequest),
      60,
    );
    return () => window.clearTimeout(timer);
  }, [plan, candidate, ready]);

  useEffect(() => {
    if (!plan) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      setNotice(
        "자동 저장에 실패했습니다. 새로고침하면 계획이 초기화될 수 있습니다.",
      );
    }
  }, [plan]);

  const fresh =
    !busy &&
    analyzedInput.current?.plan === plan &&
    analyzedInput.current?.candidate === candidate;
  return {
    metadata,
    fare,
    places,
    plan,
    setPlan,
    candidate,
    setCandidate,
    analysis,
    busy: busy || !fresh,
    ready,
    error,
    notice,
    setNotice,
    fresh,
  };
}
