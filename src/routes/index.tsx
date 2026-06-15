import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BatteryCharging,
  Bolt,
  CarFront,
  Clock3,
  DollarSign,
  Gauge,
  Leaf,
  Play,
  Power,
  Radio,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChargeGrid Intelligence | Gestão de Eletropostos" },
      {
        name: "description",
        content: "Monitoramento comercial, energético e sustentável de eletropostos em tempo real.",
      },
      { property: "og:title", content: "ChargeGrid Intelligence" },
      {
        property: "og:description",
        content: "Sistema inteligente de gestão de eletropostos — FIAP × GoodWe 2026.",
      },
    ],
  }),
  component: Dashboard,
});

type Status = "Carregando" | "Disponível" | "Aguardando";
type TariffTone = "peak" | "mid" | "off";
type Charger = {
  id: string;
  status: Status;
  vehicle: string;
  user: string;
  power: number;
  baseKwh: number;
  baseCost: number;
  elapsedSeedSeconds: number;
  sessionStartedAt: number | null;
};

const NETWORK_LIMIT_KW = 44;
const CHARGER_POWER_KW = 11;
const SIMULATION_SPEED = 60;
const CO2_KG_PER_KWH = 0.42;
const CLEAN_KM_PER_KWH = 20;
const FOSSIL_SAVINGS_PER_KWH = 8.4;

const initialChargers: Charger[] = [
  {
    id: "CP-01",
    status: "Carregando",
    vehicle: "Tesla Model 3",
    user: "USR-4821",
    power: CHARGER_POWER_KW,
    baseKwh: 18.45,
    baseCost: 15.68,
    elapsedSeedSeconds: 5075,
    sessionStartedAt: null,
  },
  {
    id: "CP-02",
    status: "Carregando",
    vehicle: "BYD Dolphin",
    user: "USR-3392",
    power: CHARGER_POWER_KW,
    baseKwh: 8.2,
    baseCost: 6.97,
    elapsedSeedSeconds: 2838,
    sessionStartedAt: null,
  },
  {
    id: "CP-03",
    status: "Disponível",
    vehicle: "—",
    user: "—",
    power: 0,
    baseKwh: 0,
    baseCost: 0,
    elapsedSeedSeconds: 0,
    sessionStartedAt: null,
  },
  {
    id: "CP-04",
    status: "Aguardando",
    vehicle: "Hyundai Ioniq 5",
    user: "USR-7741",
    power: 0,
    baseKwh: 0,
    baseCost: 0,
    elapsedSeedSeconds: 0,
    sessionStartedAt: null,
  },
];

const powers = [
  18, 21, 19, 25, 28, 24, 30, 32, 27, 34, 37, 33, 29, 31, 35, 39, 36, 32, 28, 26, 30, 34, 38, 35,
  31, 29, 26, 24, 23, 22,
];
const baseDemandData = powers.map((power, i) => ({
  time: `${String(14 + Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6) * 10).padStart(2, "0")}`,
  power,
}));
const sessions = [
  ["CP-01", "Tesla Model 3", "32,40", "2h58min", "Intermediário", "27,54", "14:22:10"],
  ["CP-02", "BYD Dolphin", "18,70", "1h42min", "Fora de Pico", "10,29", "12:15:44"],
  ["CP-03", "Chevrolet Bolt", "45,00", "4h05min", "Pico", "54,00", "21:08:33"],
  ["CP-01", "Renault Zoe", "22,10", "2h00min", "Intermediário", "18,79", "10:30:20"],
  ["CP-04", "Nissan Leaf", "28,60", "2h36min", "Fora de Pico", "15,73", "06:55:02"],
];

function tariffAt(hour: number): { label: string; price: string; rate: number; tone: TariffTone } {
  if (hour >= 18 && hour <= 20)
    return { label: "Horário de Pico", price: "R$ 1,20/kWh", rate: 1.2, tone: "peak" };
  if ((hour >= 7 && hour <= 17) || hour === 21)
    return { label: "Horário Intermediário", price: "R$ 0,85/kWh", rate: 0.85, tone: "mid" };
  return { label: "Fora de Pico", price: "R$ 0,55/kWh", rate: 0.55, tone: "off" };
}

function formatDecimal(value: number, digits = 1) {
  return value.toFixed(digits).replace(".", ",");
}

