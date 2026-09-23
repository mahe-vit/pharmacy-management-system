import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { LoadingBlock } from '@/components/app-shell';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { Dashboard, Inventory, Login, Medicines, POS, PurchaseEntry, Reports, SaleDetails, SettingsPage, SimpleListPage } from '@/pages/app-pages';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false } } });

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Protected({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const currentUser = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });

  useEffect(() => {
    if (currentUser.isError) setLocation('/login');
  }, [currentUser.isError, setLocation]);

  if (currentUser.isLoading) return <LoadingBlock label="Checking your secure session" />;
  if (currentUser.isError || !currentUser.data) return null;
  return <>{children}</>;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/login" component={Login} />
    <Route path="/"><Protected><Dashboard /></Protected></Route>
    <Route path="/medicines"><Protected><Medicines /></Protected></Route>
    <Route path="/inventory"><Protected><Inventory /></Protected></Route>
    <Route path="/purchases"><Protected><SimpleListPage kind="purchases" /></Protected></Route>
    <Route path="/purchases/new"><Protected><PurchaseEntry /></Protected></Route>
    <Route path="/pos"><Protected><POS /></Protected></Route>
    <Route path="/sales/:id"><Protected><SaleDetails /></Protected></Route>
    <Route path="/sales"><Protected><SimpleListPage kind="sales" /></Protected></Route>
    <Route path="/customers"><Protected><SimpleListPage kind="customers" /></Protected></Route>
    <Route path="/suppliers"><Protected><SimpleListPage kind="suppliers" /></Protected></Route>
    <Route path="/reports"><Protected><Reports /></Protected></Route>
    <Route path="/settings"><Protected><SettingsPage /></Protected></Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;