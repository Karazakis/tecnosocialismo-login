import { auth } from "@/lib/auth";
import type { SuiteUser } from "@/lib/messages";

export async function getRequestUser(request: Request): Promise<SuiteUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    name: session.user.name || session.user.email.split("@")[0] || "Persona",
    email: session.user.email,
  };
}