function formatMoney(value: number) {
  return `R$ ${formatDecimal(value, 2)}`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function liveElapsedSeconds(charger: Charger, now: Date | null) {
  if (charger.status !== "Carregando") return 0;
  if (!now || !charger.sessionStartedAt) return charger.elapsedSeedSeconds;
  return (
    charger.elapsedSeedSeconds +
    ((now.getTime() - charger.sessionStartedAt) / 1000) * SIMULATION_SPEED
  );
}

function liveSessionMetrics(charger: Charger, now: Date | null, rate: number) {
  if (charger.status !== "Carregando") {
    return { kwh: 0, cost: 0, elapsedSeconds: 0 };
  }

  const liveSeconds =
    charger.sessionStartedAt && now
      ? ((now.getTime() - charger.sessionStartedAt) / 1000) * SIMULATION_SPEED
      : 0;
  const liveKwh = (charger.power * liveSeconds) / 3600;

  return {
    kwh: charger.baseKwh + liveKwh,
    cost: charger.baseCost + liveKwh * rate,
    elapsedSeconds: liveElapsedSeconds(charger, now),
  };
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel-glow rounded-xl border border-border bg-card", className)}>
      {children}
    </section>
  );
}

function Title({
  icon: Icon,
  children,
  detail,
}: {
  icon: LucideIcon;
  children: ReactNode;
  detail?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-5 py-4">
      <h2 className="flex min-w-0 items-center gap-2 font-display text-sm font-semibold tracking-wide sm:text-base">
        <Icon className="shrink-0 text-primary" size={18} />
        <span className="truncate">{children}</span>
      </h2>
      {detail && <span className="hidden text-xs text-muted-foreground sm:inline">{detail}</span>}
    </div>
  );
}

