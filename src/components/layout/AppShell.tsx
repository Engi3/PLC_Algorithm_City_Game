"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/auth/get-profile";
import { signOutAction } from "@/lib/auth/actions";

type NavItem = { href: string; label: string };

function navItemsForRole(role: Profile["role"]): NavItem[] {
  switch (role) {
    case "teacher":
      return [
        { href: "/dashboard", label: "Overview" },
        { href: "/dashboard/levels", label: "Levels" },
        { href: "/dashboard/analytics", label: "Analytics & Export" },
      ];
    case "student":
      return [
        { href: "/dashboard", label: "Play" },
        { href: "/dashboard/progress", label: "My Progress" },
      ];
    case "guest":
    default:
      return [{ href: "/dashboard", label: "Play (Trial)" }];
  }
}

export default function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const navItems = navItemsForRole(profile.role);
  const displayName =
    profile.first_name || profile.username;

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
          PLC Algorithm City
        </span>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          className="rounded-md border border-zinc-300 p-2 dark:border-zinc-700"
        >
          <span className="block h-0.5 w-5 bg-zinc-700 dark:bg-zinc-300" />
          <span className="mt-1 block h-0.5 w-5 bg-zinc-700 dark:bg-zinc-300" />
          <span className="mt-1 block h-0.5 w-5 bg-zinc-700 dark:bg-zinc-300" />
        </button>
      </header>

      {/* Sidebar (desktop) / dropdown (mobile) */}
      <nav
        className={`${
          mobileOpen ? "block" : "hidden"
        } border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 md:block md:w-56 md:shrink-0 md:border-b-0 md:border-r md:px-4 md:py-6`}
      >
        <div className="hidden md:mb-6 md:block">
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            PLC Algorithm City
          </span>
        </div>

        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-blue-600 text-white"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="px-3 text-xs text-zinc-500 dark:text-zinc-400">
            Signed in as
          </p>
          <p className="px-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {displayName}{" "}
            <span className="text-xs font-normal capitalize text-zinc-500 dark:text-zinc-400">
              ({profile.role})
            </span>
          </p>
          <form action={signOutAction} className="mt-2 px-3">
            <button
              type="submit"
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main className="flex-1 bg-zinc-50 p-4 dark:bg-black sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
