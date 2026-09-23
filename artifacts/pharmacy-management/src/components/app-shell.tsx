import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, ChevronDown, CircleHelp, ClipboardList, FileBarChart2, House, LogOut, Menu, Package, PanelLeftClose, Pill, ReceiptText, Settings, ShoppingCart, Store, Truck, Users, X } from 'lucide-react';
import { useGetCurrentUser, useLogout } from '@workspace/api-client-react';

const navigation = [
  { href: '/', label: 'Overview', icon: House },
  { href: '/medicines', label: 'Medicines', icon: Pill },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/purchases', label: 'Purchases', icon: ClipboardList },
  { href: '/pos', label: 'Point of sale', icon: ShoppingCart },
  { href: '/sales', label: 'Sales & invoices', icon: ReceiptText },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/reports', label: 'Reports', icon: FileBarChart2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { data: user } = useGetCurrentUser({ query: { queryKey: ['/api/auth/me'], retry: false } });
  const logout = useLogout();
  const initials = user?.name?.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase() ?? 'PH';

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 ${collapsed ? 'w-[76px]' : 'w-[252px]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex h-[76px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" onClick={() => setMobileOpen(false)} data-testid="link-brand" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"><Pill size={19} strokeWidth={2.5} /></span>
            {!collapsed && <span><strong className="block text-[15px] tracking-[-.02em] text-white">Northstar</strong><span className="block text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/55">Pharmacy OS</span></span>}
          </Link>
          <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white md:hidden" aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          {!collapsed && <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-sidebar-foreground/40">Workspace</div>}
          <nav className="space-y-1">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? location === '/' : location.startsWith(href);
              return <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'} ${collapsed ? 'justify-center' : ''}`}>
                <Icon size={17} strokeWidth={active ? 2.3 : 1.8} /><span className={collapsed ? 'sr-only' : ''}>{label}</span>{active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />}
              </Link>;
            })}
          </nav>
          {!collapsed && <div className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-sidebar-foreground/40">Workspace</div>}
          <Link href="/settings" onClick={() => setMobileOpen(false)} data-testid="link-nav-settings" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${location === '/settings' ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'} ${collapsed ? 'justify-center' : ''}`}><Settings size={17} /><span className={collapsed ? 'sr-only' : ''}>Settings</span></Link>
        </div>
        <div className="border-t border-sidebar-border p-3">
          {!collapsed && <div className="mb-3 flex items-center gap-3 rounded-lg bg-sidebar-accent/60 px-3 py-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-bold text-sidebar-primary">{initials}</span><span className="min-w-0"><strong className="block truncate text-xs text-white">{user?.name ?? 'Current user'}</strong><span className="block truncate text-[10px] text-sidebar-foreground/55">{user?.role ?? 'Staff'}</span></span></div>}
          <button onClick={() => setCollapsed(!collapsed)} className="hidden w-full items-center justify-center rounded-md p-2 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-white md:flex" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} data-testid="button-collapse-navigation">{collapsed ? <PanelLeftClose size={17} /> : <PanelLeftClose size={17} className="rotate-180" />}</button>
        </div>
      </aside>
      {mobileOpen && <button onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" aria-label="Close menu" data-testid="button-menu-overlay" />}
      <main className={`min-h-[100dvh] transition-[margin] duration-200 ${collapsed ? 'md:ml-[76px]' : 'md:ml-[252px]'}`}>
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg border bg-card p-2 text-muted-foreground md:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={19} /></button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />System operational</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Notifications" data-testid="button-notifications"><Bell size={19} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" /></button>
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <div className="group relative">
              <button className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted" data-testid="button-user-menu"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials}</span><span className="hidden text-left sm:block"><strong className="block text-xs">{user?.name ?? 'Current user'}</strong><span className="block text-[10px] text-muted-foreground">{user?.role ?? 'Staff'}</span></span><ChevronDown size={14} className="text-muted-foreground" /></button>
              <div className="invisible absolute right-0 top-11 w-44 translate-y-1 rounded-lg border bg-card p-1 opacity-0 shadow-lg transition-all group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <Link href="/settings" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-muted" data-testid="link-user-settings"><Settings size={14} />Account settings</Link>
                <button onClick={() => logout.mutate()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10" data-testid="button-logout"><LogOut size={14} />Sign out</button>
              </div>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1600px] p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-primary">{eyebrow && <span>{eyebrow}</span>}</div><h1 className="text-[28px] font-semibold tracking-[-.04em] text-foreground md:text-[34px]">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}</div>{action}</div>;
}

export function LoadingBlock({ label = 'Loading live data' }: { label?: string }) {
  return <div className="card-surface flex min-h-36 items-center justify-center gap-3 text-sm text-muted-foreground"><span className="h-4 w-4 animate-pulse rounded-full bg-primary/30" /><span>{label}</span></div>;
}

export function ErrorBlock({ onRetry, label = 'We could not load this workspace.' }: { onRetry?: () => void; label?: string }) {
  return <div className="card-surface flex min-h-36 flex-col items-center justify-center gap-3 text-center"><CircleHelp size={22} className="text-destructive" /><p className="text-sm text-muted-foreground">{label}</p>{onRetry && <button onClick={onRetry} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted" data-testid="button-retry">Try again</button>}</div>;
}

export function EmptyBlock({ label, action }: { label: string; action?: ReactNode }) {
  return <div className="card-surface flex min-h-40 flex-col items-center justify-center gap-3 text-center"><Store size={24} className="text-muted-foreground/40" /><p className="text-sm text-muted-foreground">{label}</p>{action}</div>;
}

export function Currency({ value }: { value: number | null | undefined }) {
  return <span className="mono">₹{Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}