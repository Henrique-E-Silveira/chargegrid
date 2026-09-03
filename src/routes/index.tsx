import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CarFront, KeyRound, Lock, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signIn, signUp, useSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Acesso | ChargeGrid Intelligence" },
      {
        name: "description",
        content:
          "Entre ou cadastre-se na plataforma ChargeGrid Intelligence para gerenciar recargas de veículos elétricos.",
      },
      { property: "og:title", content: "Acesso — ChargeGrid Intelligence" },
      {
        property: "og:description",
        content: "Login de administradores e motoristas da rede de eletropostos ChargeGrid.",
      },
    ],
  }),
  component: AuthPage,
});

function Field({
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof User }) {
  return (
    <label className="block">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 focus-within:border-primary/60">
        <Icon size={16} className="shrink-0 text-muted-foreground" />
        <input
          {...props}
          className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </label>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", car: "", login: "", password: "" });

  useEffect(() => {
    if (!ready || !session) return;
    navigate({ to: session.role === "admin" ? "/admin" : "/painel" });
  }, [ready, session, navigate]);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result =
      mode === "login" ? signIn(form.login, form.password) : signUp(form);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError("");
    navigate({ to: result.role === "admin" ? "/admin" : "/painel" });
  };

  return (
    <div className="grid-surface flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Zap size={22} fill="currentColor" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">
              ChargeGrid <span className="text-primary">Intelligence</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Gestão comercial de eletropostos — FIAP × GoodWe 2026
            </p>
          </div>
        </div>

        <section className="panel-glow rounded-xl border border-border bg-card p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-border bg-background/60 p-1">
            {(["login", "signup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError("");
                }}
                className={cn(
                  "rounded-md py-2 text-xs font-semibold transition-colors",
                  mode === item
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item === "login" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>

          <form className="space-y-3" onSubmit={submit}>
            {mode === "signup" && (
              <>
                <Field
                  icon={User}
                  placeholder="Nome completo"
                  value={form.name}
                  onChange={update("name")}
                  maxLength={80}
                />
                <Field
                  icon={CarFront}
                  placeholder="Carro (ex.: BYD Dolphin)"
                  value={form.car}
                  onChange={update("car")}
                  maxLength={60}
                />
              </>
            )}
            <Field
              icon={KeyRound}
              placeholder="Login"
              value={form.login}
              onChange={update("login")}
              maxLength={40}
              autoComplete="username"
            />
            <Field
              icon={Lock}
              type="password"
              placeholder="Senha"
              value={form.password}
              onChange={update("password")}
              maxLength={64}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />

            {error && (
              <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full">
              {mode === "login" ? "Acessar plataforma" : "Criar conta de motorista"}
            </Button>
          </form>

          <div className="mt-4 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: "/motorista" })}
            >
              Entrar como motorista (sem login)
            </Button>
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            Motoristas acessam o painel pessoal de recargas. Operadores acessam o centro de controle
            da rede.
          </p>

        </section>
      </div>
    </div>
  );
}
