import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BatteryCharging,
  Bolt,
  CarFront,
  Clock3,
  DollarSign,
  Leaf,
  LogOut,
  MapPin,
  Play,
  Power,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "@/lib/auth";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Meu Painel | ChargeGrid Intelligence" },
      {
        name: "description",
        content:
          "Acompanhe sua recarga em tempo real: energia, custo, tarifa vigente e impacto ambiental do seu veículo elétrico.",
      },
      { property: "og:title", content: "Meu Painel — ChargeGrid Intelligence" },
      {
        property: "og:description",
        content: "Sessão de recarga em tempo real, histórico e economia do motorista.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserPanel,
});

const POWER_KW = 11;
const CO2_KG_PER_KWH = 0.42;
const CLEAN_KM_PER_KWH = 20;
const FOSSIL_SAVINGS_PER_KWH = 8.4;

const stations = [
  { id: "CP-01", name: "Eletroposto Paulista", distance: "0,8 km", free: 2 },
  { id: "CP-02", name: "Eletroposto Faria Lima", distance: "2,4 km", free: 1 },
  { id: "CP-03", name: "Eletroposto Ibirapuera", distance: "4,1 km", free: 3 },
];

const history = [
  { date: "26/08 · 19:12", station: "Eletroposto Paulista", kwh: "24,10", cost: "28,92", band: "Pico" },
  { date: "23/08 · 09:40", station: "Eletroposto Faria Lima", kwh: "18,60", cost: "15,81", band: "Intermediário" },
  { date: "19/08 · 23:05", station: "Eletroposto Ibirapuera", kwh: "31,20", cost: "17,16", band: "Fora de Pico" },
];

function tariffAt(hour: number) {
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

function formatDecimal(value: number, digits = 1) {
  return value.toFixed(digits).replace(".", ",");
}

function formatMoney(value: number) {
  return `R$ ${formatDecimal(value, 2)}`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel-glow rounded-xl border border-border bg-card", className)}>
      {children}
    </section>
  );
}

