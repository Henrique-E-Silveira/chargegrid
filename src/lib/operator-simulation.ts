export const OPERATOR_LIMIT_KW = 44;
export const BATTERY_CAPACITY_KWH = 40;
export const BATTERY_POWER_KW = 15;
export const EMISSIONS_FACTOR = 0.0385;
export const SCENARIO_DEMAND = [2, 0, 0, 0, 0, 3, 8, 14, 18, 16, 14, 20, 24, 22, 20, 22, 28, 36, 44, 40, 32, 22, 12, 5];

export function scenarioTariff(hour: number) {
  if (hour >= 18 && hour < 21) return { label: "Pico", rate: 1.2, tone: "peak" };
  if ((hour >= 17 && hour < 18) || (hour >= 21 && hour < 22)) return { label: "Intermediário", rate: 0.85, tone: "mid" };
  return { label: "Fora de Pico", rate: 0.55, tone: "off" };
}

export function solarPower(hour: number) {
  return hour > 6 && hour < 18 ? 30 * Math.sin(Math.PI * (hour - 6) / 12) : 0;
}

export function simulateDay(smart: boolean) {
  const demand = [...SCENARIO_DEMAND];
  if (smart) {
    let shifted = 0;
    for (const hour of [18, 19, 20]) {
      shifted += demand[hour] * 0.35;
      demand[hour] *= 0.65;
    }
    demand[22] += shifted / 2;
    demand[23] += shifted / 2;
  }
  let stored = 8;
  return demand.map((load, hour) => {
    const solar = solarPower(hour + 0.5);
    const net = load - solar;
    const tariff = scenarioTariff(hour);
    let battery = 0;
    let grid = Math.max(0, net);
    if (smart && net < 0) battery = -Math.min(-net, BATTERY_POWER_KW, BATTERY_CAPACITY_KWH - stored);
    if (smart && net > 0 && tariff.tone !== "off") {
      battery = Math.max(0, Math.min(net, BATTERY_POWER_KW, stored - 4));
      grid = net - battery;
    }
    stored -= battery;
    return { hour, solar, load, grid, battery, stored, soc: stored / BATTERY_CAPACITY_KWH * 100, solarUsed: Math.min(solar, load) + Math.max(0, -battery), tariff };
  });
}

export type ScenarioPoint = ReturnType<typeof simulateDay>[number];

export function scenarioTotals(day: ScenarioPoint[]) {
  const cost = day.reduce((sum, point) => sum + point.grid * point.tariff.rate, 0);
  const grid = day.reduce((sum, point) => sum + point.grid, 0);
  const solar = day.reduce((sum, point) => sum + point.solarUsed, 0);
  return { cost, grid, solar, co2: grid * EMISSIONS_FACTOR, peak: Math.max(...day.map(point => point.grid)) };
}

export function scenarioClock(hour: number) {
  const minutes = Math.floor((hour * 60 + 0.00001) % 1440);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const decimal = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function scenarioAnswer(question: string, point: ScenarioPoint, smart: boolean, hour: number) {
  const text = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const baseline = scenarioTotals(simulateDay(false));
  const optimized = scenarioTotals(simulateDay(true));
  if (/econom|custo/.test(text)) return `No cenário de 24 horas, o custo passa de ${money(baseline.cost)} para ${money(optimized.cost)} com otimização: economia de ${decimal((1 - optimized.cost / baseline.cost) * 100)}% (${money(baseline.cost - optimized.cost)}).`;
  if (/horario|quando|tarifa/.test(text)) return "Neste cenário, a tarifa fora de pico é R$ 0,55/kWh. Prefira o meio-dia para aproveitar a geração solar. Pico: 18h–21h; intermediário: 17h–18h e 21h–22h.";
  if (/solar|gera/.test(text)) return `Às ${scenarioClock(hour)}, a geração solar do intervalo é ${decimal(point.solar)} kW. O perfil solar tem pico de 30 kW ao meio-dia.`;
  if (/bateria|soc/.test(text)) return `A bateria de 40 kWh está em ${decimal(point.soc)}% de carga e ${point.battery > 0 ? `fornecendo ${decimal(point.battery)} kW` : point.battery < 0 ? `recebendo ${decimal(-point.battery)} kW` : "em repouso"}.`;
  if (/reduz|potencia|cp|pico/.test(text)) return smart ? "No modo inteligente, 35% da demanda flexível de 18h–21h é deslocada para 22h–24h. A bateria fornece até 15 kW nos períodos de pico e intermediário, mantendo reserva de 4 kWh." : "O modo inteligente está desligado. Ative-o para comparar o deslocamento de carga e o apoio da bateria nos horários mais caros.";
  if (/co2|carbono|emiss/.test(text)) return `As emissões simuladas passam de ${decimal(baseline.co2)} para ${decimal(optimized.co2)} kg de CO₂. Fator de referência: 0,0385 kg/kWh (SIN, 2023); confirme o valor vigente antes de citar.`;
  return "Posso consultar economia, tarifa, geração solar, bateria, redução de potência e emissões de CO₂ deste cenário. Não executo comandos nos carregadores.";
}