import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";

export type Role = "admin" | "user";
export interface SessionUser {
  username: string;
  role: Role;
}

type SessionData = { user?: SessionUser };

function getSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET is not set (must be 32+ characters)");
  }
  return {
    password,
    name: "gp_session",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

// Cache bcrypt hashes derived from env plaintext so we compare against a hash,
// never a plaintext string in memory beyond startup.
let hashCache: Record<string, { role: Role; hash: string }> | null = null;
function getAccounts() {
  if (hashCache) return hashCache;
  const adminPw = process.env.ADMIN_PASSWORD;
  const userPw = process.env.USER_PASSWORD;
  if (!adminPw || !userPw) {
    throw new Error("ADMIN_PASSWORD and USER_PASSWORD must be set");
  }
  hashCache = {
    admin: { role: "admin", hash: bcrypt.hashSync(adminPw, 10) },
    user: { role: "user", hash: bcrypt.hashSync(userPw, 10) },
  };
  return hashCache;
}

export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const session = await useSession<SessionData>(getSessionConfig());
    return session.data.user ?? null;
  },
);

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => ({
    username: String(data?.username ?? "").trim().toLowerCase(),
    password: String(data?.password ?? ""),
  }))
  .handler(async ({ data }): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> => {
    const accounts = getAccounts();
    const acc = accounts[data.username];
    // Always run a compare to reduce timing signal on unknown users.
    const hash = acc?.hash ?? "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.7z3z6nZ1s5g9Q2mR6mYy5eV6vXlq";
    const ok = await bcrypt.compare(data.password, hash);
    if (!acc || !ok) return { ok: false, error: "Invalid username or password." };
    const user: SessionUser = { username: data.username, role: acc.role };
    const session = await useSession<SessionData>(getSessionConfig());
    await session.update({ user });
    return { ok: true, user };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig());
  await session.clear();
  return { ok: true as const };
});
