import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { format } from "date-fns";
import { Download, LogOut, Menu, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_NAME, getNavTitle } from "./nav-config";

function getInitials(name?: string) {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface NavbarProps {
  onMobileMenu: () => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const Navbar = ({ onMobileMenu }: NavbarProps) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const pageTitle = useMemo(
    () => getNavTitle(location.pathname),
    [location.pathname]
  );

  const todayLabel = format(new Date(), "EEEE, d MMMM yyyy");

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200/80 bg-white/95 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMobileMenu}
          className="h-9 w-9 shrink-0 px-0 md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-gray-900 sm:text-lg">
            {pageTitle}
          </h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {pageTitle === APP_NAME ? APP_NAME : `${APP_NAME} · ${todayLabel}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {user?.role && (
          <Badge
            variant="outline"
            className="hidden border-matles-200 bg-matles-50 text-matles-800 sm:inline-flex"
          >
            {user.role}
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 px-2 hover:bg-gray-100 sm:px-3"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-matles-700 text-xs font-semibold text-white">
                {getInitials(user?.name)}
              </div>
              <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
                {user?.name}
              </span>
              <UserCircle className="h-4 w-4 text-muted-foreground sm:hidden" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              Role: {user?.role}
            </DropdownMenuItem>
            {installPrompt && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleInstall}>
                  <Download className="mr-2 h-4 w-4" />
                  Install SoftSleep app
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-red-600 focus:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
