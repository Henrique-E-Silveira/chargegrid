import { useEffect, useState } from "react";

export type Role = "admin" | "user";

export type Session = {
  name: string;
  car: string;
  login: string;
  role: Role;
};

type StoredUser = Session & { password: string };

const USERS_KEY = "chargegrid_users";
const SESSION_KEY = "chargegrid_session";

const ADMIN: StoredUser = {
  name: "Administrador",
  car: "—",
  login: "loginadmin",
  password: "12345678",
  role: "admin",
};

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function toSession({ name, car, login, role }: StoredUser): Session {
  return { name, car, login, role };
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function setSession(session: Session | null) {
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("chargegrid-auth"));
}

export function signIn(login: string, password: string): Session | { error: string } {
  const candidate = [ADMIN, ...readUsers()].find(
    (user) => user.login.toLowerCase() === login.trim().toLowerCase(),
  );
  if (!candidate) return { error: "Login não encontrado." };
  if (candidate.password !== password) return { error: "Senha incorreta." };
  const session = toSession(candidate);
  setSession(session);
  return session;
}

export function signUp(data: {
  name: string;
  car: string;
  login: string;
  password: string;
}): Session | { error: string } {
  const login = data.login.trim();
  if (!data.name.trim() || !data.car.trim() || !login || data.password.length < 6) {
    return { error: "Preencha todos os campos (senha com no mínimo 6 caracteres)." };
  }
  const users = readUsers();
  if (
    login.toLowerCase() === ADMIN.login.toLowerCase() ||
    users.some((user) => user.login.toLowerCase() === login.toLowerCase())
  ) {
    return { error: "Este login já está em uso." };
  }
  const user: StoredUser = {
    name: data.name.trim(),
    car: data.car.trim(),
    login,
    password: data.password,
    role: "user",
  };
  commitUsers([...users, user]);
  const session = toSession(user);
  setSession(session);
  return session;
}

export function signOut() {
  setSession(null);
}

export type ManagedUser = Session & { password: string };

const USERS_EVENT = "chargegrid-users";

export function listUsers(): ManagedUser[] {
  return readUsers();
}

function commitUsers(users: StoredUser[]) {
  writeUsers(users);
  window.dispatchEvent(new Event(USERS_EVENT));
}

export function updateUser(
  login: string,
  data: { name: string; car: string; login: string; password?: string },
): { error: string } | null {
  const users = readUsers();
  const index = users.findIndex((u) => u.login.toLowerCase() === login.toLowerCase());
  if (index < 0) return { error: "Conta não encontrada." };
  const nextLogin = data.login.trim();
  if (!data.name.trim() || !data.car.trim() || !nextLogin) {
    return { error: "Preencha nome, carro e login." };
  }
  if (
    nextLogin.toLowerCase() === ADMIN.login.toLowerCase() ||
    users.some((u, i) => i !== index && u.login.toLowerCase() === nextLogin.toLowerCase())
  ) {
    return { error: "Este login já está em uso." };
  }
  if (data.password && data.password.length < 6) {
    return { error: "A senha deve ter no mínimo 6 caracteres." };
  }
  users[index] = {
    ...users[index],
    name: data.name.trim(),
    car: data.car.trim(),
    login: nextLogin,
    password: data.password ? data.password : users[index].password,
  };
  commitUsers(users);
  return null;
}

export function deleteUser(login: string) {
  commitUsers(readUsers().filter((u) => u.login.toLowerCase() !== login.toLowerCase()));
}

export function useUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);

  useEffect(() => {
    const sync = () => setUsers(readUsers());
    sync();
    window.addEventListener(USERS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(USERS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return users;
}


export function useSession() {
  const [session, setLocalSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setLocalSession(getSession());
    sync();
    setReady(true);
    window.addEventListener("chargegrid-auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("chargegrid-auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { session, ready };
}
