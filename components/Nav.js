"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Tracker" },
  { href: "/profile", label: "Profile & Goals" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-b border-gray-100">
      <div className="mx-auto w-full max-w-lg px-4 flex">
        {TABS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`py-3.5 px-4 text-sm font-medium border-b-2 transition-colors ${
              pathname === href
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