function Dashboard() {
  const [now, setNow] = useState<Date | null>(null);
  const [chargers, setChargers] = useState(initialChargers);
  const [realizedRevenue, setRealizedRevenue] = useState(25.15);
  const [realizedEnergy, setRealizedEnergy] = useState(2.87);
  const [completedSessions, setCompletedSessions] = useState(16);

  useEffect(() => {
    const firstTick = new Date();
    setNow(firstTick);
    setChargers((items) =>
      items.map((cp) =>
        cp.status === "Carregando" && !cp.sessionStartedAt
          ? { ...cp, sessionStartedAt: firstTick.getTime() }
          : cp,
      ),
    );
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hour = now?.getHours() ?? 12;
  const tariff = tariffAt(hour);
  const activeCount = chargers.filter((cp) => cp.status === "Carregando").length;
  const totalPowerKw = chargers.reduce(
    (sum, cp) => sum + (cp.status === "Carregando" ? cp.power : 0),
    0,
  );
  const activeMetrics = chargers.map((cp) => liveSessionMetrics(cp, now, tariff.rate));
  const activeRevenue = activeMetrics.reduce((sum, item) => sum + item.cost, 0);
  const activeEnergy = activeMetrics.reduce((sum, item) => sum + item.kwh, 0);
  const totalRevenue = realizedRevenue + activeRevenue;
  const totalEnergy = realizedEnergy + activeEnergy;
  const networkLoad = Math.min(100, (totalPowerKw / NETWORK_LIMIT_KW) * 100);
  const networkTone = networkLoad >= 85 ? "critical" : networkLoad >= 60 ? "attention" : "stable";
  const networkLabel =
    networkLoad === 0
      ? "Rede livre"
      : networkTone === "critical"
        ? "Carga crítica"
        : networkTone === "attention"
          ? "Operação em atenção"
          : "Operação estável";
  const networkClass =
    networkTone === "critical"
      ? "text-primary"
      : networkTone === "attention"
        ? "text-warning"
        : "text-success";
  const networkStroke =
    networkTone === "critical"
      ? "var(--chart-red)"
      : networkTone === "attention"
        ? "var(--chart-orange)"
        : "var(--chart-green)";
  const latestDemandLabel = now
    ? now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "Agora";

  const tariffData = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        value: h >= 18 && h <= 20 ? 1.2 : (h >= 7 && h <= 17) || h === 21 ? 0.85 : 0.55,
        tone: h >= 18 && h <= 20 ? "red" : (h >= 7 && h <= 17) || h === 21 ? "orange" : "green",
      })),
    [],
  );

  const demandData = useMemo(
    () =>
      baseDemandData.map((point, index) =>
        index === baseDemandData.length - 1
          ? { time: latestDemandLabel, power: Number(totalPowerKw.toFixed(1)) }
          : point,
      ),
    [latestDemandLabel, totalPowerKw],
  );

  const startCharger = (id: string) => {
    const timestamp = Date.now();
    setChargers((items) =>
      items.map((cp) =>
        cp.id !== id
          ? cp
          : {
              ...cp,
              status: "Carregando",
              vehicle: cp.vehicle === "—" ? "VW ID.4" : cp.vehicle,
              user: cp.user === "—" ? `USR-${6108 + Number(cp.id.slice(-2))}` : cp.user,
              power: CHARGER_POWER_KW,
              baseKwh: 0,
              baseCost: 0,
              elapsedSeedSeconds: 0,
              sessionStartedAt: timestamp,
            },
      ),
    );
  };

  const stopCharger = (id: string) => {
    const timestamp = new Date();
    const charger = chargers.find((cp) => cp.id === id);
    if (charger?.status === "Carregando") {
      const metrics = liveSessionMetrics(charger, timestamp, tariff.rate);
      setRealizedRevenue((value) => value + metrics.cost);
      setRealizedEnergy((value) => value + metrics.kwh);
      setCompletedSessions((value) => value + 1);
    }
    setChargers((items) =>
      items.map((cp) =>
        cp.id !== id
          ? cp
          : {
              ...cp,
              status: "Disponível",
              vehicle: "—",
              user: "—",
              power: 0,
              baseKwh: 0,
              baseCost: 0,
              elapsedSeedSeconds: 0,
              sessionStartedAt: null,
            },
      ),
    );
  };

  const badgeTone =
    tariff.tone === "peak"
      ? "border-primary/40 bg-primary/10 text-primary"
      : tariff.tone === "mid"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";

  const kpis: Array<{ label: string; value: string; color: string; icon: LucideIcon }> = [
    {
      label: "Potência em Uso",
      value: `${formatDecimal(totalPowerKw)} kW / ${NETWORK_LIMIT_KW} kW`,
      color:
        networkTone === "critical"
          ? "text-primary"
          : networkTone === "attention"
            ? "text-warning"
            : "text-success",
      icon: Bolt,
    },
    {
      label: "Carregadores Ativos",
      value: `${activeCount}/${chargers.length}`,
      color: "text-success",
      icon: BatteryCharging,
    },
    {
      label: "Receita Acumulada",
      value: formatMoney(totalRevenue),
      color: "text-info",
      icon: DollarSign,
    },
    { label: "Tarifa Vigente", value: tariff.price, color: "text-violet", icon: Activity },
  ];

  const impact: Array<{ value: string; label: string; color: string; icon: LucideIcon }> = [
    {
      value: `${formatDecimal(totalEnergy * CO2_KG_PER_KWH, 2)} kg`,
      label: "CO₂ Evitado Total",
      color: "text-success",
      icon: Leaf,
    },
    {
      value: `${Math.round(totalEnergy * CLEAN_KM_PER_KWH)} km`,
      label: "Deslocamento Limpo Equivalente",
      color: "text-info",
      icon: CarFront,
    },
    {
      value: formatMoney(totalEnergy * FOSSIL_SAVINGS_PER_KWH),
      label: "Economia vs Combustível Fóssil",
      color: "text-warning",
      icon: DollarSign,
    },
    {
      value: String(completedSessions + activeCount),
      label: "Recargas Sustentáveis Realizadas",
      color: "text-violet",
      icon: BatteryCharging,
    },
  ];

  return (
    <div className="grid-surface min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Zap size={22} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold sm:text-xl">
                ChargeGrid <span className="text-primary">Intelligence</span>
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                Sistema de Gestão Comercial de Eletropostos — FIAP × GoodWe 2026
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={cn(
                "hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold md:flex",
                badgeTone,
              )}
            >
              <DollarSign size={15} />
              {tariff.label} — {tariff.price}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-display text-xs font-semibold sm:text-sm">
              <Clock3 size={15} className="text-muted-foreground" />
              {now ? now.toLocaleTimeString("pt-BR") : "--:--:--"}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 lg:px-8 lg:py-7">
        <div
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold md:hidden",
            badgeTone,
          )}
        >
          <DollarSign size={15} />
          {tariff.label} — {tariff.price}
        </div>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(({ label, value, color, icon: Icon }) => (
            <Panel key={label} className="relative overflow-hidden p-4 sm:p-5">
              <Icon className="absolute right-4 top-4 text-muted-foreground/25" size={26} />
              <p className={cn("font-display text-lg font-bold sm:text-2xl", color)}>{value}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
            </Panel>
          ))}
        </section>
        <section className="grid gap-5 lg:grid-cols-5">
          <Panel className="min-w-0 lg:col-span-3">
            <Title icon={Activity} detail="Atualização contínua · últimos 30 pontos">
              Controle de Demanda em Tempo Real
            </Title>
            <div className="h-[300px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={demandData} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-red)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--chart-red)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={5}
                  />
                  <YAxis
                    domain={[0, 50]}
                    unit=" kW"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [`${value} kW`, "Demanda"]}
                  />
                  <ReferenceLine
                    y={NETWORK_LIMIT_KW}
                    stroke="var(--chart-orange)"
                    strokeDasharray="6 5"
                    label={{
                      value: "Limite da Rede",
                      fill: "var(--chart-orange)",
                      fontSize: 11,
                      position: "insideTopRight",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="power"
                    stroke="var(--chart-red)"
                    strokeWidth={3}
                    fill="url(#demandFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="lg:col-span-2">
            <Title icon={Gauge} detail={`${formatDecimal(networkLoad, 0)}% da capacidade`}>
              Status da Rede
            </Title>
            <div className="flex h-[300px] flex-col items-center justify-center px-6">
              <div className="relative w-full max-w-[320px]">
                <svg
                  viewBox="0 0 220 125"
                  role="img"
                  aria-label={`${formatDecimal(totalPowerKw)} kW de ${NETWORK_LIMIT_KW} kW em uso`}
                  className="w-full"
                >
                  <path
                    d="M 25 110 A 85 85 0 0 1 195 110"
                    fill="none"
                    stroke="var(--muted)"
                    strokeWidth="18"
                    strokeLinecap="round"
                    pathLength="100"
                  />
                  <path
                    d="M 25 110 A 85 85 0 0 1 195 110"
                    fill="none"
                    stroke={networkStroke}
                    strokeWidth="18"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray={`${networkLoad} 100`}
                  />
                </svg>
                <div className="absolute inset-x-0 bottom-0 text-center">
                  <p className="font-display text-4xl font-bold">
                    {formatDecimal(totalPowerKw, 0)}{" "}
                    <span className="text-lg text-muted-foreground">kW</span>
                  </p>
                  <p className={cn("mt-1 text-xs uppercase tracking-[.18em]", networkClass)}>
                    {networkLabel}
                  </p>
                </div>
              </div>
              <div className="mt-8 grid w-full grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="font-display font-semibold text-success">0–60%</p>
                  <p className="text-muted-foreground">Normal</p>
                </div>
                <div className="border-x border-border">
                  <p className="font-display font-semibold text-warning">60–85%</p>
                  <p className="text-muted-foreground">Atenção</p>
                </div>
                <div>
                  <p className="font-display font-semibold text-primary">85%+</p>
                  <p className="text-muted-foreground">Crítico</p>
                </div>
              </div>
            </div>
          </Panel>
        </section>
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Power size={19} className="text-primary" />
            <h2 className="font-display text-base font-semibold sm:text-lg">
              Pontos de Carregamento <span className="text-muted-foreground">(Charge Points)</span>
            </h2>
            <span className="ml-auto hidden items-center gap-1.5 text-xs text-success sm:flex">
              <Radio size={13} className="animate-pulse" /> OCPP conectado
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {chargers.map((cp) => (
              <ChargerCard
                key={cp.id}
                charger={cp}
                now={now}
                rate={tariff.rate}
                onStart={() => startCharger(cp.id)}
                onStop={() => stopCharger(cp.id)}
              />
            ))}
          </div>
        </section>
        <section className="grid gap-5 xl:grid-cols-5">
          <Panel className="min-w-0 xl:col-span-2">
            <Title icon={DollarSign}>Tarifação Dinâmica ANEEL</Title>
            <div className="h-[280px] px-2 pt-5 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tariffData} margin={{ top: 12, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis
                    domain={[0, 1.5]}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [
                      `R$ ${Number(value).toFixed(2).replace(".", ",")}/kWh`,
                      "Tarifa",
                    ]}
                  />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {tariffData.map((d) => (
                      <Cell
                        key={d.hour}
                        fill={
                          d.tone === "red"
                            ? "var(--chart-red)"
                            : d.tone === "orange"
                              ? "var(--chart-orange)"
                              : "var(--chart-green)"
                        }
                        stroke={d.hour === hour ? "var(--foreground)" : "transparent"}
                        strokeWidth={2}
                      />
                    ))}
                  </Bar>
                  <ReferenceLine
                    x={hour}
                    stroke="var(--foreground)"
                    label={{
                      value: "AGORA",
                      fill: "var(--foreground)",
                      fontSize: 9,
                      position: "top",
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              <span>
                <b className="text-primary">●</b> Pico R$1,20
              </span>
              <span>
                <b className="text-warning">●</b> Intermediário R$0,85
              </span>
              <span>
                <b className="text-success">●</b> Fora de Pico R$0,55
              </span>
            </div>
          </Panel>
          <Panel className="min-w-0 overflow-hidden xl:col-span-3">
            <Title icon={Clock3} detail="Últimas sessões encerradas">
              Histórico de Sessões
            </Title>
            <div className="max-h-[340px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
                  <tr>
                    {[
                      "CP",
                      "Veículo",
                      "kWh",
                      "Duração",
                      "Tarifa",
                      "Custo (R$)",
                      "Encerrado em",
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row, i) => (
                    <tr
                      key={`${row[0]}-${row[6]}`}
                      className={cn(
                        "border-b border-border",
                        i % 2 ? "bg-panel-raised/60" : "bg-card",
                      )}
                    >
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={cn(
                            "px-4 py-3",
                            j === 0
                              ? "font-display font-semibold text-primary"
                              : "text-muted-foreground",
                            j === 5 && "font-semibold text-foreground",
                          )}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
        <Panel>
          <Title icon={Leaf} detail="Consolidado do mês">
            Impacto Ambiental — Recargas Realizadas
          </Title>
          <div className="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-4 lg:divide-y-0">
            {impact.map(({ value, label, color, icon: Icon }) => (
              <div key={label} className="p-5 text-center sm:p-7">
                <Icon className={cn("mx-auto mb-2", color)} size={21} />
                <p className={cn("font-display text-xl font-bold sm:text-2xl", color)}>{value}</p>
                <p className="mx-auto mt-1 max-w-[210px] text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </Panel>
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
        ChargeGrid Intelligence © 2026 — FIAP × GoodWe EV Challenge | Protótipo Acadêmico
      </footer>
    </div>
  );
}

function ChargerCard({
  charger,
  now,
  rate,
  onStart,
  onStop,
}: {
  charger: Charger;
  now: Date | null;
  rate: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const charging = charger.status === "Carregando";
  const waiting = charger.status === "Aguardando";
  const metrics = liveSessionMetrics(charger, now, rate);
  const kwhLabel = charging ? formatDecimal(metrics.kwh, 2) : "—";
  const costLabel = charging ? formatDecimal(metrics.cost, 2) : "—";
  const durationLabel = charging
    ? formatDuration(metrics.elapsedSeconds)
    : waiting
      ? "Na fila"
      : "—";

  return (
    <Panel
      className={cn(
        "overflow-hidden transition-colors",
        charging && "border-success/35",
        waiting && "border-warning/35",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-panel-raised/50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Zap
            size={17}
            className={
              charging ? "text-success" : waiting ? "text-warning" : "text-muted-foreground"
            }
          />
          <h3 className="truncate font-display font-bold">{charger.id}</h3>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-semibold",
            charging
              ? "border-success/35 bg-success/10 text-success"
              : waiting
                ? "border-warning/35 bg-warning/10 text-warning"
                : "border-border bg-muted text-muted-foreground",
          )}
        >
          {charger.status}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-y-2 text-xs">
          <span className="text-muted-foreground">Veículo</span>
          <span className="truncate font-medium">{charger.vehicle}</span>
          <span className="text-muted-foreground">Usuário</span>
          <span className="font-mono text-[11px]">{charger.user}</span>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-muted-foreground">Potência</span>
            <span
              className={cn(
                "font-display font-semibold",
                charging ? "text-success" : "text-muted-foreground",
              )}
            >
              {formatDecimal(charger.power)} kW
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                charging ? "bg-success" : waiting ? "bg-warning" : "bg-muted-foreground/30",
              )}
              style={{ width: `${Math.min((charger.power / CHARGER_POWER_KW) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center">
          <div>
            <p className="font-display text-xs font-semibold">{kwhLabel}</p>
            <p className="text-[9px] uppercase text-muted-foreground">kWh</p>
          </div>
          <div className="border-x border-border">
            <p className="font-display text-xs font-semibold">{costLabel}</p>
            <p className="text-[9px] uppercase text-muted-foreground">Custo R$</p>
          </div>
          <div>
            <p className="font-display text-xs font-semibold">{durationLabel}</p>
            <p className="text-[9px] uppercase text-muted-foreground">Duração</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="charge" size="sm" disabled={charging} onClick={onStart}>
            <Play size={13} fill="currentColor" />
            Iniciar
          </Button>
          <Button variant="stop" size="sm" disabled={!charging && !waiting} onClick={onStop}>
            <Power size={13} />
            Encerrar
          </Button>
        </div>
      </div>
    </Panel>
  );
}
