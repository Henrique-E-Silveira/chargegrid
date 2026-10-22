import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowRight, BatteryCharging, Bot, ChartNoAxesCombined, Clock3, Code2, Gauge, Leaf, Pause, Play, PlugZap, Send, Sun, Zap } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatDecimal, formatMoney } from "@/lib/grid";
import { OPERATOR_LIMIT_KW, SCENARIO_DEMAND, scenarioAnswer, scenarioClock, scenarioTotals, simulateDay } from "@/lib/operator-simulation";

export const Route = createFileRoute("/operador")({
  head: () => ({ meta: [
    { title: "Centro de Controle do Operador | ChargeGrid Intelligence" },
    { name: "description", content: "Simulação energética GoodWe: geração solar, bateria, demanda, telemetria e comparação de custos com otimização inteligente." },
    { property: "og:title", content: "Centro de Controle do Operador — ChargeGrid Intelligence" },
    { property: "og:description", content: "Cenário energético Sprint 4 — FIAP × GoodWe: fluxo de energia, otimização e assistente de simulação." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OperatorPage,
});

const baseline = simulateDay(false);
const optimized = simulateDay(true);
const before = scenarioTotals(baseline);
const after = scenarioTotals(optimized);
const saving = (1 - after.cost / before.cost) * 100;
const suggestions = ["Quanto economizei hoje?", "Qual o melhor horário para carregar?", "Qual a geração solar agora?", "Por que reduziu a potência?"];

function Section({ title, icon: Icon, detail, children }: { title: string; icon: typeof Zap; detail?: string; children: ReactNode }) {
  return <section className="min-w-0 border-t border-border pt-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Icon size={18} className="shrink-0 text-primary" />{title}</h2>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
    {children}
  </section>;
}

function OperatorPage() {
  const [hour, setHour] = useState(12);
  const [smart, setSmart] = useState(true);
  const [running, setRunning] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: "Olá! Posso consultar os dados do cenário energético ChargeGrid." }]);
  const log = useRef<HTMLDivElement>(null);
  const day = smart ? optimized : baseline;
  const point = day[Math.floor(hour)] ?? day[12];
  const active = Math.ceil(point.load / 11);
  const perCharger = active ? point.load / active : 0;
  const tariffClass = point.tariff.tone === "peak" ? "border-primary/40 bg-primary/10 text-primary" : point.tariff.tone === "mid" ? "border-warning/40 bg-warning/10 text-warning" : "border-success/40 bg-success/10 text-success";

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setHour(value => Number(((value + 0.1) % 24).toFixed(1))), 150);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);

  const ask = (text: string) => {
    if (!text.trim()) return;
    setMessages(previous => [...previous, { role: "user", text: text.trim() }, { role: "assistant", text: scenarioAnswer(text, point, smart, hour) }]);
    setQuestion("");
  };

  const flows = [
    { from: "Solar", to: "Carregadores", power: Math.min(point.solar, point.load), tone: "text-warning" },
    { from: "Solar", to: "Bateria", power: Math.max(0, -point.battery), tone: "text-info" },
    { from: "Bateria", to: "Carregadores", power: Math.max(0, point.battery), tone: "text-info" },
    { from: "Rede", to: "Carregadores", power: point.grid, tone: "text-primary" },
  ].filter(flow => flow.power > 0);
  const metrics = [
    { label: "Geração solar", value: point.solar, unit: "kW", icon: Sun, tone: "text-warning", detail: "Pico instalado · 30 kW" },
    { label: "Bateria GoodWe", value: Math.abs(point.battery), unit: "kW", icon: BatteryCharging, tone: "text-info", detail: `SoC ${formatDecimal(point.soc, 0)}% · 40 kWh · ${point.battery > 0 ? "Descarregando" : point.battery < 0 ? "Carregando" : "Em repouso"}` },
    { label: "Carregadores", value: point.load, unit: "kW", icon: PlugZap, tone: "text-success", detail: `${active}/4 ativos · limite ${OPERATOR_LIMIT_KW} kW` },
    { label: "Energia da rede", value: point.grid, unit: "kW", icon: Gauge, tone: "text-primary", detail: `${formatDecimal(point.grid / OPERATOR_LIMIT_KW * 100, 0)}% da capacidade da rede` },
  ];
  const comparisons = [
    { label: "Custo total", a: formatMoney(before.cost), b: formatMoney(after.cost) },
    { label: "Energia da rede", a: `${formatDecimal(before.grid)} kWh`, b: `${formatDecimal(after.grid)} kWh` },
    { label: "Energia solar utilizada", a: `${formatDecimal(before.solar)} kWh`, b: `${formatDecimal(after.solar)} kWh` },
    { label: "CO₂ emitido", a: `${formatDecimal(before.co2, 2)} kg`, b: `${formatDecimal(after.co2, 2)} kg` },
    { label: "Pico máximo na rede", a: `${formatDecimal(before.peak)} kW`, b: `${formatDecimal(after.peak)} kW` },
  ];
  const telemetry = JSON.stringify({ pv_power: Number(point.solar.toFixed(2)), battery_soc: Math.round(point.soc), battery_power: Number((-point.battery).toFixed(2)), grid_power: Number(point.grid.toFixed(2)), load_power: Number(point.load.toFixed(2)) }, null, 2);

  return <div className="grid-surface min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-background/95">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Zap size={22} fill="currentColor" /></div>
          <div><p className="font-display text-lg font-bold">ChargeGrid <span className="text-primary">Intelligence</span></p><p className="text-xs text-muted-foreground">FIAP × GoodWe EV Challenge 2026</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/admin"><Gauge />Admin</Link></Button>
          <Button variant="ghost" size="sm" asChild><Link to="/"><ArrowRight />Voltar</Link></Button>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1 text-xs font-medium text-primary">OPERADOR · SPRINT 4</p><h1 className="font-display text-2xl font-bold sm:text-3xl">Centro de Controle</h1><p className="mt-1 text-sm text-muted-foreground">Inversor GoodWe · cenário de 24 horas · dados simulados</p></div>
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium" htmlFor="operator-smart"><span>Modo Inteligente</span><Switch id="operator-smart" checked={smart} onCheckedChange={setSmart} /></label>
      </div>

      <div className="flex flex-wrap items-center gap-5 border-y border-border bg-card/70 px-4 py-4">
        <Button variant={running ? "secondary" : "default"} onClick={() => setRunning(value => !value)} className="w-40">{running ? <Pause /> : <Play />}{running ? "Pausar" : "Acelerar tempo"}</Button>
        <div className="flex min-w-0 flex-1 items-center gap-4 basis-72"><label htmlFor="operator-hour" className="shrink-0 text-xs text-muted-foreground">Hora simulada</label><Slider id="operator-hour" aria-label="Hora simulada" min={0} max={23.9} step={0.1} value={[hour]} onValueChange={values => { const value = values[0]; if (value !== undefined) setHour(value); }} /></div>
        <div className="flex w-24 items-center gap-2 font-display text-lg font-semibold"><Clock3 size={16} className="text-muted-foreground" /><output aria-label="Relógio simulado">{scenarioClock(hour)}</output></div>
        <span className={cn("rounded-md border px-3 py-2 text-xs font-semibold", tariffClass)}>{point.tariff.label} · {formatMoney(point.tariff.rate)}/kWh</span>
      </div>

      <div role="status" className={cn("flex min-h-12 items-center gap-2 rounded-md border px-4 py-3 text-sm", !smart && point.load > OPERATOR_LIMIT_KW * 0.9 ? "border-primary/40 bg-primary/10 text-primary" : "border-success/30 bg-success/5 text-success")}>
        <Activity className="shrink-0" size={16} />
        {!smart && point.load > OPERATOR_LIMIT_KW * 0.9 ? `Atenção: demanda a ${formatDecimal(point.load / OPERATOR_LIMIT_KW * 100, 0)}% do limite de 44 kW. Ative o Modo Inteligente.` : smart && (SCENARIO_DEMAND[Math.floor(hour)] ?? 0) > OPERATOR_LIMIT_KW * 0.9 ? `Pico evitado: demanda reduzida de ${SCENARIO_DEMAND[Math.floor(hour)]} para ${formatDecimal(point.load)} kW, com apoio da bateria.` : smart ? "Otimização ativa · prioridade solar e bateria nos horários de maior tarifa." : "Modo convencional · otimização desligada."}
      </div>

      <Section title="Inversor GoodWe · fluxo de energia" icon={Zap} detail={`Intervalo ${String(point.hour).padStart(2, "0")}:00–${String(point.hour + 1).padStart(2, "0")}:00`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, unit, icon: Icon, tone, detail }) => <div key={label} className="panel-glow rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon size={21} className={tone} /></div>
            <p className={cn("font-display text-3xl font-bold", tone)}>{formatDecimal(value)} <span className="text-base font-medium">{unit}</span></p>
            <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
          </div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">{flows.length ? flows.map(flow => <span key={`${flow.from}-${flow.to}`} className="flex items-center gap-2"><span className="text-muted-foreground">{flow.from}</span><ArrowRight size={13} className={flow.tone} /><span>{flow.to}</span><b className={flow.tone}>{formatDecimal(flow.power)} kW</b></span>) : <span className="text-muted-foreground">Sem fluxo ativo</span>}</div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Charge Points" icon={PlugZap} detail="4 × 11 kW AC · cenário simulado">
          <div className="space-y-5">{Array.from({ length: 4 }, (_, index) => {
            const power = index < active ? perCharger : 0;
            return <div key={index}><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="font-display font-semibold">CP-0{index + 1} <span className={cn("ml-2 font-sans font-normal", power ? "text-success" : "text-muted-foreground")}>{power ? "Carregando" : "Disponível"}</span></span><span className="font-display font-semibold">{formatDecimal(power)} kW</span></div><progress className="operator-progress h-2 w-full" max={11} value={power} aria-label={`Potência CP-0${index + 1}`} /></div>;
          })}</div>
        </Section>
        <Section title="Telemetria" icon={Code2} detail="Formato SEMS Portal · kW e %">
          <pre aria-label="Telemetria SEMS" className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-sm leading-7 text-info">{telemetry}</pre>
        </Section>
      </div>

      <Section title="Geração × consumo × rede" icon={ChartNoAxesCombined} detail="Dia simulado · intervalos de 1 hora">
        <div className="h-[330px] min-w-0 w-full" aria-label="Gráfico diário de energia">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={day} margin={{ top: 15, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="hour" type="number" domain={[0, 24]} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} tickFormatter={value => `${value}h`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} />
              <YAxis yAxisId="power" width={42} domain={[0, 50]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} label={{ value: "kW", position: "insideTopLeft", fill: "var(--muted-foreground)" }} />
              <YAxis yAxisId="soc" orientation="right" width={42} domain={[0, 100]} unit="%" tick={{ fill: "var(--chart-blue)", fontSize: 11 }} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} labelFormatter={value => `${value}:00`} formatter={(value, name) => [`${formatDecimal(Number(value))} ${name === "Bateria (SoC)" ? "%" : "kW"}`, name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="power" dataKey="solar" name="Solar" type="stepAfter" stroke="var(--chart-orange)" fill="var(--chart-orange)" fillOpacity={0.12} isAnimationActive={false} />
              <Line yAxisId="power" dataKey="load" name="Consumo CPs" type="stepAfter" stroke="var(--chart-green)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="power" dataKey="grid" name="Rede" type="stepAfter" stroke="var(--chart-red)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="soc" dataKey="soc" name="Bateria (SoC)" type="stepAfter" stroke="var(--chart-blue)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceLine yAxisId="power" x={hour} stroke="var(--foreground)" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Comparativo de otimização" icon={Leaf} detail="24 horas · mesmo cenário">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-3 text-left font-medium">Indicador</th><th className="px-3 py-3 text-right font-medium">Sem otimização</th><th className="py-3 text-right font-medium">Com otimização</th></tr></thead><tbody>{comparisons.map(row => <tr key={row.label} className="border-b border-border/60"><td className="py-3">{row.label}</td><td className="px-3 py-3 text-right text-muted-foreground">{row.a}</td><td className="py-3 text-right font-medium text-success">{row.b}</td></tr>)}</tbody></table></div>
          <div className="flex flex-col justify-center border-l-2 border-success pl-5"><p className="text-xs text-muted-foreground">Economia no cenário otimizado</p><p className="mt-2 font-display text-4xl font-bold text-success">{formatDecimal(saving)}%</p><p className="mt-2 font-display text-lg font-medium">{formatMoney(before.cost - after.cost)}</p><p className="mt-3 text-xs text-muted-foreground">Solar e bateria primeiro. 35% da carga flexível de 18h–21h deslocada para 22h–24h.</p></div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">CO₂: fator de referência SIN de 0,0385 kg/kWh (2023). Confirme o valor vigente antes de citar. O ganho principal deste cenário é financeiro e de redução de pico.</p>
      </Section>

      <Section title="Assistente ChargeGrid" icon={Bot} detail="Respostas locais sobre a simulação">
        <div className="mb-4 flex flex-wrap gap-2">{suggestions.map(text => <Button key={text} variant="outline" size="sm" className="h-auto whitespace-normal py-2 text-left" onClick={() => ask(text)}>{text}</Button>)}</div>
        <div ref={log} role="log" aria-label="Conversa com assistente" aria-live="polite" className="mb-4 flex h-52 flex-col gap-3 overflow-y-auto border-y border-border py-4">{messages.map((message, index) => <div key={index} className={cn("max-w-[90%] rounded-lg border px-4 py-3 text-sm leading-relaxed sm:max-w-[80%]", message.role === "user" ? "self-end border-primary/30 bg-primary/10" : "self-start border-border bg-card")}><p className={cn("mb-1 text-[10px] font-semibold", message.role === "user" ? "text-primary" : "text-info")}>{message.role === "user" ? "VOCÊ" : "CHARGEGRID"}</p>{message.text}</div>)}</div>
        <form className="flex gap-2" onSubmit={event => { event.preventDefault(); ask(question); }}><Input aria-label="Pergunta ao assistente" placeholder="Pergunte sobre os dados…" value={question} onChange={event => setQuestion(event.target.value)} maxLength={500} className="min-w-0 flex-1" /><Button type="submit" disabled={!question.trim()} aria-label="Enviar pergunta"><Send /><span className="hidden sm:inline">Enviar</span></Button></form>
      </Section>
      <footer className="border-t border-border pb-3 pt-5 text-xs leading-relaxed text-muted-foreground">Protótipo Sprint 4 · geração, bateria e consumo simulados. Este cenário não altera as sessões dos motoristas. Tarifas do cenário: Pico R$ 1,20 · Intermediário R$ 0,85 · Fora de Pico R$ 0,55/kWh.</footer>
    </main>
  </div>;
}