'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <a
      href={href}
      className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'text-pink-600 dark:text-pink-400'
          : 'text-gray-600 hover:text-pink-600 hover:bg-pink-50 dark:text-zinc-400 dark:hover:text-pink-400 dark:hover:bg-pink-950/30'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="nav-active-bg"
          className="absolute inset-0 bg-pink-50 dark:bg-pink-950/40 rounded-lg"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <span className="relative">{children}</span>
    </a>
  );
}
