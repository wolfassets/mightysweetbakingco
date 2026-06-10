import type { Metadata } from 'next';
// DEPRECATED 2026-05-02 — Bricolage was a togglable font option in /settings; we now ship Geist only.
// Uncomment these and the html.font-bricolage logic in globals.css to re-enable.
// import '@fontsource/bricolage-grotesque/400.css';
// import '@fontsource/bricolage-grotesque/500.css';
// import '@fontsource/bricolage-grotesque/600.css';
// import '@fontsource/bricolage-grotesque/700.css';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { NavLink } from './NavLink';
import { ThemeToggle } from './ThemeToggle';

export const metadata: Metadata = {
  title: 'Mighty Sweet Baking Co.',
  description: 'Inventory Manager',
};

const themeInitScript = `
(function(){try{
  var t=localStorage.getItem('theme');
  var d=document.documentElement;
  var sysDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  if(t==='dark'){d.classList.add('dark');}
  else if(t==='light'){d.classList.remove('dark');}
  else{if(sysDark)d.classList.add('dark');else d.classList.remove('dark');}
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="https://mightysweetbakingco.com/wp-content/uploads/2025/07/logo-1.png" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-white dark:bg-black min-h-screen antialiased">
        {/* Header */}
        <header className="bg-white dark:bg-black sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
              <img
                src="https://mightysweetbakingco.com/wp-content/uploads/2025/07/logo-1.png"
                alt="Mighty Sweet Baking Co."
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-title-3 text-gray-900 dark:text-zinc-100">Mighty Sweet Baking Co.</h1>
                <p className="text-headline text-pink-500">Inventory Manager</p>
              </div>
            </a>

            <div className="flex items-center gap-2">
              <nav className="flex gap-1">
                <NavLink href="/">Home</NavLink>
                <NavLink href="/flavors">Flavors</NavLink>
                <NavLink href="/events">Events</NavLink>
                <NavLink href="/deliveries">Deliveries</NavLink>
                <NavLink href="/activity">Activity</NavLink>
                <NavLink href="/donations">Donations</NavLink>
              </nav>
              <div className="w-px h-6 bg-gray-200 dark:bg-[#262626] mx-2" />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
