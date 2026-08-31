import { useEffect, useState } from "react";

export type Status = "Carregando" | "Disponível" | "Aguardando";

export type Station = {
  id: string;
  name: string;
  address: string;
  blocked: boolean;
};

export type Charger = {
  id: string;
  stationId: string;
  status: Status;
  vehicle: string;
  driver: string;
  plate: string;
  power: number;
  sessionStartedAt: number | null;
};

export type SessionRecord = {
  id: string;
  chargerId: string;
  stationId: string;
  driver: string;
  vehicle: string;
  kwh: number;
  cost: number;
  seconds: number;
  tariff: string;
  endedAt: number;
};

export type GridState = {
  stations: Station[];
  chargers: Charger[];
  history: SessionRecord[];
};

export const CHARGER_POWER_KW = 11;
export const NETWORK_LIMIT_KW = 88;
export const CO2_KG_PER_KWH = 0.42;
export const CLEAN_KM_PER_KWH = 20;
export const FOSSIL_SAVINGS_PER_KWH = 8.4;

const GRID_KEY = "chargegrid_grid";
const EVENT = "chargegrid-grid";

export const STATIONS: Station[] = [
  {
    id: "FIAP-PAULISTA",
    name: "Eletroposto FIAP Paulista",
    address: "Av. Paulista, 1106 — Bela Vista, São Paulo",
    blocked: false,
  },
  {
    id: "FIAP-ACLIMACAO",
    name: "Eletroposto FIAP Aclimação",
    address: "Av. Lins de Vasconcelos, 1222 — Aclimação, São Paulo",
    blocked: false,
  },
];

function emptyCharger(stationId: string, id: string): Charger {
  return {
    id,
    stationId,
    status: "Disponível",
    vehicle: "—",
    driver: "—",
    plate: "",
    power: 0,
    sessionStartedAt: null,
  };
}

export function initialGrid(): GridState {
  const chargers: Charger[] = [];
  STATIONS.forEach((station) => {
    const prefix = station.id === "FIAP-PAULISTA" ? "PAU" : "ACL";
    for (let i = 1; i <= 4; i += 1) {
      chargers.push(emptyCharger(station.id, `${prefix}-0${i}`));
    }
  });
  return { stations: STATIONS.map((s) => ({ ...s })), chargers, history: [] };
}

function normalize(state: Partial<GridState> | null): GridState {
  const base = initialGrid();
  if (!state) return base;
  const stations = base.stations.map((station) => {
    const stored = state.stations?.find((s) => s.id === station.id);
    return stored ? { ...station, blocked: Boolean(stored.blocked) } : station;
  });
  const chargers = base.chargers.map((charger) => {
    const stored = state.chargers?.find((c) => c.id === charger.id);
    return stored ? { ...charger, ...stored, stationId: charger.stationId } : charger;
  });
  return { stations, chargers, history: state.history ?? [] };
}

export function getGrid(): GridState {
  if (typeof window === "undefined") return initialGrid();
  try {
    const raw = window.localStorage.getItem(GRID_KEY);
    return normalize(raw ? (JSON.parse(raw) as GridState) : null);
  } catch {
    return initialGrid();
  }
}

export function setGrid(updater: (state: GridState) => GridState) {
  if (typeof window === "undefined") return;
  const next = updater(getGrid());
  window.localStorage.setItem(GRID_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function useGrid() {
  const [grid, setLocal] = useState<GridState>(() => initialGrid());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setLocal(getGrid());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    const poll = window.setInterval(sync, 2000);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
      window.clearInterval(poll);
    };
  }, []);

  return { grid, ready };
}

export function startSession(
  chargerId: string,
  data: { driver: string; vehicle: string; plate?: string },
) {
  setGrid((state) => ({
    ...state,
    chargers: state.chargers.map((cp) =>
      cp.id === chargerId
        ? {
            ...cp,
            status: "Carregando" as Status,
            driver: data.driver,
            vehicle: data.vehicle,
            plate: data.plate ?? "",
            power: CHARGER_POWER_KW,
            sessionStartedAt: Date.now(),
          }
        : cp,
    ),
  }));
}

export function stopSession(chargerId: string, tariffLabel: string, rate: number) {
  setGrid((state) => {
    const charger = state.chargers.find((cp) => cp.id === chargerId);
    if (!charger) return state;
    const metrics = sessionMetrics(charger, Date.now());
    const history =
      charger.status === "Carregando"
        ? [
            {
              id: `${chargerId}-${Date.now()}`,
              chargerId,
              stationId: charger.stationId,
              driver: charger.driver,
              vehicle: charger.vehicle,
              kwh: metrics.kwh,
              cost: metrics.kwh * rate,
              seconds: metrics.seconds,
              tariff: tariffLabel,
              endedAt: Date.now(),
            },
            ...state.history,
          ].slice(0, 100)
        : state.history;
    return {
      ...state,
      history,
      chargers: state.chargers.map((cp) =>
        cp.id === chargerId ? emptyCharger(cp.stationId, cp.id) : cp,
      ),
    };
  });
}

export function setStationBlocked(stationId: string, blocked: boolean) {
  setGrid((state) => ({
    ...state,
    stations: state.stations.map((s) => (s.id === stationId ? { ...s, blocked } : s)),
    chargers: blocked
      ? state.chargers.map((cp) =>
          cp.stationId === stationId ? emptyCharger(cp.stationId, cp.id) : cp,
        )
      : state.chargers,
  }));
}

export function sessionMetrics(charger: Charger, nowMs: number | null) {
  if (charger.status !== "Carregando" || !charger.sessionStartedAt || !nowMs) {
    return { kwh: 0, seconds: 0 };
  }
  const seconds = Math.max(0, (nowMs - charger.sessionStartedAt) / 1000);
  return { kwh: (charger.power * seconds) / 3600, seconds };
}

export function tariffAt(hour: number) {
  if (hour >= 18 && hour <= 20)
    return { label: "Horário de Pico", price: "R$ 1,20/kWh", rate: 1.2, tone: "peak" as const };
  if ((hour >= 7 && hour <= 17) || hour === 21)
    return {
      label: "Horário Intermediário",
      price: "R$ 0,85/kWh",
      rate: 0.85,
      tone: "mid" as const,
    };
  return { label: "Fora de Pico", price: "R$ 0,55/kWh", rate: 0.55, tone: "off" as const };
}

export function formatDecimal(value: number, digits = 1) {
  return value.toFixed(digits).replace(".", ",");
}

export function formatMoney(value: number) {
  return `R$ ${formatDecimal(value, 2)}`;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
