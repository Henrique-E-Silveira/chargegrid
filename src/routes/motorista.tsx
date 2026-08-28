import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BatteryCharging,
  Bolt,
  CarFront,
  CheckCircle2,
  Clock3,
  DollarSign,
  Leaf,
  Play,
  Plug,
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

export const Route = createFileRoute("/motorista")({
  head: () => ({
    meta: [
      { title: "Recarga do Motorista | ChargeGrid Intelligence" },
      {
        name: "description",
        content:
          "Escolha um ponto de carregamento, acompanhe kWh, tempo e custo em tempo real e encerre sua recarga.",
      },
      { property: "og:title", content: "Recarga do Motorista — ChargeGrid" },
      {
        property: "og:description",
        content:
          "Interface do motorista para iniciar, acompanhar e encerrar recargas na rede ChargeGrid.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverPage,
});

type Status = "Carregando" | "Disponível" | "Aguardando";
type Point = { id: string; status: Status; vehicle: string; label: string };

const CHARGER_POWER_KW = 11;
const BATTERY_KWH = 60;
const CO2_KG_PER_KWH = 0.42;

const CAR_MODELS = ["Tesla Model 3", "BYD Dolphin", "Hyundai Ioniq 5", "T-Cross elétrico"];

const initialPoints: Point[] = [
  { id: "CP-01", status: "Carregando", vehicle: "Tesla Model 3", label: "Eletroposto Paulista" },
  { id: "CP-02", status: "Carregando", vehicle: "BYD Dolphin", label: "Eletroposto Faria Lima" },
  { id: "CP-03", status: "Disponível", vehicle: "—", label: "Eletroposto Ibirapuera" },
  { id: "CP-04", status: "Aguardando", vehicle: "Hyundai Ioniq 5", label: "Eletroposto Berrini" },
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

const statusStyles: Record<Status, string> = {
  Carregando: "border-success/40 bg-success/10 text-success",
  Disponível: "border-info/40 bg-info/10 text-info",
  Aguardando: "border-warning/40 bg-warning/10 text-warning",
};

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

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
      />
    </label>
  );
}

type Session = {
  pointId: string;
  driver: string;
  car: string;
  plate: string;
  startedAt: number;
};

type Receipt = {
  pointId: string;
  driver: string;
  car: string;
  kwh: number;
  cost: number;
  seconds: number;
  tariff: string;
};

function DriverPage() {
  const [points, setPoints] = useState(initialPoints);
  const [now, setNow] = useState<Date | null>(null);
  const [step, setStep] = useState<"select" | "form" | "charging" | "receipt">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [form, setForm] = useState({ driver: "", car: CAR_MODELS[0], plate: "" });
  const [error, setError] = useState("");
  const [series, setSeries] = useState(
    Array.from({ length: 20 }, (_, i) => ({ time: `${i}`, power: 0 })),
  );

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const charging = step === "charging" && session !== null;

  useEffect(() => {
    const tick = () => {
      const stamp = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const value = charging
        ? Number((CHARGER_POWER_KW + (Math.random() - 0.5) * 1.6).toFixed(1))
        : Number((Math.random() * 0.4).toFixed(1));
      setSeries((prev) => [...prev.slice(1), { time: stamp, power: value }]);
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
  }, [charging]);

  const hour = now?.getHours() ?? 12;
  const tariff = tariffAt(hour);
  const badgeTone =
    tariff.tone === "peak"
      ? "border-primary/40 bg-primary/10 text-primary"
      : tariff.tone === "mid"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";

  const elapsed = charging && now && session ? (now.getTime() - session.startedAt) / 1000 : 0;
  const kwh = (CHARGER_POWER_KW * elapsed) / 3600;
  const cost = kwh * tariff.rate;
  const percent = Math.min(100, 22 + (kwh / BATTERY_KWH) * 100);

  const openForm = (point: Point) => {
    if (point.status !== "Disponível") return;
    setSelectedId(point.id);
    setError("");
    setStep("form");
  };

  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.driver.trim() || !form.car.trim() || !selectedId) {
      setError("Informe seu nome e o modelo do carro.");
      return;
    }
    setPoints((items) =>
      items.map((item) =>
        item.id === selectedId
          ? { ...item, status: "Carregando" as Status, vehicle: form.car.trim() }
          : item,
      ),
    );
    setSession({
      pointId: selectedId,
      driver: form.driver.trim(),
      car: form.car.trim(),
      plate: form.plate.trim(),
      startedAt: Date.now(),
    });
    setError("");
    setStep("charging");
  };

  const finish = () => {
    if (!session) return;
    setReceipt({
      pointId: session.pointId,
      driver: session.driver,
      car: session.car,
      kwh,
      cost,
      seconds: elapsed,
      tariff: tariff.label,
    });
    setPoints((items) =>
      items.map((item) =>
        item.id === session.pointId
          ? { ...item, status: "Disponível" as Status, vehicle: "—" }
          : item,
      ),
    );
    setSession(null);
    setStep("receipt");
  };

  const reset = () => {
    setStep("select");
    setSelectedId(null);
    setReceipt(null);
    setForm({ driver: "", car: CAR_MODELS[0], plate: "" });
  };

  const selected = points.find((item) => item.id === selectedId);

  return (
    <div className="grid-surface min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Zap size={22} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold sm:text-xl">
                ChargeGrid <span className="text-primary">Motorista</span>
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Autoatendimento de recarga — FIAP × GoodWe 2026
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-display text-xs font-semibold sm:text-sm">
            <Clock3 size={15} className="text-muted-foreground" />
            {now ? now.toLocaleTimeString("pt-BR") : "--:--:--"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-5 px-4 py-5">
        <div
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
            badgeTone,
          )}
        >
          <DollarSign size={15} />
          Tarifa ANEEL vigente · {tariff.label} — {tariff.price}
        </div>

        {step === "select" && (
          <Panel>
            <Title icon={Plug} detail="Toque em um ponto disponível">
              Selecionar Ponto de Carregamento
            </Title>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {points.map((point) => {
                const available = point.status === "Disponível";
                return (
                  <button
                    key={point.id}
                    type="button"
                    disabled={!available}
                    onClick={() => openForm(point)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      available
                        ? "border-border bg-background/50 hover:border-primary/50"
                        : "cursor-not-allowed border-border bg-background/30 opacity-70",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-display text-base font-bold">{point.id}</span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          statusStyles[point.status],
                        )}
                      >
                        {point.status}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm text-muted-foreground">{point.label}</p>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <CarFront size={13} /> {point.vehicle}
                    </p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Bolt size={13} /> {CHARGER_POWER_KW} kW AC
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}

        {step === "form" && selected && (
          <Panel className="mx-auto max-w-lg">
            <Title icon={CarFront} detail={selected.label}>
              Identificação — {selected.id}
            </Title>
            <form className="space-y-3 p-5" onSubmit={confirm}>
              <Field
                label="Nome do motorista"
                placeholder="Seu nome"
                value={form.driver}
                maxLength={60}
                onChange={(e) => setForm((prev) => ({ ...prev, driver: e.target.value }))}
              />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Modelo do carro
                </span>
                <input
                  list="car-models"
                  value={form.car}
                  maxLength={60}
                  onChange={(e) => setForm((prev) => ({ ...prev, car: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
                />
                <datalist id="car-models">
                  {CAR_MODELS.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <Field
                label="Placa (opcional)"
                placeholder="ABC1D23"
                value={form.plate}
                maxLength={8}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, plate: e.target.value.toUpperCase() }))
                }
              />
              {error && (
                <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                  {error}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={reset}>
                  Voltar
                </Button>
                <Button type="submit" className="flex-1">
                  <Play size={16} /> Iniciar recarga
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {step === "charging" && session && (
          <div className="grid gap-5 lg:grid-cols-5">
            <Panel className="min-w-0 lg:col-span-2">
              <Title icon={BatteryCharging} detail={session.pointId}>
                Recarga em Andamento
              </Title>
              <div className="space-y-4 p-5">
                <div>
                  <div className="flex items-end justify-between">
                    <span className="font-display text-4xl font-bold text-success">
                      {Math.round(percent)}%
                    </span>
                    <span className="font-display text-xl font-bold tabular-nums">
                      {formatDuration(elapsed)}
                    </span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success transition-all duration-1000"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Energia entregue", `${formatDecimal(kwh, 2)} kWh`],
                    ["Custo acumulado", formatMoney(cost)],
                    ["Tarifa", tariff.price],
                    ["Potência", `${formatDecimal(CHARGER_POWER_KW)} kW`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-border bg-background/50 p-3"
                    >
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="truncate font-display text-sm font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                  {session.driver} · {session.car}
                  {session.plate ? ` · ${session.plate}` : ""}
                </div>
                <Button variant="destructive" className="w-full" onClick={finish}>
                  <Power size={16} /> Encerrar recarga
                </Button>
              </div>
            </Panel>

            <Panel className="min-w-0 lg:col-span-3">
              <Title icon={Activity} detail="Atualização a cada 3s">
                Potência Entregue em Tempo Real
              </Title>
              <div className="h-[300px] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="driverFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-green)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--chart-green)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--grid-line)"
                      strokeDasharray="3 5"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={4}
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
                      fill="url(#driverFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        )}

        {step === "receipt" && receipt && (
          <Panel className="mx-auto max-w-lg">
            <Title icon={CheckCircle2} detail={receipt.pointId}>
              Resumo da Sessão
            </Title>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">
                {receipt.driver} · {receipt.car}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Energia total",
                    value: `${formatDecimal(receipt.kwh, 2)} kWh`,
                    color: "text-info",
                    icon: BatteryCharging,
                  },
                  {
                    label: "Valor cobrado",
                    value: formatMoney(receipt.cost),
                    color: "text-primary",
                    icon: DollarSign,
                  },
                  {
                    label: "Tempo total",
                    value: formatDuration(receipt.seconds),
                    color: "text-foreground",
                    icon: Clock3,
                  },
                  {
                    label: "CO₂ evitado",
                    value: `${formatDecimal(receipt.kwh * CO2_KG_PER_KWH, 2)} kg`,
                    color: "text-success",
                    icon: Leaf,
                  },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div
                    key={label}
                    className="relative overflow-hidden rounded-lg border border-border bg-background/50 p-4"
                  >
                    <Icon className="absolute right-3 top-3 text-muted-foreground/25" size={20} />
                    <p className={cn("font-display text-lg font-bold", color)}>{value}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <p className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                Faixa tarifária aplicada: {receipt.tariff}. Cobrança enviada para faturamento da
                rede ChargeGrid.
              </p>
              <Button className="w-full" onClick={reset}>
                Nova recarga
              </Button>
            </div>
          </Panel>
        )}
      </main>
    </div>
  );
}
