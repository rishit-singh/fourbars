"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Music2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { stopAudio } from "@/lib/audio";
import { useEditor } from "@/store/editor";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProfileDialog } from "@/components/ProfileDialog";
import { errorMessage } from "@/lib/errors";
export function Shell({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter(),
    pathname = usePathname();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    stopAudio();
  }, [pathname]);
  useEffect(() => {
    try {
      const s = getSupabase();
      const {
        data: { subscription },
      } = s.auth.onAuthStateChange((event, session) => {
        setEmail(session?.user.email ?? "");
        const nextUser = session?.user.id ?? null;
        setUserId(nextUser);
        const changedAccount =
          previousUser.current !== undefined && previousUser.current !== nextUser;
        previousUser.current = nextUser;
        if (event === "SIGNED_OUT" || changedAccount) {
          stopAudio();
          useEditor.getState().reset();
          // Login owns callback/return navigation, but account cleanup always runs.
          if (event === "SIGNED_OUT" || window.location.pathname !== "/login") router.replace("/");
          router.refresh();
        }
      });
      return () => subscription.unsubscribe();
    } catch {
      return;
    }
  }, [router]);
  return (
    <>
      <header className="header">
        <Link href="/" className="brand">
          <Music2 size={23} /> fourbars
        </Link>
        <nav aria-label="Main navigation">
          {userId ? (
            <>
              <ProfileDialog key={userId} />
              <span className="identity">{email}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                disabled={busy}
                onClick={async () => {
                  if (useEditor.getState().dirty && !confirm("Sign out and discard unsaved edits?"))
                    return;
                  setBusy(true);
                  try {
                    const { error } = await getSupabase().auth.signOut();
                    if (error) throw error;
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <LogOut />
              </Button>
            </>
          ) : (
            <Button asChild variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </header>
      <main className="container">{children}</main>
      <footer className="site-footer">Make four bars. Share an idea.</footer>
    </>
  );
}