function Title({ icon: Icon, children, detail }: { icon: LucideIcon; children: ReactNode; detail?: string }) {
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

function UserPanel() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const [now, setNow] = useState<Date | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stationId, setStationId] = useState(stations[0].id);
  const [totals, setTotals] = useState({ kwh: 73.9, cost: 61.89, sessions: 3 });
  const [series, setSeries] = useState(
    Array.from({ length: 24 }, (_, i) => ({ time: `-${24 - i}`, power: 0 })),
  );

  useEffect(() => {
    if (!ready) return;
    if (!session) navigate({ to: "/" });
    else if (session.role === "admin") navigate({ to: "/admin" });
  }, [ready, session, navigate]);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const charging = startedAt !== null;

  useEffect(() => {
    const tick = () => {
      const stamp = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const value = charging
        ? Number((POWER_KW + (Math.random() - 0.5) * 1.4).toFixed(1))
        : Number((Math.random() * 0.4).toFixed(1));
      setSeries((prev) => [...prev.slice(1), { time: stamp, power: value }]);
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
  }, [charging]);

  const hour = now?.getHours() ?? 12;
  const tariff = tariffAt(hour);

  const elapsed = charging && now ? (now.getTime() - (startedAt as number)) / 1000 : 0;
  const sessionKwh = (POWER_KW * elapsed) / 3600;
  const sessionCost = sessionKwh * tariff.rate;
  const totalKwh = totals.kwh + sessionKwh;
  const totalCost = totals.cost + sessionCost;

  const station = useMemo(
    () => stations.find((item) => item.id === stationId) ?? stations[0],
    [stationId],
  );

  const badgeTone =
    tariff.tone === "peak"
      ? "border-primary/40 bg-primary/10 text-primary"
      : tariff.tone === "mid"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";

  const start = () => setStartedAt(Date.now());
  const stop = () => {
    setTotals((prev) => ({
      kwh: prev.kwh + sessionKwh,
      cost: prev.cost + sessionCost,
      sessions: prev.sessions + 1,
    }));
    setStartedAt(null);
  };

  if (!ready || !session || session.role === "admin") {
    return <div className="min-h-screen bg-background" />;
  }

  const kpis: Array<{ label: string; value: string; color: string; icon: LucideIcon }> = [
    {
      label: "Potência da Sessão",
      value: charging ? `${formatDecimal(POWER_KW)} kW` : "0,0 kW",
      color: charging ? "text-success" : "text-muted-foreground",
      icon: Bolt,
    },
    {
      label: "Energia da Sessão",
      value: `${formatDecimal(sessionKwh, 2)} kWh`,
      color: "text-info",
      icon: BatteryCharging,
    },
    { label: "Custo da Sessão", value: formatMoney(sessionCost), color: "text-primary", icon: DollarSign },
    { label: "Tarifa Vigente", value: tariff.price, color: "text-violet", icon: Activity },
  ];

  const impact: Array<{ value: string; label: string; color: string; icon: LucideIcon }> = [
    {
      value: `${formatDecimal(totalKwh * CO2_KG_PER_KWH, 2)} kg`,
      label: "CO₂ Evitado",
      color: "text-success",
      icon: Leaf,
    },
    {
      value: `${Math.round(totalKwh * CLEAN_KM_PER_KWH)} km`,
      label: "Deslocamento Limpo",
      color: "text-info",
      icon: CarFront,
    },
    {
      value: formatMoney(totalKwh * FOSSIL_SAVINGS_PER_KWH),
      label: "Economia vs Gasolina",
      color: "text-warning",
      icon: DollarSign,
    },
    {
      value: String(totals.sessions + (charging ? 1 : 0)),
      label: "Recargas Realizadas",
      color: "text-violet",
      icon: BatteryCharging,
    },
  ];

  return (
    <div className="grid-surface min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Zap size={22} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold sm:text-xl">
                Olá, <span className="text-primary">{session.name.split(" ")[0]}</span>
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {session.car} · Painel do Motorista
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-display text-xs font-semibold sm:text-sm">
              <Clock3 size={15} className="text-muted-foreground" />
              {now ? now.toLocaleTimeString("pt-BR") : "--:--:--"}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 lg:px-8 lg:py-7">
        <div
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
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
            <Title icon={Activity} detail="Atualização a cada 3s">
              Minha Curva de Recarga
            </Title>
            <div className="h-[280px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="userFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-green)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--chart-green)" stopOpacity={0.02} />
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
                    domain={[0, 14]}
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
                    formatter={(value) => [`${value} kW`, "Potência"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="power"
                    stroke="var(--chart-green)"
                    strokeWidth={2}
                    fill="url(#userFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="min-w-0 lg:col-span-2">
            <Title icon={BatteryCharging}>Sessão Atual</Title>
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    charging
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {charging ? "Carregando" : "Ocioso"}
                </span>
                <span className="font-display text-xl font-bold tabular-nums">
                  {formatDuration(elapsed)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Ponto", station.id],
                  ["Local", station.name],
                  ["Energia", `${formatDecimal(sessionKwh, 2)} kWh`],
                  ["Custo", formatMoney(sessionCost)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-background/50 p-3">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="truncate font-display text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              {charging ? (
                <Button variant="destructive" className="w-full" onClick={stop}>
                  <Power size={16} /> Encerrar recarga
                </Button>
              ) : (
                <Button className="w-full" onClick={start}>
                  <Play size={16} /> Iniciar recarga em {station.id}
                </Button>
              )}
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 lg:grid-cols-5">
          <Panel className="min-w-0 lg:col-span-2">
            <Title icon={MapPin} detail="Rede ChargeGrid">
              Eletropostos Próximos
            </Title>
            <div className="space-y-2 p-4">
              {stations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={charging}
                  onClick={() => setStationId(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-50",
                    item.id === stationId
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-background/50 hover:border-primary/30",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.id} · {item.distance}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-success">
                    {item.free} livres
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="min-w-0 lg:col-span-3">
            <Title icon={Clock3} detail={`Gasto total: ${formatMoney(totalCost)}`}>
              Histórico de Recargas
            </Title>
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    {["Data", "Eletroposto", "kWh", "Custo", "Faixa"].map((head) => (
                      <th key={head} className="pb-2 font-medium">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-display">
                  {history.map((row) => (
                    <tr key={row.date} className="border-t border-border">
                      <td className="py-2.5">{row.date}</td>
                      <td className="py-2.5">{row.station}</td>
                      <td className="py-2.5 text-info">{row.kwh}</td>
                      <td className="py-2.5 text-primary">R$ {row.cost}</td>
                      <td className="py-2.5 text-muted-foreground">{row.band}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {impact.map(({ value, label, color, icon: Icon }) => (
            <Panel key={label} className="relative overflow-hidden p-4 sm:p-5">
              <Icon className="absolute right-4 top-4 text-muted-foreground/25" size={26} />
              <p className={cn("font-display text-lg font-bold sm:text-2xl", color)}>{value}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
            </Panel>
          ))}
        </section>
      </main>
    </div>
  );
}
