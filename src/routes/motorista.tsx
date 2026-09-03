import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BatteryCharging,
  Bolt,
  CarFront,
  CheckCircle2,
  Clock3,
  DollarSign,
  Leaf,
  Lock,
  Plug,
  Power,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CHARGER_POWER_KW,
  CO2_KG_PER_KWH,
  formatDecimal,
  formatDuration,
  formatMoney,
  sessionMetrics,
  startSession,
  stopSession,
  tariffAt,
  useGrid,
  type Charger,
} from "@/lib/grid";

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

const BATTERY_KWH = 60;
const CAR_MODELS = ["Tesla Model 3", "BYD Dolphin", "Hyundai Ioniq 5", "T-Cross elétrico"];

const statusStyles: Record<Charger["status"], string> = {
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
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
        <Icon size={16} className="text-primary" />
        {children}
      </h2>
      {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel-raised/50 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon size={14} className="text-primary" />
        {label}
      </div>
      <p className="mt-2 font-display text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Summary = {
  chargerId: string;
  kwh: number;
  cost: number;
  seconds: number;
  tariff: string;
};

function DriverPage() {
  const { grid, ready } = useGrid();
  const [now, setNow] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState({ driver: "", vehicle: CAR_MODELS[0], plate: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const tariff = useMemo(() => tariffAt(now ? new Date(now).getHours() : 12), [now]);
  const active = grid.chargers.find((c) => c.id === activeId) ?? null;
  const activeStation = grid.stations.find((s) => s.id === active?.stationId) ?? null;

  useEffect(() => {
    if (activeId && active && active.status !== "Carregando") setActiveId(null);
  }, [activeId, active]);

  const metrics = active ? sessionMetrics(active, now) : { kwh: 0, seconds: 0 };
  const cost = metrics.kwh * tariff.rate;
  const battery = Math.min(100, (metrics.kwh / BATTERY_KWH) * 100 + 18);

  const begin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (!form.driver.trim()) {
      setError("Informe seu nome para iniciar a recarga.");
      return;
    }
    setError("");
    startSession(selected, {
      driver: form.driver.trim(),
      vehicle: form.vehicle,
      plate: form.plate.trim(),
    });
    setActiveId(selected);
    setSelected(null);
    setSummary(null);
  };

  const finish = () => {
    if (!active) return;
    setSummary({
      chargerId: active.id,
      kwh: metrics.kwh,
      cost,
      seconds: metrics.seconds,
      tariff: tariff.label,
    });
    stopSession(active.id, tariff.label, tariff.rate);
    setActiveId(null);
  };

  return (
    <div className="grid-surface min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Zap size={20} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold">
                ChargeGrid <span className="text-primary">Motorista</span>
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Autoatendimento de recarga — rede FIAP
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-semibold",
              tariff.tone === "peak"
                ? "border-primary/40 bg-primary/10 text-primary"
                : tariff.tone === "mid"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-success/40 bg-success/10 text-success",
            )}
          >
            {tariff.label} · {tariff.price}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        {active ? (
          <Panel>
            <Title icon={BatteryCharging} detail={activeStation?.name}>
              Recarga em andamento · {active.id}
            </Title>
            <div className="space-y-4 p-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Carga estimada da bateria</span>
                  <span className="font-display font-bold text-foreground">
                    {formatDecimal(battery, 0)}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-panel-raised">
                  <div
                    className="h-full rounded-full bg-success transition-[width] duration-1000"
                    style={{ width: `${battery}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  icon={Bolt}
                  label="Energia"
                  value={`${formatDecimal(metrics.kwh, 2)} kWh`}
                  hint={`${CHARGER_POWER_KW} kW`}
                />
                <Stat icon={Clock3} label="Tempo" value={formatDuration(metrics.seconds)} />
                <Stat icon={DollarSign} label="Custo" value={formatMoney(cost)} hint={tariff.price} />
                <Stat
                  icon={Leaf}
                  label="CO₂ evitado"
                  value={`${formatDecimal(metrics.kwh * CO2_KG_PER_KWH, 2)} kg`}
                />
              </div>

              <div className="rounded-lg border border-border bg-panel-raised/50 p-4 text-xs text-muted-foreground">
                <p>
                  <span className="text-foreground">{active.driver}</span> · {active.vehicle}
                  {active.plate ? ` · ${active.plate}` : ""}
                </p>
              </div>

              <Button variant="stop" className="w-full" onClick={finish}>
                <Power size={16} />
                Encerrar recarga
              </Button>
            </div>
          </Panel>
        ) : summary ? (
          <Panel>
            <Title icon={CheckCircle2} detail={summary.tariff}>
              Recarga encerrada · {summary.chargerId}
            </Title>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat icon={Bolt} label="Energia" value={`${formatDecimal(summary.kwh, 2)} kWh`} />
                <Stat icon={Clock3} label="Duração" value={formatDuration(summary.seconds)} />
                <Stat icon={DollarSign} label="Total" value={formatMoney(summary.cost)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Recibo enviado ao painel de operação. Obrigado por usar a rede ChargeGrid.
              </p>
              <Button className="w-full" onClick={() => setSummary(null)}>
                Nova recarga
              </Button>
            </div>
          </Panel>
        ) : null}

        {!active &&
          grid.stations.map((station) => {
            const chargers = grid.chargers.filter((c) => c.stationId === station.id);
            return (
              <Panel key={station.id}>
                <Title icon={Plug} detail={station.address}>
                  {station.name}
                </Title>
                {station.blocked ? (
                  <p className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground">
                    <Lock size={14} className="text-primary" />
                    Eletroposto temporariamente bloqueado pela operação.
                  </p>
                ) : (
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    {chargers.map((charger) => {
                      const free = charger.status === "Disponível";
                      const isSelected = selected === charger.id;
                      return (
                        <div
                          key={charger.id}
                          className={cn(
                            "rounded-lg border border-border bg-panel-raised/50 p-4",
                            isSelected && "border-primary/60",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-bold">{charger.id}</span>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                statusStyles[charger.status],
                              )}
                            >
                              {charger.status}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {free ? "Pronto para uso" : `Em uso por ${charger.driver}`}
                          </p>
                          <Button
                            variant={free ? "charge" : "outline"}
                            size="sm"
                            className="mt-3 w-full"
                            disabled={!free || !ready}
                            onClick={() => {
                              setSelected(isSelected ? null : charger.id);
                              setError("");
                            }}
                          >
                            {free ? (isSelected ? "Cancelar seleção" : "Selecionar") : "Indisponível"}
                          </Button>

                          {isSelected && (
                            <form className="mt-3 space-y-2" onSubmit={begin}>
                              <input
                                value={form.driver}
                                onChange={(e) =>
                                  setForm((p) => ({ ...p, driver: e.target.value }))
                                }
                                placeholder="Seu nome"
                                maxLength={60}
                                className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs outline-none focus:border-primary/60"
                              />
                              <select
                                value={form.vehicle}
                                onChange={(e) =>
                                  setForm((p) => ({ ...p, vehicle: e.target.value }))
                                }
                                className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs outline-none focus:border-primary/60"
                              >
                                {CAR_MODELS.map((model) => (
                                  <option key={model} value={model}>
                                    {model}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={form.plate}
                                onChange={(e) => setForm((p) => ({ ...p, plate: e.target.value }))}
                                placeholder="Placa (opcional)"
                                maxLength={10}
                                className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs uppercase outline-none focus:border-primary/60"
                              />
                              {error && <p className="text-[11px] text-primary">{error}</p>}
                              <Button type="submit" variant="charge" size="sm" className="w-full">
                                <CarFront size={14} />
                                Iniciar recarga
                              </Button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            );
          })}
      </main>
    </div>
  );
}
